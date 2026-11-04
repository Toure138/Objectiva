// Inscrit l'adresse du serveur dans l'application avant sa construction (utilisé par le workflow Android).
// Usage : API_URL=https://objectiva-api.onrender.com node scripts/set-default-api-url.mjs
// L'adresse reste modifiable dans l'application ; ceci évite seulement de la saisir sur le téléphone.
import { readFileSync, writeFileSync } from 'node:fs';

const raw = (process.env.API_URL ?? '').trim();
if (!raw) {
  console.log('API_URL absente : adresse par défaut inchangée (à saisir dans l’application).');
  process.exit(0);
}
if (!/^https:\/\/[^\s'"\\]+$/.test(raw)) {
  console.error('API_URL doit commencer par https:// et ne contenir ni espace ni guillemet :', raw);
  process.exit(1);
}
const base = raw.replace(/\/+$/, '').replace(/\/api$/i, '');
const file = new URL('../frontend/src/environments/environment.prod.ts', import.meta.url);
const source = readFileSync(file, 'utf8');
if (!/apiUrl: '[^']*'/.test(source)) {
  console.error('environment.prod.ts : champ apiUrl introuvable.');
  process.exit(1);
}
writeFileSync(file, source.replace(/apiUrl: '[^']*'/, `apiUrl: '${base}/api'`));
console.log(`Adresse par défaut de l’application : ${base}/api`);
