import * as THREE from 'three';

const RENDER_WIDTH = 270;

export class PixelRenderer {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  renderTarget: THREE.WebGLRenderTarget;
  finalScene: THREE.Scene;
  finalCamera: THREE.OrthographicCamera;
  finalMaterial: THREE.ShaderMaterial;
  canvas: HTMLCanvasElement;
  palette: string[] = [];
  paletteEnabled = true;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    
    // Main scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0a0f0a, 0.08); // Reduced fog density for better visibility
    
    // Camera
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 20);
    this.camera.position.set(0, 0, 0);
    
    // WebGL renderer
    this.renderer = new THREE.WebGLRenderer({ 
      canvas,
      antialias: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(1);
    
    // Low-res render target
    const aspect = window.innerHeight / window.innerWidth;
    const renderHeight = Math.round(RENDER_WIDTH * aspect);
    this.renderTarget = new THREE.WebGLRenderTarget(RENDER_WIDTH, renderHeight, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType
    });
    
    // Final fullscreen quad for upscaling + quantization
    this.finalScene = new THREE.Scene();
    this.finalCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    
    this.finalMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.renderTarget.texture },
        palette: { value: [] },
        paletteSize: { value: 0 },
        paletteEnabled: { value: 1.0 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec3 palette[64];
        uniform int paletteSize;
        uniform float paletteEnabled;
        varying vec2 vUv;
        
        vec3 quantizeColor(vec3 color) {
          if (paletteSize == 0 || paletteEnabled < 0.5) return color;
          
          float minDist = 999999.0;
          vec3 nearest = color;
          
          for (int i = 0; i < 64; i++) {
            if (i >= paletteSize) break;
            vec3 palColor = palette[i];
            float dist = distance(color, palColor);
            if (dist < minDist) {
              minDist = dist;
              nearest = palColor;
            }
          }
          
          return nearest;
        }
        
        void main() {
          vec4 texel = texture2D(tDiffuse, vUv);
          vec3 quantized = quantizeColor(texel.rgb);
          gl_FragColor = vec4(quantized, texel.a);
        }
      `
    });
    
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.finalMaterial
    );
    this.finalScene.add(quad);
    
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  
  async loadPalette() {
    try {
      const baseUrl = import.meta.env.BASE_URL;
      const response = await fetch(`${baseUrl}art/palette.json`);
      const data = await response.json();
      this.palette = data.colors || [];
      this.updatePaletteUniform();
    } catch (err) {
      console.warn('Failed to load palette:', err);
    }
  }
  
  updatePaletteUniform() {
    const colors = this.palette.map(hex => {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      return new THREE.Vector3(r, g, b);
    });
    
    // Pad to 64 entries to match shader array size
    while (colors.length < 64) {
      colors.push(new THREE.Vector3(0, 0, 0));
    }
    
    this.finalMaterial.uniforms.palette.value = colors;
    this.finalMaterial.uniforms.paletteSize.value = this.palette.length;
  }
  
  setPaletteEnabled(enabled: boolean) {
    this.paletteEnabled = enabled;
    this.finalMaterial.uniforms.paletteEnabled.value = enabled ? 1.0 : 0.0;
  }
  
  resize() {
    const aspect = window.innerHeight / window.innerWidth;
    const renderHeight = Math.round(RENDER_WIDTH * aspect);
    
    this.renderTarget.setSize(RENDER_WIDTH, renderHeight);
    this.camera.aspect = RENDER_WIDTH / renderHeight;
    this.camera.updateProjectionMatrix();
    
    // Set canvas to render at 270px width, CSS will upscale
    this.canvas.width = RENDER_WIDTH;
    this.canvas.height = renderHeight;
    this.renderer.setSize(RENDER_WIDTH, renderHeight, false);
    
    // Scale canvas with CSS to fit viewport
    const scale = Math.min(
      window.innerWidth / RENDER_WIDTH,
      window.innerHeight / renderHeight
    );
    this.canvas.style.width = `${RENDER_WIDTH * scale}px`;
    this.canvas.style.height = `${renderHeight * scale}px`;
  }
  
  render() {
    // Render scene to low-res target
    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.render(this.scene, this.camera);
    
    // Render quantized upscale to screen
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.finalScene, this.finalCamera);
  }
}
