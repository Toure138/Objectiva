import { Component, computed, inject } from '@angular/core';
import { AlertController, IonIcon } from '@ionic/angular';
import {
  alertCircleOutline,
  arrowUpCircleOutline,
  cloudDoneOutline,
  cloudOfflineOutline,
  cloudUploadOutline,
  lockClosedOutline,
  syncOutline,
} from 'ionicons/icons';

import { OfflineService } from '../offline/offline.service';
import { SyncService } from '../offline/sync.service';

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/**
 * Pastille d'état de la synchronisation : toujours un libellé et une icône (jamais la couleur seule).
 * Hors connexion n'est jamais une erreur : tout continue sur le téléphone.
 */
@Component({
  selector: 'app-sync-status',
  imports: [IonIcon],
  styles: `
    :host {
      display: inline-flex;
    }
    button {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-width: 44px;
      min-height: 44px;
      padding: 0 8px;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: var(--ob-text-2);
      font: inherit;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    button.warn {
      color: var(--ob-warn-ink);
    }
    ion-icon {
      font-size: 20px;
    }
    .spin {
      animation: spin 1.2s linear infinite;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  `,
  template: `
    @if (visible()) {
      <button type="button" [class.warn]="warn()" (click)="details()" [attr.aria-label]="label()">
        <ion-icon [icon]="icon()" [class.spin]="syncing()" aria-hidden="true"></ion-icon>
        @if (text()) {
          <span>{{ text() }}</span>
        }
      </button>
    }
  `,
})
export class SyncStatusComponent {
  private readonly sync = inject(SyncService);
  private readonly offline = inject(OfflineService);
  private readonly alerts = inject(AlertController);

  protected readonly visible = computed(() => this.offline.current !== null || this.sync.state() !== 'idle');
  protected readonly syncing = computed(() => this.sync.state() === 'syncing');
  protected readonly warn = computed(
    () => ['auth', 'upgrade', 'error'].includes(this.sync.state()) || this.sync.rejections().length > 0,
  );

  protected readonly icon = computed(() => {
    switch (this.sync.state()) {
      case 'syncing':
        return syncOutline;
      case 'offline':
        return cloudOfflineOutline;
      case 'auth':
        return lockClosedOutline;
      case 'upgrade':
        return arrowUpCircleOutline;
      case 'error':
        return alertCircleOutline;
      default:
        return this.sync.pending() > 0 ? cloudUploadOutline : cloudDoneOutline;
    }
  });

  protected readonly text = computed(() => {
    const pending = this.sync.pending();
    switch (this.sync.state()) {
      case 'syncing':
        return this.offline.ready() ? '' : 'Préparation de tes données…';
      case 'offline':
        return pending > 0 ? `Hors ligne · ${pending}` : 'Hors ligne';
      case 'auth':
        return 'Reconnecte-toi';
      case 'upgrade':
        return 'Mise à jour';
      case 'error':
        return 'Synchro en pause';
      default:
        return pending > 0 ? `${pending} en attente` : '';
    }
  });

  protected readonly label = computed(() => {
    const base = this.text() || (this.sync.state() === 'syncing' ? 'Synchronisation en cours' : 'Synchronisé');
    return `${base}. Ouvrir les détails de la synchronisation.`;
  });

  protected async details(): Promise<void> {
    const pending = this.sync.pending();
    const refused = this.sync.rejections();
    const last = this.sync.lastSyncAt();
    const lines: string[] = [];
    switch (this.sync.state()) {
      case 'offline':
        lines.push('Pas de connexion au serveur : tout continue sur ton téléphone et sera envoyé au retour du réseau.');
        break;
      case 'auth':
        lines.push(
          'Ta session a expiré. Reconnecte-toi pour reprendre la synchronisation : tes données restent sur ce téléphone.',
          'Si le serveur a été remplacé et ne reconnaît plus ton compte, recrée-le avec le même e-mail : les données de ce téléphone y seront renvoyées.',
        );
        break;
      case 'upgrade':
        lines.push(
          'Cette version de l’application est trop ancienne pour se synchroniser. Mets-la à jour : tes données restent sur ce téléphone.',
        );
        break;
      case 'error':
        lines.push(this.sync.lastError() ?? 'La synchronisation est en pause. Tes données restent sur ce téléphone.');
        break;
      default:
        lines.push(this.offline.ready() ? 'Tout est synchronisé avec le serveur.' : 'Récupération de tes données…');
    }
    if (pending > 0) lines.push(`${plural(pending, 'modification en attente', 'modifications en attente')} d’envoi.`);
    const reseeded = this.sync.reseededAt();
    if (reseeded)
      lines.push(
        `Le serveur avait été remplacé : les données de ce téléphone y ont été renvoyées le ${new Date(reseeded).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}.`,
      );
    if (last)
      lines.push(
        `Dernière synchronisation : ${new Date(last).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}.`,
      );
    if (refused.length > 0) {
      lines.push(
        `${plural(refused.length, 'modification refusée', 'modifications refusées')} par le serveur : « ${refused[refused.length - 1]!.message} »`,
      );
    }
    const alert = await this.alerts.create({
      header: 'Synchronisation',
      message: lines.join(' '),
      buttons: [
        ...(refused.length > 0 ? [{ text: 'Effacer les refus', role: 'clear' }] : []),
        { text: 'Synchroniser', role: 'sync' },
        { text: 'Fermer', role: 'cancel' },
      ],
    });
    await alert.present();
    const { role } = await alert.onWillDismiss();
    if (role === 'sync') await this.sync.syncNow();
    if (role === 'clear') {
      await this.offline.current?.clearRejections();
      await this.offline.refresh();
    }
  }
}
