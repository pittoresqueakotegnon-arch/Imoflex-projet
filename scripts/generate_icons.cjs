const sharp = require('sharp');

async function generateIcons() {
  console.log('Generating 192x192 and 512x512 icons with sharp...');
  
  const input = 'public/assets/logo-favicon-imoflex.png';
  
  // Generate 192x192
  await sharp(input)
    .resize(192, 192, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile('public/assets/logo-192.png');
  console.log('Generated public/assets/logo-192.png');

  // Generate 512x512
  await sharp(input)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile('public/assets/logo-512.png');
  console.log('Generated public/assets/logo-512.png');
}

generateIcons().catch(console.error);
