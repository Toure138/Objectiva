import { addDays, localToday, longDate, relativeDay } from './dates';

describe('dates', () => {
  it('ajoute des jours sans dérive de fuseau, y compris en fin de mois', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
  });

  it('formate le jour local en AAAA-MM-JJ', () => {
    expect(localToday(new Date(2026, 10, 3, 23, 30))).toBe('2026-11-03');
  });

  it('affiche des libellés relatifs en français', () => {
    const today = '2026-11-03';
    expect(relativeDay(today, today)).toBe("Aujourd'hui");
    expect(relativeDay('2026-11-04', today)).toBe('Demain');
    expect(relativeDay('2026-11-02', today)).toBe('Hier');
    expect(relativeDay(null, today)).toBe('À planifier');
  });

  it('affiche la date longue avec une majuscule', () => {
    expect(longDate('2026-11-06')).toBe('Vendredi 6 novembre');
  });
});
