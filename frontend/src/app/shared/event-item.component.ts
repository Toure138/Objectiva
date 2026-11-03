import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import {
  calendarOutline,
  callOutline,
  chatbubblesOutline,
  checkmarkCircle,
  closeCircleOutline,
  linkOutline,
  locationOutline,
  peopleOutline,
  videocamOutline,
  walkOutline,
} from 'ionicons/icons';

import { EVENT_TYPE_LABELS, type CalendarEvent, type EventType } from '../core/models';

const ICONS: Record<EventType, string> = {
  REUNION: peopleOutline,
  RENCONTRE: chatbubblesOutline,
  RENDEZ_VOUS: calendarOutline,
  APPEL: callOutline,
  VISIO: videocamOutline,
};

export function eventIcon(type: EventType): string {
  return ICONS[type];
}

/** Carte d'un événement : heure, type, titre, lieu et pastilles de statut ou de départ. */
@Component({
  selector: 'app-event-item',
  imports: [IonIcon, RouterLink],
  styles: `
    :host {
      display: block;
    }
    a {
      display: flex;
      align-items: stretch;
      gap: 12px;
      margin-bottom: 8px;
      padding: 12px 14px 12px 12px;
      color: inherit;
      text-decoration: none;
      -webkit-tap-highlight-color: transparent;
      transition: transform 0.15s var(--ob-ease);
    }
    a:active {
      transform: scale(0.985);
    }
    a.off {
      background: color-mix(in srgb, var(--ob-surface) 60%, transparent);
      box-shadow: none;
    }
    .time {
      display: flex;
      flex: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 58px;
      padding: 6px 0;
      border-radius: var(--ob-radius-md);
      background: var(--cat-soft);
      color: var(--cat-ink);
      font-variant-numeric: tabular-nums;
      line-height: 1.2;
    }
    .time strong {
      font-size: 1rem;
    }
    .time small {
      font-size: 0.75rem;
      opacity: 0.85;
    }
    .body {
      flex: 1;
      min-width: 0;
    }
    .kind {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 0 0 2px;
      color: var(--cat-ink);
    }
    .title {
      margin: 0;
      font-weight: 600;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }
    .off .title {
      color: var(--ob-text-2);
      text-decoration: line-through;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
    }
  `,
  template: `
    @let e = event();
    <a
      [class]="cls()"
      [style.--i]="index()"
      [routerLink]="['/app/evenements', e.id]"
      [attr.aria-label]="typeLabel() + ' : ' + e.title + ', de ' + e.startTime + ' à ' + e.endTime"
    >
      <span class="time">
        <strong>{{ e.startTime }}</strong>
        <small>{{ e.endTime }}</small>
      </span>
      <span class="body">
        <p class="kind ob-eyebrow"><ion-icon [icon]="icon()" aria-hidden="true"></ion-icon>{{ typeLabel() }}</p>
        <p class="title">{{ e.title }}</p>
        <span class="meta">
          @if (e.status === 'REALISE') {
            <span class="ob-chip ob-chip--ok"><ion-icon [icon]="icons.done" aria-hidden="true"></ion-icon>Réalisé</span>
          }
          @if (e.status === 'ANNULE') {
            <span class="ob-chip"><ion-icon [icon]="icons.cancelled" aria-hidden="true"></ion-icon>Annulé</span>
          }
          @if (e.status === 'PREVU' && e.leaveAtTime) {
            <span class="ob-chip ob-chip--warn"
              ><ion-icon [icon]="icons.leave" aria-hidden="true"></ion-icon>Départ à {{ e.leaveAtTime }}</span
            >
          } @else if (e.status === 'PREVU' && e.blockedMinutes > 0) {
            <span class="ob-chip ob-chip--warn"
              ><ion-icon [icon]="icons.leave" aria-hidden="true"></ion-icon>Prépare-toi dès
              {{ e.blockedFromTime }}</span
            >
          }
          @if (e.location) {
            <span class="ob-chip"><ion-icon [icon]="icons.place" aria-hidden="true"></ion-icon>{{ e.location }}</span>
          } @else if (e.link) {
            <span class="ob-chip"><ion-icon [icon]="icons.link" aria-hidden="true"></ion-icon>En ligne</span>
          }
        </span>
      </span>
    </a>
  `,
})
export class EventItemComponent {
  readonly event = input.required<CalendarEvent>();
  readonly index = input(0);

  protected readonly icons = {
    done: checkmarkCircle,
    cancelled: closeCircleOutline,
    leave: walkOutline,
    place: locationOutline,
    link: linkOutline,
  };
  protected readonly icon = computed(() => ICONS[this.event().type]);
  protected readonly typeLabel = computed(() => EVENT_TYPE_LABELS[this.event().type]);
  // Les événements ont leur propre teinte (celle de « Carrière ») pour se distinguer des tâches.
  protected readonly cls = computed(
    () => `ob-card ob-cat ob-cat--carriere ob-rise ${this.event().status === 'ANNULE' ? 'off' : ''}`,
  );
}
