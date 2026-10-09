import * as THREE from 'three';
import { Sconce } from './types';

const CELL_SIZE = 2;

export class LightingManager {
  lights: THREE.PointLight[] = [];
  
  setupLights(scene: THREE.Scene, sconces: readonly Sconce[], camera: THREE.Camera) {
    // Dark ambient
    const ambient = new THREE.AmbientLight(0x0a1e14, 0.3);
    scene.add(ambient);
    
    // Party light (follows camera)
    const partyLight = new THREE.PointLight(0x4a5a5a, 0.5, 3);
    partyLight.position.copy(camera.position);
    scene.add(partyLight);
    this.lights.push(partyLight);
    
    // Sconce lights with banded falloff
    for (const sconce of sconces) {
      if (!sconce.lit) continue;
      
      const wx = sconce.x * CELL_SIZE;
      const wz = sconce.y * CELL_SIZE;
      const offset = 0.7;
      
      let lx = wx, lz = wz;
      if (sconce.face === 'N') lz -= offset;
      else if (sconce.face === 'E') lx += offset;
      else if (sconce.face === 'S') lz += offset;
      else if (sconce.face === 'W') lx -= offset;
      
      // Warm flickering torch light with banded falloff
      const light = new THREE.PointLight(0xff8844, 2.0, 6);
      light.position.set(lx, 1.2, lz);
      light.castShadow = false;
      
      // Custom distance attenuation for banded look
      light.decay = 2;
      
      scene.add(light);
      this.lights.push(light);
    }
  }
  
  update(time: number, camera: THREE.Camera) {
    // Update party light position
    if (this.lights.length > 0) {
      this.lights[0].position.copy(camera.position);
    }
    
    // Flicker torch lights
    for (let i = 1; i < this.lights.length; i++) {
      const light = this.lights[i];
      const flicker = 0.05 + Math.sin(time * 0.003 + i * 1.7) * 0.03 + Math.sin(time * 0.007 + i) * 0.02;
      light.intensity = 2.0 + flicker;
      
      // Quantize intensity for banded look
      light.intensity = Math.floor(light.intensity * 8) / 8;
    }
  }
}
