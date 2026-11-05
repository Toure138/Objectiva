import { Injectable, computed, inject, signal } from '@angular/core';

import { newId } from '../../../../shared/src/domain/repo';
import { SYNC_PROTOCOL_VERSION } from '../../../../shared/src/sync';
import type { Mutation, PullResponse, PushResponse } from '../../../../shared/src/sync.schemas';
import { ApiError } from '../core/api-error';
import { ApiService } from '../core/api.service';

import { META } from './local-db';
import { OfflineService } from './offline.service';

/** État de la synchronisation, tel que l'utilisateur le voit. */
export type SyncState =
  /** Rien à faire, ou en attente de la prochaine occasion. */
  | 'idle'
  | 'syncing'
  /** Pas de réseau ou serveur injoignable : tout continue sur le téléphone, réessai automatique. */
  | 'offline'
  /** Session expirée : les données restent sur le téléphone, se reconnecter relance la synchronisation. */
  | 'auth'
  /** Version de l'application trop ancienne pour ce serveur (426) : mise à jour nécessaire. */
  | 'upgrade'
  /** Autre problème : synchronisation en pause, données locales intactes, réessai automatique. */
  | 'error';

const PAGE = 200;
const MIN_RETRY_MS = 5_000;
const MAX_RETRY_MS = 5 * 60_000;
const PERIODIC_MS = 60_000;

/**
 * Synchronise la base locale avec le serveur : envoie les modifications en attente (`push`), puis
 * récupère celles du serveur (`pull`). Jamais bloquant : sans réseau, tout continue localement et la
 * synchronisation reprend toute seule (réessais avec délai croissant, retour du réseau, retour au premier plan).
 */
@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly api = inject(ApiService);
  private readonly offline = inject(OfflineService);

  readonly state = signal<SyncState>('idle');
  readonly lastSyncAt = signal<string | null>(null);
  readonly lastError = signal<string | null>(null);
  /** Dernière reconstruction d'un serveur remplacé ou restauré à partir de ce téléphone (ISO). */
  readonly reseededAt = signal<string | null>(null);
  readonly pending = this.offline.pending;
  readonly rejections = this.offline.rejections;
  /** `true` pendant la toute première récupération des données. */
  readonly bootstrapping = computed(() => !this.offline.ready() && this.state() === 'syncing');

  private running = false;
  private rerun = false;
  private started = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private retryMs = MIN_RETRY_MS;
  private readonly onOnline = () => void this.syncNow();
  private readonly onOffline = () => this.state.set('offline');
  private readonly onVisible = () => {
    if (document.visibilityState === 'visible') void this.syncNow();
  };

  /** Démarre la synchronisation d'une session (appelé après connexion ou au lancement de l'application). */
  start(): void {
    if (this.started) {
      void this.syncNow();
      return;
    }
    this.started = true;
    this.offline.setWriteListener(() => this.schedule(1_500));
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
    document.addEventListener('visibilitychange', this.onVisible);
    this.interval = setInterval(() => void this.syncNow(), PERIODIC_MS);
    void this.syncNow();
  }

  stop(): void {
    this.started = false;
    this.offline.setWriteListener(null);
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
    document.removeEventListener('visibilitychange', this.onVisible);
    if (this.interval) clearInterval(this.interval);
    if (this.timer) clearTimeout(this.timer);
    this.interval = this.timer = null;
    this.state.set('idle');
  }

  private schedule(delayMs: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.syncNow(), delayMs);
  }

  /** Une synchronisation à la fois ; une demande reçue pendant l'exécution en déclenche une seconde. */
  async syncNow(): Promise<void> {
    const engine = this.offline.current;
    if (!engine) return;
    if (this.running) {
      this.rerun = true;
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.state.set('offline');
      return;
    }
    this.running = true;
    this.state.set('syncing');
    try {
      do {
        this.rerun = false;
        // Première fois : rien à envoyer, on commence par télécharger.
        if (this.offline.ready()) {
          // Avant tout envoi : un serveur remplacé ne connaît pas les lignes que le journal modifie.
          await this.checkServer();
          await this.pushAll();
        }
        await this.pullAll();
        await engine.db.setMeta(META.lastSyncAt, new Date().toISOString());
      } while (this.rerun);
      this.lastSyncAt.set((await engine.db.getMeta<string>(META.lastSyncAt)) ?? null);
      this.reseededAt.set((await engine.db.getMeta<string>(META.reseededAt)) ?? null);
      this.lastError.set(null);
      this.retryMs = MIN_RETRY_MS;
      this.state.set('idle');
    } catch (e) {
      this.classify(e);
    } finally {
      this.running = false;
      await this.offline.refresh();
    }
  }

  private classify(e: unknown): void {
    const err = e instanceof ApiError ? e : null;
    if (err?.status === 0) {
      this.state.set('offline');
      this.retry();
    } else if (err?.status === 401) {
      this.state.set('auth');
    } else if (err?.status === 426) {
      this.state.set('upgrade');
      this.lastError.set(err.message);
    } else {
      this.state.set('error');
      this.lastError.set(err?.message ?? (e instanceof Error ? e.message : 'Erreur de synchronisation'));
      this.retry();
    }
  }

  /** Réessai avec un délai croissant (5 s, 10 s… jusqu'à 5 min). */
  private retry(): void {
    this.schedule(this.retryMs);
    this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
  }

  private async pushAll(): Promise<void> {
    const engine = this.offline.current!;
    const deviceId = await engine.deviceId();
    for (;;) {
      const items = await engine.pending(PAGE);
      if (items.length === 0) return;
      const res: PushResponse = await this.api.syncPush(
        { deviceId, mutations: items.map((i) => i.mutation) },
        SYNC_PROTOCOL_VERSION,
      );
      await engine.acknowledge(res.results);
      await this.offline.refresh();
      // Garde-fou : si le serveur n'a rien acquitté, on s'arrête plutôt que de boucler.
      if (res.results.length === 0) return;
    }
  }

  private async pullAll(): Promise<void> {
    const engine = this.offline.current!;
    for (;;) {
      const cursor = (await engine.db.getMeta<number>(META.cursor)) ?? 0;
      const known = await engine.db.getMeta<string>(META.epoch);
      const res: PullResponse = await this.api.syncPull(cursor, PAGE, SYNC_PROTOCOL_VERSION);
      if (known && known !== res.epoch) {
        // Changement survenu entre-temps. Première récupération inachevée : on repart de zéro, rien à renvoyer.
        if (this.offline.ready()) await this.reseed(res.epoch);
        else await engine.restartFrom(res.epoch, false);
        continue;
      }
      await engine.applyPull(res.changes, res.cursor, res.epoch);
      if (!res.hasMore) break;
    }
    if (!this.offline.ready()) await this.offline.markBootstrapped();
  }

  /** Compare l'époque du serveur à celle de la dernière synchronisation. */
  private async checkServer(): Promise<void> {
    const engine = this.offline.current!;
    const known = await engine.db.getMeta<string>(META.epoch);
    if (!known) return;
    const { epoch } = await this.api.syncMeta();
    if (epoch !== known) await this.reseed(epoch);
  }

  /**
   * Le serveur a été remplacé (base neuve) ou restauré depuis une sauvegarde : le téléphone, qui est la
   * référence, lui renvoie tout son état. Rien n'est écrasé à l'aveugle : une ligne que le serveur a déjà
   * est renvoyée en modification et fusionnée champ par champ (l'horloge la plus récente l'emporte).
   * Ensuite le journal part normalement et tout est relu depuis le début. Interrompu, il recommence au
   * prochain essai sans dommage (créations « déjà là », modifications « déjà à jour »).
   */
  private async reseed(epoch: string): Promise<void> {
    const engine = this.offline.current!;
    const deviceId = await engine.deviceId();
    const already: Mutation[] = [];
    const refused: { entity: string; id: string; message: string }[] = [];
    const send = async (list: Mutation[]): Promise<void> => {
      for (let i = 0; i < list.length; i += PAGE) {
        const batch = list.slice(i, i + PAGE);
        const res = await this.api.syncPush({ deviceId, mutations: batch }, SYNC_PROTOCOL_VERSION);
        const byId = new Map(batch.map((m) => [m.mutationId, m]));
        for (const r of res.results) {
          const m = byId.get(r.mutationId);
          if (!m) continue;
          if (r.status === 'ignored' && r.reason === 'exists') {
            already.push({
              mutationId: newId(),
              entity: m.entity,
              id: m.id,
              op: 'update',
              fields: m.fields,
              clocks: m.clocks,
            });
          } else if (r.status === 'rejected') {
            refused.push({ entity: m.entity, id: m.id, message: r.message ?? 'Modification refusée par le serveur' });
          }
        }
      }
    };
    await send(await engine.snapshot());
    await send(already.splice(0));
    await engine.recordRejections(refused);
    await engine.restartFrom(epoch, true);
  }
}
