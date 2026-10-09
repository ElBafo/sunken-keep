import sharp from 'sharp';
import fs from 'fs';
import crypto from 'crypto';

async function cropAndHash() {
  const files = [
    'screenshot-floor1-view.png',
    'screenshot-floor2-view.png',
    'screenshot-floor3-view.png',
    'screenshot-floor4-view.png'
  ];
  
  for (const file of files) {
    const inputPath = `/workspace/${file}`;
    const outputPath = `/workspace/${file.replace('-view.png', '-viewport.png')}`;
    
    if (!fs.existsSync(inputPath)) {
      console.log(`Skipping ${file} - not found`);
      continue;
    }
    
    // Get dimensions
    const metadata = await sharp(inputPath).metadata();
    console.log(`${file}: ${metadata.width}x${metadata.height}`);
    
    // Calculate the dungeon viewport area (top 270x380 scaled to device pixels)
    // iPhone 15 is 390x844 logical pixels with 3x DPR, so 1170x2532 physical pixels
    // 270x380 logical -> 810x1140 physical at 3x
    const scale = 3;
    const cropWidth = 270 * scale;   // 810
    const cropHeight = 380 * scale;  // 1140
    const cropLeft = (metadata.width! - cropWidth) / 2; // Center horizontally
    
    await sharp(inputPath)
      .extract({
        left: Math.floor(cropLeft),
        top: 0,
        width: cropWidth,
        height: cropHeight
      })
      .toFile(outputPath);
    
    console.log(`Cropped to ${outputPath}`);
    
    // Compute MD5
    const data = fs.readFileSync(outputPath);
    const hash = crypto.createHash('md5').update(data).digest('hex');
    console.log(`  MD5: ${hash}\n`);
  }
}

cropAndHash().catch(console.error);
