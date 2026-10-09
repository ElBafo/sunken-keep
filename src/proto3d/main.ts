import { PixelRenderer } from './renderer';
import { SceneBuilder } from './scene-builder';
import { Player } from './player';
import { InputManager } from './input';
import { SpriteManager } from './sprites';
import { AudioManager } from './audio';
import { VertexLightingManager } from './vertex-lighting';
import { floor1, floor1Sconces } from './floor-data';
import * as THREE from 'three';

class Game {
  renderer!: PixelRenderer;
  sceneBuilder!: SceneBuilder;
  player!: Player;
  inputManager!: InputManager;
  spriteManager!: SpriteManager;
  vertexLighting!: VertexLightingManager;
  audioManager!: AudioManager;
  
  lastTime = 0;
  fpsCounter = document.getElementById('fps-counter')!;
  fpsFrames = 0;
  fpsLastTime = 0;
  lastFps = 0;
  
  async init() {
    const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
    
    // Setup renderer
    this.renderer = new PixelRenderer(canvas);
    await this.renderer.loadPalette();
    
    // Check for palette toggle
    const params = new URLSearchParams(window.location.search);
    if (params.get('palette') === '0') {
      this.renderer.setPaletteEnabled(false);
    }
    
    // Show FPS counter only with ?debug=1
    if (params.get('debug') === '1') {
      this.fpsCounter.style.display = 'block';
    }
    
    // Load textures and build scene
    this.sceneBuilder = new SceneBuilder();
    await this.sceneBuilder.loadTextures();
    
    console.log('Building scene from floor1 data...');
    const sceneGroup = this.sceneBuilder.buildScene(this.renderer.scene, floor1);
    console.log('Scene group children:', sceneGroup.children.length);
    console.log('Scene.children before check:', this.renderer.scene.children.length);
    
    // Traverse and count meshes
    let meshCount = 0;
    this.renderer.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) meshCount++;
    });
    console.log('Total meshes in scene:', meshCount);
    
    console.log('Scene total objects:', this.renderer.scene.children.length);
    
    // Setup player (optional ?x=&y=&dir= start pose for tests)
    this.player = new Player(this.renderer.camera, floor1);
    const startX = params.has('x') ? Number(params.get('x')) : floor1.startX;
    const startY = params.has('y') ? Number(params.get('y')) : floor1.startY;
    const startDir = params.has('dir') ? Number(params.get('dir')) : floor1.startDir;
    if (Number.isFinite(startX) && Number.isFinite(startY) && Number.isFinite(startDir)) {
      this.player.setPosition(startX, startY, startDir);
    }
    console.log('Player position:', this.player.x, this.player.y, 'dir:', this.player.dir);
    console.log('Camera position:', this.renderer.camera.position.toArray());
    console.log('Camera rotation:', this.renderer.camera.rotation.toArray().slice(0, 3));
    
    // Setup lighting
    // Setup vertex lighting manager
    this.vertexLighting = new VertexLightingManager(floor1, floor1Sconces);
    this.vertexLighting.setPartyPosition(this.player.x, this.player.y);
    
    // Log a few sample brightness calculations
    console.log('Sample brightness at party (1,7):', 
      (this.vertexLighting as any).calculateBrightness(1, 7, false));
    console.log('Sample brightness at (1,6) one square ahead:', 
      (this.vertexLighting as any).calculateBrightness(1, 6, false));
    console.log('Sample brightness at (1,5) two squares ahead:', 
      (this.vertexLighting as any).calculateBrightness(1, 5, false));
    
    this.vertexLighting.registerScene(this.renderer.scene);
    this.vertexLighting.updateAllMeshes(this.renderer.scene);
    console.log('Vertex lighting initialized');
    
    console.log('Loading sprites...');
    this.spriteManager = new SpriteManager(this.renderer.camera);
    await this.spriteManager.loadSprites(this.renderer.scene, floor1, floor1Sconces);
    const slime = this.spriteManager.sprites.find(s => s.frames && s.frames.length === 4 && s.x === 7 && s.y === 2);
    console.log('Sprites added:', this.spriteManager.sprites.length);
    console.log('Sprite positions:', this.spriteManager.sprites.map(s => `(${s.x},${s.y})`));
    console.log('Slime sprite:', slime ? `world (${slime.object.position.x}, ${slime.object.position.y}, ${slime.object.position.z})` : 'MISSING');
    
    // Setup audio
    this.audioManager = new AudioManager(this.renderer.camera);
    await this.audioManager.init();
    
    // Setup input
    this.inputManager = new InputManager(this.player);
    
    // Setup tap to start
    this.setupTapToStart();

    this.exposeDebugApi();
  }

  exposeDebugApi() {
    (window as unknown as { __proto3d: unknown }).__proto3d = {
      ready: true,
      setPosition: (x: number, y: number, dir: number) => {
        this.player.setPosition(x, y, dir);
        this.vertexLighting.setPartyPosition(this.player.x, this.player.y);
        this.vertexLighting.updateAllMeshes(this.renderer.scene);
        this.spriteManager.update(performance.now());
        this.renderer.render();
      },
      getPosition: () => ({ x: this.player.x, y: this.player.y, dir: this.player.dir }),
      sprites: () => this.spriteManager.sprites.map(s => ({
        x: s.x,
        y: s.y,
        world: s.object.position.toArray(),
        frames: s.frames?.length ?? 0,
        currentFrame: s.currentFrame
      })),
      getCamera: () => ({
        position: this.renderer.camera.position.toArray(),
        rotation: this.renderer.camera.rotation.toArray().slice(0, 3),
        fov: this.renderer.camera.fov
      }),
      meanLuma: () => {
        this.renderer.render();
        const gl = this.renderer.renderer.getContext();
        const w = this.renderer.canvas.width;
        const h = this.renderer.canvas.height;
        const pixels = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let sum = 0;
        const n = w * h;
        for (let i = 0; i < pixels.length; i += 4) {
          sum += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
        }
        return sum / n;
      },
      fps: () => this.lastFps
    };
  }
  
  setupTapToStart() {
    const tapToStart = document.getElementById('tap-to-start')!;
    
    const start = async () => {
      tapToStart.classList.add('hidden');
      
      // Unlock audio
      this.audioManager.unlock();
      await this.audioManager.loadSounds(this.renderer.scene, floor1Sconces);
      
      // Start game loop
      this.lastTime = performance.now();
      this.fpsLastTime = this.lastTime;
      requestAnimationFrame(() => this.gameLoop());
    };
    
    tapToStart.addEventListener('click', start);
  }
  
  gameLoop() {
    const now = performance.now();
    const deltaTime = now - this.lastTime;
    this.lastTime = now;
    
    // Update
    const prevX = this.player.x;
    const prevY = this.player.y;
    this.player.update(deltaTime);

    // Rebake vertex lighting when the party tile changes
    if (this.player.x !== prevX || this.player.y !== prevY) {
      this.vertexLighting.setPartyPosition(this.player.x, this.player.y);
      this.vertexLighting.updateAllMeshes(this.renderer.scene);
    }

    const prevFrame = this.spriteManager.sconceFrame();
    this.spriteManager.update(now);
    const nextFrame = this.spriteManager.sconceFrame();
    if (nextFrame !== prevFrame) {
      this.vertexLighting.setFlickerFrame(nextFrame);
    }
    
    // Render
    this.renderer.render();
    
    // FPS counter
    this.fpsFrames++;
    if (now - this.fpsLastTime >= 1000) {
      const fps = Math.round((this.fpsFrames * 1000) / (now - this.fpsLastTime));
      this.fpsCounter.textContent = `FPS: ${fps}`;
      this.lastFps = fps;
      this.fpsFrames = 0;
      this.fpsLastTime = now;
    }
    
    requestAnimationFrame(() => this.gameLoop());
  }
}

// Start the game
const game = new Game();
game.init().catch(err => {
  console.error('Failed to initialize game:', err);
  alert('Failed to load game. Check console for details.');
});
