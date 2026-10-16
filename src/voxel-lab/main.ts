import * as THREE from 'three';
import {
  CAMERA_FAR,
  CAMERA_FOV,
  CAMERA_NEAR,
  CELL,
  EYE_HEIGHT,
  LAMP_COLOR,
  LAMP_DISTANCE,
  LAMP_INTENSITY,
  LANTERN_COLOR,
  LANTERN_DISTANCE,
  LANTERN_FLICKER,
  LANTERN_FLICKER_MS,
  LANTERN_HOLD,
  LANTERN_INTENSITY,
  LANTERN_SHADOW_MAP,
  LOOK_SENS,
  MOVE_MS,
  TURN_MS,
  PITCH_MAX,
  ROOM_TILES,
  SHADOW_MAP_DESKTOP,
  SHADOW_MAP_MOBILE,
  TORCH_COLOR,
  TORCH_DISTANCE,
  TORCH_INTENSITY
} from './constants';
import { buildRoom, loadFlameTextures } from './room';
import { applyShadowToggle } from './shadows';

THREE.ColorManagement.enabled = true;

type LabApi = {
  ready: boolean;
  fps: number;
  avgMs: number;
  worstMs: number;
  draws: number;
  voxels: number;
  triangles: number;
  quads: number;
  shadows: boolean;
  lantern: boolean;
  mode: 'voxel' | 'flat';
  lampLit: boolean;
  shadowMapEnabled: boolean;
  setShadows: (on: boolean) => void;
  setLantern: (on: boolean) => void;
  setMode: (mode: 'voxel' | 'flat') => void;
  setLamp: (on: boolean) => void;
  turnLeft: () => void;
  turnRight: () => void;
  meanLuma: () => number;
  debugShadowState: () => {
    shadowMapEnabled: boolean;
    lightCast: number;
    meshCast: number;
    meshReceive: number;
  };
};

const STATS_WINDOW_MS = 2000;

function isMobile(): boolean {
  return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 700;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('lab-canvas') as HTMLCanvasElement;
  const statsEl = document.getElementById('stats')!;
  const btnShadows = document.getElementById('btn-shadows') as HTMLButtonElement;
  const btnLantern = document.getElementById('btn-lantern') as HTMLButtonElement;
  const btnMode = document.getElementById('btn-mode') as HTMLButtonElement;
  const btnFwd = document.getElementById('btn-fwd') as HTMLButtonElement;
  const btnBack = document.getElementById('btn-back') as HTMLButtonElement;
  const btnLeft = document.getElementById('btn-left') as HTMLButtonElement;
  const btnRight = document.getElementById('btn-right') as HTMLButtonElement;
  const loading = document.getElementById('loading')!;

  const preserveBuffer = new URLSearchParams(location.search).get('test') === '1';
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: preserveBuffer
  });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x050403, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050403);
  scene.fog = new THREE.Fog(0x050403, 10, 22);

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, CAMERA_NEAR, CAMERA_FAR);
  camera.rotation.order = 'YXZ';

  // Keep fill dim so torch/lantern umbras read as real shadows on a phone.
  const ambient = new THREE.HemisphereLight(0x2a241c, 0x080605, 0.08);
  scene.add(ambient);
  scene.add(new THREE.AmbientLight(0x1c1814, 0.03));

  const shadowSize = isMobile() ? SHADOW_MAP_MOBILE : SHADOW_MAP_DESKTOP;
  const makeTorch = (x: number, y: number, z: number): THREE.PointLight => {
    const light = new THREE.PointLight(TORCH_COLOR, TORCH_INTENSITY, TORCH_DISTANCE, 2);
    light.position.set(x, y, z);
    light.castShadow = true;
    light.shadow.mapSize.set(shadowSize, shadowSize);
    light.shadow.camera.near = 0.05;
    light.shadow.camera.far = TORCH_DISTANCE;
    light.shadow.camera.updateProjectionMatrix();
    light.shadow.bias = -0.0006;
    light.shadow.normalBias = 0.02;
    light.shadow.radius = 1;
    light.shadow.intensity = 1;
    scene.add(light);
    return light;
  };

  const torchA = makeTorch(CELL * 1.0, 1.48, 0.38);
  const torchB = makeTorch(CELL * 2.0, 1.48, 0.38);

  const lampLight = new THREE.PointLight(LAMP_COLOR, 0, LAMP_DISTANCE, 1.6);
  lampLight.position.set(CELL * 1.5, 1.35, 0.35);
  lampLight.castShadow = true;
  lampLight.shadow.mapSize.set(shadowSize, shadowSize);
  lampLight.shadow.camera.near = 0.05;
  lampLight.shadow.camera.far = LAMP_DISTANCE;
  lampLight.shadow.camera.updateProjectionMatrix();
  lampLight.shadow.bias = -0.0006;
  lampLight.shadow.normalBias = 0.02;
  lampLight.shadow.radius = 1;
  lampLight.shadow.intensity = 1;
  scene.add(lampLight);

  const lanternLight = new THREE.PointLight(LANTERN_COLOR, LANTERN_INTENSITY, LANTERN_DISTANCE, 2);
  lanternLight.position.set(LANTERN_HOLD[0], LANTERN_HOLD[1], LANTERN_HOLD[2]);
  lanternLight.castShadow = true;
  lanternLight.shadow.mapSize.set(LANTERN_SHADOW_MAP, LANTERN_SHADOW_MAP);
  lanternLight.shadow.camera.near = 0.05;
  lanternLight.shadow.camera.far = LANTERN_DISTANCE;
  lanternLight.shadow.camera.updateProjectionMatrix();
  lanternLight.shadow.bias = -0.0006;
  lanternLight.shadow.normalBias = 0.02;
  lanternLight.shadow.radius = 1;
  lanternLight.shadow.intensity = 1;
  camera.add(lanternLight);
  scene.add(camera);

  loading.textContent = 'Meshing voxels…';
  const room = await buildRoom();
  const flames = await loadFlameTextures();
  scene.add(room.voxelGroup, room.flatGroup, room.propsGroup);

  for (const flame of room.torchFlames) {
    flame.material = new THREE.SpriteMaterial({
      map: flames[0],
      transparent: true,
      alphaTest: 0.2,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending
    });
    flame.scale.set(0.5, 0.62, 1);
    flame.visible = true;
  }

  let gridX = 1;
  let gridZ = 1;
  let yaw = 0;
  let pitch = -0.04;
  let moving = false;
  let shadowsOn = true;
  let lanternOn = true;
  let mode: 'voxel' | 'flat' = 'voxel';
  let lampLit = false;

  const camPos = (gx: number, gz: number): THREE.Vector3 =>
    new THREE.Vector3((gx + 0.5) * CELL, EYE_HEIGHT, (gz + 0.5) * CELL);

  camera.position.copy(camPos(gridX, gridZ));
  camera.rotation.set(pitch, yaw, 0);

  const applyCamera = (): void => {
    camera.rotation.set(pitch, yaw, 0);
  };

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

  const syncShadows = (): ReturnType<typeof applyShadowToggle> =>
    applyShadowToggle({
      on: shadowsOn,
      renderer,
      lights: [
        { light: torchA, active: true },
        { light: torchB, active: true },
        { light: lampLight, active: lampLit },
        { light: lanternLight, active: lanternOn }
      ],
      roots: [scene]
    });

  const setShadows = (on: boolean): void => {
    shadowsOn = on;
    syncShadows();
    btnShadows.textContent = on ? 'Shadows on' : 'Shadows off';
    btnShadows.setAttribute('aria-pressed', on ? 'true' : 'false');
  };

  const setLantern = (on: boolean): void => {
    lanternOn = on;
    lanternLight.intensity = on ? LANTERN_INTENSITY : 0;
    syncShadows();
    btnLantern.textContent = on ? 'Lantern on' : 'Lantern off';
    btnLantern.setAttribute('aria-pressed', on ? 'true' : 'false');
  };

  const setMode = (next: 'voxel' | 'flat'): void => {
    mode = next;
    room.voxelGroup.visible = next === 'voxel';
    room.flatGroup.visible = next === 'flat';
    btnMode.textContent = next === 'voxel' ? 'Voxels' : 'Flat';
    btnMode.setAttribute('aria-pressed', next === 'voxel' ? 'true' : 'false');
  };

  const setLamp = (on: boolean): void => {
    lampLit = on;
    lampLight.intensity = on ? LAMP_INTENSITY : 0;
    syncShadows();
    const mat = room.lampMesh.material as THREE.MeshStandardMaterial;
    mat.emissive.setHex(on ? 0xffcc88 : 0x000000);
    mat.emissiveIntensity = on ? 1.4 : 0;
    mat.emissiveMap = on ? mat.map : null;
  };

  btnShadows.addEventListener('click', (e) => {
    e.stopPropagation();
    setShadows(!shadowsOn);
  });
  btnLantern.addEventListener('click', (e) => {
    e.stopPropagation();
    setLantern(!lanternOn);
  });
  btnMode.addEventListener('click', (e) => {
    e.stopPropagation();
    setMode(mode === 'voxel' ? 'flat' : 'voxel');
  });

  const facing = (): [number, number] => {
    const a = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const oct = Math.round(a / (Math.PI / 2)) % 4;
    const dirs: Array<[number, number]> = [
      [0, -1],
      [-1, 0],
      [0, 1],
      [1, 0]
    ];
    return dirs[oct];
  };

  const step = (dir: 1 | -1): void => {
    if (moving) return;
    const [dx, dz] = facing();
    const nx = gridX + dx * dir;
    const nz = gridZ + dz * dir;
    if (nx < 0 || nz < 0 || nx >= ROOM_TILES || nz >= ROOM_TILES) return;
    moving = true;
    const from = camPos(gridX, gridZ);
    const to = camPos(nx, nz);
    const t0 = performance.now();
    const tick = (now: number): void => {
      const t = Math.min(1, (now - t0) / MOVE_MS);
      const k = easeInOut(t);
      camera.position.lerpVectors(from, to, k);
      if (t < 1) requestAnimationFrame(tick);
      else {
        gridX = nx;
        gridZ = nz;
        camera.position.copy(to);
        moving = false;
      }
    };
    requestAnimationFrame(tick);
  };

  /** 90° in-place turn, same ease as proto3d. dir +1 = left (CCW). */
  const turn = (dir: 1 | -1): void => {
    if (moving) return;
    moving = true;
    const from = yaw;
    const to = yaw + dir * (Math.PI / 2);
    const t0 = performance.now();
    const tick = (now: number): void => {
      const t = Math.min(1, (now - t0) / TURN_MS);
      yaw = from + (to - from) * easeInOut(t);
      applyCamera();
      if (t < 1) requestAnimationFrame(tick);
      else {
        yaw = to;
        applyCamera();
        moving = false;
      }
    };
    requestAnimationFrame(tick);
  };

  btnFwd.addEventListener('click', (e) => {
    e.stopPropagation();
    step(1);
  });
  btnBack.addEventListener('click', (e) => {
    e.stopPropagation();
    step(-1);
  });
  btnLeft.addEventListener('click', (e) => {
    e.stopPropagation();
    turn(1);
  });
  btnRight.addEventListener('click', (e) => {
    e.stopPropagation();
    turn(-1);
  });

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let downX = 0;
  let downY = 0;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  const onDown = (x: number, y: number): void => {
    dragging = true;
    lastX = downX = x;
    lastY = downY = y;
  };
  const onMove = (x: number, y: number): void => {
    if (!dragging || moving) return;
    const dx = x - lastX;
    const dy = y - lastY;
    lastX = x;
    lastY = y;
    yaw -= dx * LOOK_SENS;
    pitch -= dy * LOOK_SENS;
    pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, pitch));
    applyCamera();
  };
  const onUp = (x: number, y: number, target: EventTarget | null): void => {
    if (!dragging) return;
    dragging = false;
    const dist = Math.hypot(x - downX, y - downY);
    if (dist > 10) return;
    if (target instanceof HTMLElement && target.closest('button')) return;
    ndc.x = (x / window.innerWidth) * 2 - 1;
    ndc.y = -(y / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(room.lampTargets);
    if (hits.length) setLamp(!lampLit);
  };

  canvas.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest?.('button')) return;
    canvas.setPointerCapture(e.pointerId);
    onDown(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointermove', (e) => onMove(e.clientX, e.clientY));
  canvas.addEventListener('pointerup', (e) => onUp(e.clientX, e.clientY, e.target));
  canvas.addEventListener('pointercancel', () => {
    dragging = false;
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'w' || e.key === 'ArrowUp') step(1);
    if (e.key === 's' || e.key === 'ArrowDown') step(-1);
    if (e.key === 'q' || e.key === 'ArrowLeft') turn(1);
    if (e.key === 'e' || e.key === 'ArrowRight') turn(-1);
    if (e.key === 'l') setLamp(!lampLit);
  });

  setShadows(true);
  setLantern(true);
  setMode('voxel');
  setLamp(false);

  let flameT = 0;
  let lastFrame = performance.now();
  let lastHud = 0;
  const frameSamples: Array<{ t: number; dt: number }> = [];

  const api: LabApi = {
    ready: true,
    fps: 0,
    avgMs: 0,
    worstMs: 0,
    draws: 0,
    voxels: room.stats.voxels,
    triangles: room.stats.triangles,
    quads: room.stats.quads,
    shadows: true,
    lantern: true,
    mode: 'voxel',
    lampLit: false,
    shadowMapEnabled: true,
    setShadows: (on) => {
      setShadows(on);
      api.shadows = on;
      api.shadowMapEnabled = renderer.shadowMap.enabled;
    },
    setLantern: (on) => {
      setLantern(on);
      api.lantern = on;
    },
    setMode: (m) => {
      setMode(m);
      api.mode = m;
    },
    setLamp: (on) => {
      setLamp(on);
      api.lampLit = on;
    },
    turnLeft: () => turn(1),
    turnRight: () => turn(-1),
    meanLuma: () => {
      renderer.render(scene, camera);
      const gl = renderer.getContext();
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      const pixels = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let sum = 0;
      const n = pixels.length / 4;
      for (let i = 0; i < n; i++) {
        const o = i * 4;
        sum += 0.2126 * pixels[o] + 0.7152 * pixels[o + 1] + 0.0722 * pixels[o + 2];
      }
      return n > 0 ? sum / n / 255 : 0;
    },
    debugShadowState: () => {
      const counts = { meshCast: 0, meshReceive: 0, lightCast: 0 };
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          if (mesh.castShadow) counts.meshCast += 1;
          if (mesh.receiveShadow) counts.meshReceive += 1;
        }
        const light = obj as THREE.Light;
        if (light.isLight && light.castShadow) counts.lightCast += 1;
      });
      return { shadowMapEnabled: renderer.shadowMap.enabled, ...counts };
    }
  };
  (window as unknown as { __voxelLab: LabApi }).__voxelLab = api;

  loading.classList.add('hidden');

  const loop = (now: number): void => {
    requestAnimationFrame(loop);
    const dt = now - lastFrame;
    lastFrame = now;
    // Ignore tab-hidden / screenshot stalls so avg/worst stay real frame times.
    if (dt > 0 && dt < 1000) frameSamples.push({ t: now, dt });
    const cutoff = now - STATS_WINDOW_MS;
    while (frameSamples.length > 1 && frameSamples[0].t < cutoff) frameSamples.shift();

    const t = now * 0.001;
    const flicker = preserveBuffer ? 0 : 1;
    torchA.intensity =
      TORCH_INTENSITY * (1 + flicker * (0.07 * Math.sin(t * 6.1) + 0.04 * Math.sin(t * 13.7)));
    torchB.intensity =
      TORCH_INTENSITY * (1 + flicker * (0.07 * Math.sin(t * 5.4 + 1.2) + 0.04 * Math.sin(t * 11.9)));
    if (lampLit) {
      lampLight.intensity =
        LAMP_INTENSITY * (1 + flicker * (0.03 * Math.sin(t * 2.4) + 0.02 * Math.sin(t * 7.1)));
    }
    if (lanternOn) {
      lanternLight.intensity =
        LANTERN_INTENSITY *
        (1 + flicker * LANTERN_FLICKER * Math.sin((now / LANTERN_FLICKER_MS) * Math.PI * 2));
    }

    if (now - flameT > 200) {
      flameT = now;
      const frame = flames[Math.floor(now / 200) % flames.length];
      for (const spr of room.torchFlames) {
        (spr.material as THREE.SpriteMaterial).map = frame;
      }
    }

    renderer.render(scene, camera);

    const draws = renderer.info.render.calls;
    api.draws = draws;
    if (frameSamples.length > 0) {
      const span = now - frameSamples[0].t || dt;
      const avgMs = frameSamples.reduce((s, s0) => s + s0.dt, 0) / frameSamples.length;
      let worstMs = 0;
      for (const s of frameSamples) if (s.dt > worstMs) worstMs = s.dt;
      const fps = span > 0 ? Math.round((frameSamples.length * 1000) / span) : 0;
      api.fps = fps;
      api.avgMs = avgMs;
      api.worstMs = worstMs;
    }
    api.shadows = shadowsOn;
    api.shadowMapEnabled = renderer.shadowMap.enabled;
    api.lantern = lanternOn;
    api.mode = mode;
    api.lampLit = lampLit;
    if (now - lastHud >= 200) {
      lastHud = now;
      statsEl.innerHTML =
        `<div><b>${api.fps}</b> fps</div>` +
        `<div>${api.avgMs.toFixed(1)} ms avg · <b>${api.worstMs.toFixed(1)}</b> ms worst</div>` +
        `<div>${room.stats.voxels.toLocaleString()} vx · ${draws} draws</div>` +
        `<div>${room.stats.triangles.toLocaleString()} tri</div>`;
    }
  };
  requestAnimationFrame(loop);
}

boot().catch((err) => {
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
  console.error(err);
});
