import { Injectable, inject } from '@angular/core';
import { ActionSheetController, ModalController, ToastController } from '@ionic/angular';

import { GoalFormComponent } from './goal-form.component';
import { TaskFormComponent } from './task-form.component';

/** Bouton « Ajouter » : création rapide depuis n'importe quel espace. */
@Injectable({ providedIn: 'root' })
export class AddMenuService {
  private readonly sheets = inject(ActionSheetController);
  private readonly modals = inject(ModalController);
  private readonly toasts = inject(ToastController);

  async open(onCreated: () => void): Promise<void> {
    const sheet = await this.sheets.create({
      header: 'Ajouter',
      buttons: [
        { text: 'Une tâche', data: 'task' },
        { text: 'Un objectif', data: 'goal' },
        { text: 'Une habitude (bientôt)', data: 'soon' },
        { text: 'Un événement (bientôt)', data: 'soon' },
        { text: 'Une dépense ou un revenu (bientôt)', data: 'soon' },
        { text: 'Fermer', role: 'cancel' },
      ],
    });
    await sheet.present();
    const { data } = await sheet.onWillDismiss<string>();
    if (data === 'task') await this.openTask({}, onCreated);
    if (data === 'goal') await this.openGoal(onCreated);
    if (data === 'soon') {
      const t = await this.toasts.create({ message: 'Disponible dans une prochaine version.', duration: 2500 });
      await t.present();
    }
  }

  async openTask(
    preset: {
      presetGoalId?: string | null;
      presetMilestoneId?: string | null;
      presetDate?: string | null;
      presetTitle?: string;
    },
    onCreated: () => void,
  ): Promise<void> {
    const modal = await this.modals.create({ component: TaskFormComponent, componentProps: preset });
    await modal.present();
    const { role } = await modal.onWillDismiss();
    if (role === 'saved') onCreated();
  }

  async openGoal(onCreated: () => void): Promise<void> {
    const modal = await this.modals.create({ component: GoalFormComponent });
    await modal.present();
    const { role } = await modal.onWillDismiss();
    if (role === 'saved') onCreated();
  }
}
