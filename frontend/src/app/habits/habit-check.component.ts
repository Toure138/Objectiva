import { Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon, ToastController } from '@ionic/angular';
import { checkmark, flameOutline } from 'ionicons/icons';

import { ApiService } from '../core/api.service';
import { streakLabel } from '../core/habits';
import type { TodayHabit } from '../core/models';

/**
 * Une habitude à cocher pour un jour (aujourd'hui par défaut) : bouton de 44 px, titre (vers la fiche), série
 * et, pour « N fois par semaine », l'avancement de la semaine. Toujours un libellé, jamais la couleur seule.
 */
@Component({
  selector: 'app-habit-check',
  imports: [IonIcon, RouterLink],
  template: `
    @let h = habit();
    <div class="ob-card ob-habit" [class.done]="h.done">
      <button
        type="button"
        class="check"
        [attr.aria-pressed]="h.done"
        [attr.aria-label]="(h.done ? 'Annuler : ' : 'Marquer comme fait : ') + h.title"
        [disabled]="busy()"
        (click)="toggle()"
      >
        @if (h.done) {
          <ion-icon [icon]="icons.check" aria-hidden="true"></ion-icon>
        }
      </button>
      <a class="body" [routerLink]="['/app/habitudes', h.id]">
        <span class="title">{{ h.title }}</span>
        <span class="meta">
          @if (h.week) {
            <span class="ob-chip">{{ h.week.done }} sur {{ h.week.target }} cette semaine</span>
          }
          @if (h.streak.value > 0) {
            <span class="ob-chip ob-chip--warn"
              ><ion-icon [icon]="icons.flame" aria-hidden="true"></ion-icon>{{ streak() }}</span
            >
          }
        </span>
      </a>
    </div>
  `,
})
export class HabitCheckComponent {
  private readonly api = inject(ApiService);
  private readonly toasts = inject(ToastController);

  readonly habit = input.required<TodayHabit>();
  readonly date = input<string | undefined>(undefined);
  readonly changed = output<void>();

  protected readonly icons = { check: checkmark, flame: flameOutline };
  protected readonly busy = signal(false);
  protected readonly streak = computed(() => streakLabel(this.habit().streak));

  protected async toggle(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    const h = this.habit();
    try {
      await this.api.markHabit(h.id, !h.done, this.date());
      if (!h.done) {
        const t = await this.toasts.create({
          message: 'Bravo, c’est noté !',
          duration: 1500,
          position: 'top',
          cssClass: 'ob-toast',
        });
        await t.present();
      }
      this.changed.emit();
    } catch (e) {
      const t = await this.toasts.create({
        message: e instanceof Error ? e.message : 'Action impossible',
        duration: 2500,
        position: 'top',
        cssClass: 'ob-toast ob-toast-danger',
      });
      await t.present();
    } finally {
      this.busy.set(false);
    }
  }
}
