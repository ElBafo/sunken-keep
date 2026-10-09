import { MoveResult, Player } from './player';

export interface InputHooks {
  onMove(result: MoveResult): void;
  onInteract(): void;
}

function isUiTarget(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && !!el.closest('.control-btn, #tap-to-start');
}

export class InputManager {
  player: Player;
  hooks: InputHooks;
  private touchStartX = 0;
  private touchStartY = 0;
  private touchOnUi = false;
  private swipeThreshold = 50;

  constructor(player: Player, hooks: InputHooks) {
    this.player = player;
    this.hooks = hooks;
    this.setupControls();
  }

  private emitMove(result: MoveResult) {
    this.hooks.onMove(result);
  }

  setupControls() {
    document.getElementById('btn-forward')?.addEventListener('click', () => {
      this.emitMove(this.player.moveForward());
    });
    document.getElementById('btn-back')?.addEventListener('click', () => {
      this.emitMove(this.player.moveBackward());
    });
    document.getElementById('btn-left')?.addEventListener('click', () => {
      this.emitMove(this.player.turnLeft());
    });
    document.getElementById('btn-right')?.addEventListener('click', () => {
      this.emitMove(this.player.turnRight());
    });
    document.getElementById('btn-door')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hooks.onInteract();
    });

    document.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      this.touchStartX = touch.clientX;
      this.touchStartY = touch.clientY;
      this.touchOnUi = isUiTarget(e.target);
    });

    document.addEventListener('touchend', (e) => {
      if (this.touchOnUi || e.changedTouches.length === 0) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - this.touchStartX;
      const dy = touch.clientY - this.touchStartY;
      if (Math.abs(dx) < 18 && Math.abs(dy) < 18) {
        if ((e.target as HTMLElement | null)?.id === 'render-canvas' ||
            (e.target as HTMLElement | null)?.id === 'canvas-container') {
          this.hooks.onInteract();
        }
        return;
      }
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > this.swipeThreshold) {
        this.emitMove(dx > 0 ? this.player.turnRight() : this.player.turnLeft());
      } else if (Math.abs(dy) > this.swipeThreshold) {
        this.emitMove(dy > 0 ? this.player.moveBackward() : this.player.moveForward());
      }
    });

    document.getElementById('render-canvas')?.addEventListener('click', (e) => {
      if (e.detail === 0) return;
      this.hooks.onInteract();
    });

    document.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          this.emitMove(this.player.moveForward());
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          this.emitMove(this.player.moveBackward());
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          this.emitMove(this.player.turnLeft());
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          this.emitMove(this.player.turnRight());
          break;
        case ' ':
        case 'Enter':
        case 'e':
        case 'E':
        case 'f':
        case 'F':
          e.preventDefault();
          this.hooks.onInteract();
          break;
      }
    });
  }
}
