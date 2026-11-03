import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { toApiError } from './api-error';
import type {
  BudgetAccount,
  BudgetCategory,
  BudgetMonth,
  BudgetOperation,
  BudgetTransaction,
  CalendarEvent,
  CalendarEventDetail,
  Goal,
  GoalDetail,
  GoalReading,
  Milestone,
  Page,
  Progress,
  Review,
  Task,
  TodayView,
} from './models';
import { SettingsService } from './settings.service';

interface Envelope<T> {
  success: boolean;
  data: T;
}

type Query = Record<string, string | number | boolean | undefined | null>;
type Body = Record<string, unknown>;

/** Seul point d'appel HTTP de l'application. Toutes les règles de calcul restent côté serveur. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly settings = inject(SettingsService);

  // Aujourd'hui et bilan
  today(date?: string): Promise<TodayView> {
    return this.call('GET', '/today', undefined, { date });
  }
  review(q: { period?: 'day' | 'week' | 'month'; date?: string; from?: string; to?: string }): Promise<Review> {
    return this.call('GET', '/reviews', undefined, q);
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
  updateEvent(id: string, body: Body): Promise<CalendarEvent> {
    return this.call('PATCH', `/events/${id}`, body);
  }
  deleteEvent(id: string): Promise<void> {
    return this.call('DELETE', `/events/${id}`);
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

  private async call<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: Body,
    query?: Query,
  ): Promise<T> {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined && v !== null) params = params.set(k, String(v));
    }
    try {
      const res = await firstValueFrom(
        this.http.request<Envelope<T>>(method, `${this.settings.apiUrl()}${path}`, { body, params }),
      );
      return res.data;
    } catch (e) {
      throw toApiError(e);
    }
  }
}
