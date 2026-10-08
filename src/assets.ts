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

  async init() {
    // Load audio config
    const response = await fetch('/sunken-keep/audio/audio.json');
    const config = await response.json();
    
    // Load SFX
    for (const [key, file] of Object.entries(config.sfx)) {
      this.loadSound(key, `/sunken-keep/audio/${file}`);
    }
    
    // Load music
    for (const [key, data] of Object.entries(config.music)) {
      const musicData = data as any;
      const audio = new Audio();
      audio.preload = 'auto';
      audio.loop = musicData.loop || false;
      audio.volume = musicData.volume || 1.0;
      
      // Try OGG first, fallback to MP3
      audio.src = `/sunken-keep/audio/${musicData.file}.ogg`;
      audio.onerror = () => {
        audio.src = `/sunken-keep/audio/${musicData.file}.mp3`;
      };
      
      this.sounds.set(`music_${key}`, audio);
    }
  }

  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    console.log('Audio unlocked');
  }

  play(event: string, volume: number = 1.0) {
    if (!this.unlocked) return;
    
    const sound = this.sounds.get(event);
    if (sound) {
      sound.volume = volume;
      sound.currentTime = 0;
      sound.play().catch(() => {});
    }
  }

  playMusic(name: string) {
    if (!this.unlocked) return;
    
    if (this.music) {
      this.music.pause();
    }
    
    this.music = this.sounds.get(`music_${name}`) || null;
    if (this.music) {
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

  private loadSound(event: string, basePath: string) {
    const audio = new Audio();
    audio.preload = 'auto';
    
    // Try OGG first, fallback to MP3
    audio.src = `${basePath}.ogg`;
    audio.onerror = () => {
      audio.src = `${basePath}.mp3`;
      audio.onerror = () => {
        console.warn(`Failed to load sound: ${basePath}`);
      };
    };
    
    this.sounds.set(event, audio);
  }
}

export const assets = new AssetLoader();
export const sound = new SoundManager();
