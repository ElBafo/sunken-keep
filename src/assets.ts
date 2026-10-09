// Asset loader
export class AssetLoader {
  private images = new Map<string, HTMLImageElement>();
  private loadPromises: Promise<void>[] = [];

  loadImage(path: string): HTMLImageElement {
    if (this.images.has(path)) {
      return this.images.get(path)!;
    }

    const img = new Image();
    const promise = new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => {
        console.warn(`Failed to load image: ${path}`);
        resolve(); // Don't fail, just warn
      };
    });

    this.loadPromises.push(promise);
    img.src = path;
    this.images.set(path, img);
    return img;
  }

  getImage(path: string): HTMLImageElement | undefined {
    return this.images.get(path);
  }

  async waitForAll(): Promise<void> {
    await Promise.all(this.loadPromises);
  }
}

// Sound manager with mobile autoplay handling
export class SoundManager {
  private unlocked = false;
  private sounds = new Map<string, HTMLAudioElement>();
  private music: HTMLAudioElement | null = null;
  private muted = false;
  private audioContext: AudioContext | null = null;

  async init() {
    // Create AudioContext for iOS Safari unlock
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.warn('AudioContext not available:', e);
    }

    // Load audio config
    const response = await fetch('/sunken-keep/audio/audio.json');
    const config = await response.json();
    
    // Detect iOS Safari - prefer MP3
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const preferredFormat = isIOS ? 'mp3' : 'ogg';
    const fallbackFormat = isIOS ? 'ogg' : 'mp3';
    
    // Load SFX
    for (const [key, file] of Object.entries(config.sfx)) {
      this.loadSound(key, `/sunken-keep/audio/${file}`, preferredFormat, fallbackFormat);
    }
    
    // Load music
    for (const [key, data] of Object.entries(config.music)) {
      const musicData = data as any;
      const audio = new Audio();
      audio.preload = 'auto';
      audio.loop = musicData.loop || false;
      audio.volume = musicData.volume || 1.0;
      
      // Prefer MP3 on iOS, OGG on other platforms
      audio.src = `/sunken-keep/audio/${musicData.file}.${preferredFormat}`;
      audio.onerror = () => {
        audio.src = `/sunken-keep/audio/${musicData.file}.${fallbackFormat}`;
      };
      
      this.sounds.set(`music_${key}`, audio);
    }
  }

  async unlock() {
    if (this.unlocked) return;
    
    // Resume AudioContext on iOS Safari
    if (this.audioContext && this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (e) {
        console.warn('Failed to resume AudioContext:', e);
      }
    }
    
    // Play a silent buffer to unlock audio on iOS
    for (const sound of this.sounds.values()) {
      const playPromise = sound.play();
      if (playPromise) {
        playPromise.then(() => {
          sound.pause();
          sound.currentTime = 0;
        }).catch(() => {});
      }
      break; // Only need to do this once
    }
    
    this.unlocked = true;
    console.log('Audio unlocked');
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.music) {
      this.music.volume = muted ? 0 : (this.music.dataset.originalVolume ? parseFloat(this.music.dataset.originalVolume) : 1.0);
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  play(event: string, volume: number = 1.0) {
    if (!this.unlocked || this.muted) return;
    
    const sound = this.sounds.get(event);
    if (sound) {
      sound.volume = volume;
      sound.currentTime = 0;
      sound.play().catch(() => {});
    }
  }
  
  playLoop(event: string, volume: number = 1.0): HTMLAudioElement | null {
    if (!this.unlocked) return null;
    
    const soundKey = event.startsWith('sfx_') ? event : `sfx_${event}`;
    const sound = this.sounds.get(soundKey);
    if (sound) {
      sound.volume = this.muted ? 0 : volume;
      sound.loop = true;
      sound.play().catch(() => {});
      return sound;
    }
    return null;
  }

  playMusic(name: string) {
    if (!this.unlocked) return;
    
    if (this.music) {
      this.music.pause();
    }
    
    this.music = this.sounds.get(`music_${name}`) || null;
    if (this.music) {
      const originalVolume = this.music.volume;
      this.music.dataset.originalVolume = originalVolume.toString();
      this.music.volume = this.muted ? 0 : originalVolume;
      this.music.currentTime = 0;
      this.music.play().catch(() => {});
    }
  }

  stopMusic() {
    if (this.music) {
      this.music.pause();
      this.music.currentTime = 0;
    }
  }

  getMusicTime(): number {
    return this.music?.currentTime || 0;
  }

  private loadSound(event: string, basePath: string, preferredFormat: string, fallbackFormat: string) {
    const audio = new Audio();
    audio.preload = 'auto';
    
    // Try preferred format first (MP3 on iOS, OGG elsewhere)
    audio.src = `${basePath}.${preferredFormat}`;
    audio.onerror = () => {
      audio.src = `${basePath}.${fallbackFormat}`;
      audio.onerror = () => {
        console.warn(`Failed to load sound: ${basePath}`);
      };
    };
    
    this.sounds.set(event, audio);
  }
}

export const assets = new AssetLoader();
export const sound = new SoundManager();
