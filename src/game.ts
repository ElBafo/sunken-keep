import { Party, FloorData } from './party';
import { floor1 } from './floor';
import { Renderer } from './renderer';
import { sound } from './assets';
import { triggerBark, checkIdleBarks } from './barks';
import { characters, damageCharacter, resetIdleTimers } from './characters';
import { IntroPlayer } from './intro';

type GameState = 'intro' | 'playing' | 'combat';

export class Game {
  private state: GameState = 'intro';
  private party: Party;
  private floor: FloorData;
  private renderer: Renderer;
  private lastInputTime = 0;
  private hasKey = false;
  private discoveredSecret = false;
  private monsterHp = 0;
  private intro: IntroPlayer;
  private floorDepth = 1; // For tide sigh volume scaling

  constructor() {
    this.party = new Party(floor1.startX, floor1.startY, floor1.startDir);
    this.floor = floor1;
    this.renderer = new Renderer();
    this.lastInputTime = Date.now();
    this.intro = new IntroPlayer();
  }

  async init() {
    await sound.init();
    await this.intro.load();
    this.intro.start();
  }

  update(now: number) {
    if (this.state === 'intro') {
      this.intro.update();
      if (this.intro.isFinished()) {
        this.state = 'playing';
        this.lastInputTime = now;
        sound.playMusic('amb_flooded_halls');
      }
      return;
    }

    if (this.state === 'playing') {
      checkIdleBarks(now, this.lastInputTime);
    }
  }

  render(ctx: CanvasRenderingContext2D, now: number) {
    if (this.state === 'intro') {
      this.intro.render(ctx);
      return;
    }

    // Clear the entire canvas (270x480) to prevent intro remnants
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 270, 480);

    this.renderer.drawViewport(ctx, this.party, this.floor, now);
    this.renderer.drawPortraits(ctx, now);
    
    // Debug info
    if (this.hasKey) {
      ctx.fillStyle = '#ffff00';
      ctx.fillRect(5, 5, 8, 8);
    }
  }

  handleTap(x: number, y: number) {
    sound.unlock();
    
    if (this.state === 'intro') {
      this.intro.handleTap(x, y);
      return;
    }

    this.lastInputTime = Date.now();
    resetIdleTimers();

    // Check portrait taps (combat)
    if (y >= 202 && y < 266) {
      const portraitIndex = Math.floor((x - 11) / 66);
      if (portraitIndex >= 0 && portraitIndex < 4) {
        this.handleCombat(portraitIndex);
        return;
      }
    }

    // Check for carving tap
    const frontPos = this.party.getForward();
    if (frontPos.x >= 0 && frontPos.x < this.floor.width && frontPos.y >= 0 && frontPos.y < this.floor.height) {
      const tile = this.floor.tiles[frontPos.y][frontPos.x];
      
      if (tile.carving && y < 200) {
        this.handleCarvingTap(tile.carving);
        return;
      }
    }
  }

  handleSwipe(direction: 'up' | 'down' | 'left' | 'right') {
    if (this.state !== 'playing') return;
    
    sound.unlock();
    this.lastInputTime = Date.now();
    resetIdleTimers();

    const moved = this.handleMovement(direction);
    
    if (moved) {
      this.checkTile();
    }
  }

  handleKey(key: string) {
    if (this.state === 'intro') {
      if (key === ' ' || key === 'Enter') {
        this.intro.handleTap(200, 200);
      } else if (key === 'Escape') {
        this.intro.skip();
      }
      return;
    }

    if (this.state !== 'playing') return;
    
    sound.unlock();
    this.lastInputTime = Date.now();
    resetIdleTimers();

    let moved = false;

    switch (key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        moved = this.party.moveForward(this.floor);
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        moved = this.party.moveBackward(this.floor);
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        this.party.strafeLeft(this.floor);
        moved = true;
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        this.party.strafeRight(this.floor);
        moved = true;
        break;
      case 'q':
      case 'Q':
        this.party.turnLeft();
        break;
      case 'e':
      case 'E':
        this.party.turnRight();
        break;
      case ' ':
        this.interact();
        break;
    }

    if (moved) {
      sound.play('step');
      this.checkTile();
    }
  }

  private handleMovement(direction: 'up' | 'down' | 'left' | 'right'): boolean {
    switch (direction) {
      case 'up':
        return this.party.moveForward(this.floor);
      case 'down':
        return this.party.moveBackward(this.floor);
      case 'left':
        this.party.strafeLeft(this.floor);
        return true;
      case 'right':
        this.party.strafeRight(this.floor);
        return true;
    }
  }

  private checkTile() {
    const tile = this.floor.tiles[this.party.y][this.party.x];
    
    if (tile.deepWater) {
      triggerBark('deep_water');
    }
    
    if (tile.item === 'key' && !this.hasKey) {
      this.hasKey = true;
      tile.item = undefined;
      sound.play('key');
      triggerBark('loot', "Rusty. Like Brannoc's charm.", 'mags');
    }
    
    if (tile.monster && this.monsterHp === 0) {
      this.monsterHp = 30;
      this.state = 'combat';
      triggerBark('new_monster');
    }
  }

  private interact() {
    const frontPos = this.party.getForward();
    if (frontPos.x < 0 || frontPos.x >= this.floor.width || frontPos.y < 0 || frontPos.y >= this.floor.height) {
      sound.play('bump');
      return;
    }

    const tile = this.floor.tiles[frontPos.y][frontPos.x];
    
    if (tile.secret && !tile.secretOpen && !this.discoveredSecret) {
      tile.secretOpen = true;
      this.discoveredSecret = true;
      sound.play('secret_wall');
      triggerBark('secret_wall');
    } else if (tile.door && tile.doorLocked && !tile.doorOpen && this.hasKey) {
      tile.doorOpen = true;
      this.hasKey = false;
      sound.play('door');
      triggerBark('loot', 'Smells like home. Damp home.', 'brannoc');
    } else if (tile.door && tile.doorLocked && !tile.doorOpen && !this.hasKey) {
      sound.play('bump');
    }
  }

  private handleCombat(_characterIndex: number) {
    if (this.monsterHp <= 0) return;

    const damage = Math.floor(Math.random() * 6) + 5;
    
    this.monsterHp -= damage;
    sound.play('hit');
    
    if (this.monsterHp <= 0) {
      this.monsterHp = 0;
      const tile = this.floor.tiles[this.party.y][this.party.x];
      if (tile.monster) {
        tile.monster = undefined;
      }
      this.state = 'playing';
      triggerBark('loot');
    } else {
      // Monster counterattack
      setTimeout(() => {
        const target = characters[Math.floor(Math.random() * characters.length)];
        const monsterDamage = Math.floor(Math.random() * 8) + 3;
        damageCharacter(target, monsterDamage);
        sound.play('hurt');
        
        if (target.hp / target.maxHp < 0.3) {
          setTimeout(() => triggerBark('low_health'), 500);
        }
      }, 500);
    }
  }

  private handleCarvingTap(carving: string) {
    const texts = {
      'carving_start': 'Thane Orrun keeps the clan dry.',
      'carving_door': 'One flame given. One floor spared.',
      'carving_secret': 'We gave too much. It is still hungry.'
    };

    const text = texts[carving as keyof typeof texts];
    if (text) {
      if (carving === 'carving_secret') {
        // Volume scales with depth: ~0.25 on floor 1
        const volume = 0.2 + (this.floorDepth * 0.1);
        sound.play('tide_sigh', Math.min(volume, 1.0));
      }
      triggerBark('loot', text, 'ilsevar');
    }
  }
}
