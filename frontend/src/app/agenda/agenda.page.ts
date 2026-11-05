import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton, IonContent, IonIcon } from '@ionic/angular';
import {
  add,
  alertCircleOutline,
  calendarClearOutline,
  checkmarkCircleOutline,
  chevronBackOutline,
  chevronForwardOutline,
  repeatOutline,
  walkOutline,
} from 'ionicons/icons';

import { ApiService } from '../core/api.service';
import { addDays, localToday, longDate } from '../core/dates';
import type { AgendaDay, AgendaEvent } from '../core/models';
import { AddMenuService } from '../shared/add-menu.service';
import { EmptyStateComponent } from '../shared/empty-state.component';
import { eventIcon } from '../shared/event-item.component';
import { PageHeaderComponent } from '../shared/page-header.component';
import { StateViewComponent } from '../shared/state-view.component';

/** Hauteur d'une heure sur la grille. */
const HOUR_PX = 64;
/** Hauteur minimale d'un bloc, pour qu'un rendez-vous court reste lisible et touchable. */
const MIN_BLOCK_PX = 28;

interface Block {
  event: AgendaEvent;
  height: number;
  /** Plage réservée (trajet + préparation) dessinée au-dessus du bloc. */
  bandTop: number;
  bandHeight: number;
  left: string;
  width: string;
}

const minutesOf = (time: string): number => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/**
 * Agenda d'un jour, heure par heure (spec 009). Le placement (colonnes) et les chevauchements viennent
 * de l'API ou du moteur local : l'écran ne fait que convertir des minutes en pixels.
 */
@Component({
  selector: 'app-agenda',
  imports: [PageHeaderComponent, StateViewComponent, EmptyStateComponent, IonContent, IonButton, IonIcon, RouterLink],
  template: `
    <app-page-header title="Agenda" backHref="/app/aujourdhui" [showProfile]="false" />
    <ion-content>
      <div class="ob-container">
        <nav class="ob-agenda-nav" aria-label="Changer de jour">
          <ion-button fill="clear" (click)="move(-1)" aria-label="Jour précédent">
            <ion-icon slot="icon-only" [icon]="icons.back"></ion-icon>
          </ion-button>
          <div class="ob-agenda-day">
            <h1 class="ob-display">{{ dayLabel() }}</h1>
            @if (!isToday()) {
              <button type="button" class="ob-link" (click)="goToday()">Revenir à aujourd’hui</button>
            }
          </div>
          <ion-button fill="clear" (click)="move(1)" aria-label="Jour suivant">
            <ion-icon slot="icon-only" [icon]="icons.next"></ion-icon>
          </ion-button>
        </nav>

        <app-state-view [loading]="loading()" [error]="error()" (retry)="load()">
          @if (agenda(); as a) {
            @if (a.events.length === 0) {
              <app-empty-state
                [icon]="icons.empty"
                title="Aucun rendez-vous ce jour-là"
                message="Ta journée est libre pour avancer sur tes objectifs."
              />
            } @else {
              @if (a.conflictCount > 0) {
                <p class="ob-agenda-summary warn" role="status">
                  <ion-icon [icon]="icons.conflict" aria-hidden="true"></ion-icon>
                  {{ conflictSummary() }}
                </p>
              } @else {
                <p class="ob-agenda-summary" role="status">
                  <ion-icon [icon]="icons.ok" aria-hidden="true"></ion-icon>Aucun chevauchement
                </p>
              }

              <div class="ob-agenda-wrap" [style.height.px]="gridHeight()">
                <div class="ob-agenda-grid" aria-hidden="true">
                  @for (h of hours(); track h) {
                    <div class="ob-agenda-hour" [style.top.px]="(h - a.startHour) * hourPx">
                      <span>{{ h }} h</span>
                    </div>
                  }
                  @if (nowTop() !== null) {
                    <div class="ob-agenda-now" [style.top.px]="nowTop()"></div>
                  }
                </div>
                <!-- Les blocs sont des liens réels, lisibles au lecteur d'écran, posés sur la grille décorative. -->
                <ol class="ob-agenda-blocks" aria-label="Rendez-vous de la journée">
                  @for (b of blocks(); track b.event.id) {
                    <li [style.left]="b.left" [style.width]="b.width" [style.top.px]="b.bandTop">
                      @if (b.bandHeight > 0) {
                        <span class="band" [style.height.px]="b.bandHeight"></span>
                      }
                      <a
                        class="block"
                        [class.conflict]="b.event.conflicts.length > 0"
                        [class.done]="b.event.status === 'REALISE'"
                        [style.height.px]="b.height"
                        [routerLink]="['/app/evenements', b.event.id]"
                        [attr.aria-label]="label(b.event)"
                      >
                        <span class="t">
                          <ion-icon [icon]="icon(b.event)" aria-hidden="true"></ion-icon>{{ b.event.startTime }}
                          @if (b.event.repeat) {
                            <ion-icon [icon]="icons.repeat" aria-hidden="true"></ion-icon>
                          }
                          @if (b.event.conflicts.length > 0) {
                            <ion-icon class="warn" [icon]="icons.conflict" aria-hidden="true"></ion-icon>
                          }
                        </span>
                        <span class="n">{{ b.event.title }}</span>
                      </a>
                    </li>
                  }
                </ol>
              </div>

              @if (a.conflictCount > 0) {
                <section class="ob-agenda-conflicts">
                  <h2>Chevauchements</h2>
                  <ul>
                    @for (c of conflictLines(); track c) {
                      <li><ion-icon [icon]="icons.conflict" aria-hidden="true"></ion-icon>{{ c }}</li>
                    }
                  </ul>
                </section>
              }
            }
            <ion-button expand="block" fill="outline" class="ion-margin-top" (click)="addEvent()">
              <ion-icon slot="start" [icon]="icons.add" aria-hidden="true"></ion-icon>Ajouter un rendez-vous ce jour-là
            </ion-button>
            <div class="ob-fab-space"></div>
          }
        </app-state-view>
      </div>
    </ion-content>
  `,
})
export class AgendaPage {
  private readonly api = inject(ApiService);
  private readonly addMenu = inject(AddMenuService);

  /** Paramètre de route `:date` (facultatif : aujourd'hui par défaut). */
  readonly date = input<string | undefined>(undefined);

  protected readonly hourPx = HOUR_PX;
  protected readonly icons = {
    add,
    back: chevronBackOutline,
    next: chevronForwardOutline,
    conflict: alertCircleOutline,
    ok: checkmarkCircleOutline,
    empty: calendarClearOutline,
    repeat: repeatOutline,
    leave: walkOutline,
  };

  protected readonly agenda = signal<AgendaDay | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  /** Jour affiché (change avec les flèches sans empiler de pages). */
  private readonly day = signal<string | null>(null);

  protected readonly isToday = computed(() => this.agenda()?.date === localToday());
  protected readonly dayLabel = computed(() => {
    const d = this.agenda()?.date ?? this.day();
    return d ? longDate(d) : '';
  });
  protected readonly hours = computed(() => {
    const a = this.agenda();
    return a ? Array.from({ length: a.endHour - a.startHour + 1 }, (_, i) => a.startHour + i) : [];
  });
  protected readonly gridHeight = computed(() => {
    const a = this.agenda();
    return a ? (a.endHour - a.startHour) * HOUR_PX + 12 : 0;
  });

  protected readonly blocks = computed<Block[]>(() => {
    const a = this.agenda();
    if (!a) return [];
    const origin = a.startHour * 60;
    const px = (min: number) => ((min - origin) * HOUR_PX) / 60;
    return a.events.map((event) => {
      const start = minutesOf(event.startTime);
      const end = minutesOf(event.endTime);
      const bandStart = Math.max(origin, start - event.blockedMinutes);
      const width = `calc((100% - 52px) / ${event.columns} - 4px)`;
      return {
        event,
        height: Math.max(MIN_BLOCK_PX, px(end) - px(start)),
        bandTop: px(bandStart),
        bandHeight: px(start) - px(bandStart),
        left: `calc(52px + (100% - 52px) * ${event.column} / ${event.columns})`,
        width,
      };
    });
  });

  protected readonly nowTop = computed(() => {
    const a = this.agenda();
    if (!a || !this.isToday()) return null;
    const now = new Date();
    const min = now.getHours() * 60 + now.getMinutes();
    if (min < a.startHour * 60 || min > a.endHour * 60) return null;
    return ((min - a.startHour * 60) * HOUR_PX) / 60;
  });

  protected readonly conflictSummary = computed(() => {
    const n = this.agenda()?.conflictCount ?? 0;
    return n > 1 ? `${n} rendez-vous se gênent : regarde les détails plus bas.` : '1 rendez-vous se gêne.';
  });

  /** Une ligne par paire, en toutes lettres (jamais la couleur seule). */
  protected readonly conflictLines = computed(() => {
    const a = this.agenda();
    if (!a) return [];
    const byId = new Map(a.events.map((e) => [e.id, e]));
    const seen = new Set<string>();
    const lines: string[] = [];
    for (const e of a.events) {
      for (const c of e.conflicts) {
        const key = [e.id, c.withId].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        const other = byId.get(c.withId);
        lines.push(
          c.kind === 'CHEVAUCHEMENT'
            ? `« ${e.title} » (${e.startTime}) chevauche « ${c.withTitle} » (${other?.startTime ?? ''}).`
            : `Le trajet ou la préparation empiète entre « ${e.title} » et « ${c.withTitle} ».`,
        );
      }
    }
    return lines;
  });

  ionViewWillEnter(): void {
    if (this.day() === null) this.day.set(this.date() ?? null);
    void this.load();
  }

  async load(): Promise<void> {
    this.error.set(null);
    try {
      const a = await this.api.agenda(this.day() ?? undefined);
      this.agenda.set(a);
      this.day.set(a.date);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Chargement impossible');
    } finally {
      this.loading.set(false);
    }
  }

  protected move(days: number): void {
    const current = this.agenda()?.date ?? this.day() ?? localToday();
    this.day.set(addDays(current, days));
    void this.load();
  }

  protected goToday(): void {
    this.day.set(localToday());
    void this.load();
  }

  protected addEvent(): void {
    void this.addMenu.openEvent({ presetDate: this.agenda()?.date ?? null }, () => void this.load());
  }

  protected icon(e: AgendaEvent): string {
    return eventIcon(e.type);
  }

  protected label(e: AgendaEvent): string {
    const parts = [`${e.title}, de ${e.startTime} à ${e.endTime}`];
    if (e.blockedMinutes > 0) parts.push(`temps réservé dès ${e.blockedFromTime}`);
    if (e.status === 'REALISE') parts.push('réalisé');
    for (const c of e.conflicts) {
      parts.push(
        c.kind === 'CHEVAUCHEMENT' ? `chevauche ${c.withTitle}` : `préparation qui empiète sur ${c.withTitle}`,
      );
    }
    return parts.join(', ');
  }
}
