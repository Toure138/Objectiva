import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonNote,
  IonSelect,
  IonSelectOption,
  IonToggle,
  ToastController,
} from '@ionic/angular';
import { logOutOutline, moonOutline, phonePortraitOutline, sunnyOutline } from 'ionicons/icons';

import { AuthService } from '../core/auth.service';
import { REMINDER_LABELS, type EventReminder } from '../core/models';
import { RemindersService } from '../core/reminders.service';
import { SettingsService } from '../core/settings.service';
import { ThemeService, type ThemeChoice } from '../core/theme.service';
import { PageHeaderComponent } from '../shared/page-header.component';
import { SegmentedComponent, type SegmentOption } from '../shared/segmented.component';

@Component({
  selector: 'app-profile',
  imports: [
    FormsModule,
    PageHeaderComponent,
    SegmentedComponent,
    IonContent,
    IonList,
    IonItem,
    IonInput,
    IonButton,
    IonIcon,
    IonToggle,
    IonSelect,
    IonSelectOption,
    IonNote,
  ],
  styles: `
    .identity {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-top: 8px;
      padding: 20px;
      background: linear-gradient(
        135deg,
        color-mix(in srgb, var(--ion-color-primary) 15%, var(--ob-surface)),
        var(--ob-surface) 70%
      );
    }
    .avatar {
      display: grid;
      flex: none;
      place-items: center;
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: var(--ion-color-primary);
      color: var(--ion-color-primary-contrast);
      font-family: var(--ob-font-display);
      font-size: 1.75rem;
      font-weight: 700;
    }
    .identity h2 {
      margin: 0;
      font-size: 1.375rem;
    }
    .identity p {
      margin: 0;
      overflow-wrap: anywhere;
    }
    section {
      margin-top: 20px;
      padding: 16px;
    }
    h3 {
      margin: 0 0 12px;
      font-size: 0.75rem;
    }
    dl {
      margin: 0;
    }
    .row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 10px 0;
    }
    .row + .row {
      border-top: 1px solid var(--ob-hairline);
    }
    dt {
      color: var(--ob-text-2);
    }
    dd {
      margin: 0;
      font-weight: 550;
      text-align: right;
      overflow-wrap: anywhere;
    }
    .hint {
      margin: 0 0 12px;
      font-size: 0.875rem;
    }
    ion-list {
      padding: 0;
      background: transparent;
    }
    .logout {
      margin-top: 24px;
    }
    .soon {
      margin: 20px 4px 0;
      font-size: 0.875rem;
    }
  `,
  template: `
    <app-page-header title="Profil" backHref="/app/aujourdhui" [showProfile]="false" />
    <ion-content>
      <div class="ob-container">
        <div class="identity ob-card ob-rise">
          <div class="avatar" aria-hidden="true">{{ initial() }}</div>
          <div>
            <h2 class="ob-display">{{ auth.user()?.displayName }}</h2>
            <p class="ob-muted">{{ auth.user()?.email }}</p>
          </div>
        </div>

        <section class="ob-card">
          <h3 class="ob-eyebrow">Mon compte</h3>
          <dl>
            <div class="row">
              <dt>Prénom</dt>
              <dd>{{ auth.user()?.displayName }}</dd>
            </div>
            <div class="row">
              <dt>E-mail</dt>
              <dd>{{ auth.user()?.email }}</dd>
            </div>
            <div class="row">
              <dt>Fuseau horaire</dt>
              <dd>{{ auth.user()?.timezone }}</dd>
            </div>
          </dl>
        </section>

        <section class="ob-card">
          <h3 class="ob-eyebrow">Affichage</h3>
          <app-segmented
            [options]="themes"
            [value]="theme.choice()"
            (valueChange)="setTheme($event)"
            ariaLabel="Thème de l’application"
          />
        </section>

        <section class="ob-card">
          <h3 class="ob-eyebrow">Rappels</h3>
          @if (reminders.permission() === 'unavailable') {
            <p class="hint ob-muted">
              Les rappels avant tes rendez-vous fonctionnent dans l’application Android installée sur ton téléphone.
            </p>
          } @else {
            <ion-list class="ob-form" lines="none">
              <ion-item>
                <ion-toggle [checked]="reminders.enabled()" (ionChange)="toggleReminders($event.detail.checked)">
                  Me rappeler mes rendez-vous
                </ion-toggle>
              </ion-item>
              <ion-item>
                <ion-select
                  label="Par défaut"
                  labelPlacement="stacked"
                  interface="action-sheet"
                  [value]="reminders.defaultChoice()"
                  (ionChange)="setDefault($event.detail.value)"
                  [disabled]="!reminders.enabled()"
                >
                  @for (r of reminderChoices; track r[0]) {
                    @if (r[0] !== 'AUCUN') {
                      <ion-select-option [value]="r[0]">{{ r[1] }}</ion-select-option>
                    }
                  }
                </ion-select>
              </ion-item>
            </ion-list>
            @if (reminders.permission() === 'denied') {
              <ion-note class="hint" color="warning">
                Les notifications sont bloquées pour Objectiva. Pour recevoir tes rappels, autorise-les dans les
                réglages Android de l’application.
              </ion-note>
            }
            @if (reminders.exact() === 'denied') {
              <p class="hint ob-muted">Android peut retarder tes rappels de quelques minutes.</p>
              <ion-button expand="block" fill="outline" (click)="reminders.openExactSettings()">
                Autoriser les rappels à l’heure exacte
              </ion-button>
            }
            <ion-button expand="block" fill="clear" (click)="test()">Envoyer un rappel d’essai</ion-button>
          }
        </section>

        <section class="ob-card">
          <h3 class="ob-eyebrow">Connexion au serveur</h3>
          <p class="hint ob-muted">Sur téléphone : adresse de ton serveur, ex. https://objectiva-api.onrender.com</p>
          <ion-list class="ob-form" lines="none">
            <ion-item>
              <ion-input
                label="Adresse de l'API"
                labelPlacement="stacked"
                [(ngModel)]="apiUrl"
                inputmode="url"
              ></ion-input>
            </ion-item>
          </ion-list>
          <ion-button expand="block" fill="outline" (click)="saveApi()">
            {{ saved() ? 'Adresse enregistrée ✓' : 'Enregistrer l’adresse' }}
          </ion-button>
        </section>

        <p class="soon ob-muted">
          Devise, rappels, export des données et suppression du compte arrivent dans une prochaine étape.
        </p>

        <ion-button class="logout" expand="block" fill="outline" color="danger" (click)="auth.logout()">
          <ion-icon slot="start" [icon]="icons.logout" aria-hidden="true"></ion-icon>
          Se déconnecter
        </ion-button>
        <div class="ob-fab-space"></div>
      </div>
    </ion-content>
  `,
})
export class ProfilePage {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  private readonly settings = inject(SettingsService);

  protected readonly themes: SegmentOption[] = [
    { value: 'system', label: 'Auto', icon: phonePortraitOutline },
    { value: 'light', label: 'Clair', icon: sunnyOutline },
    { value: 'dark', label: 'Sombre', icon: moonOutline },
  ];
  protected readonly icons = { logout: logOutOutline };
  protected readonly reminders = inject(RemindersService);
  private readonly toasts = inject(ToastController);
  protected readonly reminderChoices = Object.entries(REMINDER_LABELS) as [EventReminder, string][];
  protected apiUrl = this.settings.apiUrl();
  protected readonly saved = signal(false);
  protected readonly initial = computed(() => (this.auth.user()?.displayName.trim().charAt(0) || '?').toUpperCase());

  protected setTheme(choice: string): void {
    void this.theme.set(choice as ThemeChoice);
  }

  protected toggleReminders(on: boolean): void {
    void this.reminders.setEnabled(on);
  }

  protected setDefault(choice: EventReminder): void {
    void this.reminders.setDefault(choice);
  }

  protected async test(): Promise<void> {
    const ok = await this.reminders.sendTest();
    const toast = await this.toasts.create({
      message: ok
        ? 'Rappel d’essai dans 5 secondes : tu peux fermer l’application.'
        : 'Les notifications ne sont pas autorisées pour Objectiva.',
      duration: 3000,
      position: 'top',
      cssClass: 'ob-toast',
    });
    await toast.present();
  }

  protected async saveApi(): Promise<void> {
    await this.settings.setApiUrl(this.apiUrl);
    this.apiUrl = this.settings.apiUrl();
    this.saved.set(true);
  }
}
