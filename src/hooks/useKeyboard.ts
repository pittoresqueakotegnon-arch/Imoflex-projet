import { useState, useEffect } from 'react';

/**
 * Detects if the virtual keyboard is open on mobile devices.
 * Relies on viewport resize events.
 */
export function useKeyboard() {
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    // Initial innerHeight
    let initialHeight = window.innerHeight;

    const handleResize = () => {
      // If the new innerHeight is significantly smaller than the initial,
      // it's very likely the virtual keyboard opened.
      // (Using 150px as a safe threshold for keyboard height)
      if (initialHeight - window.innerHeight > 150) {
        setIsKeyboardOpen(true);
      } else {
        setIsKeyboardOpen(false);
        // Update initialHeight in case of orientation change when keyboard is closed
        initialHeight = window.innerHeight;
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return { isKeyboardOpen };
}
