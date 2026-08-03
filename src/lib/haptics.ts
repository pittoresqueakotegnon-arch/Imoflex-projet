/**
 * Utility for triggering haptic feedback (vibrations) on mobile devices.
 * Gracefully degrades if the Vibration API is not supported.
 */

export const haptics = {
  /**
   * Light impact, suitable for minor UI interactions (e.g., clicking a tab).
   */
  light: () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(5);
    }
  },

  /**
   * Medium impact, suitable for main actions (e.g., primary buttons).
   */
  medium: () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(15);
    }
  },

  /**
   * Heavy impact, suitable for warnings or significant state changes.
   */
  heavy: () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([30, 50, 30]);
    }
  },

  /**
   * Success pattern.
   */
  success: () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([10, 30, 20]);
    }
  },

  /**
   * Error pattern.
   */
  error: () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([50, 50, 50, 50, 50]);
    }
  }
};
