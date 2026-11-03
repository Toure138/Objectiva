import { Injectable, inject } from '@angular/core';
import { ActionSheetController, AlertController, ToastController } from '@ionic/angular';

import { ApiService } from '../core/api.service';
import { addDays, localToday } from '../core/dates';
import type { Task } from '../core/models';

/** Actions sur une tâche, avec confirmation visuelle et « Annuler » en cas d'erreur. */
@Injectable({ providedIn: 'root' })
export class TaskActionsService {
  private readonly api = inject(ApiService);
  private readonly toasts = inject(ToastController);
  private readonly sheets = inject(ActionSheetController);
  private readonly alerts = inject(AlertController);

  async toggle(task: Task, onChange: () => void): Promise<void> {
    if (task.status === 'DONE') {
      await this.run(() => this.api.reopenTask(task.id), 'Tâche remise à faire', onChange);
      return;
    }
    await this.run(
      () => this.api.completeTask(task.id),
      'Bravo, tâche terminée !',
      onChange,
      () => this.api.reopenTask(task.id),
    );
  }

  /** Propose les options de report ; renvoie quand l'action est terminée. */
  async reschedule(task: Task, onChange: () => void): Promise<void> {
    const today = localToday();
    const sheet = await this.sheets.create({
      header: task.suggestSplit
        ? `Reportée ${task.rescheduleCount} fois : et si tu la découpais en étapes plus petites ?`
        : 'Que faire de cette tâche ?',
      buttons: [
        { text: 'Aujourd’hui', data: today },
        { text: 'Demain', data: addDays(today, 1) },
        { text: 'Choisir une date…', data: 'pick' },
        { text: 'Remettre dans « À planifier »', data: 'unschedule' },
        { text: 'Annuler la tâche', role: 'destructive', data: 'cancel' },
        { text: 'Fermer', role: 'cancel' },
      ],
    });
    await sheet.present();
    const { data } = await sheet.onWillDismiss<string>();
    if (!data) return;

    if (data === 'cancel') {
      await this.run(
        () => this.api.cancelTask(task.id),
        'Tâche annulée',
        onChange,
        () => this.api.reopenTask(task.id),
      );
      return;
    }
    if (data === 'unschedule') {
      await this.run(() => this.api.rescheduleTask(task.id, null), 'Tâche remise à planifier', onChange);
      return;
    }
    const date = data === 'pick' ? await this.pickDate(task.workDate ?? today) : data;
    if (date) {
      await this.run(() => this.api.rescheduleTask(task.id, date), 'Tâche replanifiée', onChange);
    }
  }

  async pickDate(initial: string): Promise<string | null> {
    const alert = await this.alerts.create({
      header: 'Nouvelle date',
      inputs: [{ name: 'date', type: 'date', value: initial, attributes: { 'aria-label': 'Date' } }],
      buttons: [
        { text: 'Fermer', role: 'cancel' },
        { text: 'Valider', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role, data } = await alert.onWillDismiss<{ values: { date: string } }>();
    return role === 'confirm' && data?.values.date ? data.values.date : null;
  }

  private async run(
    action: () => Promise<unknown>,
    message: string,
    onChange: () => void,
    undo?: () => Promise<unknown>,
  ) {
    try {
      await action();
      onChange();
      await this.toast(message, undo ? { undo, onChange } : undefined);
    } catch (e) {
      await this.toast(e instanceof Error ? e.message : 'Échec de l’enregistrement', undefined, 'danger');
    }
  }

  private async toast(message: string, undo?: { undo: () => Promise<unknown>; onChange: () => void }, color?: string) {
    const t = await this.toasts.create({
      message,
      duration: undo ? 5000 : 2500,
      // En haut : en bas, le bouton « + » et la barre d'onglets masqueraient « Annuler ».
      position: 'top',
      color,
      buttons: undo
        ? [
            {
              text: 'Annuler',
              handler: () => {
                void undo.undo().then(undo.onChange);
              },
            },
          ]
        : [],
    });
    await t.present();
  }
}
