import { NgTemplateOutlet } from '@angular/common';
import { Component, ElementRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonButton, IonContent, IonFab, IonFabButton, IonIcon, IonSelect, IonSelectOption } from '@ionic/angular';
import {
  add,
  calendarClearOutline,
  chevronBackOutline,
  chevronForwardOutline,
  chevronForward,
  repeatOutline,
  todayOutline,
} from 'ionicons/icons';

import { ApiService } from '../core/api.service';
import { addDays, addMonths, localToday, longDate, monthLabel } from '../core/dates';
import type { CalendarEvent, CalendarMonth, Goal, Task } from '../core/models';
import { AddMenuService } from '../shared/add-menu.service';
import { EmptyStateComponent } from '../shared/empty-state.component';
import { EventItemComponent } from '../shared/event-item.component';
import { PageHeaderComponent } from '../shared/page-header.component';
import { SectionHeaderComponent } from '../shared/section-header.component';
import { SegmentedComponent, type SegmentOption } from '../shared/segmented.component';
import { StateViewComponent } from '../shared/state-view.component';
import { TaskItemComponent } from '../shared/task-item.component';

import { MonthViewComponent } from './month-view.component';

type Mode = 'avenir' | 'mois' | 'aplanifier';
type Kind = 'tout' | 'rdv' | 'taches';
const PAGE_SIZE = 50;
/** « À venir » : une semaine de plus à chaque appui. */
const WEEK = 7;
/** Taille de page maximale acceptée par l'API pour les tâches. */
const TASK_PAGE = 100;

interface DayGroup {
  date: string;
  label: string;
  tasks: Task[];
  events: CalendarEvent[];
}

@Component({
  selector: 'app-plan',
  imports: [
    NgTemplateOutlet,
    FormsModule,
    RouterLink,
    PageHeaderComponent,
    StateViewComponent,
    TaskItemComponent,
    EventItemComponent,
    SegmentedComponent,
    SectionHeaderComponent,
    EmptyStateComponent,
    MonthViewComponent,
    IonContent,
    IonButton,
    IonFab,
    IonFabButton,
    IonIcon,
    IonSelect,
    IonSelectOption,
  ],
  styles: `
    .switch {
      padding-block: 4px 12px;
    }
    section {
      margin-bottom: 20px;
    }
    .more {
      margin-top: 4px;
    }
  `,
  template: `
    <app-page-header title="Planifier" eyebrow="Ton planning" />
    <ion-content>
      <div class="ob-container">
        <div class="switch">
          <app-segmented
            [options]="options"
            [value]="mode()"
            (valueChange)="switchTo($event)"
            ariaLabel="Mode d’affichage"
          />
        </div>
        <app-state-view [loading]="loading()" [error]="error()" (retry)="load()">
          @switch (mode()) {
            @case ('avenir') {
              @if (seriesCount() > 0) {
                <a class="ob-card ob-row ob-plan-series" routerLink="/app/reunions">
                  <ion-icon [icon]="icons.repeat" aria-hidden="true"></ion-icon>
                  <span class="ob-row-txt"
                    >Réunions récurrentes <span class="ob-muted">({{ seriesCount() }})</span></span
                  >
                  <ion-icon [icon]="icons.chevron" aria-hidden="true"></ion-icon>
                </a>
              }
              <div class="ob-plan-filters">
                <div class="ob-chips" role="group" aria-label="Afficher">
                  @for (k of kinds; track k[0]) {
                    <button
                      type="button"
                      [class.on]="kind() === k[0]"
                      [attr.aria-pressed]="kind() === k[0]"
                      (click)="kind.set(k[0])"
                    >
                      {{ k[1] }}
                    </button>
                  }
                </div>
                @if (goals().length > 0) {
                  <ion-select
                    aria-label="Objectif"
                    interface="action-sheet"
                    [ngModel]="goalId()"
                    (ngModelChange)="goalId.set($event)"
                    [selectedText]="goalLabel()"
                  >
                    <ion-select-option [value]="null">Tous les objectifs</ion-select-option>
                    @for (g of goals(); track g.id) {
                      <ion-select-option [value]="g.id">{{ g.title }}</ion-select-option>
                    }
                  </ion-select>
                }
              </div>
              @for (group of byDay(); track group.date) {
                <ng-container *ngTemplateOutlet="day; context: { $implicit: group }" />
              } @empty {
                <app-empty-state
                  [icon]="icons.week"
                  [title]="filtered() ? 'Rien pour ce filtre' : 'Rien de prévu'"
                  [message]="emptyMessage()"
                >
                  <ion-button class="ob-soft" (click)="add()">Ajouter une action</ion-button>
                </app-empty-state>
              }
              <ion-button class="more" expand="block" fill="outline" (click)="nextWeek()" [disabled]="loadingMore()">
                Afficher la semaine suivante
              </ion-button>
              <p class="ob-muted ob-plan-until">Jusqu’au {{ untilLabel() }}</p>
            }
            @case ('mois') {
              @if (month(); as m) {
                <nav class="ob-agenda-nav" aria-label="Changer de mois">
                  <ion-button fill="clear" (click)="moveMonth(-1)" aria-label="Mois précédent">
                    <ion-icon slot="icon-only" [icon]="icons.back"></ion-icon>
                  </ion-button>
                  <div class="ob-agenda-day">
                    <h1 class="ob-display">{{ monthTitle() }}</h1>
                  </div>
                  <ion-button fill="clear" (click)="moveMonth(1)" aria-label="Mois suivant">
                    <ion-icon slot="icon-only" [icon]="icons.next"></ion-icon>
                  </ion-button>
                </nav>
                <app-month-view [month]="m" [selected]="selected()" [today]="today" (pick)="pickDay($event)" />
                @if (selectedGroup(); as g) {
                  <section class="ob-plan-day">
                    <app-section-header [title]="g.label" [count]="g.tasks.length + g.events.length">
                      @if (g.events.length > 0) {
                        <a class="ob-link" [routerLink]="['/app/agenda', g.date]">Heure par heure</a>
                      }
                    </app-section-header>
                    @for (e of g.events; track e.id; let i = $index) {
                      <app-event-item [event]="e" [index]="i" />
                    }
                    @for (t of g.tasks; track t.id; let i = $index) {
                      <app-task-item [task]="t" [showDate]="false" [index]="i" (changed)="reloadDay()" />
                    }
                    @if (g.tasks.length + g.events.length === 0) {
                      <p class="ob-muted">Rien de prévu ce jour-là.</p>
                    }
                  </section>
                }
              }
            }
            @default {
              @for (t of tasks(); track t.id; let i = $index) {
                <app-task-item [task]="t" [index]="i" (changed)="load()" />
              } @empty {
                <app-empty-state
                  [icon]="icons.clear"
                  title="Tout a une date"
                  message="Aucune action n’attend d’être planifiée. Joli travail d’organisation !"
                />
              }
              @if (tasks().length < total()) {
                <ion-button class="more" expand="block" fill="clear" (click)="more()">Afficher plus</ion-button>
              }
            }
          }
          <div class="ob-fab-space"></div>
        </app-state-view>
      </div>
      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button (click)="add()" aria-label="Ajouter"><ion-icon [icon]="icons.add"></ion-icon></ion-fab-button>
      </ion-fab>
    </ion-content>

    <ng-template #day let-group>
      <section>
        <app-section-header [title]="group.label" [count]="group.tasks.length + group.events.length">
          @if (group.events.length > 0) {
            <a class="ob-link" [routerLink]="['/app/agenda', group.date]">Agenda</a>
          }
        </app-section-header>
        @for (e of group.events; track e.id; let i = $index) {
          <app-event-item [event]="e" [index]="i" />
        }
        @for (t of group.tasks; track t.id; let i = $index) {
          <app-task-item [task]="t" [showDate]="false" [index]="i" (changed)="load()" />
        }
      </section>
    </ng-template>
  `,
})
export class PlanPage {
  private readonly api = inject(ApiService);
  private readonly addMenu = inject(AddMenuService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly options: SegmentOption[] = [
    { value: 'avenir', label: 'À venir' },
    { value: 'mois', label: 'Mois' },
    { value: 'aplanifier', label: 'À planifier' },
  ];
  protected readonly kinds: readonly [Kind, string][] = [
    ['tout', 'Tout'],
    ['rdv', 'Rendez-vous'],
    ['taches', 'Tâches'],
  ];
  protected readonly icons = {
    add,
    week: todayOutline,
    clear: calendarClearOutline,
    back: chevronBackOutline,
    next: chevronForwardOutline,
    chevron: chevronForward,
    repeat: repeatOutline,
  };
  protected readonly today = localToday();

  protected readonly mode = signal<Mode>('avenir');
  protected readonly tasks = signal<Task[]>([]);
  protected readonly events = signal<CalendarEvent[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly loadingMore = signal(false);
  protected readonly error = signal<string | null>(null);

  // « À venir »
  protected readonly days = signal(WEEK);
  protected readonly kind = signal<Kind>('tout');
  protected readonly goalId = signal<string | null>(null);
  protected readonly goals = signal<Goal[]>([]);
  protected readonly seriesCount = signal(0);

  // « Mois »
  protected readonly month = signal<CalendarMonth | null>(null);
  private readonly monthKey = signal(localToday().slice(0, 7));
  protected readonly selected = signal<string | null>(null);
  protected readonly selectedGroup = signal<DayGroup | null>(null);

  protected readonly filtered = computed(() => this.kind() !== 'tout' || this.goalId() !== null);

  /** Jours de la période, rendez-vous (par heure) puis tâches, après filtres. */
  protected readonly byDay = computed<DayGroup[]>(() => {
    const goal = this.goalId();
    const tasks = this.kind() === 'rdv' ? [] : this.tasks().filter((t) => !goal || t.goalId === goal);
    const events = this.kind() === 'taches' ? [] : this.events().filter((e) => !goal || e.goalId === goal);
    return group(tasks, events);
  });

  protected readonly untilLabel = computed(() => longDate(addDays(this.today, this.days() - 1)));
  protected readonly monthTitle = computed(() => monthLabel(this.monthKey()));
  protected readonly goalLabel = computed(() => {
    const id = this.goalId();
    return id ? (this.goals().find((g) => g.id === id)?.title ?? 'Objectif') : 'Tous les objectifs';
  });
  protected readonly emptyMessage = computed(() =>
    this.filtered()
      ? 'Aucune action ne correspond à ce filtre sur cette période.'
      : 'Rien de prévu sur cette période. Un bon moment pour planifier ta prochaine étape.',
  );

  ionViewWillEnter(): void {
    void this.load();
  }

  protected switchTo(mode: string): void {
    this.mode.set(mode as Mode);
    this.tasks.set([]);
    this.events.set([]);
    this.loading.set(true);
    void this.load();
  }

  async load(): Promise<void> {
    this.error.set(null);
    try {
      if (this.mode() === 'avenir') await this.loadUpcoming();
      else if (this.mode() === 'mois') await this.loadMonth();
      else {
        const page = await this.api.tasks({ unscheduled: true, status: 'TODO', limit: PAGE_SIZE, offset: 0 });
        this.tasks.set(page.items);
        this.total.set(page.total);
      }
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Chargement impossible');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadUpcoming(): Promise<void> {
    const to = addDays(this.today, this.days() - 1);
    const [page, events, goals, series] = await Promise.all([
      this.allTasks(this.today, to),
      this.api.events({ from: this.today, to, limit: 200 }),
      this.api.goals(),
      this.api.series(),
    ]);
    this.tasks.set(page);
    this.events.set(events.filter((e) => e.status !== 'ANNULE'));
    this.goals.set(goals.filter((g) => g.status === 'A_DEMARRER' || g.status === 'EN_COURS'));
    this.seriesCount.set(series.length);
  }

  protected async nextWeek(): Promise<void> {
    this.loadingMore.set(true);
    this.days.update((d) => d + WEEK);
    try {
      await this.loadUpcoming();
    } finally {
      this.loadingMore.set(false);
    }
  }

  private async loadMonth(): Promise<void> {
    this.month.set(await this.api.calendar(this.monthKey()));
    const sel = this.selected();
    if (sel && sel.startsWith(this.monthKey())) await this.reloadDay();
  }

  protected moveMonth(n: number): void {
    this.monthKey.update((m) => addMonths(m, n));
    this.selected.set(null);
    this.selectedGroup.set(null);
    void this.load();
  }

  protected async pickDay(date: string): Promise<void> {
    this.selected.set(date);
    await this.reloadDay();
    // Le détail du jour est sous le calendrier : on l'amène à l'écran.
    setTimeout(() =>
      this.host.nativeElement.querySelector('.ob-plan-day')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }

  protected async reloadDay(): Promise<void> {
    const date = this.selected();
    if (!date) return;
    const [page, events] = await Promise.all([this.allTasks(date, date), this.api.events({ from: date, to: date })]);
    this.selectedGroup.set(
      group(
        page,
        events.filter((e) => e.status !== 'ANNULE'),
      )[0] ?? { date, label: longDate(date), tasks: [], events: [] },
    );
    // Cocher une tâche change les nombres du calendrier.
    this.month.set(await this.api.calendar(this.monthKey()));
  }

  /** Toutes les tâches à faire d'une période, page après page. */
  private async allTasks(from: string, to: string): Promise<Task[]> {
    const out: Task[] = [];
    for (;;) {
      const page = await this.api.tasks({ from, to, status: 'TODO', limit: TASK_PAGE, offset: out.length });
      out.push(...page.items);
      if (page.items.length === 0 || out.length >= page.total) return out;
    }
  }

  protected async more(): Promise<void> {
    const page = await this.api.tasks({
      unscheduled: true,
      status: 'TODO',
      limit: PAGE_SIZE,
      offset: this.tasks().length,
    });
    this.tasks.update((list) => [...list, ...page.items]);
    this.total.set(page.total);
  }

  protected add(): void {
    const presetDate = this.mode() === 'aplanifier' ? null : (this.selected() ?? this.today);
    void this.addMenu.openTask({ presetDate }, () => void this.load());
  }
}

/** Regroupe par jour (ordre chronologique) ; dans un jour, les rendez-vous viennent avant les tâches. */
function group(tasks: Task[], events: CalendarEvent[]): DayGroup[] {
  const groups = new Map<string, { tasks: Task[]; events: CalendarEvent[] }>();
  const at = (date: string) => {
    const g = groups.get(date) ?? { tasks: [], events: [] };
    groups.set(date, g);
    return g;
  };
  for (const t of tasks) at(t.workDate ?? '').tasks.push(t);
  for (const e of events) at(e.date).events.push(e);
  return [...groups.keys()].sort().map((date) => ({ date, label: longDate(date), ...groups.get(date)! }));
}
