import { Injectable, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

import { environment } from '../../environments/environment';

import { normalizeApiUrl } from './api-url';

const API_URL_KEY = 'objectiva.apiUrl';

/**
 * Adresse de l'API. Sur téléphone, « localhost » désigne le téléphone lui-même : il faut saisir
 * l'adresse du serveur en ligne (ex. https://objectiva-api.onrender.com) ou, en développement,
 * l'adresse IP du PC (ex. http://192.168.1.20:3100). `/api` et le schéma sont complétés au besoin.
 */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  readonly apiUrl = signal(environment.apiUrl);

  async load(): Promise<void> {
    const { value } = await Preferences.get({ key: API_URL_KEY });
    if (value) this.apiUrl.set(value);
  }

  async setApiUrl(url: string): Promise<void> {
    const clean = normalizeApiUrl(url);
    this.apiUrl.set(clean || environment.apiUrl);
    if (clean) await Preferences.set({ key: API_URL_KEY, value: clean });
    else await Preferences.remove({ key: API_URL_KEY });
  }
}
