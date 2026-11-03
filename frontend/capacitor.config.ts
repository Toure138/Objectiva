import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fr.objectiva.app',
  appName: 'Objectiva',
  webDir: 'www',
  server: {
    // Développement : l'API locale est en HTTP (http://IP-du-PC:3000). Avec le schéma https par
    // défaut, Android bloquerait ces appels (contenu mixte). À repasser en https avec une API en HTTPS.
    androidScheme: 'http',
    cleartext: true,
  },
};

export default config;
