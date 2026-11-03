import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { AuthService } from '../core/auth.service';
import { SettingsService } from '../core/settings.service';
import { ThemeService, type ThemeChoice } from '../core/theme.service';

@Component({
  selector: 'app-profile',
  imports: [
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonList,
    IonListHeader,
    IonItem,
    IonLabel,
    IonNote,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonButton,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"
          ><ion-back-button defaultHref="/app/aujourdhui" text="Retour"></ion-back-button
        ></ion-buttons>
        <ion-title>Profil et paramètres</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-list>
        <ion-list-header><ion-label>Mon compte</ion-label></ion-list-header>
        <ion-item
          ><ion-label>Prénom</ion-label><ion-note slot="end">{{ auth.user()?.displayName }}</ion-note></ion-item
        >
        <ion-item
          ><ion-label>E-mail</ion-label><ion-note slot="end">{{ auth.user()?.email }}</ion-note></ion-item
        >
        <ion-item
          ><ion-label>Fuseau horaire</ion-label><ion-note slot="end">{{ auth.user()?.timezone }}</ion-note></ion-item
        >
      </ion-list>

      <ion-list>
        <ion-list-header><ion-label>Affichage</ion-label></ion-list-header>
        <ion-item>
          <ion-select
            label="Thème"
            [value]="theme.choice()"
            (ionChange)="setTheme($any($event.detail.value))"
            interface="action-sheet"
          >
            <ion-select-option value="system">Comme le téléphone</ion-select-option>
            <ion-select-option value="light">Clair</ion-select-option>
            <ion-select-option value="dark">Sombre</ion-select-option>
          </ion-select>
        </ion-item>
      </ion-list>

      <ion-list>
        <ion-list-header><ion-label>Connexion au serveur</ion-label></ion-list-header>
        <ion-item>
          <ion-input label="Adresse de l'API" labelPlacement="stacked" [(ngModel)]="apiUrl" inputmode="url"></ion-input>
        </ion-item>
        <ion-item lines="none">
          <ion-note>Sur téléphone : adresse IP du PC, ex. http://192.168.1.20:3100/api</ion-note>
        </ion-item>
        <ion-button expand="block" fill="outline" class="ion-margin" (click)="saveApi()">
          {{ saved() ? 'Adresse enregistrée' : 'Enregistrer l’adresse' }}
        </ion-button>
      </ion-list>

      <ion-list>
        <ion-list-header><ion-label>À venir</ion-label></ion-list-header>
        <ion-item lines="none">
          <ion-note
            >Devise, rappels, export des données et suppression du compte arrivent dans une prochaine étape.</ion-note
          >
        </ion-item>
      </ion-list>

      <ion-button expand="block" color="danger" class="ion-margin" (click)="auth.logout()">Se déconnecter</ion-button>
    </ion-content>
  `,
})
export class ProfilePage {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  private readonly settings = inject(SettingsService);

  protected apiUrl = this.settings.apiUrl();
  protected readonly saved = signal(false);

  protected setTheme(choice: ThemeChoice): void {
    void this.theme.set(choice);
  }

  protected async saveApi(): Promise<void> {
    await this.settings.setApiUrl(this.apiUrl);
    this.apiUrl = this.settings.apiUrl();
    this.saved.set(true);
  }
}
