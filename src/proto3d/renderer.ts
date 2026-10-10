import * as THREE from 'three';
import { CAMERA_FAR, CAMERA_FOV, CAMERA_NEAR, FOG_COLOR, FOG_FAR, FOG_NEAR } from './constants';

// Enable Three.js color management for proper sRGB handling
THREE.ColorManagement.enabled = true;

const MIN_BUTTON_PX = 44;

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
  /** Logical 3D view size from layout585.json `view`. */
  viewWidth: number;
  viewHeight: number;

  constructor(canvas: HTMLCanvasElement, viewWidth: number, viewHeight: number) {
    this.canvas = canvas;
    this.viewWidth = viewWidth;
    this.viewHeight = viewHeight;
    
    // Main scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);
    this.scene.background = new THREE.Color(FOG_COLOR);
    
    // Vertical FOV is wide enough that an adjacent wall sits in frame with a floor strip
    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, CAMERA_NEAR, CAMERA_FAR);
    this.camera.rotation.order = 'YXZ';
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
    this.renderer.setClearColor(FOG_COLOR, 1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // No conversion on final quad
    
    // Low-res render target — layout585 view size, nearest-neighbour upscaled in CSS
    this.renderTarget = new THREE.WebGLRenderTarget(this.viewWidth, this.viewHeight, {
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
        // Perceptual distance using OKLab color space (better than weighted RGB)
        vec3 linearToOKLab(vec3 linear) {
          // Linear RGB to OKLab
          float l = 0.4122214708 * linear.r + 0.5363325363 * linear.g + 0.0514459929 * linear.b;
          float m = 0.2119034982 * linear.r + 0.6806995451 * linear.g + 0.1073969566 * linear.b;
          float s = 0.0883024619 * linear.r + 0.2817188376 * linear.g + 0.6299787005 * linear.b;
          
          float l_ = pow(l, 1.0/3.0);
          float m_ = pow(m, 1.0/3.0);
          float s_ = pow(s, 1.0/3.0);
          
          return vec3(
            0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
            1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
            0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
          );
        }
        
        float luma(vec3 c) {
          return dot(c, vec3(0.2126, 0.7152, 0.0722));
        }

        vec3 quantizeColor(vec3 linearColor) {
          if (paletteSize == 0 || paletteEnabled < 0.5) {
            return linearToSRGB(linearColor);
          }

          // Crush only the deepest linear values so floor-3 ambient can
          // actually land on #000000 instead of a mid-dark stone swatch.
          float linL = dot(linearColor, vec3(0.2126, 0.7152, 0.0722));
          if (linL < 0.024) {
            float t = linL / 0.024;
            linearColor *= t;
          }
          
          // Convert linear to sRGB for display
          vec3 srgb = linearToSRGB(linearColor);
          
          // Convert to OKLab for perceptual distance
          vec3 lab = linearToOKLab(linearColor);
          float pixL = luma(srgb);
          
          float minDist = 999999.0;
          vec3 nearest = srgb;
          
          for (int i = 0; i < 64; i++) {
            if (i >= paletteSize) break;
            vec3 palColor = palette[i];
            
            // Convert palette color from sRGB to linear to OKLab
            vec3 palLinear = vec3(
              palColor.r <= 0.04045 ? palColor.r / 12.92 : pow((palColor.r + 0.055) / 1.055, 2.4),
              palColor.g <= 0.04045 ? palColor.g / 12.92 : pow((palColor.g + 0.055) / 1.055, 2.4),
              palColor.b <= 0.04045 ? palColor.b / 12.92 : pow((palColor.b + 0.055) / 1.055, 2.4)
            );
            vec3 palLab = linearToOKLab(palLinear);
            float palL = luma(palColor);

            float dist = distance(lab, palLab);
            // Only dark pixels: OKLab otherwise lifts dim stone onto #282828.
            // Mid/bright torch stone must still be allowed to snap upward.
            if (pixL < 0.12) {
              float lift = max(0.0, palL - pixL);
              dist += lift * 10.0 + lift * lift * 24.0;
              if (palL > pixL + 0.04) dist += 6.0;
            }
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
      const response = await fetch(`${baseUrl}proto3d/palette.json`);
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
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scale = vw / this.viewWidth;

    const bodyStyle = getComputedStyle(document.body);
    const padTop = parseFloat(bodyStyle.paddingTop) || 0;
    const padBottom = parseFloat(bodyStyle.paddingBottom) || 0;

    const controls = document.getElementById('controls');
    const hud = document.getElementById('party-hud');
    let controlsSpace = MIN_BUTTON_PX * 2 + 16;
    if (controls) {
      const cs = getComputedStyle(controls);
      controlsSpace =
        controls.offsetHeight +
        (parseFloat(cs.marginTop) || 0) +
        (parseFloat(cs.marginBottom) || 0);
    }
    if (hud) {
      const hs = getComputedStyle(hud);
      controlsSpace +=
        hud.offsetHeight +
        (parseFloat(hs.marginTop) || 0) +
        (parseFloat(hs.marginBottom) || 0);
    }

    const available = Math.max(1, vh - padTop - padBottom - controlsSpace);
    let cssHeight = this.viewHeight * scale;
    // Prefer shrinking the view over overlapping the D-pad on short screens
    if (cssHeight > available) {
      cssHeight = available;
    }

    const renderHeight = Math.max(1, Math.round((cssHeight / scale)));

    this.renderTarget.setSize(this.viewWidth, renderHeight);
    this.camera.aspect = this.viewWidth / renderHeight;
    this.camera.updateProjectionMatrix();

    // Drawing buffer stays viewW×logicalH; CSS upscales nearest-neighbour to the viewport
    this.renderer.setSize(this.viewWidth, renderHeight, false);
    this.canvas.style.width = `${vw}px`;
    this.canvas.style.height = `${cssHeight}px`;
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
      const rtCenterX = Math.floor(this.viewWidth / 2);
      const rtCenterY = Math.floor(this.renderTarget.height / 2);
      gl.readPixels(rtCenterX, rtCenterY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rtPixels);
      console.log(`Render target center pixel RGB: ${rtPixels[0]}, ${rtPixels[1]}, ${rtPixels[2]}, ${rtPixels[3]}`);
      this.renderer.setRenderTarget(null);
      
      (window as any).__debugFrame = false;
    }
  }
}
