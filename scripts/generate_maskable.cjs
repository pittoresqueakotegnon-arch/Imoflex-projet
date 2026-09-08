const sharp = require('sharp');

async function createMaskable() {
  console.log('Generating maskable icon with sharp...');
  
  // Create the 512x512 background layer
  // The user says "60-70% de la surface". For a 512x512 canvas, 65% is about 332px. Let's resize logo to 340x340.
  const bg = sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 123, g: 63, b: 228, alpha: 1 } // #7B3FE4 is rgb(123, 63, 228)
    }
  });
  
  // Resize the logo
  const resizedLogo = await sharp('public/assets/logo-favicon-imoflex.png')
    .resize(340, 340, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .toBuffer();

  // Composite the logo onto the background
  await bg.composite([{
    input: resizedLogo,
    gravity: 'center'
  }])
  .png()
  .toFile('public/assets/logo-maskable-512.png');
  
  console.log('Maskable icon generated successfully at public/assets/logo-maskable-512.png');
}

createMaskable().catch(console.error);
