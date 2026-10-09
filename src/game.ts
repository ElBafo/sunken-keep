import { Party, FloorData, Tile } from './party';
import { floor1 } from './floor';
import { Renderer } from './renderer';
import { sound } from './assets';
import { triggerBark, checkIdleBarks, triggerScriptedBark } from './barks';
import { characters, damageCharacter, healCharacter, resetIdleTimers } from './characters';
import { IntroPlayer } from './intro';
import { getMonsterStats, getMonsterDamage, canLatch, getLatchInfo } from './monster-stats';
import { scrollText, potionTexts } from './floor1-text';

type GameState = 'intro' | 'playing' | 'combat' | 'reading';

export class Game {
  private state: GameState = 'intro';
  private party: Party;
  private floor: FloorData;
  private renderer: Renderer;
  private lastInputTime = 0;
  private hasKey = false;
  private discoveredSecret = false;
  private intro: IntroPlayer;
  private floorDepth = 1;
  
  // Combat state
  private combatTile: Tile | null = null;
  private combatMonsterType: string = '';
  private playerTurn = true;
  private combatStartTime = 0;
  
  // Reading state
  private readingText: string[] = [];
  private readingIndex = 0;
  
  // First sight tracking
  private seenMonsters = new Set<string>();
  private enteredPantry = false;
  
  // Leech latch tracking
  private latchedLeeches: Array<{ tile: Tile; turns: number; drain: number }> = [];

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
      
      // Update monster animations
      this.updateMonsterAnimations(now);
      
      // Process leech latches
      this.updateLeeches();
    }
    
    if (this.state === 'combat') {
      // Update combat monster animation
      if (this.combatTile) {
        const elapsed = (now - this.combatStartTime) / 1000;
        this.combatTile.monsterAnimTime = elapsed;
        
        // Check if attack animation is done
        if (this.combatTile.monsterState === 'attack' && elapsed > 0.3) {
          this.combatTile.monsterState = 'idle';
          this.combatTile.monsterAnimTime = 0;
        }
        
        // Check if hurt animation is done
        if (this.combatTile.monsterState === 'hurt' && elapsed > 0.2) {
          if (this.combatTile.monsterHp && this.combatTile.monsterHp <= 0) {
            this.combatTile.monsterState = 'death';
            this.combatTile.monsterAnimTime = 0;
            this.combatStartTime = now;
          } else {
            this.combatTile.monsterState = 'idle';
            this.combatTile.monsterAnimTime = 0;
          }
        }
        
        // Check if death animation is done
        if (this.combatTile.monsterState === 'death' && elapsed > 0.5) {
          // Remove monster
          this.combatTile.monster = undefined;
          this.combatTile.monsterHp = 0;
          this.combatTile = null;
          this.state = 'playing';
          triggerBark('loot');
        }
      }
    }
  }
  
  private updateMonsterAnimations(now: number) {
    const elapsed = now / 1000;
    
    for (let y = 0; y < this.floor.height; y++) {
      for (let x = 0; x < this.floor.width; x++) {
        const tile = this.floor.tiles[y][x];
        if (tile.monster && tile.monsterState === 'idle') {
          tile.monsterAnimTime = elapsed;
        }
      }
    }
  }
  
  private updateLeeches() {
    // Process latched leeches
    for (let i = this.latchedLeeches.length - 1; i >= 0; i--) {
      const leech = this.latchedLeeches[i];
      leech.turns--;
      
      if (leech.turns <= 0 || !leech.tile.monster) {
        this.latchedLeeches.splice(i, 1);
      } else {
        // Drain health
        const target = characters[Math.floor(Math.random() * characters.length)];
        damageCharacter(target, leech.drain);
        sound.play('bog_leeches_attack', 0.3); // Quiet replay
        
        if (Math.random() < 0.5) {
          triggerScriptedBark('leech_latch');
        }
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, now: number) {
    if (this.state === 'intro') {
      this.intro.render(ctx);
      return;
    }

    // Clear the entire canvas to prevent intro remnants
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 270, 480);

    this.renderer.drawViewport(ctx, this.party, this.floor, now);
    this.renderer.drawPortraits(ctx, now);
    
    // Debug info
    if (this.hasKey) {
      ctx.fillStyle = '#ffff00';
      ctx.fillRect(5, 5, 8, 8);
    }
    
    // Reading UI
    if (this.state === 'reading') {
      this.renderReading(ctx);
    }
  }
  
  private renderReading(ctx: CanvasRenderingContext2D) {
    // Semi-transparent overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, 270, 480);
    
    // Text display
    const text = this.readingText[this.readingIndex];
    const lines = this.wrapText(text, 250);
    const lineHeight = 10;
    const startY = 150;
    
    ctx.fillStyle = '#ffffff';
    lines.forEach((line, i) => {
      const x = (270 - line.length * 6) / 2;
      this.drawText(ctx, line, x, startY + i * lineHeight);
    });
    
    // Instructions
    const instr = this.readingIndex < this.readingText.length - 1 ? 'TAP TO CONTINUE' : 'TAP TO CLOSE';
    const instrX = (270 - instr.length * 6) / 2;
    ctx.fillStyle = '#888888';
    this.drawText(ctx, instr, instrX, startY + lines.length * lineHeight + 20);
  }
  
  private wrapText(text: string, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (testLine.length * 6 <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }
  
  private drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
    ctx.fillText(text, x, y);
  }

  handleTap(x: number, y: number) {
    sound.unlock();
    
    if (this.state === 'intro') {
      this.intro.handleTap(x, y);
      return;
    }
    
    if (this.state === 'reading') {
      this.readingIndex++;
      if (this.readingIndex >= this.readingText.length) {
        this.state = 'playing';
        this.readingText = [];
        this.readingIndex = 0;
      }
      return;
    }

    this.lastInputTime = Date.now();
    resetIdleTimers();

    // Check portrait taps (combat)
    if (this.state === 'combat' && y >= 202 && y < 266) {
      const portraitIndex = Math.floor((x - 11) / 66);
      if (portraitIndex >= 0 && portraitIndex < 4) {
        this.handleCombatAttack();
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
    
    if (this.state === 'reading') {
      if (key === ' ' || key === 'Enter' || key === 'Escape') {
        this.readingIndex++;
        if (this.readingIndex >= this.readingText.length || key === 'Escape') {
          this.state = 'playing';
          this.readingText = [];
          this.readingIndex = 0;
        }
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
      this.playFootstepSound();
      this.checkTile();
    }
  }
  
  private playFootstepSound() {
    const tile = this.floor.tiles[this.party.y][this.party.x];
    if (tile.shallowWater) {
      sound.play('step_water_shallow');
    } else if (tile.deepWater) {
      sound.play('step_water_deep');
    } else {
      sound.play('step');
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
    
    // Deep water bark
    if (tile.deepWater && Math.random() < 0.3) {
      triggerBark('deep_water');
    }
    
    // Pantry bark (first time stepping onto tile 5,5 from corridor)
    if (!this.enteredPantry && this.party.y === 5 && this.party.x === 5) {
      this.enteredPantry = true;
      triggerScriptedBark('pantry');
    }
    
    // Key pickup
    if (tile.item === 'key' && !this.hasKey) {
      this.hasKey = true;
      tile.item = undefined;
      sound.play('key');
      triggerBark('loot', "Rusty. Like Brannoc's charm.", 'mags');
    }
    
    // Potion pickup
    if (tile.item && tile.item.startsWith('potion_')) {
      const text = potionTexts[tile.item as keyof typeof potionTexts];
      tile.item = undefined;
      sound.play('pickup');
      triggerBark('loot', text, 'mags');
      
      // Heal party
      setTimeout(() => {
        healCharacter(characters[Math.floor(Math.random() * characters.length)], 15);
        sound.play('potion');
        triggerScriptedBark('drinking_potion');
      }, 1000);
    }
    
    // Scroll pickup (behind secret wall)
    if (tile.item === 'scroll' && tile.secretOpen) {
      tile.item = undefined;
      sound.play('pickup');
      this.state = 'reading';
      this.readingText = scrollText;
      this.readingIndex = 0;
    }
    
    // Monster encounter
    if (tile.monster && !tile.monsterAlerted) {
      this.startCombat(tile);
    }
  }
  
  private startCombat(tile: Tile) {
    if (!tile.monster) return;
    
    tile.monsterAlerted = true;
    this.combatTile = tile;
    this.combatMonsterType = tile.monster;
    this.state = 'combat';
    this.playerTurn = true;
    this.combatStartTime = Date.now();
    
    // Load monster stats if not set
    const stats = getMonsterStats(tile.monster);
    if (stats && !tile.monsterHp) {
      tile.monsterHp = stats.hp;
      tile.monsterMaxHp = stats.hp;
      tile.monsterArmor = stats.armor || 0;
    }
    
    // Play alert sound
    sound.play(`${tile.monster}_alert`);
    
    // First sight bark
    if (!this.seenMonsters.has(tile.monster)) {
      this.seenMonsters.add(tile.monster);
      triggerScriptedBark(`first_sight_${tile.monster}`);
    } else {
      triggerBark('new_monster');
    }
  }
  
  private handleCombatAttack() {
    if (!this.combatTile || !this.playerTurn) return;
    
    // Player attacks
    const damage = Math.floor(Math.random() * 6) + 5; // 5-10 damage
    const armor = this.combatTile.monsterArmor || 0;
    const actualDamage = Math.max(1, damage - armor);
    
    this.combatTile.monsterHp = (this.combatTile.monsterHp || 0) - actualDamage;
    this.combatTile.monsterState = 'hurt';
    this.combatTile.monsterAnimTime = 0;
    this.combatStartTime = Date.now();
    sound.play('hit');
    sound.play(`${this.combatMonsterType}_hurt`);
    
    if (this.combatTile.monsterHp <= 0) {
      // Monster dies
      sound.play(`${this.combatMonsterType}_death`);
      // Death animation will complete in update()
      return;
    }
    
    // Monster counterattacks
    this.playerTurn = false;
    setTimeout(() => {
      if (!this.combatTile) return;
      
      this.combatTile.monsterState = 'attack';
      this.combatTile.monsterAnimTime = 0;
      this.combatStartTime = Date.now();
      sound.play(`${this.combatMonsterType}_attack`);
      
      const target = characters[Math.floor(Math.random() * characters.length)];
      const monsterDamage = getMonsterDamage(this.combatMonsterType);
      damageCharacter(target, monsterDamage);
      sound.play('hurt');
      
      // Check for leech latch
      if (this.combatMonsterType === 'bog_leeches' && canLatch(this.combatMonsterType)) {
        const latchInfo = getLatchInfo(this.combatMonsterType);
        if (latchInfo && this.combatTile) {
          this.latchedLeeches.push({
            tile: this.combatTile,
            turns: latchInfo.turns,
            drain: latchInfo.drainPerTurn
          });
        }
      }
      
      if (target.hp / target.maxHp < 0.3) {
        setTimeout(() => triggerBark('low_health'), 500);
      }
      
      this.playerTurn = true;
    }, 400);
  }

  private interact() {
    const frontPos = this.party.getForward();
    if (frontPos.x < 0 || frontPos.x >= this.floor.width || frontPos.y < 0 || frontPos.y >= this.floor.height) {
      sound.play('bump');
      return;
    }

    const tile = this.floor.tiles[frontPos.y][frontPos.x];
    
    // Open chest
    if (tile.chest && !tile.chestOpen) {
      tile.chestOpen = true;
      sound.play('chest');
      triggerScriptedBark('opening_chest');
      
      // Add potion inside
      setTimeout(() => {
        tile.item = 'potion_red';
      }, 500);
      return;
    }
    
    // Secret wall
    if (tile.secret && !tile.secretOpen && !this.discoveredSecret) {
      tile.secretOpen = true;
      this.discoveredSecret = true;
      sound.play('secret_wall');
      triggerBark('secret_wall');
      return;
    }
    
    // Locked door
    if (tile.door && tile.doorLocked && !tile.doorOpen && this.hasKey) {
      tile.doorOpen = true;
      this.hasKey = false;
      sound.play('door');
      triggerBark('loot', 'Smells like home. Damp home.', 'brannoc');
      return;
    }
    
    if (tile.door && tile.doorLocked && !tile.doorOpen && !this.hasKey) {
      sound.play('bump');
      return;
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
        const volume = 0.2 + (this.floorDepth * 0.1);
        sound.play('tide_sigh', Math.min(volume, 1.0));
      }
      triggerBark('loot', text, 'ilsevar');
    }
  }
}
