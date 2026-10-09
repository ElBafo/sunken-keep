import { PixelRenderer } from './renderer';
import { SceneBuilder } from './scene-builder';
import { Player } from './player';
import { InputManager } from './input';
import { SpriteManager } from './sprites';
import { LightingManager } from './lighting';
import { AudioManager } from './audio';
import { floor1, floor1Sconces } from './floor-data';

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
    await this.renderer.loadPalette();
    
    // Check for palette toggle
    const params = new URLSearchParams(window.location.search);
    if (params.get('palette') === '0') {
      this.renderer.setPaletteEnabled(false);
    }
    
    // Load textures and build scene
    this.sceneBuilder = new SceneBuilder();
    await this.sceneBuilder.loadTextures();
    this.sceneBuilder.buildScene(this.renderer.scene, floor1);
    
    // Setup player
    this.player = new Player(this.renderer.camera, floor1);
    
    // Setup lighting
    this.lightingManager = new LightingManager();
    this.lightingManager.setupLights(this.renderer.scene, floor1Sconces, this.renderer.camera);
    
    // Setup sprites
    this.spriteManager = new SpriteManager(this.renderer.camera);
    await this.spriteManager.loadSprites(this.renderer.scene, floor1, floor1Sconces);
    
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
