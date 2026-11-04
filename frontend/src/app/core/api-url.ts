const HAS_SCHEME = /^https?:\/\//i;
// Adresses d'un réseau local ou du PC : en HTTP simple. Tout le reste est un serveur en ligne : HTTPS.
const LOCAL_HOST = /^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/|$)/i;

/**
 * Rend une adresse saisie à la main utilisable : ajoute le schéma manquant (https en ligne, http pour
 * localhost et les adresses IP), retire les « / » finaux et ajoute « /api ». Vide si rien n'est saisi.
 */
export function normalizeApiUrl(input: string): string {
  let url = input.trim();
  if (!url) return '';
  if (!HAS_SCHEME.test(url)) url = `${LOCAL_HOST.test(url) ? 'http' : 'https'}://${url}`;
  url = url.replace(/\/+$/, '');
  return /\/api$/i.test(url) ? url : `${url}/api`;
}
