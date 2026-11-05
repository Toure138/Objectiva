import { Component, effect, inject, untracked } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';

import { AuthService } from './core/auth.service';
import { RemindersService } from './core/reminders.service';
import { OfflineService } from './offline/offline.service';
import { SyncService } from './offline/sync.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  private readonly reminders = inject(RemindersService);

  constructor() {
    const auth = inject(AuthService);
    const offline = inject(OfflineService);
    const sync = inject(SyncService);
    void this.reminders.init();
    // Rappels (spec 011) : reprogrammés après une connexion, une modification locale ou une synchronisation.
    effect(() => {
      auth.isLoggedIn();
      offline.ready();
      offline.pending();
      sync.lastSyncAt();
      untracked(() => this.reminders.request());
    });
    // Retour au premier plan : l'autorisation a pu changer dans les réglages, et la journée a pu avancer.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      void this.reminders.refreshStatus();
      this.reminders.request();
    });
  }
}
