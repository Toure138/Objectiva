import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { StatusBar, Style } from '@capacitor/status-bar';

export type ThemeChoice = 'system' | 'light' | 'dark';
const THEME_KEY = 'objectiva.theme';

/** Thème clair/sombre : la classe `ion-palette-dark` active la palette sombre d'Ionic. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly choice = signal<ThemeChoice>('system');
  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');

  async init(): Promise<void> {
    const { value } = await Preferences.get({ key: THEME_KEY });
    if (value === 'light' || value === 'dark' || value === 'system') this.choice.set(value);
    this.media.addEventListener?.('change', () => this.apply());
    this.apply();
  }

  async set(choice: ThemeChoice): Promise<void> {
    this.choice.set(choice);
    await Preferences.set({ key: THEME_KEY, value: choice });
    this.apply();
  }

  private apply() {
    const dark = this.choice() === 'dark' || (this.choice() === 'system' && this.media.matches);
    document.documentElement.classList.toggle('ion-palette-dark', dark);
    // Barre du navigateur / du système aux couleurs du thème (mêmes valeurs que --ob-bg).
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b1310' : '#f6f4ee');
    if (Capacitor.isNativePlatform()) {
      void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => undefined);
    }
  }
}
