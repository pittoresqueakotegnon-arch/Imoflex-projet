const sharp = require('sharp');

async function generateIcons() {
  console.log('Generating icons with sharp...');
  
  const iconViolet = 'public/assets/logo-icon-fond-violet.png';
  const iconTrans = 'public/assets/logo-icon-transparent-recadre.png';

  // 1. logo-192.png from violet
  await sharp(iconViolet)
    .resize(192, 192)
    .png()
    .toFile('public/assets/logo-192.png');
  console.log('Generated public/assets/logo-192.png');

  // 2. logo-512.png from violet
  await sharp(iconViolet)
    .resize(512, 512)
    .png()
    .toFile('public/assets/logo-512.png');
  console.log('Generated public/assets/logo-512.png');

  // 3. logo-maskable-512.png from violet (padding)
  // 65% of 512 is 332px. Let's resize logo to 340x340.
  const resizedViolet = await sharp(iconViolet)
    .resize(340, 340)
    .toBuffer();

  const bg = sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 123, g: 63, b: 228, alpha: 1 } // #7B3FE4
    }
  });

  await bg.composite([{ input: resizedViolet, gravity: 'center' }])
    .png()
    .toFile('public/assets/logo-maskable-512.png');
  console.log('Generated public/assets/logo-maskable-512.png');

  // 4. favicon-32.png and 64 from transparent
  await sharp(iconTrans).resize(32, 32).png().toFile('public/assets/favicon-32.png');
  console.log('Generated public/assets/favicon-32.png');
  await sharp(iconTrans).resize(64, 64).png().toFile('public/assets/favicon-64.png');
  console.log('Generated public/assets/favicon-64.png');

  // 5. splash-screen.png (1080x1920, bg #120D2A) from transparent
  // logo centered 40% of width = 432px
  const splashLogo = await sharp(iconTrans)
    .resize(432, 432, { fit: 'contain' })
    .toBuffer();

  const splashBg = sharp({
    create: {
      width: 1080,
      height: 1920,
      channels: 4,
      background: { r: 18, g: 13, b: 42, alpha: 1 } // #120D2A
    }
  });

  await splashBg.composite([{ input: splashLogo, gravity: 'center' }])
    .png()
    .toFile('public/assets/splash-screen.png');
  console.log('Generated public/assets/splash-screen.png');
}

generateIcons().catch(console.error);
