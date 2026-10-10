import { MoveResult, Player } from './player';

export interface InputHooks {
  onMove(result: MoveResult): void;
  onInteract(): void;
}

function isUiTarget(el: EventTarget | null): boolean {
  return (
    el instanceof HTMLElement &&
    !!el.closest('.control-btn, #tap-to-start, .hand-btn, .hud-choice-btn, #torch-choice, #party-hud')
  );
}

function isCanvasTarget(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && !!el.closest('#render-canvas, #canvas-container');
}

export class InputManager {
  player: Player;
  hooks: InputHooks;
  private pointerStartX = 0;
  private pointerStartY = 0;
  private pointerDown = false;
  private swipeStartX = 0;
  private swipeStartY = 0;
  private swipeArmed = false;
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

    const canvas = document.getElementById('render-canvas');
    if (canvas) {
      canvas.addEventListener('pointerdown', (e) => {
        if (!e.isPrimary) return;
        this.pointerDown = true;
        this.pointerStartX = e.clientX;
        this.pointerStartY = e.clientY;
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          // capture is optional — pointerup on the canvas still works for a tap
        }
      });
      canvas.addEventListener('pointerup', (e) => {
        if (!e.isPrimary || !this.pointerDown) return;
        this.pointerDown = false;
        const dx = e.clientX - this.pointerStartX;
        const dy = e.clientY - this.pointerStartY;
        if (Math.abs(dx) < 18 && Math.abs(dy) < 18) {
          this.hooks.onInteract();
          return;
        }
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > this.swipeThreshold) {
          this.emitMove(dx > 0 ? this.player.turnRight() : this.player.turnLeft());
        } else if (Math.abs(dy) > this.swipeThreshold) {
          this.emitMove(dy > 0 ? this.player.moveBackward() : this.player.moveForward());
        }
      });
      canvas.addEventListener('pointercancel', () => {
        this.pointerDown = false;
      });
    }

    document.addEventListener('touchstart', (e) => {
      if (isUiTarget(e.target) || isCanvasTarget(e.target)) {
        this.swipeArmed = false;
        return;
      }
      const touch = e.touches[0];
      this.swipeStartX = touch.clientX;
      this.swipeStartY = touch.clientY;
      this.swipeArmed = true;
    });

    // Swipes that miss the canvas (rare). Never interact here — iPhone also
    // synthesizes a click after touchend, and canvas taps are pointerup-only.
    document.addEventListener('touchend', (e) => {
      if (isUiTarget(e.target) || isCanvasTarget(e.target)) return;
      if (!this.swipeArmed || e.changedTouches.length === 0) return;
      this.swipeArmed = false;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - this.swipeStartX;
      const dy = touch.clientY - this.swipeStartY;
      if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > this.swipeThreshold) {
        this.emitMove(dx > 0 ? this.player.turnRight() : this.player.turnLeft());
      } else if (Math.abs(dy) > this.swipeThreshold) {
        this.emitMove(dy > 0 ? this.player.moveBackward() : this.player.moveForward());
      }
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
