import { PixelRenderer } from './renderer';
import { SceneBuilder } from './scene-builder';
import { Player } from './player';
import { InputManager } from './input';
import { SpriteManager } from './sprites';
import { LightingManager } from './lighting';
import { AudioManager } from './audio';
import { floor1, floor1Sconces } from './floor-data';
import * as THREE from 'three';

class Game {
  renderer!: PixelRenderer;
  sceneBuilder!: SceneBuilder;
  player!: Player;
  inputManager!: InputManager;
  spriteManager!: SpriteManager;
  lightingManager!: LightingManager;
  audioManager!: AudioManager;
  
  lastTime = 0;
  fpsCounter = document.getElementById('fps-counter')!;
  fpsFrames = 0;
  fpsLastTime = 0;
  
  async init() {
    const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
    
    // Setup renderer
    this.renderer = new PixelRenderer(canvas);
    
    // DEBUG: Remove red background now that we're checking render target
    // this.renderer.scene.background = new THREE.Color(0xff0000);
    
    // Temporarily disable palette for debugging
    this.renderer.setPaletteEnabled(false);
    
    await this.renderer.loadPalette();
    
    // Check for palette toggle
    const params = new URLSearchParams(window.location.search);
    if (params.get('palette') === '0') {
      this.renderer.setPaletteEnabled(false);
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
    
    // Setup player
    this.player = new Player(this.renderer.camera, floor1);
    console.log('Player position:', this.player.x, this.player.y, 'dir:', this.player.dir);
    console.log('Camera position:', this.renderer.camera.position.toArray());
    console.log('Camera rotation:', this.renderer.camera.rotation.toArray().slice(0, 3));
    
    // Setup lighting
    this.lightingManager = new LightingManager();
    this.lightingManager.setupLights(this.renderer.scene, floor1Sconces, this.renderer.camera);
    console.log('Lights added:', this.lightingManager.lights.length);
    
    // Setup sprites
    this.spriteManager = new SpriteManager(this.renderer.camera);
    await this.spriteManager.loadSprites(this.renderer.scene, floor1, floor1Sconces);
    console.log('Sprites added:', this.spriteManager.sprites.length);
    
    // Setup audio
    this.audioManager = new AudioManager(this.renderer.camera);
    await this.audioManager.init();
    
    // Setup input
    this.inputManager = new InputManager(this.player);
    
    // Setup tap to start
    this.setupTapToStart();
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
    this.player.update(deltaTime);
    this.spriteManager.update(now);
    this.lightingManager.update(now, this.renderer.camera);
    
    // Render
    this.renderer.render();
    
    // FPS counter
    this.fpsFrames++;
    if (now - this.fpsLastTime >= 1000) {
      const fps = Math.round((this.fpsFrames * 1000) / (now - this.fpsLastTime));
      this.fpsCounter.textContent = `FPS: ${fps}`;
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
