import './style.css';
import { Game } from './game';
import { InputHandler } from './input';
import { loadFont } from './font';
import { loadPortraits } from './characters';
import { loadBarks } from './barks';
import { generateCutscenePlaceholders } from './cutscene-placeholders';
import { assets, sound } from './assets';

const BASE_WIDTH = 270;
const BASE_HEIGHT = 480;

async function main() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const tapToStart = document.getElementById('tap-to-start')!;
  const muteToggle = document.getElementById('mute-toggle')!;
  const installHint = document.getElementById('install-hint')!;
  
  // Set base resolution
  canvas.width = BASE_WIDTH;
  canvas.height = BASE_HEIGHT;
  
  // Calculate scale with better portrait support
  function updateScale() {
    // Try to fill the screen as much as possible
    const scaleX = window.innerWidth / BASE_WIDTH;
    const scaleY = window.innerHeight / BASE_HEIGHT;
    const scale = Math.max(1, Math.min(scaleX, scaleY));
    
    // Use the calculated scale (non-integer allowed)
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
  
  // Disable image smoothing (keep pixels crisp even with non-integer scaling)
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
  
  // Check if running as PWA (standalone mode)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                       (window.navigator as any).standalone === true;
  
  // Show install hint on iOS Safari when not standalone (one-time)
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const installHintShown = localStorage.getItem('installHintShown');
  
  if (isIOS && isSafari && !isStandalone && !installHintShown) {
    setTimeout(() => {
      installHint.classList.remove('hidden');
      setTimeout(() => {
        installHint.classList.add('hidden');
        localStorage.setItem('installHintShown', 'true');
      }, 8000);
    }, 3000);
  }
  
  let gameStarted = false;
  
  // Tap to start handler
  tapToStart.addEventListener('click', async () => {
    if (gameStarted) return;
    gameStarted = true;
    
    // Unlock audio on first user gesture
    await sound.unlock();
    
    // Try to request fullscreen on Android Chrome
    if (document.documentElement.requestFullscreen && !isStandalone) {
      try {
        await document.documentElement.requestFullscreen();
      } catch (e) {
        // Fullscreen denied or not supported
        console.log('Fullscreen not available:', e);
      }
    }
    
    tapToStart.classList.add('hidden');
    muteToggle.classList.remove('hidden');
  });
  
  // Mute toggle
  muteToggle.addEventListener('click', () => {
    const muted = sound.isMuted();
    sound.setMuted(!muted);
    muteToggle.textContent = muted ? '🔊' : '🔇';
  });
  
  // Input handling
  const inputHandler = new InputHandler(
    canvas,
    (direction) => {
      if (!gameStarted) return;
      game.handleSwipe(direction);
    },
    (x, y) => {
      if (!gameStarted) return;
      game.handleTap(x, y);
    },
    (direction) => {
      if (!gameStarted) return;
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
    if (!gameStarted && (e.key === ' ' || e.key === 'Enter')) {
      tapToStart.click();
      e.preventDefault();
      return;
    }
    
    if (!gameStarted) return;
    
    // Mute toggle with 'M' key
    if (e.key === 'm' || e.key === 'M') {
      muteToggle.click();
      e.preventDefault();
      return;
    }
    
    game.handleKey(e.key);
    
    // Prevent default for game keys
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'w', 'a', 's', 'd', 'q', 'e'].includes(e.key)) {
      e.preventDefault();
    }
  });
  
  // Game loop
  function gameLoop() {
    const now = Date.now();
    if (gameStarted) {
      game.update(now);
      game.render(ctx, now);
    }
    requestAnimationFrame(gameLoop);
  }
  
  gameLoop();
}

main().catch(console.error);
