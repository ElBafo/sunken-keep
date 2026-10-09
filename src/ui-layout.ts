// UI Layout constants for 270x480 canvas
// Following panel.json from update13

export const UI = {
  // Canvas dimensions
  CANVAS_WIDTH: 270,
  CANVAS_HEIGHT: 480,
  
  // 3D Viewport (expanded to use panel properly)
  VIEWPORT_HEIGHT: 264,  // Panel starts at y=264 in 480px canvas
  
  // Control Panel (panel_bg.png is 270x216, placed directly under viewport)
  PANEL_Y: 264,
  PANEL_HEIGHT: 216,
  PANEL_BG: '/sunken-keep/art/ui/panel/panel_bg.png',
  
  // Wells (from panel.json, coordinates are [x1, y1, x2, y2])
  LOG: { x: 6, y: 274, w: 258, h: 48 },  // y = PANEL_Y + 10
  COMPASS: { x: 124, y: 356, w: 42, h: 42 },  // y = PANEL_Y + 92
  
  // Inventory slots (3x3 grid, panel.json inv_0 to inv_8)
  INV_SLOTS: [
    { x: 176, y: 360, w: 28, h: 28 },  // inv_0, y = PANEL_Y + 96
    { x: 206, y: 360, w: 28, h: 28 },  // inv_1
    { x: 236, y: 360, w: 28, h: 28 },  // inv_2
    { x: 176, y: 390, w: 28, h: 28 },  // inv_3, y = PANEL_Y + 126
    { x: 206, y: 390, w: 28, h: 28 },  // inv_4
    { x: 236, y: 390, w: 28, h: 28 },  // inv_5
    { x: 176, y: 420, w: 28, h: 28 },  // inv_6, y = PANEL_Y + 156
    { x: 206, y: 420, w: 28, h: 28 },  // inv_7
    { x: 236, y: 420, w: 28, h: 28 },  // inv_8
  ],
  
  // Buttons (from panel.json)
  ATTACK_BUTTONS: [
    { x: 5, y: 326, w: 58, h: 22 },    // attack_0, y = PANEL_Y + 62
    { x: 72, y: 326, w: 58, h: 22 },   // attack_1
    { x: 139, y: 326, w: 58, h: 22 },  // attack_2
    { x: 206, y: 326, w: 58, h: 22 },  // attack_3
  ],
  
  MOVEMENT_PAD: [
    { key: 'turn_left', x: 8, y: 360, w: 35, h: 35 },      // y = PANEL_Y + 96
    { key: 'forward', x: 45, y: 360, w: 35, h: 35 },
    { key: 'turn_right', x: 82, y: 360, w: 35, h: 35 },
    { key: 'strafe_left', x: 8, y: 397, w: 35, h: 35 },    // y = PANEL_Y + 133
    { key: 'back', x: 45, y: 397, w: 35, h: 35 },
    { key: 'strafe_right', x: 82, y: 397, w: 35, h: 35 },
  ],
  
  MENU_BUTTON: { x: 124, y: 406, w: 42, h: 24 },  // y = PANEL_Y + 142
  
  // Button sprites
  BUTTON_NORMAL: '/sunken-keep/art/ui/panel/button_9slice.png',
  BUTTON_PRESSED: '/sunken-keep/art/ui/panel/button_pressed_9slice.png',
  BUTTON_SLICE_MARGIN: 4,
  
  // Icons
  ICONS: {
    forward: '/sunken-keep/art/ui/panel/icon_forward.png',
    back: '/sunken-keep/art/ui/panel/icon_back.png',
    turn_left: '/sunken-keep/art/ui/panel/icon_turn_left.png',
    turn_right: '/sunken-keep/art/ui/panel/icon_turn_right.png',
    strafe_left: '/sunken-keep/art/ui/panel/icon_strafe_left.png',
    strafe_right: '/sunken-keep/art/ui/panel/icon_strafe_right.png',
    attack: '/sunken-keep/art/ui/panel/icon_attack.png',
    menu: '/sunken-keep/art/ui/panel/icon_menu.png',
  },
  
  // Compass sprites
  COMPASS_SPRITES: {
    N: '/sunken-keep/art/ui/panel/compass_N.png',
    E: '/sunken-keep/art/ui/panel/compass_E.png',
    S: '/sunken-keep/art/ui/panel/compass_S.png',
    W: '/sunken-keep/art/ui/panel/compass_W.png',
  },
  
  // Log text (font_5x7, color #d8ccb0, 6px padding, 4 lines of 10px)
  LOG_TEXT_COLOR: '#d8ccb0',
  LOG_LINE_HEIGHT: 10,
  LOG_MAX_LINES: 4,
  LOG_PADDING: 6,
} as const;

// Message log system
export interface LogMessage {
  text: string;
  time: number;
  color?: string;
}

export class MessageLog {
  private messages: LogMessage[] = [];
  private maxMessages = 20;  // Keep history beyond visible lines
  
  add(text: string, color?: string) {
    this.messages.push({ text, time: Date.now(), color: color || '#d8ccb0' });
    if (this.messages.length > this.maxMessages) {
      this.messages.shift();
    }
  }
  
  clear() {
    this.messages = [];
  }
  
  getMessages(): LogMessage[] {
    return this.messages;
  }
  
  getRecent(count: number): LogMessage[] {
    return this.messages.slice(-count);
  }
}
