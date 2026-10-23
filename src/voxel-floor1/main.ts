import * as THREE from 'three';
import {
  BRACKET_LAYER,
  CAMERA_FAR,
  CAMERA_FOV,
  CAMERA_HFOV_DEG,
  CAMERA_NEAR,
  CAMERA_PITCH,
  CAMERA_VIEW_ASPECT,
  CELL,
  FOG_FAR,
  FOG_NEAR,
  LANTERN_COLOR,
  LANTERN_DISTANCE,
  LANTERN_FLICKER,
  LANTERN_FLICKER_MS,
  LANTERN_HOLD,
  LANTERN_INTENSITY,
  LANTERN_SPOT_ANGLE,
  LANTERN_SPOT_INTENSITY,
  LANTERN_SPOT_MAP_DESKTOP,
  LANTERN_SPOT_MAP_MOBILE
} from './constants';
import { facingCell, GridMover } from './camera';
import { Floor1PartyUi, preloadPortraitArt } from './party-ui';
import {
  applyCameraProjection,
  measurePortraitLayout,
  parseSafeQuery,
  readSafeInsets,
  type HudHeroId,
  type PortraitLayout
} from './portrait-layout';
import { lookColors } from '../voxel-lab/look';
import { applyShadowToggle, recompileShadowShaders } from '../voxel-lab/shadows';
import { facingSconce, floor1Sconces, floor1Sunbeams, TORCH_CAPPED_PROMPT } from './fixtures';
import {
  Floor1Lights,
  parseLightMode,
  qualityFromLightMode,
  readStoredQuality,
  writeStoredQuality,
  type LightMode,
  type QualityLevel
} from './lights';
import { Floor1Gameplay } from './gameplay';
import { buildFloor1Items } from './floor-items';
import { doorBetween, doorEdgeAt, floor1Map, tileAt } from './layout';
import { buildFloor1 } from './level';
import { buildFloor1Markers } from './markers';
import { buildFloor1Openings } from './openings';
import { buildFloor1Props } from './props';
import { buildFloor1Water } from './water';

THREE.ColorManagement.enabled = true;

type Floor1Api = {
  ready: boolean;
  fps: number;
  avgMs: number;
  worstMs: number;
  draws: number;
  voxels: number;
  triangles: number;
  totalTriangles: number;
  quads: number;
  faces: number;
  voxelFaces: number;
  flatFaces: number;
  gpuTriangles: number;
  programs: number;
  gridX: number;
  gridY: number;
  dir: number;
  quality: QualityLevel;
  lantern: boolean;
  cell: number;
  eyeHeight: number;
  fov: number;
  hfov: number;
  aspect: number;
  near: number;
  canvas: { w: number; h: number };
  layout: PortraitLayout | null;
  position: [number, number, number];
  setPosition: (x: number, y: number, dir: number) => void;
  setLookPitch: (rad: number) => void;
  setLookYaw: (rad: number) => void;
  setShotPose: (x: number, y: number, z: number, pitch: number, yaw: number) => void;
  stepForward: () => boolean;
  stepBack: () => boolean;
  turnLeft: () => boolean;
  turnRight: () => boolean;
  strafeLeft: () => boolean;
  strafeRight: () => boolean;
  setHeroDowned: (id: HudHeroId, downed: boolean) => void;
  setHeroHp: (id: HudHeroId, hp: number) => void;
  pushLog: (text: string) => void;
  logLines: string[];
  meanLuma: (band?: { x0?: number; x1?: number; y0?: number; y1?: number }) => number;
  meanRgb: (band?: { x0?: number; x1?: number; y0?: number; y1?: number }) => {
    r: number;
    g: number;
    b: number;
    rb: number;
  };
  sconceVisible: (x: number, y: number, face: string) => boolean;
  hasKey: boolean;
  giveKey: () => void;
  giveItem: (id: string, n?: number) => number;
  getBag: () => Array<{ item: string; count: number }>;
  pickupHere: () => boolean;
  pickupFacing: () => boolean;
  pickupAt: (x: number, y: number) => boolean;
  openBag: () => void;
  closeBag: () => void;
  bagOpen: () => boolean;
  noteOpen: () => boolean;
  hideNote: () => boolean;
  useBagSlot: (i: number) => void;
  equipBagSlot: (i: number, hero: string, slot?: 'main' | 'off' | 'armour' | 'trinket') => boolean;
  getHands: () => Array<{ id: string; main: string; off: string; armour?: string }>;
  floorItems: () => Array<{ x: number; y: number; item: string; visible: boolean }>;
  lastMessage: string;
  lastUi: () => string[];
  prompt: string;
  doorAhead: () => { x: number; y: number } | null;
  handleDoor: (x?: number, y?: number) => string;
  snapDoor: (x: number, y: number, open: boolean) => boolean;
  poseDoor: (x: number, y: number, t: number) => boolean;
  doorOpen: (x: number, y: number) => boolean;
  doorBusy: (x: number, y: number) => boolean;
  doorLocked: (x: number, y: number) => boolean;
  openSecret: (x: number, y: number) => boolean;
  secretOpen: (x: number, y: number) => boolean;
  interact: () => string;
  objectNames: () => string[];
  phase: string;
  introVisible: boolean;
  titleVisible: boolean;
  audioUnlocked: boolean;
  lastBark: string | null;
  lastBarkTrigger: string | null;
  skipIntro: () => void;
  speakBark: (trigger: string, speaker?: HudHeroId) => boolean;
  unlockAudio: () => void;
  storyLog: (key: string) => string;
  lights: {
    mode: LightMode;
    lantern: number;
    torches: number;
    torchesLit: number;
    torchesActive: number;
    sunbeams: number;
    sunbeamsActive: number;
    total: number;
  };
  stepWorstMs: number;
  stepWorstWorkMs: number;
  stepArrivalMs: number;
  stepBuildMs: number;
  cacheSize: number;
};

const STATS_WINDOW_MS = 2000;

function isMobile(): boolean {
  return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 700;
}

function showDevHud(): boolean {
  const q = new URLSearchParams(location.search);
  return q.get('dev') === '1' || q.get('test') === '1';
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('floor1-canvas') as HTMLCanvasElement;
  const statsEl = document.getElementById('stats')!;
  const loading = document.getElementById('loading')!;
  const hud = document.getElementById('hud')!;
  const safeProbe = document.getElementById('safe-probe');
  const querySafe = parseSafeQuery(location.search);

  const params = new URLSearchParams(location.search);
  const preserveBuffer = params.get('test') === '1';
  const hiresShot = params.get('shot') === '1';
  const lightMode = parseLightMode(location.search, readStoredQuality());
  const quality = qualityFromLightMode(lightMode);
  const gameplay = new Floor1Gameplay(location.search, quality);
  const devHud = showDevHud();
  hud.hidden = !devHud;
  loading.textContent = 'Loading story…';
  await gameplay.loadStory(location.search);

  const btnDoor = document.getElementById('btn-door') as HTMLButtonElement | null;
  let debugKey = params.get('key') === '1';
  let promptText = '';
  let partyUi: Floor1PartyUi | null = null;
  const showPrompt = (text: string): void => {
    promptText = text;
    if (text && text !== gameplay.lastMessage) partyUi?.pushLog(text);
  };
  const btnQuality = document.getElementById('btn-quality') as HTMLButtonElement | null;
  const labelQuality = (q: QualityLevel): string => (q === 'max' ? 'Gfx Max' : 'Gfx Med');
  if (btnQuality) {
    btnQuality.textContent = labelQuality(quality);
    btnQuality.addEventListener('click', (e) => {
      e.stopPropagation();
      writeStoredQuality(quality === 'max' ? 'medium' : 'max');
      const url = new URL(location.href);
      url.searchParams.delete('lights');
      location.replace(url.toString());
    });
  }

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: preserveBuffer
  });
  renderer.setPixelRatio(hiresShot ? Math.max(1, window.devicePixelRatio || 1) : 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.localClippingEnabled = true;

  const look = lookColors(1, false);
  const fog = look.fog;
  renderer.setClearColor(fog, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(fog);
  scene.fog = new THREE.Fog(fog, FOG_NEAR, FOG_FAR);

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, CAMERA_VIEW_ASPECT, CAMERA_NEAR, CAMERA_FAR);
  camera.rotation.order = 'YXZ';

  const hemi = new THREE.HemisphereLight(0x2a241c, 0x080605, 0.04);
  hemi.color.setRGB(look.ambientSky[0], look.ambientSky[1], look.ambientSky[2]);
  hemi.groundColor.setRGB(look.ambientGround[0], look.ambientGround[1], look.ambientGround[2]);
  hemi.layers.enable(BRACKET_LAYER);
  scene.add(hemi);
  const fillLight = new THREE.AmbientLight(0x1c1814, 0.015);
  fillLight.color.setRGB(look.ambientFill[0], look.ambientFill[1], look.ambientFill[2]);
  fillLight.layers.enable(BRACKET_LAYER);
  scene.add(fillLight);

  const lanternLight = new THREE.PointLight(LANTERN_COLOR, LANTERN_INTENSITY, LANTERN_DISTANCE, 2);
  lanternLight.position.set(LANTERN_HOLD[0], LANTERN_HOLD[1], LANTERN_HOLD[2]);
  lanternLight.castShadow = false;
  lanternLight.color.setRGB(look.lantern[0], look.lantern[1], look.lantern[2]);
  camera.add(lanternLight);

  const lanternSpotMap = isMobile() ? LANTERN_SPOT_MAP_MOBILE : LANTERN_SPOT_MAP_DESKTOP;
  const lanternSpot = new THREE.SpotLight(
    LANTERN_COLOR,
    LANTERN_SPOT_INTENSITY,
    LANTERN_DISTANCE,
    LANTERN_SPOT_ANGLE,
    0.35,
    1.6
  );
  lanternSpot.name = 'lantern-spot';
  lanternSpot.position.set(LANTERN_HOLD[0], LANTERN_HOLD[1], LANTERN_HOLD[2]);
  lanternSpot.target.position.set(LANTERN_HOLD[0], LANTERN_HOLD[1] - 0.2, LANTERN_HOLD[2] - 4);
  lanternSpot.color.setRGB(look.lantern[0], look.lantern[1], look.lantern[2]);
  lanternSpot.castShadow = true;
  lanternSpot.shadow.mapSize.set(lanternSpotMap, lanternSpotMap);
  lanternSpot.shadow.bias = -0.0002;
  lanternSpot.shadow.normalBias = 0.01;
  lanternSpot.shadow.radius = 1;
  lanternSpot.shadow.intensity = 1;
  lanternSpot.shadow.camera.near = 0.12;
  lanternSpot.shadow.camera.far = LANTERN_DISTANCE;
  lanternSpot.shadow.camera.updateProjectionMatrix();
  camera.add(lanternSpot);
  camera.add(lanternSpot.target);
  camera.layers.enable(BRACKET_LAYER);
  lanternLight.layers.enable(BRACKET_LAYER);
  lanternSpot.layers.enable(BRACKET_LAYER);
  scene.add(camera);
  gameplay.attach(scene);

  const mover = new GridMover(camera, floor1Map);

  loading.textContent = 'Meshing floor 1…';
  const portraitsReady = preloadPortraitArt();
  const level = await buildFloor1(floor1Map, mover.x, mover.y, lightMode === 'all');
  scene.add(level.group);

  const lights = new Floor1Lights(floor1Map, lightMode);
  lights.attach(scene, floor1Sconces, floor1Sunbeams);

  loading.textContent = 'Placing torches…';
  const props = await buildFloor1Props(floor1Sconces, floor1Sunbeams);
  scene.add(props.group);
  const openings = await buildFloor1Openings(floor1Map, lightMode === 'all');
  scene.add(openings.group);
  const floorItems = await buildFloor1Items(floor1Map);
  scene.add(floorItems.group);
  const markers = await buildFloor1Markers(floor1Map);
  scene.add(markers.group);
  const water = await buildFloor1Water(floor1Map, floor1Sconces);
  scene.add(water.group);

  const currentSafe = (): { top: number; right: number; bottom: number; left: number } => {
    if (querySafe) return querySafe;
    if (safeProbe) return readSafeInsets(safeProbe);
    return { top: 0, right: 0, bottom: 0, left: 0 };
  };

  const resize = (): void => {
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    const layout = measurePortraitLayout(cssW, cssH, currentSafe());
    canvas.style.imageRendering = 'pixelated';
    canvas.style.width = `${layout.view.w}px`;
    canvas.style.height = `${layout.view.h}px`;
    renderer.setSize(layout.view.w, layout.view.h, false);
    applyCameraProjection(camera, layout.projection);
    partyUi?.applyLayout(layout);
    latestLayout = layout;
  };
  let latestLayout = measurePortraitLayout(window.innerWidth, window.innerHeight, currentSafe());
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  window.visualViewport?.addEventListener('resize', resize);

  const syncShadows = (): void => {
    applyShadowToggle({
      on: true,
      renderer,
      lights: [{ light: lanternSpot, active: true }, ...lights.shadowLights()],
      roots: [scene]
    });
  };

  const placeLights = (now: number): void => {
    const px = mover.kind === 'step' ? mover.toX : mover.x;
    const py = mover.kind === 'step' ? mover.toY : mover.y;
    lights.setParty(px, py, now, preserveBuffer);
    const flick = preserveBuffer ? 1 : 1 + 0.05 * Math.sin(now * 0.001 * 6.1);
    level.setBakeBlends(lights.blends, flick);
    props.update(
      camera,
      now,
      preserveBuffer,
      mover.kind === 'step' ? { x: mover.toX, y: mover.toY, dir: mover.toDir } : null
    );
    openings.system.setBakeBlends(lights.blends, flick);
    floorItems.update(camera);
  };

  const renderFrame = (): { draws: number; tris: number } => {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    return { draws: renderer.info.render.calls, tris: renderer.info.render.triangles };
  };

  const samplePixels = (
    band?: { x0?: number; x1?: number; y0?: number; y1?: number }
  ): { r: number; g: number; b: number; luma: number; rb: number; n: number } => {
    renderFrame();
    const gl = renderer.getContext();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const x0 = Math.max(0, Math.floor((band?.x0 ?? 0) * w));
    const x1 = Math.min(w, Math.ceil((band?.x1 ?? 1) * w));
    const y0 = Math.max(0, Math.floor((band?.y0 ?? 0) * h));
    const y1 = Math.min(h, Math.ceil((band?.y1 ?? 1) * h));
    const rows = Math.max(1, y1 - y0);
    const pixels = new Uint8Array(w * rows * 4);
    gl.readPixels(0, y0, w, rows, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = x0; col < x1; col++) {
        const o = (row * w + col) * 4;
        r += pixels[o];
        g += pixels[o + 1];
        b += pixels[o + 2];
        n += 1;
      }
    }
    const rr = n > 0 ? r / n / 255 : 0;
    const gg = n > 0 ? g / n / 255 : 0;
    const bb = n > 0 ? b / n / 255 : 0;
    return {
      r: rr,
      g: gg,
      b: bb,
      luma: 0.2126 * rr + 0.7152 * gg + 0.0722 * bb,
      rb: bb > 0.001 ? rr / bb : 99,
      n
    };
  };

  // Draw 1px on the real framebuffer so uploads use the same programs as a frame.
  const warmupVP = new THREE.Vector4();
  const uploadPending = (): void => {
    renderer.getViewport(warmupVP);
    renderer.setRenderTarget(null);
    renderer.setScissorTest(true);
    renderer.setScissor(0, 0, 1, 1);
    renderer.setViewport(0, 0, 1, 1);
    renderer.render(scene, camera);
    renderer.setScissorTest(false);
    renderer.setViewport(warmupVP);
  };

  const prepareCell = (x: number, y: number): number => {
    const created = level.prefetch(x, y);
    if (created) level.warm(uploadPending);
    level.activate(x, y);
    return created ? level.lastBuildMs : 0;
  };

  let stepTracking = false;
  let stepWorstMs = 0;
  let stepWorstWorkMs = 0;
  let stepArrivalMs = 0;
  let stepBuildMs = 0;
  let lastStepWorstMs = 0;
  let lastStepWorstWorkMs = 0;
  let lastStepArrivalMs = 0;
  let lastStepBuildMs = 0;

  const facing = (): { x: number; y: number } => facingCell(mover.x, mover.y, mover.dir);
  const doorAhead = (): { x: number; y: number } | null => {
    const pos = facing();
    const edge = doorBetween(mover.x, mover.y, pos.x, pos.y);
    return edge ? { x: edge.x, y: edge.y } : null;
  };
  const hasKeyNow = (): boolean => gameplay.hasBagKey() || debugKey;
  const handleDoor = (x?: number, y?: number): string => {
    const ahead = doorAhead();
    const tx = x ?? ahead?.x;
    const ty = y ?? ahead?.y;
    if (tx == null || ty == null || !ahead || ahead.x !== tx || ahead.y !== ty) return 'none';
    const tile = tileAt(floor1Map, tx, ty);
    const locked = !!(tile?.doorLocked && !tile.doorOpen);
    if (locked && !hasKeyNow()) {
      gameplay.onDoorLocked(tx, ty);
      showPrompt('The door is locked. It needs a key.');
      return 'locked';
    }
    if (locked && gameplay.hasBagKey()) gameplay.takeDoorKey();
    else if (locked) debugKey = false;
    const result = openings.system.tryDoor(tx, ty, true, performance.now());
    gameplay.onDoorResult(result, tx, ty);
    if (result === 'locked') showPrompt('The door is locked. It needs a key.');
    if (result === 'unlocking') showPrompt('The key turns. The lock groans open.');
    if (result === 'toggled') showPrompt('');
    return result;
  };
  const tryPickup = (x: number, y: number): boolean => gameplay.pickupItemAt(x, y);
  const interact = (): string => {
    if (gameplay.hideNote()) return 'note';
    if (tryPickup(mover.x, mover.y)) return 'pickup';
    const pos = facing();
    if (tryPickup(pos.x, pos.y)) return 'pickup';
    const tile = tileAt(floor1Map, pos.x, pos.y);
    if (tile?.secret && !tile.secretOpen) {
      const ok = openings.system.openSecret(pos.x, pos.y, performance.now());
      if (ok) {
        showPrompt('The stone grinds aside.');
        gameplay.onSecretOpened();
        markers.update();
      }
      return ok ? 'secret' : 'none';
    }
    const ahead = doorAhead();
    if (ahead) return handleDoor(ahead.x, ahead.y);
    const sconce = facingSconce(floor1Sconces, mover.x, mover.y, mover.dir);
    if (sconce?.capped) {
      showPrompt(TORCH_CAPPED_PROMPT);
      return 'torch_capped';
    }
    const markerLine = markers.interact(mover.x, mover.y, mover.dir);
    if (markerLine) {
      showPrompt(markerLine);
      return 'marker';
    }
    return 'none';
  };
  const syncDoorButton = (): void => {
    if (!btnDoor) return;
    const pos = facing();
    const tile = tileAt(floor1Map, pos.x, pos.y);
    const ahead = doorAhead();
    const doorTile = ahead ? tileAt(floor1Map, ahead.x, ahead.y) : undefined;
    const show = !!(ahead || (tile?.secret && !tile.secretOpen));
    btnDoor.classList.toggle('visible', show);
    btnDoor.textContent = tile?.secret && !tile.secretOpen
      ? 'Push'
      : doorTile?.doorLocked && !doorTile.doorOpen
        ? 'Unlock'
        : doorTile?.doorOpen
          ? 'Close'
          : 'Open';
  };

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const pointerToNdc = (e: PointerEvent): THREE.Vector2 => {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    pointerNdc.set(((e.clientX - rect.left) / w) * 2 - 1, -((e.clientY - rect.top) / h) * 2 + 1);
    return pointerNdc;
  };
  const hitFacingDoorLeaf = (e: PointerEvent): boolean => {
    const ahead = doorAhead();
    if (!ahead) return false;
    const visual = openings.system.get(ahead.x, ahead.y);
    if (!visual) return false;
    const targets: THREE.Object3D[] = [];
    for (const panel of visual.panels) {
      panel.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh && obj.userData.doorLeaf) targets.push(obj);
      });
    }
    if (!targets.length) return false;
    camera.updateMatrixWorld();
    raycaster.setFromCamera(pointerToNdc(e), camera);
    return raycaster.intersectObjects(targets, false).length > 0;
  };

  const beginStep = (dirSign: 1 | -1): boolean => {
    if (!gameplay.allowsInput() || gameplay.bagOpen()) return false;
    if (dirSign === 1) {
      const pos = facing();
      const tile = tileAt(floor1Map, pos.x, pos.y);
      if (tile?.secret && !tile.secretOpen) {
        interact();
        return false;
      }
    }
    if (!mover.step(dirSign)) return false;
    stepTracking = true;
    stepWorstMs = 0;
    stepWorstWorkMs = 0;
    stepArrivalMs = 0;
    stepBuildMs = prepareCell(mover.toX, mover.toY);
    if (stepBuildMs > stepWorstMs) stepWorstMs = stepBuildMs;
    if (stepBuildMs > stepWorstWorkMs) stepWorstWorkMs = stepBuildMs;
    return true;
  };

  const onArrived = (fromStep = false): void => {
    level.activate(mover.x, mover.y);
    placeLights(performance.now());
    if (fromStep) gameplay.onStep(mover.x, mover.y);
  };

  const beginStrafe = (dirSign: 1 | -1): boolean => {
    if (!gameplay.allowsInput() || gameplay.bagOpen()) return false;
    if (!mover.strafe(dirSign)) return false;
    stepTracking = true;
    stepWorstMs = 0;
    stepWorstWorkMs = 0;
    stepArrivalMs = 0;
    stepBuildMs = prepareCell(mover.toX, mover.toY);
    if (stepBuildMs > stepWorstMs) stepWorstMs = stepBuildMs;
    if (stepBuildMs > stepWorstWorkMs) stepWorstWorkMs = stepBuildMs;
    return true;
  };

  await portraitsReady;
  partyUi = Floor1PartyUi.mount(
    {
      onTurnLeft: () => gameplay.allowsInput() && !gameplay.bagOpen() && mover.turn(1),
      onTurnRight: () => gameplay.allowsInput() && !gameplay.bagOpen() && mover.turn(-1),
      onStepForward: () => beginStep(1),
      onStepBack: () => beginStep(-1),
      onStrafeLeft: () => beginStrafe(-1),
      onStrafeRight: () => beginStrafe(1),
      onInteract: () => (gameplay.allowsInput() ? interact() : 'none'),
      onMenu: () => partyUi?.toggleMenu(),
      onBag: () => {
        partyUi?.closeOverlays();
        gameplay.toggleBag();
      },
      onPortrait: (id) => {
        if (gameplay.handlePortraitTap(id)) return;
        partyUi?.openSheet(id);
      },
      onHand: (id, hand) => {
        if (gameplay.handleHandTap(id, hand)) return;
        const hero = partyUi?.heroes[id];
        const item = hand === 'main' ? hero?.main : hero?.off;
        showPrompt(`${id} ${hand}: ${item ?? 'empty'}`);
      }
    },
    latestLayout
  );
  partyUi.setCompass(mover.dir);
  resize();
  await gameplay.start({
    pushLog: (text) => partyUi?.pushLog(text),
    setSpeaking: (id) => partyUi?.setSpeaking(id),
    party: () =>
      (['brannoc', 'wren', 'ilsevar', 'mags'] as const).map((id) => {
        const hero = partyUi!.heroes[id];
        return {
          id,
          hp: hero.hp,
          maxHp: hero.maxHp,
          mana: hero.mana,
          maxMana: hero.maxMana,
          downed: hero.downed,
          main: hero.main,
          off: hero.off,
          armour: hero.armour
        };
      }),
    oil: () => partyUi?.oil ?? 2,
    setOil: (n) => partyUi?.setOil(n),
    setHand: (id, hand, item) => partyUi?.setHand(id, hand, item),
    setArmour: (id, item) => partyUi?.setArmour(id, item),
    setHeroHp: (id, hp) => {
      partyUi?.setHeroHp(id, hp);
      const hero = partyUi?.heroes[id];
      if (hero) gameplay.noteHero(id, hero.hp, hero.downed);
    },
    setHeroMana: (id, mana) => partyUi?.setHeroMana(id, mana),
    hideItemAt: (x, y) => floorItems.hideAt(x, y),
    openChestAt: (x, y) => floorItems.openChestAt(x, y),
    unlockFacingDoor: () => handleDoor()
  });
  if (debugKey) gameplay.giveItem('key');

  let swipeX = 0;
  let swipeY = 0;
  let swipeDown = false;
  const swipeThreshold = 50;
  const swipeFromView = (e: PointerEvent): boolean => {
    if (!gameplay.allowsInput()) return false;
    if (partyUi?.overlayOpen() || gameplay.bagOpen()) return false;
    const t = e.target as HTMLElement | null;
    if (t?.closest?.('button, .hand-hit, .portrait-cell, .overlay, #stats, #message-log, #tap-to-start, #intro-overlay, #title-overlay, #inventory-screen, #note-overlay')) return false;
    return e.clientY < latestLayout.view.h && e.clientY >= 0;
  };

  window.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || !swipeFromView(e)) return;
    swipeDown = true;
    swipeX = e.clientX;
    swipeY = e.clientY;
  });
  window.addEventListener('pointerup', (e) => {
    if (!e.isPrimary || !swipeDown) return;
    swipeDown = false;
    const dx = e.clientX - swipeX;
    const dy = e.clientY - swipeY;
    if (Math.abs(dx) < 18 && Math.abs(dy) < 18) {
      if (doorAhead()) {
        if (hitFacingDoorLeaf(e)) handleDoor();
        return;
      }
      interact();
      return;
    }
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > swipeThreshold) {
      if (dx > 0) mover.turn(-1);
      else mover.turn(1);
    } else if (Math.abs(dy) > swipeThreshold) {
      if (dy > 0) beginStep(-1);
      else beginStep(1);
    }
  });
  window.addEventListener('pointercancel', () => {
    swipeDown = false;
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (gameplay.hideNote()) return;
      if (gameplay.bagOpen()) {
        gameplay.closeBag();
        return;
      }
      if (gameplay.phase === 'intro') {
        gameplay.skipIntro();
        return;
      }
      partyUi?.closeOverlays();
    }
    if (!gameplay.allowsInput() || gameplay.bagOpen()) return;
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') beginStep(1);
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') beginStep(-1);
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A' || e.key === 'q') mover.turn(1);
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D' || e.key === 'e') mover.turn(-1);
    if (e.key === 'z' || e.key === 'Z') beginStrafe(-1);
    if (e.key === 'c' || e.key === 'C') beginStrafe(1);
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'f' || e.key === 'F') interact();
    if (e.key === 'k' || e.key === 'K') {
      debugKey = true;
      if (!gameplay.hasBagKey()) gameplay.giveItem('key');
    }
    if (e.key === 'i' || e.key === 'I' || e.key === 'b' || e.key === 'B') gameplay.toggleBag();
  });

  const api: Floor1Api = {
    ready: false,
    fps: 0,
    avgMs: 0,
    worstMs: 0,
    draws: 0,
    voxels: level.stats.voxels,
    triangles: level.stats.triangles,
    totalTriangles: level.stats.totalTriangles,
    quads: level.stats.quads,
    faces: level.stats.faces,
    voxelFaces: level.stats.voxelFaces,
    flatFaces: level.stats.flatFaces,
    gpuTriangles: 0,
    programs: 0,
    gridX: mover.x,
    gridY: mover.y,
    dir: mover.dir,
    quality,
    lantern: true,
    cell: CELL,
    eyeHeight: camera.position.y,
    fov: camera.fov,
    hfov: CAMERA_HFOV_DEG,
    aspect: camera.aspect,
    near: CAMERA_NEAR,
    canvas: { w: latestLayout.view.w, h: latestLayout.view.h },
    layout: latestLayout,
    position: [camera.position.x, camera.position.y, camera.position.z],
    setPosition: (x, y, dir) => {
      mover.hold = false;
      mover.setPosition(x, y, dir);
      camera.rotation.x = CAMERA_PITCH;
      prepareCell(x, y);
      onArrived(true);
    },
    stepWorstMs: 0,
    stepWorstWorkMs: 0,
    stepArrivalMs: 0,
    stepBuildMs: 0,
    cacheSize: 1,
    setLookPitch: (rad) => {
      camera.rotation.x = rad;
      camera.updateMatrixWorld();
    },
    setLookYaw: (rad) => {
      camera.rotation.y = rad;
      camera.updateMatrixWorld();
    },
    setShotPose: (x, y, z, pitch, yaw) => {
      mover.hold = true;
      camera.position.set(x, y, z);
      camera.rotation.order = 'YXZ';
      camera.rotation.x = pitch;
      camera.rotation.y = yaw;
      camera.updateMatrixWorld();
      renderFrame();
    },
    stepForward: () => beginStep(1),
    stepBack: () => beginStep(-1),
    turnLeft: () => gameplay.allowsInput() && mover.turn(1),
    turnRight: () => gameplay.allowsInput() && mover.turn(-1),
    strafeLeft: () => beginStrafe(-1),
    strafeRight: () => beginStrafe(1),
    setHeroDowned: (id, downed) => {
      partyUi?.setHeroDowned(id, downed);
      const hero = partyUi?.heroes[id];
      if (hero) gameplay.noteHero(id, hero.hp, hero.downed);
    },
    setHeroHp: (id, hp) => {
      partyUi?.setHeroHp(id, hp);
      const hero = partyUi?.heroes[id];
      if (hero) gameplay.noteHero(id, hero.hp, hero.downed);
    },
    pushLog: (text) => partyUi?.pushLog(text),
    get logLines() {
      return partyUi?.logLines.slice() ?? [];
    },
    meanLuma: (band) => samplePixels(band).luma,
    meanRgb: (band) => {
      const s = samplePixels(band);
      return { r: s.r, g: s.g, b: s.b, rb: s.rb };
    },
    sconceVisible: (x, y, face) => props.sconceVisible(x, y, face),
    get hasKey() {
      return hasKeyNow();
    },
    giveKey: () => {
      debugKey = true;
      if (!gameplay.hasBagKey()) gameplay.giveItem('key');
    },
    giveItem: (id, n = 1) => gameplay.giveItem(id, n),
    getBag: () => gameplay.bag.serialize(),
    pickupHere: () => tryPickup(mover.x, mover.y),
    pickupFacing: () => {
      const pos = facing();
      return tryPickup(pos.x, pos.y);
    },
    pickupAt: (x, y) => tryPickup(x, y),
    openBag: () => gameplay.openBag(),
    closeBag: () => gameplay.closeBag(),
    bagOpen: () => gameplay.bagOpen(),
    noteOpen: () => gameplay.noteOpen,
    hideNote: () => gameplay.hideNote(),
    useBagSlot: (i) => gameplay.useBagSlot(i),
    equipBagSlot: (i, hero, slot) => gameplay.equipBagSlot(i, hero as HudHeroId, slot),
    getHands: () =>
      (['brannoc', 'wren', 'ilsevar', 'mags'] as const).map((id) => {
        const hero = partyUi!.heroes[id];
        return { id, main: hero.main, off: hero.off, armour: hero.armour };
      }),
    floorItems: () => floorItems.snapshot(),
    get lastMessage() {
      return gameplay.lastMessage || promptText;
    },
    lastUi: () => gameplay.audio.lastUi(),
    get prompt() {
      return promptText || gameplay.lastMessage;
    },
    doorAhead,
    handleDoor,
    snapDoor: (x, y, open) => {
      const visual = openings.system.get(x, y);
      if (!visual || visual.kind !== 'door') return false;
      openings.system.snapOpen(visual, open);
      return true;
    },
    poseDoor: (x, y, t) => {
      const visual = openings.system.get(x, y);
      if (!visual) return false;
      openings.system.poseOpen(visual, t);
      return true;
    },
    doorOpen: (x, y) => openings.system.isOpen(x, y),
    doorBusy: (x, y) => openings.system.isBusy(x, y),
    doorLocked: (x, y) => openings.system.isLocked(x, y),
    openSecret: (x, y) => openings.system.openSecret(x, y, performance.now()),
    secretOpen: (x, y) => openings.system.isOpen(x, y),
    interact,
    get phase() {
      return gameplay.phase;
    },
    get introVisible() {
      return gameplay.introVisible();
    },
    get titleVisible() {
      return gameplay.titleVisible();
    },
    get audioUnlocked() {
      return gameplay.audioUnlocked;
    },
    get lastBark() {
      return gameplay.lastBark ? `${gameplay.story.speakerName(gameplay.lastBark.speaker)}: ${gameplay.lastBark.text}` : null;
    },
    get lastBarkTrigger() {
      return gameplay.lastBarkTrigger;
    },
    skipIntro: () => gameplay.skipIntro(),
    speakBark: (trigger, speaker) => gameplay.speakBark(trigger, speaker),
    unlockAudio: () => gameplay.unlock(),
    storyLog: (key) => gameplay.storyLog(key),
    lights: lights.stats,
    objectNames: () => {
      const names: string[] = [];
      scene.traverse((obj) => {
        if (obj.name) names.push(obj.name);
      });
      return names;
    }
  };
  (window as unknown as { __voxelFloor1: Floor1Api }).__voxelFloor1 = api;

  placeLights(performance.now());
  syncShadows();
  renderFrame();
  recompileShadowShaders([scene]);
  renderer.shadowMap.needsUpdate = true;
  renderFrame();

  loading.classList.add('hidden');
  api.ready = true;

  let lastFrame = performance.now();
  let lastHud = 0;
  const frameSamples: Array<{ t: number; dt: number }> = [];

  const loop = (now: number): void => {
    requestAnimationFrame(loop);
    const dt = now - lastFrame;
    lastFrame = now;
    if (dt > 0 && dt < 1000) frameSamples.push({ t: now, dt });
    const cutoff = now - STATS_WINDOW_MS;
    while (frameSamples.length > 1 && frameSamples[0].t < cutoff) frameSamples.shift();

    const fromX = mover.x;
    const fromY = mover.y;
    const arrived = mover.update(now);
    if (arrived) onArrived(fromX !== mover.x || fromY !== mover.y);
    else if (!stepTracking && !mover.moving && level.pump()) level.warm(uploadPending);
    gameplay.update(now, mover.x, mover.y, mover.dir);
    openings.system.update(now);
    markers.update();
    water.update(now, preserveBuffer, camera);
    syncDoorButton();

    if (!preserveBuffer) {
      const k = 1 + LANTERN_FLICKER * Math.sin((now / LANTERN_FLICKER_MS) * Math.PI * 2);
      lanternLight.intensity = LANTERN_INTENSITY * k;
      lanternSpot.intensity = LANTERN_SPOT_INTENSITY * k;
    }
    placeLights(now);

    const frame = renderFrame();
    const workMs = performance.now() - now;
    if (stepTracking || arrived) {
      if (workMs > stepWorstWorkMs) stepWorstWorkMs = workMs;
      const spike = Math.max(dt, workMs);
      if (spike > stepWorstMs) stepWorstMs = spike;
    }
    if (arrived) {
      stepArrivalMs = workMs;
      lastStepWorstMs = stepWorstMs;
      lastStepWorstWorkMs = stepWorstWorkMs;
      lastStepArrivalMs = stepArrivalMs;
      lastStepBuildMs = stepBuildMs;
      stepTracking = false;
    }
    api.draws = frame.draws;
    api.gpuTriangles = renderer.info.render.triangles;
    api.programs = renderer.info.programs?.length ?? 0;
    api.lights = lights.stats;
    api.triangles = level.stats.triangles;
    api.voxelFaces = level.stats.voxelFaces;
    api.flatFaces = level.stats.flatFaces;
    api.gridX = mover.x;
    api.gridY = mover.y;
    api.dir = mover.dir;
    api.eyeHeight = camera.position.y;
    api.fov = camera.fov;
    api.hfov = latestLayout.projection.hfov;
    api.aspect = camera.aspect;
    api.canvas = { w: latestLayout.view.w, h: latestLayout.view.h };
    api.layout = latestLayout;
    partyUi?.setCompass(mover.dir);
    api.position = [camera.position.x, camera.position.y, camera.position.z];
    api.stepWorstMs = lastStepWorstMs;
    api.stepWorstWorkMs = lastStepWorstWorkMs;
    api.stepArrivalMs = lastStepArrivalMs;
    api.stepBuildMs = lastStepBuildMs;
    api.cacheSize = level.cacheSize;
    if (frameSamples.length > 0) {
      const span = now - frameSamples[0].t || dt;
      const avgMs = frameSamples.reduce((s, s0) => s + s0.dt, 0) / frameSamples.length;
      let worstMs = 0;
      for (const s of frameSamples) if (s.dt > worstMs) worstMs = s.dt;
      api.fps = span > 0 ? Math.round((frameSamples.length * 1000) / span) : 0;
      api.avgMs = avgMs;
      api.worstMs = worstMs;
    }
    if (devHud && now - lastHud >= 200) {
      lastHud = now;
      statsEl.innerHTML =
        `<div><b>${api.fps}</b> fps</div>` +
        `<div>${api.avgMs.toFixed(1)} ms avg · <b>${api.worstMs.toFixed(1)}</b> ms worst</div>` +
        `<div>${frame.draws} draws · ${level.stats.triangles.toLocaleString()} tri · ${api.programs} prog</div>` +
        `<div>${api.voxelFaces} vx faces · ${api.flatFaces} flat</div>` +
        `<div>gfx=${api.quality} · lights=${api.lights.mode} · ${api.lights.total} · ${api.lights.torchesActive}/${api.lights.torchesLit} torch · ${api.lights.sunbeamsActive}/${api.lights.sunbeams} beam</div>` +
        `<div>step worst ${lastStepWorstMs.toFixed(1)} · arrive ${lastStepArrivalMs.toFixed(1)} · cache ${level.cacheSize}</div>` +
        (() => {
          const ahead = doorAhead();
          const edge = ahead ? doorEdgeAt(ahead.x, ahead.y) : undefined;
          if (!edge) return '';
          const open = openings.system.isOpen(edge.x, edge.y);
          return `<div>door ${edge.x},${edge.y} ${edge.face} ${open ? 'open' : 'closed'}</div>`;
        })();
    }
  };
  requestAnimationFrame(loop);
}

boot().catch((err) => {
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
  console.error(err);
});
