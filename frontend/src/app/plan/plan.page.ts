import { Component, computed, inject, signal } from '@angular/core';
import { IonButton, IonContent, IonFab, IonFabButton, IonIcon } from '@ionic/angular';
import { add, calendarClearOutline, todayOutline } from 'ionicons/icons';

import { ApiService } from '../core/api.service';
import { addDays, localToday, longDate } from '../core/dates';
import type { Task } from '../core/models';
import { AddMenuService } from '../shared/add-menu.service';
import { EmptyStateComponent } from '../shared/empty-state.component';
import { PageHeaderComponent } from '../shared/page-header.component';
import { SectionHeaderComponent } from '../shared/section-header.component';
import { SegmentedComponent, type SegmentOption } from '../shared/segmented.component';
import { StateViewComponent } from '../shared/state-view.component';
import { TaskItemComponent } from '../shared/task-item.component';

type Mode = 'semaine' | 'aplanifier';
const PAGE_SIZE = 50;

@Component({
  selector: 'app-plan',
  imports: [
    PageHeaderComponent,
    StateViewComponent,
    TaskItemComponent,
    SegmentedComponent,
    SectionHeaderComponent,
    EmptyStateComponent,
    IonContent,
    IonButton,
    IonFab,
    IonFabButton,
    IonIcon,
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
    <app-page-header title="Planifier" eyebrow="Ta semaine" />
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
          @if (mode() === 'semaine') {
            @for (group of byDay(); track group.date) {
              <section>
                <app-section-header [title]="group.label" [count]="group.tasks.length" />
                @for (t of group.tasks; track t.id; let i = $index) {
                  <app-task-item [task]="t" [showDate]="false" [index]="i" (changed)="load()" />
                }
              </section>
            } @empty {
              <app-empty-state
                [icon]="icons.week"
                title="Semaine dégagée"
                message="Rien de prévu sur les 7 prochains jours. Un bon moment pour planifier ta prochaine étape."
              >
                <ion-button class="ob-soft" (click)="add()">Ajouter une action</ion-button>
              </app-empty-state>
            }
          } @else {
            @for (t of tasks(); track t.id; let i = $index) {
              <app-task-item [task]="t" [index]="i" (changed)="load()" />
            } @empty {
              <app-empty-state
                [icon]="icons.clear"
                title="Tout a une date"
                message="Aucune action n’attend d’être planifiée. Joli travail d’organisation !"
              />
            }
          }
          @if (tasks().length < total()) {
            <ion-button class="more" expand="block" fill="clear" (click)="more()">Afficher plus</ion-button>
          }
          <div class="ob-fab-space"></div>
        </app-state-view>
      </div>
      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button (click)="add()" aria-label="Ajouter"><ion-icon [icon]="icons.add"></ion-icon></ion-fab-button>
      </ion-fab>
    </ion-content>
  `,
})
export class PlanPage {
  private readonly api = inject(ApiService);
  private readonly addMenu = inject(AddMenuService);

  protected readonly options: SegmentOption[] = [
    { value: 'semaine', label: '7 prochains jours' },
    { value: 'aplanifier', label: 'À planifier' },
  ];
  protected readonly icons = { add, week: todayOutline, clear: calendarClearOutline };
  protected readonly mode = signal<Mode>('semaine');
  protected readonly tasks = signal<Task[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly byDay = computed(() => {
    const groups = new Map<string, Task[]>();
    for (const t of this.tasks()) {
      const key = t.workDate ?? '';
      groups.set(key, [...(groups.get(key) ?? []), t]);
    }
    return [...groups.entries()].map(([date, tasks]) => ({ date, label: longDate(date), tasks }));
  });

  ionViewWillEnter(): void {
    void this.load();
  }

  protected switchTo(mode: string): void {
    this.mode.set(mode as Mode);
    this.tasks.set([]);
    this.loading.set(true);
    void this.load();
  }

  private query(offset: number) {
    const today = localToday();
    return this.mode() === 'semaine'
      ? { from: today, to: addDays(today, 6), status: 'TODO', limit: PAGE_SIZE, offset }
      : { unscheduled: true, status: 'TODO', limit: PAGE_SIZE, offset };
  }

  async load(): Promise<void> {
    this.error.set(null);
    if (this.tasks().length === 0) this.loading.set(true);
    try {
      const page = await this.api.tasks(this.query(0));
      this.tasks.set(page.items);
      this.total.set(page.total);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Chargement impossible');
    } finally {
      this.loading.set(false);
    }
  }

  protected async more(): Promise<void> {
    const page = await this.api.tasks(this.query(this.tasks().length));
    this.tasks.update((list) => [...list, ...page.items]);
    this.total.set(page.total);
  }

  protected add(): void {
    const presetDate = this.mode() === 'aplanifier' ? null : localToday();
    void this.addMenu.openTask({ presetDate }, () => void this.load());
  }
}
