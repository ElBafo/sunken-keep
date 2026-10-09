import { assets } from './assets';
import type { GameState } from './types';
import { sound } from './assets';

interface DialogueNode {
  id: string;
  speaker: string;
  face?: string;
  text: string;
  next?: string;
  choices?: DialogueChoice[];
  action?: string;
}

interface DialogueChoice {
  text: string;
  next?: string;
  set?: Record<string, boolean | string | number>;
  requires?: Record<string, boolean | string | number>;
  cost?: any;
}

interface Dialogue {
  nodes: DialogueNode[];
  currentNode: string;
}

export class DialogueSystem {
  private dialogues: Record<string, DialogueNode[]> = {};
  private activeDialogue: Dialogue | null = null;
  private onComplete: (() => void) | null = null;

  // Load dialogue data
  async loadDialogues(baseUrl: string): Promise<void> {
    try {
      const response = await fetch(`${baseUrl}story/dialogue.json`);
      const data = await response.json();
      this.dialogues = data.dialogues;
      console.log('Dialogue data loaded');
    } catch (error) {
      console.error('Failed to load dialogue data:', error);
    }
  }

  // Start a dialogue
  startDialogue(dialogueId: string, onComplete?: () => void): boolean {
    const nodes = this.dialogues[dialogueId];
    if (!nodes || nodes.length === 0) {
      console.error(`Dialogue not found: ${dialogueId}`);
      return false;
    }

    this.activeDialogue = {
      nodes,
      currentNode: nodes[0].id,
    };
    this.onComplete = onComplete || null;
    sound.play('bark');
    return true;
  }

  // Get current dialogue node
  getCurrentNode(): DialogueNode | null {
    if (!this.activeDialogue) return null;

    return this.activeDialogue.nodes.find(n => n.id === this.activeDialogue!.currentNode) || null;
  }

  // Advance dialogue (no choices)
  advance(state: GameState): void {
    if (!this.activeDialogue) return;

    const node = this.getCurrentNode();
    if (!node) {
      this.endDialogue();
      return;
    }

    // Execute action if present
    if (node.action) {
      this.executeAction(node.action, state);
    }

    if (node.next) {
      this.activeDialogue.currentNode = node.next;
      sound.play('bark');
    } else {
      this.endDialogue();
    }
  }

  // Choose dialogue option
  chooseOption(choiceIndex: number, state: GameState): void {
    if (!this.activeDialogue) return;

    const node = this.getCurrentNode();
    if (!node || !node.choices || choiceIndex >= node.choices.length) return;

    const choice = node.choices[choiceIndex];

    // Check requirements
    if (choice.requires) {
      for (const [flag, value] of Object.entries(choice.requires)) {
        if (state.flags.has(flag) !== (value as boolean)) {
          sound.play('no');
          return;
        }
      }
    }

    // Apply costs (TODO: implement cost system)
    if (choice.cost) {
      console.log('Cost:', choice.cost);
    }

    // Set flags
    if (choice.set) {
      for (const [flag, value] of Object.entries(choice.set)) {
        if (typeof value === 'boolean' && value) {
          state.flags.add(flag);
        }
      }
    }

    // Move to next node or end
    if (choice.next) {
      this.activeDialogue.currentNode = choice.next;
      sound.play('bark');
    } else {
      this.endDialogue();
    }
  }

  // Execute action
  private executeAction(action: string, _state: GameState): void {
    console.log(`Action: ${action}`);
    // Actions will be handled by game controller
    // e.g., "start_fight:captain", "start_escape"
  }

  // End dialogue
  endDialogue(): void {
    this.activeDialogue = null;
    if (this.onComplete) {
      this.onComplete();
      this.onComplete = null;
    }
  }

  // Check if dialogue is active
  isActive(): boolean {
    return this.activeDialogue !== null;
  }

  // Render dialogue UI
  render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (!this.activeDialogue) return;

    const node = this.getCurrentNode();
    if (!node) return;

    const baseUrl = '/sunken-keep/';

    // Dialogue box (bottom 200px)
    const boxHeight = 200;
    const boxY = height - boxHeight;

    // Background
    ctx.fillStyle = 'rgba(20, 16, 12, 0.95)';
    ctx.fillRect(0, boxY, width, boxHeight);

    // Border
    ctx.strokeStyle = '#8a7a6a';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, boxY, width, boxHeight);

    // Portrait (if not narrator/tide)
    if (node.speaker !== 'narrator' && node.speaker !== 'tide') {
      const portraitSize = 60;
      const portraitX = 10;
      const portraitY = boxY + 10;

      // Get portrait
      const face = node.face || 'neutral';
      const portraitPath = `${baseUrl}art/portraits/${node.speaker}_${face}.png`;
      const portrait = assets.getImage(portraitPath);

      if (portrait && portrait.complete) {
        ctx.drawImage(portrait, portraitX, portraitY, portraitSize, portraitSize);
      } else {
        // Fallback: colored square
        ctx.fillStyle = '#4a4a6a';
        ctx.fillRect(portraitX, portraitY, portraitSize, portraitSize);
      }

      // Portrait border
      ctx.strokeStyle = '#8a7a6a';
      ctx.lineWidth = 1;
      ctx.strokeRect(portraitX, portraitY, portraitSize, portraitSize);
    }

    // Speaker name
    const textX = node.speaker === 'narrator' || node.speaker === 'tide' ? 10 : 80;
    const textY = boxY + 20;
    const textWidth = width - textX - 10;

    if (node.speaker !== 'narrator') {
      ctx.fillStyle = node.speaker === 'tide' ? '#4a6a8a' : '#d8ccb0';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'left';
      const speakerName = node.speaker.charAt(0).toUpperCase() + node.speaker.slice(1);
      ctx.fillText(speakerName, textX, textY);
    }

    // Text
    ctx.fillStyle = node.speaker === 'tide' ? '#6a8aaa' : '#d8ccb0';
    ctx.font = '12px monospace';
    const textStartY = node.speaker === 'narrator' ? textY : textY + 20;
    
    // Word wrap
    const words = node.text.split(' ');
    let line = '';
    let y = textStartY;
    const lineHeight = 16;

    for (const word of words) {
      const testLine = line + word + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > textWidth - 10 && line !== '') {
        ctx.fillText(line, textX, y);
        line = word + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, textX, y);

    // Choices or continue prompt
    if (node.choices && node.choices.length > 0) {
      const choiceY = boxY + 120;
      const choiceHeight = 25;
      const choiceSpacing = 5;

      node.choices.forEach((choice, i) => {
        const y = choiceY + i * (choiceHeight + choiceSpacing);
        
        // Background
        ctx.fillStyle = '#3a3a4a';
        ctx.fillRect(10, y, width - 20, choiceHeight);

        // Border
        ctx.strokeStyle = '#6a6a8a';
        ctx.lineWidth = 1;
        ctx.strokeRect(10, y, width - 20, choiceHeight);

        // Choice text
        ctx.fillStyle = '#d8ccb0';
        ctx.font = '11px monospace';
        ctx.fillText(choice.text, 15, y + 17);
      });
    } else {
      // Continue prompt
      ctx.fillStyle = '#8a7a6a';
      ctx.font = '11px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('[Tap to continue]', width - 10, height - 15);
    }
  }

  // Handle click
  handleClick(x: number, y: number, width: number, height: number, state: GameState): boolean {
    if (!this.activeDialogue) return false;

    const node = this.getCurrentNode();
    if (!node) return false;

    const boxHeight = 200;
    const boxY = height - boxHeight;

    // Check if click is in dialogue box
    if (y < boxY) return false;

    // Handle choices
    if (node.choices && node.choices.length > 0) {
      const choiceY = boxY + 120;
      const choiceHeight = 25;
      const choiceSpacing = 5;

      for (let i = 0; i < node.choices.length; i++) {
        const cy = choiceY + i * (choiceHeight + choiceSpacing);
        if (y >= cy && y < cy + choiceHeight && x >= 10 && x < width - 10) {
          this.chooseOption(i, state);
          return true;
        }
      }
    } else {
      // Advance dialogue
      this.advance(state);
      return true;
    }

    return false;
  }
}

export const dialogueSystem = new DialogueSystem();
