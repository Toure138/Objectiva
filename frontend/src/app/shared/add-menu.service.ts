import { Injectable, inject } from '@angular/core';
import { ModalController } from '@ionic/angular';

import { AddSheetComponent, type AddChoice } from './add-sheet.component';
import { GoalFormComponent } from './goal-form.component';
import { TaskFormComponent } from './task-form.component';

/** Bouton « Ajouter » : création rapide depuis n'importe quel espace. */
@Injectable({ providedIn: 'root' })
export class AddMenuService {
  private readonly modals = inject(ModalController);

  async open(onCreated: () => void): Promise<void> {
    const sheet = await this.modals.create({
      component: AddSheetComponent,
      cssClass: 'ob-sheet',
      breakpoints: [0, 0.5],
      initialBreakpoint: 0.5,
      handle: true,
    });
    await sheet.present();
    const { data, role } = await sheet.onWillDismiss<AddChoice>();
    if (role !== 'choice') return;
    if (data === 'task') await this.openTask({}, onCreated);
    if (data === 'goal') await this.openGoal(onCreated);
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
