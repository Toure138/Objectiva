import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Preferences } from '@capacitor/preferences';

import { ApiService, type AuthSession } from './api.service';
import type { User } from './models';
import { SettingsService } from './settings.service';

const TOKEN_KEY = 'objectiva.token';
const USER_KEY = 'objectiva.user';

/**
 * Session : le jeton est conservé via Capacitor Preferences (stockage natif sur
 * Android/iOS, localStorage sur le web), pour rester connecté après fermeture.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly settings = inject(SettingsService);

  readonly token = signal<string | null>(null);
  readonly user = signal<User | null>(null);
  readonly isLoggedIn = computed(() => this.token() !== null);

  private restored: Promise<void> | null = null;

  /** Relit la session enregistrée ; appelé une seule fois, au premier besoin. */
  restore(): Promise<void> {
    this.restored ??= (async () => {
      await this.settings.load();
      const [{ value: token }, { value: user }] = await Promise.all([
        Preferences.get({ key: TOKEN_KEY }),
        Preferences.get({ key: USER_KEY }),
      ]);
      if (token) {
        this.token.set(token);
        this.user.set(user ? (JSON.parse(user) as User) : null);
      }
    })();
    return this.restored;
  }

  async login(email: string, password: string): Promise<void> {
    await this.startSession(() => this.api.login({ email, password }));
  }

  async register(displayName: string, email: string, password: string): Promise<void> {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    await this.startSession(() => this.api.register({ displayName, email, password, timezone }));
  }

  async logout(): Promise<void> {
    try {
      if (this.token()) await this.api.logout();
    } catch {
      // Hors connexion : on oublie quand même la session localement.
    }
    await this.clearSession();
    await this.router.navigateByUrl('/connexion', { replaceUrl: true });
  }

  /** Session refusée par le serveur (expirée ou révoquée). */
  async handleExpired(): Promise<void> {
    if (!this.token()) return;
    await this.clearSession();
    await this.router.navigateByUrl('/connexion', { replaceUrl: true });
  }

  private async startSession(call: () => Promise<AuthSession>): Promise<void> {
    const session = await call();
    this.token.set(session.token);
    this.user.set(session.user);
    await Promise.all([
      Preferences.set({ key: TOKEN_KEY, value: session.token }),
      Preferences.set({ key: USER_KEY, value: JSON.stringify(session.user) }),
    ]);
  }

  private async clearSession(): Promise<void> {
    this.token.set(null);
    this.user.set(null);
    await Promise.all([Preferences.remove({ key: TOKEN_KEY }), Preferences.remove({ key: USER_KEY })]);
  }
}
