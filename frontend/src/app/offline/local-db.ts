import Dexie, { type Table } from 'dexie';

import type { GoalRow, MilestoneRow, ReadingRow, TaskRow } from '../../../../shared/src/domain/rows';
import type { Mutation } from '../../../../shared/src/sync.schemas';

/** Une ligne stockée sur le téléphone : la ligne métier + l'horloge hybride de chacun de ses champs. */
export type Stored<T> = T & { _c: Record<string, string> };

/** Modification en attente d'envoi au serveur (journal « outbox »), dans l'ordre où elle a été faite. */
export interface OutboxItem {
  seq?: number;
  mutation: Mutation;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

/** Clés de la table `meta`. */
export const META = {
  /** Dernier numéro de version du serveur traité (curseur de lecture). */
  cursor: 'cursor',
  /** Époque du serveur lors de la dernière synchronisation. */
  epoch: 'epoch',
  /** Identifiant de cet appareil (créé une fois). */
  deviceId: 'deviceId',
  /** État de l'horloge hybride de cet appareil. */
  hlc: 'hlc',
  /** Propriétaire des données (identifiant utilisateur). */
  userId: 'userId',
  /** Fuseau horaire de l'utilisateur. */
  timezone: 'timezone',
  /** Dernière synchronisation réussie (ISO). */
  lastSyncAt: 'lastSyncAt',
  /** Première synchronisation complète terminée (les données locales sont exploitables). */
  bootstrapped: 'bootstrapped',
  /** Dernière fois que ce téléphone a reconstruit un serveur remplacé ou restauré (ISO). */
  reseededAt: 'reseededAt',
} as const;

/**
 * Base locale d'un utilisateur (IndexedDB). Une base par utilisateur : deux comptes sur le même
 * appareil ne mélangent jamais leurs données.
 */
export class OfflineDb extends Dexie {
  goals!: Table<Stored<GoalRow>, string>;
  milestones!: Table<Stored<MilestoneRow>, string>;
  readings!: Table<Stored<ReadingRow>, string>;
  tasks!: Table<Stored<TaskRow>, string>;
  outbox!: Table<OutboxItem, number>;
  meta!: Table<MetaEntry, string>;

  constructor(name: string) {
    super(name);
    // Évolution du schéma : ajouter une version, jamais modifier la précédente (migrations testées, spec 007 CA-11).
    this.version(1).stores({
      goals: 'id, endDate, status',
      milestones: 'id, goalId',
      readings: 'id, goalId',
      tasks: 'id, workDate, originalDate, status, goalId, milestoneId, dueDate',
      outbox: '++seq',
      meta: 'key',
    });
  }

  /** Les tables de données, pour ouvrir une transaction. */
  get dataTables(): Table[] {
    return [this.goals, this.milestones, this.readings, this.tasks];
  }

  get allTables(): Table[] {
    return [...this.dataTables, this.outbox, this.meta];
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.meta.get(key))?.value as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.meta.put({ key, value });
  }
}

/** Nom de la base d'un utilisateur. */
export const dbNameFor = (userId: string): string => `objectiva-${userId}`;
