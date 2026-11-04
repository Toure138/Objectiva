import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  IonInputPasswordToggle,
  IonItem,
  IonList,
  IonNote,
} from '@ionic/angular';
import { alertCircleOutline, chevronDown, settingsOutline } from 'ionicons/icons';

import { ApiError } from '../core/api-error';
import { AuthService } from '../core/auth.service';
import { SettingsService } from '../core/settings.service';
import { BrandMarkComponent } from '../shared/brand-mark.component';
import { SegmentedComponent, type SegmentOption } from '../shared/segmented.component';

@Component({
  selector: 'app-login',
  imports: [
    FormsModule,
    BrandMarkComponent,
    SegmentedComponent,
    IonContent,
    IonList,
    IonItem,
    IonInput,
    IonInputPasswordToggle,
    IonButton,
    IonIcon,
    IonNote,
  ],
  styles: `
    ion-content {
      --background: var(--ob-bg);
    }
    .page {
      display: flex;
      flex-direction: column;
      min-height: 100%;
    }
    .hero {
      position: relative;
      overflow: hidden;
      padding: calc(var(--ion-safe-area-top, 0px) + 40px) 24px 56px;
      background: linear-gradient(160deg, #1f7f6b 0%, #0e4a3f 70%);
      color: #fff;
    }
    .hero::before,
    .hero::after {
      content: '';
      position: absolute;
      border-radius: 50%;
      border: 1.5px solid rgb(255 255 255 / 0.12);
      pointer-events: none;
    }
    .hero::before {
      top: -70px;
      right: -50px;
      width: 220px;
      height: 220px;
    }
    .hero::after {
      top: -20px;
      right: 0;
      width: 120px;
      height: 120px;
    }
    .hero-inner {
      position: relative;
      max-width: 440px;
      margin-inline: auto;
    }
    h1 {
      margin: 18px 0 6px;
      font-size: 2.5rem;
      line-height: 1.05;
    }
    .tagline {
      max-width: 28ch;
      margin: 0;
      font-size: 1.0625rem;
      line-height: 1.4;
      opacity: 0.9;
    }
    .card {
      position: relative;
      flex: 1;
      width: 100%;
      max-width: 440px;
      margin: -28px auto 0;
      padding: 24px 20px 32px;
      border-radius: var(--ob-radius-xl) var(--ob-radius-xl) 0 0;
      background: var(--ob-surface);
      box-shadow: 0 -8px 24px rgb(0 0 0 / 0.08);
    }
    form {
      margin-top: 20px;
    }
    ion-list {
      padding: 0;
      background: transparent;
    }
    .hint {
      display: block;
      margin: -4px 0 12px 4px;
    }
    .error {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin: 0 0 14px;
      padding: 12px 14px;
      border-radius: var(--ob-radius-md);
      background: color-mix(in srgb, var(--ob-danger) 12%, var(--ob-surface));
      color: var(--ob-danger-ink);
      font-weight: 500;
    }
    .error ion-icon {
      flex: none;
      margin-top: 2px;
      font-size: 20px;
    }
    .server-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 44px;
      margin-top: 12px;
      padding: 0 4px;
      border: 0;
      background: transparent;
      color: var(--ob-text-2);
      font: inherit;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
    }
    .server-toggle .chev {
      margin-left: auto;
      transition: transform 0.25s var(--ob-ease);
    }
    .server-toggle[aria-expanded='true'] .chev {
      transform: rotate(180deg);
    }
    .server {
      padding: 4px 0 0;
    }
    @media (min-width: 600px) {
      .card {
        margin-top: -28px;
        border-radius: var(--ob-radius-xl);
      }
    }
  `,
  template: `
    <ion-content>
      <div class="page">
        <header class="hero">
          <div class="hero-inner">
            <app-brand-mark [size]="56" />
            <h1 class="ob-display">Objectiva</h1>
            <p class="tagline">Ce que je veux accomplir, ce que je fais aujourd'hui.</p>
          </div>
        </header>

        <main class="card ob-rise">
          <app-segmented
            [options]="modes"
            [value]="mode()"
            (valueChange)="setMode($event)"
            ariaLabel="Connexion ou inscription"
          />

          <form (ngSubmit)="submit()">
            <ion-list class="ob-form" lines="none">
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
                <ion-note class="hint">8 caractères minimum.</ion-note>
              }
            </ion-list>

            @if (error()) {
              <p class="error" role="alert">
                <ion-icon [icon]="icons.alert" aria-hidden="true"></ion-icon><span>{{ error() }}</span>
              </p>
            }
            <ion-button expand="block" type="submit" [disabled]="busy()">
              {{ mode() === 'login' ? 'Se connecter' : 'Créer mon compte' }}
            </ion-button>
          </form>

          <button
            type="button"
            class="server-toggle"
            [attr.aria-expanded]="showServer()"
            (click)="showServer.set(!showServer())"
          >
            <ion-icon [icon]="icons.settings" aria-hidden="true"></ion-icon>
            Adresse du serveur
            <ion-icon class="chev" [icon]="icons.chevron" aria-hidden="true"></ion-icon>
          </button>
          @if (showServer()) {
            <div class="server">
              <ion-list class="ob-form" lines="none">
                <ion-item>
                  <ion-input
                    label="Adresse de l'API"
                    labelPlacement="stacked"
                    [(ngModel)]="apiUrl"
                    name="apiUrl"
                    (ionBlur)="saveApiUrl()"
                    inputmode="url"
                  ></ion-input>
                </ion-item>
              </ion-list>
              <ion-note>Sur téléphone, colle l'adresse de ton serveur, ex. https://objectiva-api.onrender.com</ion-note>
            </div>
          }
        </main>
      </div>
    </ion-content>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly settings = inject(SettingsService);

  protected readonly modes: SegmentOption[] = [
    { value: 'login', label: 'Connexion' },
    { value: 'register', label: 'Inscription' },
  ];
  protected readonly icons = { alert: alertCircleOutline, chevron: chevronDown, settings: settingsOutline };
  protected readonly mode = signal<'login' | 'register'>('login');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showServer = signal(false);

  protected displayName = '';
  protected email = '';
  protected password = '';
  protected apiUrl = this.settings.apiUrl();

  protected setMode(mode: string): void {
    this.mode.set(mode as 'login' | 'register');
    this.error.set(null);
  }

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
