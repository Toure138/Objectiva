import { Injectable, signal } from '@angular/core';

import { dbNameFor, META, OfflineDb } from './local-db';
import { LocalEngine, type ApiResult, type Rejection } from './local-engine';

/**
 * Porte d'entrée de la base locale. Tant que les données n'ont pas été téléchargées une première
 * fois (`ready` faux), tout passe par le réseau comme avant ; ensuite, tâches, objectifs, jalons,
 * relevés, rendez-vous, réunions récurrentes, agenda, « Aujourd'hui » et bilan sont traités sur le
 * téléphone, avec ou sans réseau.
 */
@Injectable({ providedIn: 'root' })
export class OfflineService {
  /** Les données locales sont complètes (première synchronisation terminée) : le moteur local répond. */
  readonly ready = signal(false);
  /** Modifications faites sur ce téléphone et pas encore envoyées au serveur. */
  readonly pending = signal(0);
  /** Modifications refusées par le serveur, à montrer à l'utilisateur. */
  readonly rejections = signal<Rejection[]>([]);

  private engine: LocalEngine | null = null;
  private userId: string | null = null;
  private timezone = 'UTC';
  private writeListener: (() => void) | null = null;

  /** Ouvre la base de cet utilisateur (une base par utilisateur : jamais de mélange entre comptes). */
  async attach(user: { id: string; timezone: string }): Promise<void> {
    this.timezone = user.timezone;
    if (this.userId === user.id && this.engine) return;
    await this.detach();
    const db = new OfflineDb(dbNameFor(user.id));
    await db.open();
    const engine = new LocalEngine(db, { timezone: () => this.timezone });
    await db.setMeta(META.userId, user.id);
    this.engine = engine;
    this.userId = user.id;
    this.ready.set((await db.getMeta<boolean>(META.bootstrapped)) === true);
    await this.refresh();
    // Demande au système de ne pas purger ces données en cas de manque de place (sans bloquer).
    try {
      void navigator.storage?.persist?.();
    } catch {
      // Non supporté : sans conséquence.
    }
  }

  /** Ferme la base. Les données restent sur le téléphone : se reconnecter au même compte les retrouve. */
  async detach(): Promise<void> {
    this.engine?.db.close();
    this.engine = null;
    this.userId = null;
    this.ready.set(false);
    this.pending.set(0);
    this.rejections.set([]);
  }

  get current(): LocalEngine | null {
    return this.engine;
  }

  /** Appelé après chaque modification locale : le service de synchronisation s'en sert pour planifier un envoi. */
  setWriteListener(fn: (() => void) | null): void {
    this.writeListener = fn;
  }

  /** `true` si ce serveur-appel est traité localement. */
  handles(method: string, path: string): boolean {
    return this.ready() && this.engine?.handles(method, path) === true;
  }

  /** Traite l'appel localement ; `null` si la base locale n'est pas prête ou si la route n'est pas locale. */
  async tryLocal(method: string, path: string, body?: unknown): Promise<ApiResult | null> {
    if (!this.engine || !this.ready()) return null;
    const result = await this.engine.call(method, path, body);
    // Une lecture par période peut créer les occurrences à venir : elle compte comme une écriture.
    if (result && this.engine.writes(method, path) && result.status < 400) {
      await this.refresh();
      this.writeListener?.();
    }
    return result;
  }

  /** Une écriture est passée par le réseau (ex. tâche de préparation créée par le serveur) : on récupère vite ses effets. */
  touch(): void {
    if (this.engine) this.writeListener?.();
  }

  async markBootstrapped(): Promise<void> {
    await this.engine?.db.setMeta(META.bootstrapped, true);
    this.ready.set(true);
  }

  async refresh(): Promise<void> {
    if (!this.engine) return;
    this.pending.set(await this.engine.pendingCount());
    this.rejections.set(await this.engine.rejections());
  }
}
