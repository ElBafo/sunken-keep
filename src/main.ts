import './style.css';
import { Game } from './game';
import { InputHandler } from './input';
import { loadFont } from './font';
import { loadPortraits } from './characters';
import { loadBarks } from './barks';
import { generateCutscenePlaceholders } from './cutscene-placeholders';
import { assets } from './assets';

const BASE_WIDTH = 270;
const BASE_HEIGHT = 480;

async function main() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  
  // Set base resolution
  canvas.width = BASE_WIDTH;
  canvas.height = BASE_HEIGHT;
  
  // Calculate scale for pixel-perfect integer scaling
  function updateScale() {
    const scaleX = Math.floor(window.innerWidth / BASE_WIDTH);
    const scaleY = Math.floor(window.innerHeight / BASE_HEIGHT);
    const scale = Math.max(1, Math.min(scaleX, scaleY));
    
    const displayWidth = BASE_WIDTH * scale;
    const displayHeight = BASE_HEIGHT * scale;
    
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
    
    return scale;
  }
  
  let scale = updateScale();
  window.addEventListener('resize', () => {
    scale = updateScale();
    inputHandler.setScale(scale);
  });
  
  // Disable image smoothing
  ctx.imageSmoothingEnabled = false;
  
  // Load assets
  loadFont();
  loadPortraits();
  await loadBarks();
  
  // Generate placeholder cutscene images
  const placeholders = generateCutscenePlaceholders();
  for (const [path, canvas] of placeholders) {
    // Convert canvas to image for AssetLoader
    const img = new Image();
    img.src = canvas.toDataURL();
    await new Promise(resolve => img.onload = resolve);
    assets.getImage(path); // Register if needed
  }
  
  // Initialize game
  const game = new Game();
  await game.init();
  
  // Input handling
  const inputHandler = new InputHandler(
    canvas,
    (direction) => game.handleSwipe(direction),
    (x, y) => game.handleTap(x, y),
    (direction) => {
      if (direction === 'left') {
        game.handleKey('q');
      } else {
        game.handleKey('e');
      }
    }
  );
  
  inputHandler.setScale(scale);
  
  // Keyboard input
  window.addEventListener('keydown', (e) => {
    game.handleKey(e.key);
    
    // Prevent default for game keys
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'w', 'a', 's', 'd', 'q', 'e'].includes(e.key)) {
      e.preventDefault();
    }
  });
  
  // Game loop
  function gameLoop() {
    const now = Date.now();
    game.update(now);
    game.render(ctx, now);
    requestAnimationFrame(gameLoop);
  }
  
  gameLoop();
}

main().catch(console.error);
