import * as THREE from 'three';
import {
  CAMERA_FAR,
  CAMERA_FOV,
  CAMERA_NEAR,
  CAMERA_PITCH,
  CELL,
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
import { GridMover } from './camera';
import { lookColors } from '../voxel-lab/look';
import { applyShadowToggle, recompileShadowShaders } from '../voxel-lab/shadows';
import { floor1Sconces, floor1Sunbeams } from './fixtures';
import { Floor1Lights } from './lights';
import { floor1Map } from './layout';
import { buildFloor1 } from './level';
import { TorchLightPools } from './pools';
import { buildFloor1Props } from './props';

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
  gridX: number;
  gridY: number;
  dir: number;
  lantern: boolean;
  cell: number;
  eyeHeight: number;
  fov: number;
  setPosition: (x: number, y: number, dir: number) => void;
  setLookPitch: (rad: number) => void;
  stepForward: () => boolean;
  stepBack: () => boolean;
  turnLeft: () => boolean;
  turnRight: () => boolean;
  meanLuma: (band?: { y0?: number; y1?: number }) => number;
  meanRgb: (band?: { y0?: number; y1?: number }) => { r: number; g: number; b: number; rb: number };
  lights: {
    lantern: number;
    torches: number;
    torchesLit: number;
    torchesActive: number;
    sunbeams: number;
    sunbeamsActive: number;
    total: number;
  };
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
  const btnFwd = document.getElementById('btn-fwd') as HTMLButtonElement;
  const btnBack = document.getElementById('btn-back') as HTMLButtonElement;
  const btnLeft = document.getElementById('btn-left') as HTMLButtonElement;
  const btnRight = document.getElementById('btn-right') as HTMLButtonElement;
  const loading = document.getElementById('loading')!;
  const hud = document.getElementById('hud')!;

  const params = new URLSearchParams(location.search);
  const preserveBuffer = params.get('test') === '1';
  const devHud = showDevHud();
  hud.hidden = !devHud;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: preserveBuffer
  });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const look = lookColors(1, false);
  const fog = look.fog;
  renderer.setClearColor(fog, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(fog);
  scene.fog = new THREE.Fog(fog, 10, 22);

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, CAMERA_NEAR, CAMERA_FAR);
  camera.rotation.order = 'YXZ';

  const hemi = new THREE.HemisphereLight(0x2a241c, 0x080605, 0.04);
  hemi.color.setRGB(look.ambientSky[0], look.ambientSky[1], look.ambientSky[2]);
  hemi.groundColor.setRGB(look.ambientGround[0], look.ambientGround[1], look.ambientGround[2]);
  scene.add(hemi);
  const fillLight = new THREE.AmbientLight(0x1c1814, 0.015);
  fillLight.color.setRGB(look.ambientFill[0], look.ambientFill[1], look.ambientFill[2]);
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
  scene.add(camera);

  const mover = new GridMover(camera, floor1Map);

  loading.textContent = 'Meshing floor 1…';
  const level = await buildFloor1(floor1Map, mover.x, mover.y);
  scene.add(level.group);

  const lights = new Floor1Lights(floor1Map);
  lights.attach(scene, floor1Sconces, floor1Sunbeams);

  loading.textContent = 'Placing torches…';
  const props = await buildFloor1Props(floor1Sconces, floor1Sunbeams);
  scene.add(props.group);
  const pools = new TorchLightPools(floor1Map, floor1Sconces);
  scene.add(pools.group);

  const resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);

  let lastLightKey = '';
  const syncShadows = (): void => {
    applyShadowToggle({
      on: true,
      renderer,
      lights: [{ light: lanternSpot, active: true }, ...lights.shadowLights()],
      roots: [scene]
    });
  };

  const placeLights = (now: number): void => {
    lights.setParty(mover.x, mover.y, now, preserveBuffer);
    const flick = preserveBuffer ? 1 : 1 + 0.05 * Math.sin(now * 0.001 * 6.1);
    pools.setBlends(lights.blends, flick);
    props.update(mover.x, mover.y, mover.dir, now, preserveBuffer);
    const key = `${lights.stats.torchesActive}:${lights.stats.sunbeamsActive}`;
    if (key !== lastLightKey) {
      lastLightKey = key;
      syncShadows();
    }
  };

  const renderFrame = (): { draws: number; tris: number } => {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    return { draws: renderer.info.render.calls, tris: renderer.info.render.triangles };
  };

  const samplePixels = (
    band?: { y0?: number; y1?: number }
  ): { r: number; g: number; b: number; luma: number; rb: number; n: number } => {
    renderFrame();
    const gl = renderer.getContext();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const y0 = Math.max(0, Math.floor((band?.y0 ?? 0) * h));
    const y1 = Math.min(h, Math.ceil((band?.y1 ?? 1) * h));
    const rows = Math.max(1, y1 - y0);
    const pixels = new Uint8Array(w * rows * 4);
    gl.readPixels(0, y0, w, rows, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let r = 0;
    let g = 0;
    let b = 0;
    const n = pixels.length / 4;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      r += pixels[o];
      g += pixels[o + 1];
      b += pixels[o + 2];
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

  const onArrived = (): void => {
    const remeshed = level.setParty(mover.x, mover.y);
    placeLights(performance.now());
    if (remeshed) syncShadows();
  };

  btnFwd.addEventListener('click', (e) => {
    e.stopPropagation();
    mover.step(1);
  });
  btnBack.addEventListener('click', (e) => {
    e.stopPropagation();
    mover.step(-1);
  });
  btnLeft.addEventListener('click', (e) => {
    e.stopPropagation();
    mover.turn(1);
  });
  btnRight.addEventListener('click', (e) => {
    e.stopPropagation();
    mover.turn(-1);
  });

  let swipeX = 0;
  let swipeY = 0;
  let swipeDown = false;
  const swipeThreshold = 50;

  canvas.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest?.('button')) return;
    if (!e.isPrimary) return;
    swipeDown = true;
    swipeX = e.clientX;
    swipeY = e.clientY;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* optional */
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!e.isPrimary || !swipeDown) return;
    swipeDown = false;
    const dx = e.clientX - swipeX;
    const dy = e.clientY - swipeY;
    if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > swipeThreshold) {
      if (dx > 0) mover.turn(-1);
      else mover.turn(1);
    } else if (Math.abs(dy) > swipeThreshold) {
      if (dy > 0) mover.step(-1);
      else mover.step(1);
    }
  });
  canvas.addEventListener('pointercancel', () => {
    swipeDown = false;
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') mover.step(1);
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') mover.step(-1);
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A' || e.key === 'q') mover.turn(1);
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D' || e.key === 'e') mover.turn(-1);
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
    gridX: mover.x,
    gridY: mover.y,
    dir: mover.dir,
    lantern: true,
    cell: CELL,
    eyeHeight: camera.position.y,
    fov: CAMERA_FOV,
    setPosition: (x, y, dir) => {
      mover.setPosition(x, y, dir);
      camera.rotation.x = CAMERA_PITCH;
      onArrived();
    },
    setLookPitch: (rad) => {
      camera.rotation.x = rad;
      camera.updateMatrixWorld();
    },
    stepForward: () => mover.step(1),
    stepBack: () => mover.step(-1),
    turnLeft: () => mover.turn(1),
    turnRight: () => mover.turn(-1),
    meanLuma: (band) => samplePixels(band).luma,
    meanRgb: (band) => {
      const s = samplePixels(band);
      return { r: s.r, g: s.g, b: s.b, rb: s.rb };
    },
    lights: lights.stats
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

    const arrived = mover.update(now);
    if (arrived) onArrived();

    if (!preserveBuffer) {
      const k = 1 + LANTERN_FLICKER * Math.sin((now / LANTERN_FLICKER_MS) * Math.PI * 2);
      lanternLight.intensity = LANTERN_INTENSITY * k;
      lanternSpot.intensity = LANTERN_SPOT_INTENSITY * k;
    }
    placeLights(now);

    const frame = renderFrame();
    api.draws = frame.draws;
    api.lights = lights.stats;
    api.triangles = frame.tris;
    api.voxelFaces = level.stats.voxelFaces;
    api.flatFaces = level.stats.flatFaces;
    api.gridX = mover.x;
    api.gridY = mover.y;
    api.dir = mover.dir;
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
        `<div>${frame.draws} draws · ${api.triangles.toLocaleString()} tri</div>` +
        `<div>${api.voxelFaces} vx faces · ${api.flatFaces} flat</div>` +
        `<div>${api.lights.total} lights · ${api.lights.torchesActive}/${api.lights.torchesLit} torch · ${api.lights.sunbeamsActive}/${api.lights.sunbeams} beam</div>`;
    }
  };
  requestAnimationFrame(loop);
}

boot().catch((err) => {
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
  console.error(err);
});
