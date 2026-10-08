// Generate placeholder cutscene images
export function generateCutscenePlaceholders(): Map<string, HTMLCanvasElement> {
  const images = new Map<string, HTMLCanvasElement>();
  
  // Scene 1: Dwarven keep in swamp
  const scene1 = document.createElement('canvas');
  scene1.width = 270;
  scene1.height = 200;
  const ctx1 = scene1.getContext('2d')!;
  
  // Background - swamp night sky
  const gradient1 = ctx1.createLinearGradient(0, 0, 0, 200);
  gradient1.addColorStop(0, '#0a0a1a');
  gradient1.addColorStop(1, '#1a2a2a');
  ctx1.fillStyle = gradient1;
  ctx1.fillRect(0, 0, 270, 200);
  
  // Keep silhouette
  ctx1.fillStyle = '#1a1a1a';
  ctx1.fillRect(80, 60, 110, 80);
  ctx1.fillRect(110, 40, 50, 20);
  
  // Windows with orange glow
  ctx1.fillStyle = '#ff8844';
  for (let i = 0; i < 4; i++) {
    ctx1.fillRect(95 + i * 20, 75, 8, 12);
    ctx1.fillRect(95 + i * 20, 100, 8, 12);
  }
  
  // Swamp water
  ctx1.fillStyle = '#0a3830';
  ctx1.fillRect(0, 140, 270, 60);
  
  images.set('/sunken-keep/art/cutscenes/scene1_bg.png', scene1);
  
  // Scene 1: Torchlight overlay
  const torch1 = document.createElement('canvas');
  torch1.width = 270;
  torch1.height = 200;
  const ctxT1 = torch1.getContext('2d')!;
  
  const torchGlow = ctxT1.createRadialGradient(135, 90, 10, 135, 90, 80);
  torchGlow.addColorStop(0, 'rgba(255, 136, 68, 0.3)');
  torchGlow.addColorStop(1, 'rgba(255, 136, 68, 0)');
  ctxT1.fillStyle = torchGlow;
  ctxT1.fillRect(0, 0, 270, 200);
  
  images.set('/sunken-keep/art/cutscenes/scene1_torchlight.png', torch1);
  
  // Scene 2: Sinking keep
  const scene2 = document.createElement('canvas');
  scene2.width = 270;
  scene2.height = 200;
  const ctx2 = scene2.getContext('2d')!;
  
  // Dark sky
  ctx2.fillStyle = '#0a0a1a';
  ctx2.fillRect(0, 0, 270, 200);
  
  // Keep (partially submerged)
  ctx2.fillStyle = '#1a1a1a';
  ctx2.fillRect(70, 80, 130, 120);
  ctx2.fillRect(100, 60, 70, 20);
  
  // Dim windows
  ctx2.fillStyle = '#442211';
  for (let i = 0; i < 5; i++) {
    ctx2.fillRect(85 + i * 22, 95, 8, 12);
  }
  
  images.set('/sunken-keep/art/cutscenes/scene2_sinking.png', scene2);
  
  // Scene 2: Water overlay
  const water2 = document.createElement('canvas');
  water2.width = 270;
  water2.height = 80;
  const ctxW2 = water2.getContext('2d')!;
  
  ctxW2.fillStyle = '#0a3830';
  ctxW2.fillRect(0, 0, 270, 80);
  
  // Water ripples
  ctxW2.strokeStyle = '#1a4840';
  for (let i = 0; i < 10; i++) {
    ctxW2.beginPath();
    ctxW2.arc(20 + i * 30, 20, 15, 0, Math.PI * 2);
    ctxW2.stroke();
  }
  
  images.set('/sunken-keep/art/cutscenes/scene2_water.png', water2);
  
  // Scene 3: Flooded gate
  const scene3 = document.createElement('canvas');
  scene3.width = 270;
  scene3.height = 200;
  const ctx3 = scene3.getContext('2d')!;
  
  // Background
  ctx3.fillStyle = '#0a1612';
  ctx3.fillRect(0, 0, 270, 200);
  
  // Stone gate
  ctx3.fillStyle = '#2a2a2a';
  ctx3.fillRect(50, 30, 170, 140);
  ctx3.fillRect(70, 50, 130, 100);
  
  // Gate opening
  ctx3.fillStyle = '#000000';
  ctx3.fillRect(90, 70, 90, 80);
  
  // Water at bottom
  ctx3.fillStyle = '#0a3830';
  ctx3.fillRect(0, 150, 270, 50);
  
  images.set('/sunken-keep/art/cutscenes/scene3_gate.png', scene3);
  
  // Scene 3: Silhouettes
  const silh3 = document.createElement('canvas');
  silh3.width = 270;
  silh3.height = 200;
  const ctxS3 = silh3.getContext('2d')!;
  
  ctxS3.fillStyle = '#000000';
  
  // Four character silhouettes
  // Brannoc (dwarf, stocky)
  ctxS3.fillRect(70, 140, 20, 35);
  ctxS3.fillRect(72, 135, 16, 10);
  
  // Wren (tall, robed)
  ctxS3.fillRect(100, 125, 18, 50);
  ctxS3.fillRect(98, 120, 22, 10);
  
  // Ilsevar (medium, slender)
  ctxS3.fillRect(135, 130, 16, 45);
  ctxS3.fillRect(137, 125, 12, 10);
  
  // Mags (halfling, small)
  ctxS3.fillRect(165, 145, 15, 30);
  ctxS3.fillRect(167, 140, 11, 10);
  
  images.set('/sunken-keep/art/cutscenes/scene3_silhouettes.png', silh3);
  
  return images;
}
