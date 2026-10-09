import type { GameState } from './types';
import { createNewGameState } from './game-state';
import { loadAllFloors, getFloorStart } from './floor-loader';
import { actionSystem } from './action-system';
import { combatController } from './combat-controller';
import { SaveSystem } from './save-system';
import { sound } from './assets';

export class GameController {
  private state: GameState;
  private baseUrl: string;
  private walkStepCounter = 0;

  constructor() {
    this.state = createNewGameState();
    // Get base URL from Vite's import.meta or fallback
    this.baseUrl = '/sunken-keep/';
    if (typeof window !== 'undefined' && (window as any).BASE_URL) {
      this.baseUrl = (window as any).BASE_URL;
    }
  }

  async init(): Promise<void> {
    // Load floors
    const floors = await loadAllFloors();
    this.state.floors = floors;

    // Load action data
    await actionSystem.loadData(this.baseUrl);

    // Load monster data
    await combatController.loadMonsterData(this.baseUrl);

    // Initialize audio
    await sound.init();

    // Parse URL parameters for testing
    this.parseURLParams();

    // Load settings
    const settings = SaveSystem.loadSettings();
    this.state.brightness = settings.brightness;
    this.state.settings = {
      musicVolume: settings.musicVolume,
      sfxVolume: settings.sfxVolume,
    };

    // Setup auto-save on page leave
    SaveSystem.setupAutoSaveOnLeave(() => this.state);

    console.log('GameController initialized');
  }

  // Parse URL parameters: ?floor=N&flags=a,b,c
  private parseURLParams(): void {
    const params = new URLSearchParams(window.location.search);
    
    // Floor override
    const floorParam = params.get('floor');
    if (floorParam) {
      const floorNum = parseInt(floorParam);
      if (floorNum >= 1 && floorNum <= 4) {
        const start = getFloorStart(floorNum, this.state.floors);
        this.state.party.floor = floorNum;
        this.state.party.x = start.x;
        this.state.party.y = start.y;
        this.state.party.dir = start.dir;
        this.state.screen = 'playing';
        console.log(`URL override: Starting on floor ${floorNum}`);
      }
    }

    // Flags override
    const flagsParam = params.get('flags');
    if (flagsParam) {
      const flags = flagsParam.split(',').filter(f => f.trim());
      flags.forEach(flag => this.state.flags.add(flag.trim()));
      console.log(`URL override: Set flags: ${flags.join(', ')}`);
    }
  }

  getState(): GameState {
    return this.state;
  }

  // Handle stairs
  handleStairs(direction: 'up' | 'down'): void {
    const currentFloor = this.state.party.floor;
    
    if (direction === 'down') {
      const nextFloor = currentFloor + 1;
      if (nextFloor <= 4) {
        const start = getFloorStart(nextFloor, this.state.floors);
        this.state.party.floor = nextFloor;
        this.state.party.x = start.x;
        this.state.party.y = start.y;
        this.state.party.dir = start.dir;
        
        // Auto-save at stairs
        if (!this.state.escapeRunActive) {
          SaveSystem.autoSave(this.state);
        }
        
        sound.play('ui_log_line');
        console.log(`Descended to floor ${nextFloor}`);
      }
    } else {
      const prevFloor = currentFloor - 1;
      if (prevFloor >= 1) {
        // Find stairs down on previous floor
        const prevFloorData = this.state.floors.get(prevFloor);
        if (prevFloorData) {
          let stairsX = prevFloorData.startX;
          let stairsY = prevFloorData.startY;
          
          // Find the stairs down tile
          for (let y = 0; y < prevFloorData.height; y++) {
            for (let x = 0; x < prevFloorData.width; x++) {
              const tile = prevFloorData.tiles[y][x];
              if (tile.stairs === 'down') {
                stairsX = x;
                stairsY = y;
                break;
              }
            }
          }
          
          this.state.party.floor = prevFloor;
          this.state.party.x = stairsX;
          this.state.party.y = stairsY;
          this.state.party.dir = 0;
          
          // Auto-save at stairs
          if (!this.state.escapeRunActive) {
            SaveSystem.autoSave(this.state);
          }
          
          sound.play('ui_log_line');
          console.log(`Ascended to floor ${prevFloor}`);
        }
      }
    }
  }

  // Check if current tile has stairs
  checkStairs(): 'up' | 'down' | null {
    const floor = this.state.floors.get(this.state.party.floor);
    if (!floor) return null;

    const { x, y } = this.state.party;
    if (x < 0 || x >= floor.width || y < 0 || y >= floor.height) return null;

    const tile = floor.tiles[y][x];
    return tile.stairs || null;
  }

  // Movement: turn left
  turnLeft(): void {
    if (combatController.isInCombat()) return;
    this.state.party.dir = (this.state.party.dir + 3) % 4;
    sound.play('ui_turn');
  }

  // Movement: turn right
  turnRight(): void {
    if (combatController.isInCombat()) return;
    this.state.party.dir = (this.state.party.dir + 1) % 4;
    sound.play('ui_turn');
  }

  // Movement: move forward
  moveForward(): void {
    if (combatController.isInCombat()) return;
    this.tryMove(0);
  }

  // Movement: move backward
  moveBackward(): void {
    if (combatController.isInCombat()) return;
    this.tryMove(2);
  }

  // Movement: strafe left
  strafeLeft(): void {
    if (combatController.isInCombat()) return;
    this.tryMove(3);
  }

  // Movement: strafe right
  strafeRight(): void {
    if (combatController.isInCombat()) return;
    this.tryMove(1);
  }

  // Try to move in relative direction (0=forward, 1=right, 2=back, 3=left)
  private tryMove(relativeDir: number): void {
    const floor = this.state.floors.get(this.state.party.floor);
    if (!floor) return;

    const absoluteDir = (this.state.party.dir + relativeDir) % 4;
    const dx = [0, 1, 0, -1][absoluteDir];
    const dy = [-1, 0, 1, 0][absoluteDir];

    const newX = this.state.party.x + dx;
    const newY = this.state.party.y + dy;

    // Check bounds
    if (newX < 0 || newX >= floor.width || newY < 0 || newY >= floor.height) {
      sound.play('bump');
      return;
    }

    const tile = floor.tiles[newY][newX];

    // Check wall
    if (tile.wall) {
      sound.play('bump');
      return;
    }

    // Check monster (start combat)
    if (tile.monster && tile.monsterHp && tile.monsterHp > 0) {
      combatController.startCombat(this.state, tile.monster, newX, newY);
      return;
    }

    // Move successful
    this.state.party.x = newX;
    this.state.party.y = newY;

    // Play step sound
    if (tile.deepWater) {
      sound.play('step_water_deep');
    } else if (tile.shallowWater) {
      sound.play('step_water_shallow');
    } else {
      sound.play('step');
    }

    // Increment walk counter for mana regen
    this.walkStepCounter++;
    if (this.walkStepCounter >= 10) {
      combatController.regenerateMana(this.state, this.walkStepCounter);
      this.walkStepCounter = 0;
    }
  }
}
