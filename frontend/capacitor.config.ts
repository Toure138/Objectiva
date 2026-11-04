import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fr.objectiva.app',
  appName: 'Objectiva',
  webDir: 'www',
  // Production : application en https (origine « https://localhost », autorisée dans CORS_ORIGIN de l'API)
  // et API en HTTPS. Pour tester sur téléphone contre l'API d'un PC en HTTP, construire avec
  // OBJECTIVA_DEV_HTTP=1 (Android bloquerait sinon ces appels : contenu mixte).
  server:
    process.env['OBJECTIVA_DEV_HTTP'] === '1' ? { androidScheme: 'http', cleartext: true } : { androidScheme: 'https' },
};

export default config;
