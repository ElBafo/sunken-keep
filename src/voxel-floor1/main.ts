import * as THREE from 'three';
import {
  CAMERA_FAR,
  CAMERA_FOV,
  CAMERA_NEAR,
  CAMERA_PITCH,
  CAMERA_VIEW_ASPECT,
  CAMERA_VIEW_H,
  CAMERA_VIEW_W,
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
import { GridMover } from './camera';
import { lookColors } from '../voxel-lab/look';
import { applyShadowToggle, recompileShadowShaders } from '../voxel-lab/shadows';
import { floor1Sconces, floor1Sunbeams } from './fixtures';
import {
  Floor1Lights,
  parseLightMode,
  qualityFromLightMode,
  readStoredQuality,
  writeStoredQuality,
  type LightMode,
  type QualityLevel
} from './lights';
import { floor1Map } from './layout';
import { buildFloor1 } from './level';
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
  aspect: number;
  near: number;
  canvas: { w: number; h: number };
  position: [number, number, number];
  setPosition: (x: number, y: number, dir: number) => void;
  setLookPitch: (rad: number) => void;
  stepForward: () => boolean;
  stepBack: () => boolean;
  turnLeft: () => boolean;
  turnRight: () => boolean;
  meanLuma: (band?: { y0?: number; y1?: number }) => number;
  meanRgb: (band?: { y0?: number; y1?: number }) => { r: number; g: number; b: number; rb: number };
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
  const btnFwd = document.getElementById('btn-fwd') as HTMLButtonElement;
  const btnBack = document.getElementById('btn-back') as HTMLButtonElement;
  const btnLeft = document.getElementById('btn-left') as HTMLButtonElement;
  const btnRight = document.getElementById('btn-right') as HTMLButtonElement;
  const loading = document.getElementById('loading')!;
  const hud = document.getElementById('hud')!;

  const params = new URLSearchParams(location.search);
  const preserveBuffer = params.get('test') === '1';
  const lightMode = parseLightMode(location.search, readStoredQuality());
  const quality = qualityFromLightMode(lightMode);
  const devHud = showDevHud();
  hud.hidden = !devHud;

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
  renderer.setPixelRatio(1);
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
  scene.fog = new THREE.Fog(fog, FOG_NEAR, FOG_FAR);

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, CAMERA_VIEW_ASPECT, CAMERA_NEAR, CAMERA_FAR);
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
  const level = await buildFloor1(floor1Map, mover.x, mover.y, lightMode === 'all');
  scene.add(level.group);

  const lights = new Floor1Lights(floor1Map, lightMode);
  lights.attach(scene, floor1Sconces, floor1Sunbeams);

  loading.textContent = 'Placing torches…';
  const props = await buildFloor1Props(floor1Sconces, floor1Sunbeams);
  scene.add(props.group);

  const resize = (): void => {
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    const scale = Math.min(cssW / CAMERA_VIEW_W, cssH / CAMERA_VIEW_H);
    const w = Math.max(1, Math.round(CAMERA_VIEW_W * scale));
    const h = Math.max(1, Math.round(CAMERA_VIEW_H * scale));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.style.imageRendering = 'pixelated';
    renderer.setSize(CAMERA_VIEW_W, CAMERA_VIEW_H, false);
    camera.aspect = CAMERA_VIEW_ASPECT;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);
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
    props.update(px, py, mover.dir, now, preserveBuffer);
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

  // Keep shadowMap on so warmup does not compile a second MeshPhysical variant.
  const warmupRT = new THREE.WebGLRenderTarget(1, 1);
  const uploadPending = (): void => {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(warmupRT);
    renderer.render(scene, camera);
    renderer.setRenderTarget(prev);
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

  const beginStep = (dirSign: 1 | -1): boolean => {
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

  const onArrived = (): void => {
    level.activate(mover.x, mover.y);
    placeLights(performance.now());
  };

  btnFwd.addEventListener('click', (e) => {
    e.stopPropagation();
    beginStep(1);
  });
  btnBack.addEventListener('click', (e) => {
    e.stopPropagation();
    beginStep(-1);
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
      if (dy > 0) beginStep(-1);
      else beginStep(1);
    }
  });
  canvas.addEventListener('pointercancel', () => {
    swipeDown = false;
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') beginStep(1);
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') beginStep(-1);
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
    gpuTriangles: 0,
    programs: 0,
    gridX: mover.x,
    gridY: mover.y,
    dir: mover.dir,
    quality,
    lantern: true,
    cell: CELL,
    eyeHeight: camera.position.y,
    fov: CAMERA_FOV,
    aspect: CAMERA_VIEW_ASPECT,
    near: CAMERA_NEAR,
    canvas: { w: CAMERA_VIEW_W, h: CAMERA_VIEW_H },
    position: [camera.position.x, camera.position.y, camera.position.z],
    setPosition: (x, y, dir) => {
      mover.setPosition(x, y, dir);
      camera.rotation.x = CAMERA_PITCH;
      prepareCell(x, y);
      onArrived();
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
    stepForward: () => beginStep(1),
    stepBack: () => beginStep(-1),
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
    else if (!stepTracking && !mover.moving && level.pump()) level.warm(uploadPending);

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
    api.aspect = camera.aspect;
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
        `<div>step worst ${lastStepWorstMs.toFixed(1)} · arrive ${lastStepArrivalMs.toFixed(1)} · cache ${level.cacheSize}</div>`;
    }
  };
  requestAnimationFrame(loop);
}

boot().catch((err) => {
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
  console.error(err);
});
