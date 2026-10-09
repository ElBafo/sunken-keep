import * as THREE from 'three';
import { Sconce } from './types';

const CELL_SIZE = 2;

export class AudioManager {
  listener: THREE.AudioListener;
  audioContext: AudioContext | null = null;
  sounds: THREE.PositionalAudio[] = [];
  ambientSound: THREE.Audio | null = null;
  
  constructor(camera: THREE.Camera) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
  }
  
  async init() {
    // AudioContext will be created on first user interaction
    return Promise.resolve();
  }
  
  unlock() {
    if (!this.listener.context) return;
    
    // Resume AudioContext on iOS
    if (this.listener.context.state === 'suspended') {
      this.listener.context.resume();
    }
  }
  
  async loadSounds(scene: THREE.Scene, sconces: readonly Sconce[]) {
    const audioLoader = new THREE.AudioLoader();
    const baseUrl = import.meta.env.BASE_URL;
    
    try {
      // Flooded halls ambient
      const ambBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
        audioLoader.load(
          `${baseUrl}audio/amb_flooded_halls_loop.mp3`,
          resolve,
          undefined,
          reject
        );
      });
      
      this.ambientSound = new THREE.Audio(this.listener);
      this.ambientSound.setBuffer(ambBuffer);
      this.ambientSound.setLoop(true);
      this.ambientSound.setVolume(0.3);
      this.ambientSound.play();
      
      // Torch loop for each lit sconce
      const torchBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
        audioLoader.load(
          `${baseUrl}audio/sfx_torch_loop.mp3`,
          resolve,
          undefined,
          reject
        );
      });
      
      for (const sconce of sconces) {
        if (!sconce.lit) continue;
        
        const sound = new THREE.PositionalAudio(this.listener);
        sound.setBuffer(torchBuffer);
        sound.setRefDistance(2);
        sound.setMaxDistance(8);
        sound.setRolloffFactor(1);
        sound.setLoop(true);
        sound.setVolume(0.4);
        
        const wx = sconce.x * CELL_SIZE;
        const wz = sconce.y * CELL_SIZE;
        const offset = 0.7;
        
        let lx = wx, lz = wz;
        if (sconce.face === 'N') lz -= offset;
        else if (sconce.face === 'E') lx += offset;
        else if (sconce.face === 'S') lz += offset;
        else if (sconce.face === 'W') lx -= offset;
        
        const soundMesh = new THREE.Object3D();
        soundMesh.position.set(lx, 1.2, lz);
        soundMesh.add(sound);
        scene.add(soundMesh);
        
        sound.play();
        this.sounds.push(sound);
      }
      
      // Add a drip sound at one water location
      const dripBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
        audioLoader.load(
          `${baseUrl}audio/sfx_drip_1.mp3`,
          resolve,
          undefined,
          reject
        );
      });
      
      const dripSound = new THREE.PositionalAudio(this.listener);
      dripSound.setBuffer(dripBuffer);
      dripSound.setRefDistance(3);
      dripSound.setMaxDistance(10);
      dripSound.setRolloffFactor(1);
      dripSound.setLoop(true);
      dripSound.setVolume(0.5);
      
      const dripMesh = new THREE.Object3D();
      dripMesh.position.set(2 * CELL_SIZE, 1.5, 2 * CELL_SIZE);
      dripMesh.add(dripSound);
      scene.add(dripMesh);
      
      dripSound.play();
      this.sounds.push(dripSound);
      
    } catch (err) {
      console.warn('Failed to load audio:', err);
    }
  }
  
  stopAll() {
    if (this.ambientSound) {
      this.ambientSound.stop();
    }
    for (const sound of this.sounds) {
      sound.stop();
    }
  }
}
