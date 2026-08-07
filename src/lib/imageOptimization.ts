import imageCompression from 'browser-image-compression';

export interface OptimizedImages {
  thumb: File;
  medium: File;
  hd: File;
}

export const processImage = async (file: File): Promise<OptimizedImages> => {
  // Common options
  const baseOptions = {
    useWebWorker: true,
    fileType: 'image/webp',
    alwaysKeepResolution: false,
    initialQuality: 0.85, // 80-85% target
  };

  try {
    // 1. HD Version (max 1600x1600, max 500KB)
    const hdOptions = {
      ...baseOptions,
      maxSizeMB: 0.5,
      maxWidthOrHeight: 1600,
    };
    const hdFile = await imageCompression(file, hdOptions);

    // 2. Medium Version (max 800x800)
    // We can compress from the original or from the HD version to save time.
    // Compressing from the original is safer for quality, but HD is faster.
    // Let's use HD as source for medium and thumb to be faster.
    const mediumOptions = {
      ...baseOptions,
      maxSizeMB: 0.2, // ~200KB max for medium
      maxWidthOrHeight: 800,
    };
    const mediumFile = await imageCompression(hdFile, mediumOptions);

    // 3. Thumb Version (max 300x300)
    const thumbOptions = {
      ...baseOptions,
      maxSizeMB: 0.05, // ~50KB max for thumb
      maxWidthOrHeight: 300,
    };
    const thumbFile = await imageCompression(mediumFile, thumbOptions);

    return {
      hd: hdFile,
      medium: mediumFile,
      thumb: thumbFile,
    };
  } catch (error) {
    console.error('Error during image compression:', error);
    throw new Error('Échec de la compression de l\'image.');
  }
};
