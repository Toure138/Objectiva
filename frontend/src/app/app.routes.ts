import type { Routes } from '@angular/router';

import { authGuard, guestGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'connexion',
    canActivate: [guestGuard],
    loadComponent: () => import('./auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () => import('./tabs/tabs.page').then((m) => m.TabsPage),
    children: [
      { path: 'aujourdhui', loadComponent: () => import('./today/today.page').then((m) => m.TodayPage) },
      { path: 'planifier', loadComponent: () => import('./plan/plan.page').then((m) => m.PlanPage) },
      { path: 'objectifs', loadComponent: () => import('./goals/goals.page').then((m) => m.GoalsPage) },
      { path: 'objectifs/:id', loadComponent: () => import('./goals/goal-detail.page').then((m) => m.GoalDetailPage) },
      { path: 'budget', loadComponent: () => import('./budget/budget.page').then((m) => m.BudgetPage) },
      { path: 'bilan', loadComponent: () => import('./review/review.page').then((m) => m.ReviewPage) },
      { path: '', redirectTo: 'aujourdhui', pathMatch: 'full' },
    ],
  },
  {
    path: 'profil',
    canActivate: [authGuard],
    loadComponent: () => import('./profile/profile.page').then((m) => m.ProfilePage),
  },
  { path: '', redirectTo: 'app/aujourdhui', pathMatch: 'full' },
  { path: '**', redirectTo: 'app/aujourdhui' },
];
