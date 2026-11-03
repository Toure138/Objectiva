import { describe, expect, it } from 'vitest';
import { dateOnly, todayIn } from '../../src/core/dates.ts';
import { milestoneProgress } from '../../src/modules/goals/goals.rules.ts';
import { periodRange, reviewTasks, type ReviewTask } from '../../src/modules/reviews/reviews.rules.ts';
import { applyWorkDateChange, taskFlags } from '../../src/modules/tasks/tasks.rules.ts';

describe('milestoneProgress', () => {
  it('reste indéterminée sans jalon', () => {
    expect(milestoneProgress([])).toMatchObject({ percent: null, label: 'Ajoute un premier jalon' });
  });
  it('compte les jalons terminés sur le total', () => {
    const p = milestoneProgress([{ completedAt: new Date() }, { completedAt: null }, { completedAt: null }]);
    expect(p).toMatchObject({ done: 1, total: 3, percent: 33, label: '1 jalon terminé sur 3' });
  });
});

describe('taskFlags', () => {
  const base = { status: 'TODO', workDate: null, dueDate: null, rescheduleCount: 0 };
  it('marque « à replanifier » une date de travail passée', () => {
    expect(taskFlags({ ...base, workDate: '2026-11-02' }, '2026-11-03').needsRescheduling).toBe(true);
  });
  it('marque « en retard » une échéance dépassée et ouverte', () => {
    expect(taskFlags({ ...base, dueDate: '2026-11-02' }, '2026-11-03').overdue).toBe(true);
  });
  it("n'alerte pas pour une tâche terminée", () => {
    const f = taskFlags({ ...base, status: 'DONE', workDate: '2026-11-01', dueDate: '2026-11-01' }, '2026-11-03');
    expect(f).toMatchObject({ needsRescheduling: false, overdue: false });
  });
  it('propose le découpage après 3 reports', () => {
    expect(taskFlags({ ...base, workDate: '2026-11-05', rescheduleCount: 3 }, '2026-11-03').suggestSplit).toBe(true);
  });
});

describe('applyWorkDateChange', () => {
  it("la première planification n'est pas un report", () => {
    const r = applyWorkDateChange({ workDate: null, originalDate: null, rescheduleCount: 0 }, '2026-11-05');
    expect(r).toEqual({ workDate: '2026-11-05', originalDate: '2026-11-05', rescheduleCount: 0, changed: true });
  });
  it('un report conserve la date initiale et incrémente le compteur', () => {
    const r = applyWorkDateChange({ workDate: '2026-11-05', originalDate: '2026-11-05', rescheduleCount: 0 }, '2026-11-07');
    expect(r).toEqual({ workDate: '2026-11-07', originalDate: '2026-11-05', rescheduleCount: 1, changed: true });
  });
  it('la même date ne compte pas comme un report (double appui)', () => {
    const r = applyWorkDateChange({ workDate: '2026-11-07', originalDate: '2026-11-05', rescheduleCount: 1 }, '2026-11-07');
    expect(r.changed).toBe(false);
    expect(r.rescheduleCount).toBe(1);
  });
  it('remettre dans « À planifier » est un report', () => {
    const r = applyWorkDateChange({ workDate: '2026-11-05', originalDate: '2026-11-05', rescheduleCount: 0 }, null);
    expect(r).toMatchObject({ workDate: null, originalDate: '2026-11-05', rescheduleCount: 1 });
  });
});

describe('reviewTasks', () => {
  const t = (o: Partial<ReviewTask>): ReviewTask => ({
    status: 'TODO',
    workDate: '2026-11-03',
    originalDate: '2026-11-03',
    createdDate: '2026-11-01',
    ...o,
  });

  it("n'a pas de taux sur une période sans action attendue", () => {
    expect(reviewTasks([], '2026-11-03', '2026-11-03').executionRate).toBeNull();
  });

  it('exclut les annulées du dénominateur mais les compte à part', () => {
    const r = reviewTasks([t({ status: 'DONE' }), t({ status: 'CANCELLED' }), t({})], '2026-11-03', '2026-11-03');
    expect(r).toMatchObject({ expected: 2, done: 1, pending: 1, cancelled: 1 });
    expect(r.executionRate).toEqual({ numerator: 1, denominator: 2, percent: 50 });
  });

  it('une période uniquement annulée n’a pas de taux', () => {
    const r = reviewTasks([t({ status: 'CANCELLED' })], '2026-11-03', '2026-11-03');
    expect(r.executionRate).toBeNull();
    expect(r.cancelled).toBe(1);
  });

  it('compte comme reportée une tâche déplacée hors de la période', () => {
    const r = reviewTasks([t({ workDate: '2026-11-10', originalDate: '2026-11-03' })], '2026-11-03', '2026-11-03');
    expect(r).toMatchObject({ expected: 1, rescheduledOut: 1, done: 0 });
  });

  it('distingue prévu au début et ajouté pendant la période', () => {
    const r = reviewTasks([t({ createdDate: '2026-10-30' }), t({ createdDate: '2026-11-03' })], '2026-11-03', '2026-11-09');
    expect(r).toMatchObject({ plannedAtStart: 1, addedDuringPeriod: 1 });
  });
});

describe('periodRange', () => {
  it('semaine du lundi au dimanche', () => {
    expect(periodRange('week', '2026-11-05')).toEqual({ from: '2026-11-02', to: '2026-11-08' });
  });
  it('mois complet, février compris', () => {
    expect(periodRange('month', '2027-02-14')).toEqual({ from: '2027-02-01', to: '2027-02-28' });
  });
});

describe('dates', () => {
  it('refuse une date inexistante', () => {
    expect(dateOnly.safeParse('2026-02-30').success).toBe(false);
    expect(dateOnly.safeParse('2026-11-03').success).toBe(true);
  });
  it('calcule le jour local selon le fuseau', () => {
    const instant = new Date('2026-11-03T23:30:00Z');
    expect(todayIn('Africa/Abidjan', instant)).toBe('2026-11-03');
    expect(todayIn('Europe/Paris', instant)).toBe('2026-11-04');
  });
});
