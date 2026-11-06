import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent, IonFab, IonFabButton, IonIcon, ModalController } from '@ionic/angular';
import { add, chevronForward, flameOutline, pauseCircleOutline, repeatOutline } from 'ionicons/icons';

import { ApiService } from '../core/api.service';
import { frequencyLabel, streakLabel } from '../core/habits';
import type { Habit } from '../core/models';
import { EmptyStateComponent } from '../shared/empty-state.component';
import { PageHeaderComponent } from '../shared/page-header.component';
import { SectionHeaderComponent } from '../shared/section-header.component';
import { StateViewComponent } from '../shared/state-view.component';

import { HabitFormComponent } from './habit-form.component';

/** Liste des habitudes (spec 012) : en cours, puis archivées. */
@Component({
  selector: 'app-habits',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    PageHeaderComponent,
    StateViewComponent,
    EmptyStateComponent,
    SectionHeaderComponent,
    IonContent,
    IonFab,
    IonFabButton,
    IonIcon,
  ],
  template: `
    <app-page-header title="Habitudes" backHref="/app/aujourdhui" [showProfile]="false" />
    <ion-content>
      <div class="ob-container">
        <app-state-view [loading]="loading()" [error]="error()" (retry)="load()">
          @for (h of active(); track h.id; let i = $index) {
            <ng-container *ngTemplateOutlet="row; context: { $implicit: h, i: i }" />
          } @empty {
            <app-empty-state
              [icon]="icons.habit"
              title="Aucune habitude pour l’instant"
              message="Une petite action répétée chaque jour finit par faire une grande différence. Commence par une seule."
            />
          }
          @if (archived().length > 0) {
            <section class="ob-plan-day">
              <app-section-header title="Archivées" [count]="archived().length" />
              @for (h of archived(); track h.id; let i = $index) {
                <ng-container *ngTemplateOutlet="row; context: { $implicit: h, i: i }" />
              }
            </section>
          }
          <div class="ob-fab-space"></div>
        </app-state-view>
      </div>
      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button (click)="create()" aria-label="Nouvelle habitude"
          ><ion-icon [icon]="icons.add"></ion-icon
        ></ion-fab-button>
      </ion-fab>
    </ion-content>

    <ng-template #row let-h let-i="i">
      <a
        class="ob-card ob-row ob-series ob-rise"
        [style.--i]="i"
        [routerLink]="['/app/habitudes', h.id]"
        [class.off]="h.status === 'ARCHIVEE'"
      >
        <span class="ob-ico"><ion-icon [icon]="icons.habit" aria-hidden="true"></ion-icon></span>
        <span class="ob-row-txt">
          <strong>{{ h.title }}</strong>
          <span class="ob-muted">{{ frequency(h) }}</span>
          <span class="ob-habit-chips">
            @if (h.paused) {
              <span class="ob-chip"><ion-icon [icon]="icons.pause" aria-hidden="true"></ion-icon>En pause</span>
            } @else if (h.streak.value > 0) {
              <span class="ob-chip ob-chip--warn"
                ><ion-icon [icon]="icons.flame" aria-hidden="true"></ion-icon>{{ streak(h) }}</span
              >
            }
            @if (h.last30.rate !== null) {
              <span class="ob-chip">{{ percent(h) }} sur 30 jours</span>
            }
          </span>
        </span>
        <ion-icon [icon]="icons.chevron" aria-hidden="true"></ion-icon>
      </a>
    </ng-template>
  `,
})
export class HabitsPage {
  private readonly api = inject(ApiService);
  private readonly modals = inject(ModalController);

  protected readonly habits = signal<Habit[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly active = computed(() => this.habits().filter((h) => h.status === 'ACTIVE'));
  protected readonly archived = computed(() => this.habits().filter((h) => h.status === 'ARCHIVEE'));
  protected readonly icons = {
    add,
    habit: repeatOutline,
    chevron: chevronForward,
    flame: flameOutline,
    pause: pauseCircleOutline,
  };

  ionViewWillEnter(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.error.set(null);
    try {
      this.habits.set(await this.api.habits());
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Chargement impossible');
    } finally {
      this.loading.set(false);
    }
  }

  protected async create(): Promise<void> {
    const modal = await this.modals.create({ component: HabitFormComponent });
    await modal.present();
    if ((await modal.onWillDismiss()).role === 'saved') await this.load();
  }

  protected frequency(h: Habit): string {
    return frequencyLabel(h);
  }

  protected streak(h: Habit): string {
    return streakLabel(h.streak);
  }

  protected percent(h: Habit): string {
    return `${Math.round((h.last30.rate ?? 0) * 100)}\u00a0%`;
  }
}
