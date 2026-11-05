import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Preferences } from '@capacitor/preferences';

import { OfflineService } from '../offline/offline.service';
import { SyncService } from '../offline/sync.service';

import { ApiError } from './api-error';
import { ApiService, type AuthSession } from './api.service';
import type { User } from './models';
import { SettingsService } from './settings.service';

const TOKEN_KEY = 'objectiva.token';
const USER_KEY = 'objectiva.user';
/** Comptes déjà ouverts sur ce téléphone : e-mail → identifiant (nom de leur base locale). */
const ACCOUNTS_KEY = 'objectiva.accounts';

/**
 * Session : le jeton est conservé via Capacitor Preferences (stockage natif sur
 * Android/iOS, localStorage sur le web), pour rester connecté après fermeture.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly settings = inject(SettingsService);
  private readonly offline = inject(OfflineService);
  private readonly sync = inject(SyncService);

  readonly token = signal<string | null>(null);
  readonly user = signal<User | null>(null);
  readonly isLoggedIn = computed(() => this.token() !== null);
  /**
   * Le serveur a refusé le jeton (expiré ou révoqué) mais des données locales existent : on ne déconnecte pas,
   * pour ne pas bloquer l'accès aux données du téléphone. Se reconnecter reprend la synchronisation.
   */
  readonly sessionExpired = signal(false);

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
        await this.rememberAccount();
        await this.startOffline();
      }
    })();
    return this.restored;
  }

  async login(email: string, password: string): Promise<void> {
    await this.startSession(() => this.api.login({ email, password }));
  }

  /**
   * Si ce téléphone a déjà connu un compte avec cet e-mail (serveur remplacé qui ne le connaît plus), le
   * compte est recréé avec le même identifiant : ses données locales sont retrouvées et renvoyées au serveur.
   */
  async register(displayName: string, email: string, password: string): Promise<void> {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const body = { displayName, email, password, timezone };
    const id = (await this.accounts())[email.trim().toLowerCase()];
    if (!id) return this.startSession(() => this.api.register(body));
    try {
      await this.startSession(() => this.api.register({ ...body, id }));
    } catch (e) {
      // Identifiant déjà pris sur ce serveur : compte neuf, les données locales restent sous l'ancien.
      if (!(e instanceof ApiError && e.status === 409 && e.code === 'CONFLICT')) throw e;
      await this.startSession(() => this.api.register(body));
    }
  }

  async logout(): Promise<void> {
    try {
      if (this.token()) await this.api.logout();
    } catch {
      // Hors connexion : on oublie quand même la session localement.
    }
    this.sync.stop();
    await this.offline.detach();
    await this.clearSession();
    await this.router.navigateByUrl('/connexion', { replaceUrl: true });
  }

  /** Session refusée par le serveur (expirée ou révoquée). */
  async handleExpired(): Promise<void> {
    if (!this.token()) return;
    // Des données locales existent : on les garde accessibles, la synchronisation attend une reconnexion.
    if (this.offline.ready()) {
      this.sessionExpired.set(true);
      return;
    }
    this.sync.stop();
    await this.offline.detach();
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
    this.sessionExpired.set(false);
    await this.rememberAccount();
    await this.startOffline();
  }

  private async accounts(): Promise<Record<string, string>> {
    try {
      const { value } = await Preferences.get({ key: ACCOUNTS_KEY });
      return value ? (JSON.parse(value) as Record<string, string>) : {};
    } catch {
      return {};
    }
  }

  private async rememberAccount(): Promise<void> {
    const user = this.user();
    if (!user?.email) return;
    const all = await this.accounts();
    if (all[user.email] === user.id) return;
    await Preferences.set({ key: ACCOUNTS_KEY, value: JSON.stringify({ ...all, [user.email]: user.id }) });
  }

  /** Ouvre la base locale de l'utilisateur et lance la synchronisation (jamais bloquant, ni sans réseau). */
  private async startOffline(): Promise<void> {
    const user = this.user();
    if (!user) return;
    try {
      await this.offline.attach({ id: user.id, timezone: user.timezone });
      this.sync.start();
    } catch {
      // Stockage indisponible : l'application continue en mode connecté classique.
    }
  }

  private async clearSession(): Promise<void> {
    this.token.set(null);
    this.user.set(null);
    await Promise.all([Preferences.remove({ key: TOKEN_KEY }), Preferences.remove({ key: USER_KEY })]);
  }
}
