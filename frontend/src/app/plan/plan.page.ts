import { Component, computed, inject, signal } from '@angular/core';
import {
  IonButton,
  IonContent,
  IonFab,
  IonFabButton,
  IonIcon,
  IonItemDivider,
  IonLabel,
  IonList,
  IonSegment,
  IonSegmentButton,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add } from 'ionicons/icons';

import { ApiService } from '../core/api.service';
import { addDays, localToday, longDate } from '../core/dates';
import type { Task } from '../core/models';
import { AddMenuService } from '../shared/add-menu.service';
import { PageHeaderComponent } from '../shared/page-header.component';
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
    IonContent,
    IonToolbar,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonList,
    IonItemDivider,
    IonButton,
    IonFab,
    IonFabButton,
    IonIcon,
  ],
  styles: `
    .empty {
      padding: 24px 16px;
      text-align: center;
      color: var(--ion-color-medium);
    }
    .spacer {
      height: 88px;
    }
  `,
  template: `
    <app-page-header title="Planifier" />
    <ion-toolbar>
      <ion-segment [value]="mode()" (ionChange)="switch($any($event.detail.value))">
        <ion-segment-button value="semaine"><ion-label>7 prochains jours</ion-label></ion-segment-button>
        <ion-segment-button value="aplanifier"><ion-label>À planifier</ion-label></ion-segment-button>
      </ion-segment>
    </ion-toolbar>
    <ion-content>
      <app-state-view [loading]="loading()" [error]="error()" (retry)="load()">
        @if (mode() === 'semaine') {
          @for (group of byDay(); track group.date) {
            <ion-list>
              <ion-item-divider sticky
                ><ion-label>{{ group.label }}</ion-label></ion-item-divider
              >
              @for (t of group.tasks; track t.id) {
                <app-task-item [task]="t" [showDate]="false" (changed)="load()" />
              }
            </ion-list>
          } @empty {
            <p class="empty">Rien de prévu sur les 7 prochains jours.</p>
          }
        } @else {
          <ion-list>
            @for (t of tasks(); track t.id) {
              <app-task-item [task]="t" (changed)="load()" />
            } @empty {
              <p class="empty">Aucune action en attente de date.</p>
            }
          </ion-list>
        }
        @if (tasks().length < total()) {
          <ion-button expand="block" fill="clear" (click)="more()">Afficher plus</ion-button>
        }
        <div class="spacer"></div>
      </app-state-view>
      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button (click)="add()" aria-label="Ajouter"><ion-icon name="add"></ion-icon></ion-fab-button>
      </ion-fab>
    </ion-content>
  `,
})
export class PlanPage {
  private readonly api = inject(ApiService);
  private readonly addMenu = inject(AddMenuService);

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

  constructor() {
    addIcons({ add });
  }

  ionViewWillEnter(): void {
    void this.load();
  }

  protected switch(mode: Mode): void {
    this.mode.set(mode);
    this.tasks.set([]);
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
