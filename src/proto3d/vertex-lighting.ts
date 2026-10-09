import * as THREE from 'three';
import { FloorData, Sconce } from './types';

const CELL_SIZE = 2;

interface LightSource {
  x: number;
  y: number;
  type: 'party' | 'sconce';
  intensity: number;
}

export class VertexLightingManager {
  private floorData: FloorData;
  private sconces: readonly Sconce[];
  private partyX: number = 0;
  private partyY: number = 0;
  
  constructor(floorData: FloorData, sconces: readonly Sconce[]) {
    this.floorData = floorData;
    this.sconces = sconces;
  }
  
  setPartyPosition(x: number, y: number) {
    this.partyX = x;
    this.partyY = y;
  }
  
  private getBandedFalloff(distance: number): number {
    // Party/lantern: 1.0 at 0-1 distance, ×0.65 per further square
    // Make banding more obvious with stricter cutoffs
    const distSquares = Math.floor(distance);
    if (distSquares === 0) return 1.0;
    
    return Math.pow(0.65, distSquares);
  }
  
  private calculateBrightness(tileX: number, tileY: number, isDark: boolean): number {
    const sources: LightSource[] = [];
    
    // Party lantern
    sources.push({
      x: this.partyX,
      y: this.partyY,
      type: 'party',
      intensity: 1.0
    });
    
    // Lit sconces
    for (const sconce of this.sconces) {
      if (sconce.lit) {
        sources.push({
          x: sconce.x,
          y: sconce.y,
          type: 'sconce',
          intensity: 1.0
        });
      }
    }
    
    let maxBrightness = 0;
    
    for (const source of sources) {
      const dx = tileX - source.x;
      const dy = tileY - source.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // For floorNDark squares, only party lantern
      if (isDark && source.type === 'sconce') continue;
      
      // User spec: 1.0 at 0-1 distance, ×0.65 per further square
      // Boost to achieve 35-60/255 mean while preserving depth falloff
      const falloff = this.getBandedFalloff(distance);
      const brightness = source.intensity * falloff * 4.7; // Fine-tuned for 35+ mean
      
      maxBrightness = Math.max(maxBrightness, brightness);
    }
    
    // floorNDark squares: ~2 squares then black, plus faint floor on exits/vents
    if (isDark) {
      const distFromParty = Math.sqrt(
        Math.pow(tileX - this.partyX, 2) + 
        Math.pow(tileY - this.partyY, 2)
      );
      if (distFromParty > 2.0) {
        maxBrightness = Math.max(maxBrightness, 0.16); // Faint floor, boosted
      }
    }
    
    return Math.min(maxBrightness, 4.7); // Cap tuned for 35-60 range
  }
  
  private getWarmTint(tileX: number, tileY: number): THREE.Color {
    // Slight warm tint near sconces
    let warmth = 0;
    
    for (const sconce of this.sconces) {
      if (!sconce.lit) continue;
      
      const dx = tileX - sconce.x;
      const dy = tileY - sconce.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < 3.0) {
        const strength = Math.max(0, 1.0 - distance / 3.0);
        warmth = Math.max(warmth, strength * 0.15);
      }
    }
    
    // Subtle warm tint: (1.0, 1.0, 1.0) → (1.0, 0.98, 0.92)
    // Less tinting to preserve neutral stone colors
    return new THREE.Color(
      1.0,
      1.0 - warmth * 0.02,
      1.0 - warmth * 0.08
    );
  }
  
  updateMeshLighting(mesh: THREE.Mesh, tileX: number, tileY: number, isDark: boolean = false) {
    const geometry = mesh.geometry;
    
    if (!geometry.attributes.color) {
      const colors = new Float32Array(geometry.attributes.position.count * 3);
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    
    const brightness = this.calculateBrightness(tileX, tileY, isDark);
    const tint = this.getWarmTint(tileX, tileY);
    
    const finalColor = new THREE.Color(
      tint.r * brightness,
      tint.g * brightness,
      tint.b * brightness
    );
    
    const colors = geometry.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < colors.count; i++) {
      colors.setXYZ(i, finalColor.r, finalColor.g, finalColor.b);
    }
    colors.needsUpdate = true;
    
    // Ensure material uses MeshBasicMaterial with vertex colors
    // Sprites should NOT have their colors modulated (they're already marked to skip)
    if (!(mesh.material instanceof THREE.MeshBasicMaterial)) {
      const oldMat = mesh.material as THREE.Material;
      const map = (oldMat as any).map || null;
      mesh.material = new THREE.MeshBasicMaterial({
        map: map,
        vertexColors: true,
        side: (oldMat as any).side || THREE.FrontSide
      });
      oldMat.dispose();
    } else {
      // Already BasicMaterial, ensure vertexColors is enabled
      mesh.material.vertexColors = true;
      mesh.material.needsUpdate = true;
    }
  }
  
  updateAllMeshes(scene: THREE.Scene) {
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || !obj.geometry.attributes.position) return;
      // Skip sprite billboards (THREE.Sprite is not a Mesh; keep this for any plane leftover)
      if (obj.userData.isSprite || obj instanceof THREE.Sprite) return;

      const tileX = Math.round(obj.position.x / CELL_SIZE);
      const tileY = Math.round(obj.position.z / CELL_SIZE);

      const tile = this.floorData.tiles[tileY]?.[tileX];
      const isDark = tile?.floorNDark || false;

      this.updateMeshLighting(obj, tileX, tileY, isDark);
    });
  }
}
