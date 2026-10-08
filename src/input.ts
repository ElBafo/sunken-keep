// Touch and input handling
export class InputHandler {
  private touchStartX = 0;
  private touchStartY = 0;
  private touchStartTime = 0;
  private onSwipe: (direction: 'up' | 'down' | 'left' | 'right') => void;
  private onTap: (x: number, y: number) => void;
  private onTurn: (direction: 'left' | 'right') => void;
  private canvas: HTMLCanvasElement;
  private scale = 1;

  constructor(
    canvas: HTMLCanvasElement,
    onSwipe: (direction: 'up' | 'down' | 'left' | 'right') => void,
    onTap: (x: number, y: number) => void,
    onTurn: (direction: 'left' | 'right') => void
  ) {
    this.canvas = canvas;
    this.onSwipe = onSwipe;
    this.onTap = onTap;
    this.onTurn = onTurn;

    canvas.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
    canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    canvas.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });
    
    canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
  }

  setScale(scale: number) {
    this.scale = scale;
  }

  private handleTouchStart(e: TouchEvent) {
    e.preventDefault();
    const touch = e.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.touchStartTime = Date.now();
  }

  private handleTouchEnd(e: TouchEvent) {
    e.preventDefault();
    const touch = e.changedTouches[0];
    const endX = touch.clientX;
    const endY = touch.clientY;
    const deltaX = endX - this.touchStartX;
    const deltaY = endY - this.touchStartY;
    const deltaTime = Date.now() - this.touchStartTime;

    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Tap
    if (absX < 20 && absY < 20 && deltaTime < 300) {
      const rect = this.canvas.getBoundingClientRect();
      const canvasX = Math.floor((endX - rect.left) / this.scale);
      const canvasY = Math.floor((endY - rect.top) / this.scale);
      this.onTap(canvasX, canvasY);
      return;
    }

    // Swipe
    if (absX > 30 || absY > 30) {
      // Check for turn gestures (short horizontal swipe in top quarter)
      const rect = this.canvas.getBoundingClientRect();
      const relativeY = (this.touchStartY - rect.top) / rect.height;
      
      if (relativeY < 0.4 && absX > absY * 1.5) {
        // Turn
        if (deltaX > 0) {
          this.onTurn('right');
        } else {
          this.onTurn('left');
        }
      } else {
        // Movement swipe
        if (absX > absY) {
          this.onSwipe(deltaX > 0 ? 'right' : 'left');
        } else {
          this.onSwipe(deltaY > 0 ? 'down' : 'up');
        }
      }
    }
  }

  private handleMouseDown(e: MouseEvent) {
    this.touchStartX = e.clientX;
    this.touchStartY = e.clientY;
    this.touchStartTime = Date.now();
  }

  private handleMouseUp(e: MouseEvent) {
    const deltaX = e.clientX - this.touchStartX;
    const deltaY = e.clientY - this.touchStartY;
    const deltaTime = Date.now() - this.touchStartTime;

    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Click
    if (absX < 10 && absY < 10 && deltaTime < 300) {
      const rect = this.canvas.getBoundingClientRect();
      const canvasX = Math.floor((e.clientX - rect.left) / this.scale);
      const canvasY = Math.floor((e.clientY - rect.top) / this.scale);
      this.onTap(canvasX, canvasY);
    }
  }
}
