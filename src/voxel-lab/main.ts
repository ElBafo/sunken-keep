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
  LOOK_SENS,
  MOVE_MS,
  PITCH_MAX,
  ROOM_TILES,
  SHADOW_MAP_DESKTOP,
  SHADOW_MAP_MOBILE,
  TORCH_COLOR,
  TORCH_DISTANCE,
  TORCH_INTENSITY
} from './constants';
import { buildRoom, loadFlameTextures } from './room';

THREE.ColorManagement.enabled = true;

type LabApi = {
  ready: boolean;
  fps: number;
  voxels: number;
  triangles: number;
  quads: number;
  shadows: boolean;
  mode: 'voxel' | 'flat';
  lampLit: boolean;
  setShadows: (on: boolean) => void;
  setMode: (mode: 'voxel' | 'flat') => void;
  setLamp: (on: boolean) => void;
};

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
  const btnMode = document.getElementById('btn-mode') as HTMLButtonElement;
  const btnFwd = document.getElementById('btn-fwd') as HTMLButtonElement;
  const btnBack = document.getElementById('btn-back') as HTMLButtonElement;
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
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x050403, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050403);
  scene.fog = new THREE.Fog(0x050403, 10, 22);

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, CAMERA_NEAR, CAMERA_FAR);
  camera.rotation.order = 'YXZ';

  const ambient = new THREE.HemisphereLight(0x2a241c, 0x080605, 0.22);
  scene.add(ambient);
  scene.add(new THREE.AmbientLight(0x1c1814, 0.08));

  const shadowSize = isMobile() ? SHADOW_MAP_MOBILE : SHADOW_MAP_DESKTOP;
  const makeTorch = (x: number, y: number, z: number): THREE.PointLight => {
    const light = new THREE.PointLight(TORCH_COLOR, TORCH_INTENSITY, TORCH_DISTANCE, 2);
    light.position.set(x, y, z);
    light.castShadow = true;
    light.shadow.mapSize.set(shadowSize, shadowSize);
    light.shadow.camera.near = 0.08;
    light.shadow.camera.far = TORCH_DISTANCE;
    light.shadow.bias = -0.004;
    light.shadow.radius = 2;
    scene.add(light);
    return light;
  };

  const torchA = makeTorch(0.22, 1.48, CELL * 1.5);
  const torchB = makeTorch(CELL * ROOM_TILES - 0.22, 1.48, CELL * 1.5);

  const lampLight = new THREE.PointLight(LAMP_COLOR, 0, LAMP_DISTANCE, 1.6);
  lampLight.position.set(CELL * 1.5, 1.35, 0.35);
  lampLight.castShadow = true;
  lampLight.shadow.mapSize.set(shadowSize, shadowSize);
  lampLight.shadow.camera.near = 0.1;
  lampLight.shadow.camera.far = LAMP_DISTANCE;
  lampLight.shadow.bias = -0.003;
  lampLight.shadow.radius = 2;
  scene.add(lampLight);

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
    flame.scale.set(0.42, 0.52, 1);
    flame.visible = true;
  }

  let gridX = 1;
  let gridZ = 1;
  let yaw = 0;
  let pitch = -0.04;
  let moving = false;
  let shadowsOn = true;
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

  const setShadows = (on: boolean): void => {
    shadowsOn = on;
    torchA.castShadow = on;
    torchB.castShadow = on;
    lampLight.castShadow = on && lampLit;
    btnShadows.textContent = on ? 'Shadows on' : 'Shadows off';
    btnShadows.setAttribute('aria-pressed', on ? 'true' : 'false');
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
    lampLight.castShadow = on && shadowsOn;
    const mat = room.lampMesh.material as THREE.MeshStandardMaterial;
    mat.emissive.setHex(on ? 0xffcc88 : 0x000000);
    mat.emissiveIntensity = on ? 1.4 : 0;
    mat.emissiveMap = on ? mat.map : null;
  };

  btnShadows.addEventListener('click', (e) => {
    e.stopPropagation();
    setShadows(!shadowsOn);
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

  btnFwd.addEventListener('click', (e) => {
    e.stopPropagation();
    step(1);
  });
  btnBack.addEventListener('click', (e) => {
    e.stopPropagation();
    step(-1);
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
    if (!dragging) return;
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
    if (e.key === 'l') setLamp(!lampLit);
  });

  setShadows(true);
  setMode('voxel');
  setLamp(false);

  let frames = 0;
  let fps = 0;
  let fpsT = performance.now();
  let flameT = 0;

  const api: LabApi = {
    ready: true,
    fps: 0,
    voxels: room.stats.voxels,
    triangles: room.stats.triangles,
    quads: room.stats.quads,
    shadows: true,
    mode: 'voxel',
    lampLit: false,
    setShadows: (on) => {
      setShadows(on);
      api.shadows = on;
    },
    setMode: (m) => {
      setMode(m);
      api.mode = m;
    },
    setLamp: (on) => {
      setLamp(on);
      api.lampLit = on;
    }
  };
  (window as unknown as { __voxelLab: LabApi }).__voxelLab = api;

  loading.classList.add('hidden');

  const loop = (now: number): void => {
    requestAnimationFrame(loop);
    frames += 1;
    if (now - fpsT >= 500) {
      fps = Math.round((frames * 1000) / (now - fpsT));
      frames = 0;
      fpsT = now;
      api.fps = fps;
      api.shadows = shadowsOn;
      api.mode = mode;
      api.lampLit = lampLit;
      statsEl.textContent = `${fps} fps  ·  ${room.stats.voxels.toLocaleString()} voxels  ·  ${room.stats.triangles.toLocaleString()} tris`;
    }

    const t = now * 0.001;
    torchA.intensity = TORCH_INTENSITY * (1 + 0.07 * Math.sin(t * 6.1) + 0.04 * Math.sin(t * 13.7));
    torchB.intensity = TORCH_INTENSITY * (1 + 0.07 * Math.sin(t * 5.4 + 1.2) + 0.04 * Math.sin(t * 11.9));
    if (lampLit) {
      lampLight.intensity =
        LAMP_INTENSITY * (1 + 0.03 * Math.sin(t * 2.4) + 0.02 * Math.sin(t * 7.1));
    }

    if (now - flameT > 200) {
      flameT = now;
      const frame = flames[Math.floor(now / 200) % flames.length];
      for (const spr of room.torchFlames) {
        (spr.material as THREE.SpriteMaterial).map = frame;
      }
    }

    renderer.render(scene, camera);
  };
  requestAnimationFrame(loop);
}

boot().catch((err) => {
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
  console.error(err);
});
