import { describe, expect, it } from 'vitest';

import { normalizeApiUrl } from './api-url';

describe('normalizeApiUrl', () => {
  it('ajoute https et /api à une adresse de serveur en ligne', () => {
    expect(normalizeApiUrl('objectiva-api.onrender.com')).toBe('https://objectiva-api.onrender.com/api');
    expect(normalizeApiUrl('  https://objectiva-api.onrender.com/  ')).toBe('https://objectiva-api.onrender.com/api');
  });

  it('garde http pour un PC du réseau local ou localhost', () => {
    expect(normalizeApiUrl('192.168.1.20:3100')).toBe('http://192.168.1.20:3100/api');
    expect(normalizeApiUrl('localhost:3100/api')).toBe('http://localhost:3100/api');
    expect(normalizeApiUrl('http://192.168.1.20:3100')).toBe('http://192.168.1.20:3100/api');
  });

  it('ne double pas /api et respecte un schéma explicite', () => {
    expect(normalizeApiUrl('https://exemple.fr/api/')).toBe('https://exemple.fr/api');
    expect(normalizeApiUrl('http://exemple.fr')).toBe('http://exemple.fr/api');
  });

  it('renvoie une chaîne vide si rien n’est saisi', () => {
    expect(normalizeApiUrl('')).toBe('');
    expect(normalizeApiUrl('   ')).toBe('');
  });
});
