import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonBackButton, IonButtons, IonHeader, IonToolbar } from '@ionic/angular';

import { AuthService } from '../core/auth.service';

/**
 * En-tête commun : titre en police d'affichage, accès au profil (avatar à l'initiale) et,
 * sur les écrans de détail, bouton retour. Les boutons d'action se projettent à droite.
 */
@Component({
  selector: 'app-page-header',
  imports: [IonHeader, IonToolbar, IonButtons, IonBackButton, RouterLink],
  template: `
    <ion-header>
      <ion-toolbar>
        <div class="bar" [class.compact]="backHref()">
          @if (backHref(); as href) {
            <ion-buttons class="back">
              <ion-back-button [defaultHref]="href" [text]="backText()" aria-label="Retour"></ion-back-button>
            </ion-buttons>
          }
          <div class="titles">
            @if (eyebrow()) {
              <p class="ob-eyebrow">{{ eyebrow() }}</p>
            }
            <h1 class="ob-display">{{ title() }}</h1>
          </div>
          <div class="end">
            <ng-content />
            @if (showProfile()) {
              <a class="avatar" routerLink="/profil" aria-label="Profil et paramètres">{{ initial() }}</a>
            }
          </div>
        </div>
      </ion-toolbar>
    </ion-header>
  `,
  styles: `
    .bar {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      max-width: var(--ob-content-width);
      margin-inline: auto;
      padding: 8px 0 4px;
    }
    .titles {
      flex: 1;
      min-width: 0;
    }
    h1 {
      font-size: 1.75rem;
      line-height: 1.15;
      overflow-wrap: anywhere;
    }
    .compact h1 {
      overflow: hidden;
      font-size: 1.25rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .back {
      margin-inline-start: -12px;
    }
    ion-back-button {
      --color: var(--ob-text);
      --icon-font-size: 24px;
    }
    .end {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .avatar {
      display: grid;
      flex: none;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: color-mix(in srgb, var(--ion-color-primary) 16%, var(--ob-surface));
      color: var(--ob-primary-ink);
      font-family: var(--ob-font-display);
      font-size: 1.125rem;
      font-weight: 700;
      text-decoration: none;
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ion-color-primary) 28%, transparent);
    }
  `,
})
export class PageHeaderComponent {
  private readonly auth = inject(AuthService);

  readonly title = input.required<string>();
  /** Petit texte au-dessus du titre (ex. la date). */
  readonly eyebrow = input('');
  /** Si défini : affiche un bouton retour vers cette adresse par défaut. */
  readonly backHref = input<string | null>(null);
  readonly backText = input('');
  readonly showProfile = input(true);

  protected readonly initial = computed(() => (this.auth.user()?.displayName.trim().charAt(0) || '?').toUpperCase());
}
