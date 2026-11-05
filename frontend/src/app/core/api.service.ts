import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { PullResponse, PushRequest, PushResponse } from '../../../../shared/src/sync.schemas';
import { OfflineService } from '../offline/offline.service';

import { ApiError, toApiError, type FieldError } from './api-error';
import type {
  AgendaDay,
  BudgetAccount,
  BudgetCategory,
  BudgetMonth,
  BudgetOperation,
  BudgetTransaction,
  CalendarEvent,
  CalendarMonth,
  CalendarEventDetail,
  EventScope,
  Goal,
  GoalDetail,
  GoalReading,
  Milestone,
  Page,
  Progress,
  Review,
  SeriesSummary,
  Task,
  TodayView,
  User,
} from './models';
import { SettingsService } from './settings.service';

interface Envelope<T> {
  success: boolean;
  data: T;
}

export interface AuthSession {
  user: User;
  token: string;
  expiresAt: string;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type Query = Record<string, string | number | boolean | undefined | null>;

function withQuery(path: string, query?: Query): string {
  const entries = Object.entries(query ?? {}).filter(([, v]) => v !== undefined && v !== null);
  return entries.length === 0
    ? path
    : `${path}?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}`;
}
type Body = Record<string, unknown>;

/**
 * Seul point d'entrée des données de l'application. Les appels sur les tâches, objectifs, jalons,
 * relevés, rendez-vous, réunions récurrentes, agenda, « Aujourd'hui » et bilan sont traités par le
 * moteur local une fois la base du téléphone prête (avec ou sans réseau) ; les autres (budget, compte)
 * passent par HTTP.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly settings = inject(SettingsService);
  private readonly offline = inject(OfflineService);

  // Authentification (sans jeton : l'intercepteur n'en ajoute pas sur login et register)
  login(body: Body): Promise<AuthSession> {
    return this.call('POST', '/auth/login', body);
  }
  register(body: Body): Promise<AuthSession> {
    return this.call('POST', '/auth/register', body);
  }
  logout(): Promise<unknown> {
    return this.call('POST', '/auth/logout', {});
  }

  // Aujourd'hui, bilan et agenda (rendez-vous compris, sur le téléphone)
  today(date?: string): Promise<TodayView> {
    return this.call('GET', '/today', undefined, { date });
  }
  review(q: { period?: 'day' | 'week' | 'month'; date?: string; from?: string; to?: string }): Promise<Review> {
    return this.call('GET', '/reviews', undefined, q);
  }
  agenda(date?: string): Promise<AgendaDay> {
    return this.call('GET', '/agenda', undefined, { date });
  }
  /** Calendrier d'un mois (`AAAA-MM`, défaut : mois courant). */
  calendar(month?: string): Promise<CalendarMonth> {
    return this.call('GET', '/calendar', undefined, { month });
  }
  /** Réunions récurrentes. */
  series(): Promise<SeriesSummary[]> {
    return this.call('GET', '/series');
  }

  // Synchronisation (spec 007) : jamais traitée localement, avec la version du protocole en en-tête.
  /** Point d'entrée public : époque du serveur (change si la base a été remplacée ou restaurée). */
  syncMeta(): Promise<{ epoch: string; protocolVersion: number; minProtocolVersion: number; serverTime: string }> {
    return this.remote('GET', '/meta');
  }
  syncPull(cursor: number, limit: number, protocol: number): Promise<PullResponse> {
    return this.remote('GET', '/sync/pull', undefined, { cursor, limit }, { 'X-Objectiva-Protocol': String(protocol) });
  }
  syncPush(body: PushRequest, protocol: number): Promise<PushResponse> {
    return this.remote('POST', '/sync/push', body as unknown as Body, undefined, {
      'X-Objectiva-Protocol': String(protocol),
    });
  }

  // Objectifs et jalons
  goals(q: Query = {}): Promise<Goal[]> {
    return this.call('GET', '/goals', undefined, q);
  }
  goal(id: string): Promise<GoalDetail> {
    return this.call('GET', `/goals/${id}`);
  }
  createGoal(body: Body): Promise<Goal> {
    return this.call('POST', '/goals', body);
  }
  updateGoal(id: string, body: Body): Promise<Goal> {
    return this.call('PATCH', `/goals/${id}`, body);
  }
  deleteGoal(id: string): Promise<void> {
    return this.call('DELETE', `/goals/${id}`);
  }
  createMilestone(goalId: string, body: Body): Promise<Milestone> {
    return this.call('POST', `/goals/${goalId}/milestones`, body);
  }
  updateMilestone(id: string, body: Body): Promise<Milestone> {
    return this.call('PATCH', `/milestones/${id}`, body);
  }
  deleteMilestone(id: string): Promise<void> {
    return this.call('DELETE', `/milestones/${id}`);
  }

  createReading(goalId: string, body: Body): Promise<{ reading: GoalReading; progress: Progress }> {
    return this.call('POST', `/goals/${goalId}/readings`, body);
  }
  deleteReading(id: string): Promise<{ progress: Progress }> {
    return this.call('DELETE', `/readings/${id}`);
  }

  // Événements
  events(q: Query = {}): Promise<CalendarEvent[]> {
    return this.call('GET', '/events', undefined, q);
  }
  event(id: string): Promise<CalendarEventDetail> {
    return this.call('GET', `/events/${id}`);
  }
  createEvent(body: Body): Promise<CalendarEvent> {
    return this.call('POST', '/events', body);
  }
  /** `scope` : pour une occurrence de réunion récurrente, cette occurrence seule ou aussi les suivantes. */
  updateEvent(id: string, body: Body, scope: 'occurrence' | 'following' = 'occurrence'): Promise<CalendarEvent> {
    return this.call('PATCH', withQuery(`/events/${id}`, { scope }), body);
  }
  /** Occurrence : `occurrence` l'annule, `following` supprime la suite, `series` toute la série. */
  deleteEvent(id: string, scope: EventScope = 'occurrence'): Promise<void> {
    return this.call('DELETE', withQuery(`/events/${id}`, { scope }));
  }
  completeEvent(id: string, decisions?: string | null): Promise<CalendarEvent> {
    return this.call('POST', `/events/${id}/complete`, decisions === undefined ? {} : { decisions });
  }
  reopenEvent(id: string): Promise<CalendarEvent> {
    return this.call('POST', `/events/${id}/reopen`);
  }
  cancelEvent(id: string): Promise<CalendarEvent> {
    return this.call('POST', `/events/${id}/cancel`);
  }
  createEventTask(id: string, body: Body): Promise<Task> {
    return this.call('POST', `/events/${id}/tasks`, body);
  }

  // Budget
  budgetMonth(month: string): Promise<BudgetMonth> {
    return this.call('GET', `/budget/months/${month}`);
  }
  budgetSetup(): Promise<{ accounts: BudgetAccount[]; categories: BudgetCategory[] }> {
    return this.call('POST', '/budget/setup');
  }
  createBudgetCategory(body: Body): Promise<BudgetCategory> {
    return this.call('POST', '/budget/categories', body);
  }
  createBudgetAccount(body: Body): Promise<BudgetAccount> {
    return this.call('POST', '/budget/accounts', body);
  }
  setEnvelope(body: Body): Promise<{ month: string; categoryId: string; plannedAmount: number }> {
    return this.call('PUT', '/budget/envelopes', body);
  }
  createOperation(body: Body): Promise<BudgetOperation> {
    return this.call('POST', '/budget/operations', body);
  }
  updateOperation(id: string, body: Body): Promise<BudgetOperation> {
    return this.call('PATCH', `/budget/operations/${id}`, body);
  }
  deleteOperation(id: string): Promise<void> {
    return this.call('DELETE', `/budget/operations/${id}`);
  }
  /** La clé d'idempotence rend le double appui sans effet : la rejouer renvoie la première écriture. */
  settleOperation(
    id: string,
    body: Body,
  ): Promise<{ operation: BudgetOperation; transaction: BudgetTransaction; replayed: boolean }> {
    return this.call('POST', `/budget/operations/${id}/settle`, body);
  }
  createTransaction(body: Body): Promise<{ transaction: BudgetTransaction; replayed: boolean }> {
    return this.call('POST', '/budget/transactions', body);
  }
  deleteTransaction(id: string): Promise<{ operation: BudgetOperation | null }> {
    return this.call('DELETE', `/budget/transactions/${id}`);
  }

  // Tâches
  tasks(q: Query = {}): Promise<Page<Task>> {
    return this.call('GET', '/tasks', undefined, q);
  }
  createTask(body: Body): Promise<Task> {
    return this.call('POST', '/tasks', body);
  }
  updateTask(id: string, body: Body): Promise<Task> {
    return this.call('PATCH', `/tasks/${id}`, body);
  }
  deleteTask(id: string): Promise<void> {
    return this.call('DELETE', `/tasks/${id}`);
  }
  completeTask(id: string): Promise<Task> {
    return this.call('POST', `/tasks/${id}/complete`);
  }
  reopenTask(id: string): Promise<Task> {
    return this.call('POST', `/tasks/${id}/reopen`);
  }
  cancelTask(id: string): Promise<Task> {
    return this.call('POST', `/tasks/${id}/cancel`);
  }
  rescheduleTask(id: string, workDate: string | null): Promise<Task> {
    return this.call('POST', `/tasks/${id}/reschedule`, { workDate });
  }

  /** Traite l'appel sur le téléphone si la base locale est prête et sait le faire, sinon par le réseau. */
  private async call<T>(method: Method, path: string, body?: Body, query?: Query): Promise<T> {
    const local = await this.offline.tryLocal(method, withQuery(path, query), body);
    if (local) {
      if (local.body.success) return local.body.data as T;
      const failure = local.body;
      throw new ApiError(
        failure.message,
        local.status,
        failure.code,
        Array.isArray(failure.details) ? (failure.details as FieldError[]) : [],
      );
    }
    return this.remote<T>(method, path, body, query);
  }

  /** Appel HTTP vers le serveur (jamais traité localement). */
  private async remote<T>(
    method: Method,
    path: string,
    body?: Body,
    query?: Query,
    headers?: Record<string, string>,
  ): Promise<T> {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined && v !== null) params = params.set(k, String(v));
    }
    try {
      const res = await firstValueFrom(
        this.http.request<Envelope<T>>(method, `${this.settings.apiUrl()}${path}`, { body, params, headers }),
      );
      // Une écriture réseau peut avoir créé ou modifié des données synchronisées : on les récupère sans attendre.
      if (method !== 'GET' && !path.startsWith('/sync/') && !path.startsWith('/auth/')) this.offline.touch();
      return res.data;
    } catch (e) {
      throw toApiError(e);
    }
  }
}
