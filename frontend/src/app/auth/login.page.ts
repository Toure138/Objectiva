import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonAccordion,
  IonAccordionGroup,
  IonButton,
  IonContent,
  IonInput,
  IonInputPasswordToggle,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonSegment,
  IonSegmentButton,
  IonText,
} from '@ionic/angular';

import { ApiError } from '../core/api-error';
import { AuthService } from '../core/auth.service';
import { SettingsService } from '../core/settings.service';

@Component({
  selector: 'app-login',
  imports: [
    FormsModule,
    IonContent,
    IonList,
    IonItem,
    IonInput,
    IonInputPasswordToggle,
    IonButton,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonText,
    IonNote,
    IonAccordionGroup,
    IonAccordion,
  ],
  styles: `
    .wrap {
      max-width: 420px;
      margin: 0 auto;
      padding-top: 8vh;
    }
    h1 {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 4px;
      color: var(--ion-color-primary);
    }
    .tagline {
      margin-top: 0;
      color: var(--ion-color-medium);
    }
  `,
  template: `
    <ion-content class="ion-padding">
      <div class="wrap">
        <h1>Objectiva</h1>
        <p class="tagline">Ce que je veux accomplir, ce que je fais aujourd'hui.</p>

        <ion-segment [value]="mode()" (ionChange)="mode.set($any($event.detail.value))">
          <ion-segment-button value="login"><ion-label>Connexion</ion-label></ion-segment-button>
          <ion-segment-button value="register"><ion-label>Inscription</ion-label></ion-segment-button>
        </ion-segment>

        <form (ngSubmit)="submit()">
          <ion-list class="ion-margin-top">
            @if (mode() === 'register') {
              <ion-item>
                <ion-input
                  label="Prénom"
                  labelPlacement="stacked"
                  [(ngModel)]="displayName"
                  name="displayName"
                  autocomplete="given-name"
                  required
                ></ion-input>
              </ion-item>
            }
            <ion-item>
              <ion-input
                label="E-mail"
                labelPlacement="stacked"
                type="email"
                [(ngModel)]="email"
                name="email"
                autocomplete="email"
                inputmode="email"
                required
              ></ion-input>
            </ion-item>
            <ion-item>
              <ion-input
                label="Mot de passe"
                labelPlacement="stacked"
                type="password"
                [(ngModel)]="password"
                name="password"
                [autocomplete]="mode() === 'login' ? 'current-password' : 'new-password'"
                required
              >
                <ion-input-password-toggle slot="end"></ion-input-password-toggle>
              </ion-input>
            </ion-item>
            @if (mode() === 'register') {
              <ion-note class="ion-padding-start">8 caractères minimum.</ion-note>
            }
          </ion-list>

          @if (error()) {
            <ion-text color="danger"
              ><p role="alert">{{ error() }}</p></ion-text
            >
          }
          <ion-button expand="block" type="submit" [disabled]="busy()">
            {{ mode() === 'login' ? 'Se connecter' : 'Créer mon compte' }}
          </ion-button>
        </form>

        <ion-accordion-group class="ion-margin-top">
          <ion-accordion value="serveur">
            <ion-item slot="header"><ion-label>Adresse du serveur</ion-label></ion-item>
            <div slot="content" class="ion-padding">
              <ion-input
                label="Adresse de l'API"
                labelPlacement="stacked"
                [(ngModel)]="apiUrl"
                name="apiUrl"
                (ionBlur)="saveApiUrl()"
                inputmode="url"
              ></ion-input>
              <ion-note>Sur téléphone, indique l'adresse IP de ton PC, ex. http://192.168.1.20:3100/api</ion-note>
            </div>
          </ion-accordion>
        </ion-accordion-group>
      </div>
    </ion-content>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly settings = inject(SettingsService);

  protected readonly mode = signal<'login' | 'register'>('login');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected displayName = '';
  protected email = '';
  protected password = '';
  protected apiUrl = this.settings.apiUrl();

  protected async saveApiUrl(): Promise<void> {
    await this.settings.setApiUrl(this.apiUrl);
    this.apiUrl = this.settings.apiUrl();
  }

  protected async submit(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      if (this.mode() === 'login') {
        await this.auth.login(this.email, this.password);
        await this.router.navigateByUrl('/app/aujourdhui', { replaceUrl: true });
      } else {
        await this.auth.register(this.displayName, this.email, this.password);
        // Première utilisation : parcours court guidé par l'écran Objectifs.
        await this.router.navigateByUrl('/app/objectifs?bienvenue=1', { replaceUrl: true });
      }
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      this.error.set(err?.fields[0]?.message ?? err?.message ?? 'Connexion impossible');
    } finally {
      this.busy.set(false);
    }
  }
}
