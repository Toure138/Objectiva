import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { toApiError } from './api-error';
import type { Goal, GoalDetail, Milestone, Page, Review, Task, TodayView } from './models';
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
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
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
