import { characters, Character, Expression, resetIdleTimers } from './characters';
import { sound } from './assets';

export interface Bark {
  trigger: string;
  speaker: string;
  text: string;
  face: Expression;
  listener?: string;
  listenerFace?: Expression;
}

export interface ActiveBark {
  bark: Bark;
  speaker: Character;
  listener?: Character;
  startTime: number;
  duration: number;
}

let barks: Bark[] = [];
let activeBark: ActiveBark | null = null;
const lastTriggerTime = new Map<string, number>();
const lastBarkByTrigger = new Map<string, Bark>();
const COOLDOWN = 5000;
const BARK_DURATION = 3000;

export async function loadBarks() {
  const response = await fetch('/sunken-keep/barks.json');
  barks = await response.json();
}

export function triggerBark(trigger: string, scriptedText?: string, scriptedSpeaker?: string) {
  const now = Date.now();
  
  // Check cooldown
  const lastTime = lastTriggerTime.get(trigger) || 0;
  if (now - lastTime < COOLDOWN) return;

  let bark: Bark | undefined;

  if (scriptedText && scriptedSpeaker) {
    // Scripted bark
    bark = {
      trigger,
      speaker: scriptedSpeaker,
      text: scriptedText,
      face: 'smirk'
    };
  } else {
    // Random bark from pool
    const candidates = barks.filter(b => 
      b.trigger === trigger && b !== lastBarkByTrigger.get(trigger)
    );
    
    if (candidates.length === 0) return;
    bark = candidates[Math.floor(Math.random() * candidates.length)];
  }

  const speaker = characters.find(c => c.id === bark!.speaker);
  if (!speaker) return;

  const listener = bark.listener ? characters.find(c => c.id === bark.listener) : undefined;

  // Set expressions
  speaker.expression = bark.face;
  speaker.talkingUntil = now + BARK_DURATION;
  
  if (listener && bark.listenerFace) {
    listener.expression = bark.listenerFace;
  }

  activeBark = {
    bark,
    speaker,
    listener,
    startTime: now,
    duration: BARK_DURATION
  };

  lastTriggerTime.set(trigger, now);
  lastBarkByTrigger.set(trigger, bark);
  
  sound.play('bark');
  resetIdleTimers();
}

export function getActiveBark(now: number): ActiveBark | null {
  if (activeBark && now - activeBark.startTime < activeBark.duration) {
    return activeBark;
  }
  
  if (activeBark && now - activeBark.startTime >= activeBark.duration) {
    // Reset expressions
    if (activeBark.speaker.expression !== 'neutral') {
      activeBark.speaker.expression = 'neutral';
    }
    if (activeBark.listener && activeBark.listener.expression !== 'neutral') {
      activeBark.listener.expression = 'neutral';
    }
    activeBark = null;
  }
  
  return null;
}

export function checkIdleBarks(now: number, lastInputTime: number) {
  if (activeBark) return;
  if (now - lastInputTime < 20000) return;

  const idleCandidates = characters.filter(c => {
    return now - c.lastIdleAnim > 30000;
  });

  if (idleCandidates.length === 0) return;

  const char = idleCandidates[Math.floor(Math.random() * idleCandidates.length)];
  char.lastIdleAnim = now;
  
  triggerBark('idle');
}
