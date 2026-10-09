import * as THREE from 'three';

// Enable Three.js color management for proper sRGB handling
THREE.ColorManagement.enabled = true;

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
    this.scene.fog = new THREE.FogExp2(0x1a2e1a, 0.015); // Reduced - darkness only at far end
    
    // Camera with proper FOV and aspect
    this.camera = new THREE.PerspectiveCamera(65, 1, 0.1, 20);
    this.camera.position.set(0, 0, 0);
    
    // WebGL renderer with preserveDrawingBuffer only for ?test=1
    const params = new URLSearchParams(window.location.search);
    const preserveBuffer = params.get('test') === '1';
    
    this.renderer = new THREE.WebGLRenderer({ 
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: preserveBuffer
    });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // No conversion on final quad
    
    // Low-res render target - renders in linear space
    const aspect = window.innerHeight / window.innerWidth;
    const renderHeight = Math.round(RENDER_WIDTH * aspect);
    this.renderTarget = new THREE.WebGLRenderTarget(RENDER_WIDTH, renderHeight, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType
      // Renders in linear, textures auto-converted from sRGB
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
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec3 palette[64];
        uniform int paletteSize;
        uniform float paletteEnabled;
        varying vec2 vUv;
        
        // Linear to sRGB conversion
        vec3 linearToSRGB(vec3 linear) {
          vec3 a = 12.92 * linear;
          vec3 b = 1.055 * pow(linear, vec3(1.0 / 2.4)) - 0.055;
          vec3 c = step(vec3(0.0031308), linear);
          return mix(a, b, c);
        }
        
        // Perceptual distance using weighted RGB (human eye more sensitive to green)
        float perceptualDistance(vec3 c1, vec3 c2) {
          vec3 d = c1 - c2;
          // Weight: red=2, green=4, blue=3 (roughly approximates perception)
          return sqrt(2.0*d.r*d.r + 4.0*d.g*d.g + 3.0*d.b*d.b);
        }
        
        vec3 quantizeColor(vec3 linearColor) {
          if (paletteSize == 0 || paletteEnabled < 0.5) {
            return linearToSRGB(linearColor);
          }
          
          // Convert linear working space to sRGB for palette matching
          // Textures are sRGB -> converted to linear on read -> rendered in linear
          // -> now convert back to sRGB to match palette.json colors
          vec3 srgb = linearToSRGB(linearColor);
          
          float minDist = 999999.0;
          vec3 nearest = srgb;
          
          for (int i = 0; i < 64; i++) {
            if (i >= paletteSize) break;
            vec3 palColor = palette[i];
            float dist = perceptualDistance(srgb, palColor);
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
          gl_FragColor = vec4(quantized, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false
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
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    
    // Render quantized upscale to screen
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(this.finalScene, this.finalCamera);
    
    // Debug: Read center pixel after render
    if (typeof window !== 'undefined' && (window as any).__debugFrame === true) {
      const gl = this.renderer.getContext();
      const pixels = new Uint8Array(4);
      const centerX = Math.floor(this.canvas.width / 2);
      const centerY = Math.floor(this.canvas.height / 2);
      gl.readPixels(centerX, centerY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      console.log(`Center pixel RGB: ${pixels[0]}, ${pixels[1]}, ${pixels[2]}, ${pixels[3]}`);
      
      // Also check render target
      this.renderer.setRenderTarget(this.renderTarget);
      const rtPixels = new Uint8Array(4);
      const rtCenterX = Math.floor(RENDER_WIDTH / 2);
      const rtCenterY = Math.floor(this.renderTarget.height / 2);
      gl.readPixels(rtCenterX, rtCenterY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rtPixels);
      console.log(`Render target center pixel RGB: ${rtPixels[0]}, ${rtPixels[1]}, ${rtPixels[2]}, ${rtPixels[3]}`);
      this.renderer.setRenderTarget(null);
      
      (window as any).__debugFrame = false;
    }
  }
}
