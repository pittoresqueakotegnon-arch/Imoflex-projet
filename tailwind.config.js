/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-deep': '#0D0720',
        'bg-app': '#120D2A',
        'surface': '#1E1545',
        'surface2': '#261C55',
        'violet': '#7B3FE4',
        'violet-light': '#A855F7',
        'violet-glow': '#C084FC',
        'white-soft': '#E8E0FF',
        'text-dim': '#8B7BB5',
        'text-muted': '#4A3D7A',
        'imoflex-green': '#22C55E',
        'imoflex-amber': '#F59E0B',
        'imoflex-red': '#EF4444',
        'imoflex-gold': '#FBBF24',
      },
      fontFamily: {
        nunito: ['Nunito', 'sans-serif'],
        grotesk: ['Space Grotesk', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-violet': 'linear-gradient(135deg, #7B3FE4, #A855F7)',
        'gradient-gold': 'linear-gradient(135deg, #FBBF24, #F59E0B)',
        'gradient-rent': 'linear-gradient(90deg, #7B3FE4, #C084FC)',
      },
      boxShadow: {
        'violet': '0 4px 20px rgba(123, 63, 228, 0.4)',
        'violet-sm': '0 2px 12px rgba(123, 63, 228, 0.3)',
        'gold': '0 4px 16px rgba(251, 191, 36, 0.3)',
      },
      borderRadius: {
        'card': '16px',
        'btn': '14px',
        'input': '12px',
      },
    },
  },
  plugins: [],
};
