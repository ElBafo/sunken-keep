import './style.css';
// import { Game } from './game';  // Disabled for new system
import { GameController } from './game-controller';
import { UIRenderer585 } from './ui-renderer-585';
import { TitleScreen } from './title-screen';
import { combatController } from './combat-controller';
import { inputManager } from './input-manager';
import { SaveSystem } from './save-system';
import { InputHandler } from './input';
import { loadFont } from './font';
import { loadPortraits } from './characters';
import { loadBarks } from './barks';
import { generateCutscenePlaceholders } from './cutscene-placeholders';
import { assets, sound } from './assets';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';

const BASE_WIDTH = CANVAS_WIDTH;  // 270
const BASE_HEIGHT = CANVAS_HEIGHT;  // 585

// Check if we should use new game controller (for testing)
const USE_NEW_CONTROLLER = true;

async function main() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const tapToStart = document.getElementById('tap-to-start')!;
  const muteToggle = document.getElementById('mute-toggle')!;
  const installHint = document.getElementById('install-hint')!;
  
  // Set base resolution
  canvas.width = BASE_WIDTH;
  canvas.height = BASE_HEIGHT;
  
  // Calculate scale with better portrait support and iOS Safari toolbar handling
  function updateScale() {
    // Use visualViewport when available (iOS Safari) for accurate dimensions after toolbar movement
    let viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    let viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    
    // Account for safe area insets (iPhone notch and home bar)
    // In standalone (Home Screen) mode, visualViewport already excludes safe areas
    // In Safari tab mode, we need to manually account for them
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                         (window.navigator as any).standalone === true;
    
    if (!isStandalone && window.visualViewport) {
      // In Safari tab, manually subtract safe areas from available space
      const style = getComputedStyle(document.documentElement);
      const safeTop = parseInt(style.getPropertyValue('--safe-area-inset-top') || '0');
      const safeBottom = parseInt(style.getPropertyValue('--safe-area-inset-bottom') || '0');
      viewportHeight -= (safeTop + safeBottom);
    }
    
    // Calculate scale to fit letterboxed (maintain aspect ratio)
    const scaleX = viewportWidth / BASE_WIDTH;
    const scaleY = viewportHeight / BASE_HEIGHT;
    const scale = Math.min(scaleX, scaleY);
    
    // Use the calculated scale
    const displayWidth = BASE_WIDTH * scale;
    const displayHeight = BASE_HEIGHT * scale;
    
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
    
    return scale;
  }
  
  let scale = updateScale();
  
  // Expose safe area insets as CSS variables for calculations
  function updateSafeAreaInsets() {
    const style = getComputedStyle(document.documentElement);
    const safeTop = style.getPropertyValue('padding-top') || '0px';
    const safeBottom = style.getPropertyValue('padding-bottom') || '0px';
    document.documentElement.style.setProperty('--safe-area-inset-top', safeTop);
    document.documentElement.style.setProperty('--safe-area-inset-bottom', safeBottom);
  }
  
  updateSafeAreaInsets();
  
  // Re-run resize on all viewport changes
  function handleResize() {
    scale = updateScale();
    if (inputHandler) {
      inputHandler.setScale(scale);
    }
  }
  
  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', () => {
    // iOS Safari needs a delay after orientation change for toolbar to settle
    setTimeout(handleResize, 100);
    setTimeout(handleResize, 300);
  });
  
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleResize);
  }
  
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
  // const game = USE_NEW_CONTROLLER ? null : new Game();
  // if (game) {
  //   await game.init();
  // }
  
  // Initialize new game controller for testing
  let gameController: GameController | null = null;
  let uiRenderer585: UIRenderer585 | null = null;
  let titleScreen: TitleScreen | null = null;
  let inTitleScreen = true; // Start in title screen
  
  if (USE_NEW_CONTROLLER) {
    gameController = new GameController();
    await gameController.init();
    uiRenderer585 = new UIRenderer585();
    titleScreen = new TitleScreen();
    console.log('New game controller initialized');
  }
  
  // Check if running as PWA (standalone mode)
  let isStandalone = false;
  try {
    isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                   (window.navigator as any).standalone === true;
    
    // Show install hint on iOS Safari when not standalone (one-time)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    const installHintDismissed = localStorage.getItem('installHintDismissed');
    
    // Dismiss hint on tap
    installHint.addEventListener('click', () => {
      installHint.classList.add('hidden');
      localStorage.setItem('installHintDismissed', 'true');
    });
    
    if (isIOS && isSafari && !isStandalone && !installHintDismissed) {
      setTimeout(() => {
        installHint.classList.remove('hidden');
      }, 3000);
    }
  } catch (error) {
    console.error('PWA check error:', error);
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

  // Canvas click/tap handler (for new controller)
  canvas.addEventListener('click', (e) => {
    if (!gameStarted || !gameController || !USE_NEW_CONTROLLER) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Handle title screen clicks
    if (inTitleScreen && titleScreen) {
      const action = titleScreen.handleClick(x, y);
      if (action === 'new_game') {
        inTitleScreen = false;
        // Start new game
        return;
      } else if (action === 'continue') {
        const mostRecentSlot = SaveSystem.getMostRecentSlot();
        if (mostRecentSlot !== null) {
          const save = SaveSystem.load(mostRecentSlot);
          if (save) {
            const state = gameController.getState();
            SaveSystem.restoreState(save, state);
            inTitleScreen = false;
          }
        }
        return;
      } else if (action === 'load') {
        // Title screen will switch to load mode internally
        return;
      } else if (typeof action === 'number') {
        // Load from specific slot
        const save = SaveSystem.load(action);
        if (save) {
          const state = gameController.getState();
          SaveSystem.restoreState(save, state);
          inTitleScreen = false;
          titleScreen.reset();
        }
        return;
      } else if (action === 'back') {
        // Back to title (handled by titleScreen internally)
        return;
      } else if (action === 'settings') {
        // TODO: implement settings menu
        console.log('Settings not yet implemented');
        return;
      }
    }

    // Handle title screen
    if (inTitleScreen && titleScreen) {
      const result = titleScreen.handleClick(x, y);
      
      if (result === 'new_game') {
        // Start new game
        gameController = new GameController();
        gameController.init().then(() => {
          inTitleScreen = false;
          console.log('New game started');
        });
        return;
      } else if (result === 'continue') {
        // Load most recent save
        const slot = SaveSystem.getMostRecentSlot();
        if (slot && gameController) {
          const save = SaveSystem.load(slot);
          if (save) {
            const newController = new GameController();
            newController.init().then(() => {
              SaveSystem.restoreState(save, newController.getState());
              gameController = newController;
              inTitleScreen = false;
              console.log(`Continued from slot ${slot}`);
            });
          }
        }
        return;
      } else if (typeof result === 'number') {
        // Load specific slot
        const save = SaveSystem.load(result);
        if (save && gameController) {
          const newController = new GameController();
          newController.init().then(() => {
            SaveSystem.restoreState(save, newController.getState());
            gameController = newController;
            inTitleScreen = false;
            console.log(`Loaded slot ${result}`);
          });
        }
        return;
      }
      return;
    }

    // Check hand buttons (combat)
    const handButton = inputManager.checkHandButton(x, y);
    if (handButton) {
      const state = gameController.getState();
      combatController.handleHandButton(state, handButton.heroId, handButton.hand);
      return;
    }

    // Check movement pad
    const movement = inputManager.checkMovementPad(x, y);
    if (movement) {
      switch (movement) {
        case 'turn_left':
          gameController.turnLeft();
          break;
        case 'turn_right':
          gameController.turnRight();
          break;
        case 'forward':
          gameController.moveForward();
          break;
        case 'back':
          gameController.moveBackward();
          break;
        case 'strafe_left':
          gameController.strafeLeft();
          break;
        case 'strafe_right':
          gameController.strafeRight();
          break;
      }
      return;
    }

    // Check potion buttons
    const potion = inputManager.checkPotionButton(x, y);
    if (potion) {
      console.log(`Potion ${potion} clicked`);
      // TODO: Use potion
      return;
    }

    // Check save button
    if (inputManager.checkSaveButton(x, y)) {
      // Manual save to most recent slot or slot 1
      const slot = SaveSystem.getMostRecentSlot() || 1;
      const success = SaveSystem.save(gameController.getState(), slot, false);
      if (success) {
        sound.play('ui_button');
        console.log(`Saved to slot ${slot}`);
      } else {
        sound.play('no');
      }
      return;
    }

    // Check menu button
    if (inputManager.checkMenuButton(x, y)) {
      console.log('Menu clicked');
      // TODO: Open menu
      return;
    }

    // Check portrait (character sheet)
    const portrait = inputManager.checkPortrait(x, y);
    if (portrait) {
      console.log(`Portrait ${portrait} clicked`);
      // TODO: Open character sheet
      return;
    }
  });
  
  // Mute toggle
  muteToggle.addEventListener('click', () => {
    const muted = sound.isMuted();
    sound.setMuted(!muted);
    muteToggle.textContent = muted ? '🔊' : '🔇';
  });
  
  // Input handling for swipes (turn left/right on phone)
  const inputHandler = new InputHandler(
    canvas,
    (direction) => {
      // Swipe handler: left = turn left, right = turn right
      if (!gameStarted || !gameController || !USE_NEW_CONTROLLER) return;
      if (inTitleScreen) return;
      
      if (direction === 'left') {
        gameController.turnLeft();
      } else if (direction === 'right') {
        gameController.turnRight();
      }
    },
    (_x, _y) => {
      // Tap handler - handled by canvas click listener below
    },
    (direction) => {
      // Two-finger swipe: left/right turn
      if (!gameStarted || !gameController || !USE_NEW_CONTROLLER) return;
      if (inTitleScreen) return;
      
      if (direction === 'left') {
        gameController.turnLeft();
      } else {
        gameController.turnRight();
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
    
    if (!gameController || !USE_NEW_CONTROLLER) return;

    // Check for debug mode
    const urlParams = new URLSearchParams(window.location.search);
    const debugMode = urlParams.get('debug') === '1';
    
    // TEST: Start combat with 'C' key (debug only)
    if ((e.key === 'c' || e.key === 'C') && debugMode) {
      const state = gameController.getState();
      const floor = state.floors.get(state.party.floor);
      if (floor) {
        // Find a monster on current floor
        for (let y = 0; y < floor.height; y++) {
          for (let x = 0; x < floor.width; x++) {
            const tile = floor.tiles[y][x];
            if (tile.monster && tile.monsterHp) {
              combatController.startCombat(state, tile.monster, x, y);
              console.log(`Combat started with ${tile.monster}`);
              e.preventDefault();
              return;
            }
          }
        }
      }
      console.log('No monster found on current floor');
      e.preventDefault();
      return;
    }
    
    // Movement keys
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      gameController.moveForward();
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      gameController.moveBackward();
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      gameController.strafeLeft();
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      gameController.strafeRight();
      e.preventDefault();
      return;
    }
    if (e.key === 'q' || e.key === 'Q') {
      gameController.turnLeft();
      e.preventDefault();
      return;
    }
    if (e.key === 'e' || e.key === 'E') {
      gameController.turnRight();
      e.preventDefault();
      return;
    }
    
    // Handle stairs with space bar
    if (e.key === ' ') {
      const stairs = gameController.checkStairs();
      if (stairs) {
        gameController.handleStairs(stairs);
        e.preventDefault();
        return;
      }
    }
  });
  
  // Game loop
  function gameLoop() {
    const now = Date.now();
    if (gameStarted) {
      // Render title screen if active
      if (inTitleScreen && titleScreen && USE_NEW_CONTROLLER) {
        titleScreen.render(ctx, CANVAS_WIDTH, CANVAS_HEIGHT, now);
      }
      // Render game UI if past title screen
      else if (gameController && uiRenderer585 && USE_NEW_CONTROLLER && !inTitleScreen) {
        const state = gameController.getState();
        
        // Render 585 UI
        uiRenderer585.render(ctx, state, now);
        
        // Debug info (only if ?debug=1)
        const urlParams = new URLSearchParams(window.location.search);
        const debugMode = urlParams.get('debug') === '1';
        
        if (debugMode) {
          ctx.save();
          ctx.fillStyle = '#ffffff';
          ctx.font = '12px monospace';
          ctx.fillText(`Floor ${state.party.floor}`, 10, 20);
          ctx.fillText(`Pos: (${state.party.x}, ${state.party.y})`, 10, 35);
          
          // Check for stairs
          const stairs = gameController.checkStairs();
          if (stairs) {
            ctx.fillText(`Stairs ${stairs} - Press Space`, 10, 50);
          }
          
          // Show combat status
          if (combatController.isInCombat()) {
            const info = combatController.getCombatInfo();
            if (info) {
              ctx.fillText(`Combat: ${info.monster} ${info.monsterHp}/${info.monsterMaxHp}`, 10, 65);
            }
          }
          ctx.restore();
        }
      }
    }
    requestAnimationFrame(gameLoop);
  }
  
  gameLoop();
}

main().catch(console.error);
