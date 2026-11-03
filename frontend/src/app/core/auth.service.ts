import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Preferences } from '@capacitor/preferences';
import { firstValueFrom } from 'rxjs';

import { toApiError } from './api-error';
import type { User } from './models';
import { SettingsService } from './settings.service';

const TOKEN_KEY = 'objectiva.token';
const USER_KEY = 'objectiva.user';

interface AuthResponse {
  success: true;
  data: { user: User; token: string; expiresAt: string };
}

/**
 * Session : le jeton est conservé via Capacitor Preferences (stockage natif sur
 * Android/iOS, localStorage sur le web), pour rester connecté après fermeture.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
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
    await this.authenticate('/auth/login', { email, password });
  }

  async register(displayName: string, email: string, password: string): Promise<void> {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    await this.authenticate('/auth/register', { displayName, email, password, timezone });
  }

  async logout(): Promise<void> {
    try {
      if (this.token()) await firstValueFrom(this.http.post(`${this.settings.apiUrl()}/auth/logout`, {}));
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

  private async authenticate(path: string, body: object): Promise<void> {
    try {
      const res = await firstValueFrom(this.http.post<AuthResponse>(`${this.settings.apiUrl()}${path}`, body));
      this.token.set(res.data.token);
      this.user.set(res.data.user);
      await Promise.all([
        Preferences.set({ key: TOKEN_KEY, value: res.data.token }),
        Preferences.set({ key: USER_KEY, value: JSON.stringify(res.data.user) }),
      ]);
    } catch (e) {
      throw toApiError(e);
    }
  }

  private async clearSession(): Promise<void> {
    this.token.set(null);
    this.user.set(null);
    await Promise.all([Preferences.remove({ key: TOKEN_KEY }), Preferences.remove({ key: USER_KEY })]);
  }
}
