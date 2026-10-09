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
      img.onload = async () => {
        try {
          // Decode the image to ensure it's ready
          await img.decode();
          resolve();
        } catch (error) {
          console.warn(`Failed to decode image: ${path}`, error);
          resolve(); // Don't fail, just warn
        }
      };
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
  
  isImageReady(img: HTMLImageElement | undefined): boolean {
    if (!img) return false;
    if (!img.complete) return false;
    if (img.naturalWidth === 0) return false;
    return true;
  }

  async waitForAll(): Promise<void> {
    // Keep draining until a pass adds no new loads (preload can chain).
    let previous = -1;
    while (this.loadPromises.length !== previous) {
      previous = this.loadPromises.length;
      await Promise.all(this.loadPromises);
    }

    const decodes: Promise<void>[] = [];
    for (const img of this.images.values()) {
      if (typeof img.decode === 'function') {
        decodes.push(img.decode().then(() => undefined, () => undefined));
      }
    }
    await Promise.all(decodes);

    if (this.loadPromises.length !== previous) {
      await this.waitForAll();
    }
  }
}

// Sound manager with mobile autoplay handling
export class SoundManager {
  private unlocked = false;
  private sounds = new Map<string, HTMLAudioElement>();
  private music: HTMLAudioElement | null = null;
  private muted = false;
  private audioContext: AudioContext | null = null;
  private sfxFiles: Record<string, string> = {};
  private musicFiles: Record<string, { file: string; loop?: boolean; volume?: number }> = {};
  private preferredFormat = 'mp3';
  private fallbackFormat = 'ogg';
  private audioAvailable = true;

  async init() {
    // Create AudioContext for iOS Safari unlock. Do not construct dozens of
    // Audio() elements here — WebKit (iPhone Safari / Playwright) crashes if
    // every clip starts fetching at once.
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.warn('AudioContext not available:', e);
    }

    const response = await fetch('/sunken-keep/audio/audio.json');
    const config = await response.json();

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    this.preferredFormat = isIOS ? 'mp3' : 'ogg';
    this.fallbackFormat = isIOS ? 'ogg' : 'mp3';

    this.sfxFiles = config.sfx || {};
    this.musicFiles = config.music || {};
  }

  async unlock() {
    if (this.unlocked) return;
    
    // Resume AudioContext on iOS Safari
    if (this.audioContext && this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (e) {
        this.audioAvailable = false;
      }
    }

    if (this.audioAvailable && this.audioContext) {
      try {
        const buf = this.audioContext.createBuffer(1, 1, 22050);
        const src = this.audioContext.createBufferSource();
        src.buffer = buf;
        src.connect(this.audioContext.destination);
        src.start(0);
      } catch {
        this.audioAvailable = false;
      }
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
    if (!this.unlocked || this.muted || !this.audioAvailable) return;
    
    const sound = this.ensureSfx(event);
    if (sound) {
      sound.volume = volume;
      sound.currentTime = 0;
      sound.play().catch(() => {});
    }
  }
  
  playLoop(event: string, volume: number = 1.0): HTMLAudioElement | null {
    if (!this.unlocked || !this.audioAvailable) return null;
    
    const soundKey = event.startsWith('sfx_') ? event : `sfx_${event}`;
    const sound = this.ensureSfx(soundKey) || this.ensureSfx(event);
    if (sound) {
      sound.volume = this.muted ? 0 : volume;
      sound.loop = true;
      sound.play().catch(() => {});
      return sound;
    }
    return null;
  }

  playMusic(name: string) {
    if (!this.unlocked || !this.audioAvailable) return;
    
    if (this.music) {
      this.music.pause();
    }
    
    this.music = this.ensureMusic(name);
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

  private ensureSfx(event: string): HTMLAudioElement | undefined {
    if (this.sounds.has(event)) return this.sounds.get(event);
    const file = this.sfxFiles[event] || this.sfxFiles[event.replace(/^sfx_/, '')];
    if (!file) return undefined;
    this.loadSound(event, `/sunken-keep/audio/${file}`, this.preferredFormat, this.fallbackFormat);
    return this.sounds.get(event);
  }

  private ensureMusic(name: string): HTMLAudioElement | null {
    const key = `music_${name}`;
    if (this.sounds.has(key)) return this.sounds.get(key) || null;
    const musicData = this.musicFiles[name];
    if (!musicData) return null;
    const audio = new Audio();
    audio.preload = 'auto';
    audio.loop = musicData.loop || false;
    audio.volume = musicData.volume || 1.0;
    audio.src = `/sunken-keep/audio/${musicData.file}.${this.preferredFormat}`;
    audio.onerror = () => {
      audio.src = `/sunken-keep/audio/${musicData.file}.${this.fallbackFormat}`;
    };
    this.sounds.set(key, audio);
    return audio;
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
