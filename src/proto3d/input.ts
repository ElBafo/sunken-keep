import { Player } from './player';

export class InputManager {
  player: Player;
  
  touchStartX = 0;
  touchStartY = 0;
  swipeThreshold = 50;
  
  constructor(player: Player) {
    this.player = player;
    this.setupControls();
  }
  
  setupControls() {
    // Button controls
    document.getElementById('btn-forward')?.addEventListener('click', () => {
      this.player.moveForward();
    });
    
    document.getElementById('btn-back')?.addEventListener('click', () => {
      this.player.moveBackward();
    });
    
    document.getElementById('btn-left')?.addEventListener('click', () => {
      this.player.turnLeft();
    });
    
    document.getElementById('btn-right')?.addEventListener('click', () => {
      this.player.turnRight();
    });
    
    // Swipe controls
    document.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      this.touchStartX = touch.clientX;
      this.touchStartY = touch.clientY;
    });
    
    document.addEventListener('touchend', (e) => {
      if (e.changedTouches.length === 0) return;
      
      const touch = e.changedTouches[0];
      const dx = touch.clientX - this.touchStartX;
      const dy = touch.clientY - this.touchStartY;
      
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > this.swipeThreshold) {
        if (dx > 0) {
          this.player.turnRight();
        } else {
          this.player.turnLeft();
        }
      } else if (Math.abs(dy) > this.swipeThreshold) {
        if (dy > 0) {
          this.player.moveBackward();
        } else {
          this.player.moveForward();
        }
      }
    });
    
    // Keyboard controls
    document.addEventListener('keydown', (e) => {
      switch(e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          this.player.moveForward();
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          this.player.moveBackward();
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          this.player.turnLeft();
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          this.player.turnRight();
          break;
      }
    });
  }
}
