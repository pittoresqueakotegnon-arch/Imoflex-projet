import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.imoflex.app',
  appName: 'ImoFlex',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    StatusBar: {
      backgroundColor: '#120D2A',
      style: 'DARK',
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#120D2A',
      showSpinner: false,
    },
  },
};

export default config;
