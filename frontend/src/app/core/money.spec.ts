import { describe, expect, it } from 'vitest';

import { formatMoney, formatSigned, fractionDigits, parseMoney, toInputValue } from './money';

// Intl insère des espaces insécables : on les normalise pour comparer.
const flat = (s: string) => s.replace(/[\s\u00a0\u202f]+/g, ' ');

describe('money', () => {
  it('connaît le nombre de décimales de chaque devise', () => {
    expect(fractionDigits('XOF')).toBe(0);
    expect(fractionDigits('EUR')).toBe(2);
  });

  it('formate les francs CFA sans décimale et les euros avec centimes', () => {
    expect(flat(formatMoney(15_000, 'XOF'))).toBe('15 000 F CFA');
    expect(flat(formatMoney(1_250, 'EUR'))).toBe('12,50 €');
    expect(flat(formatMoney(0, 'XOF'))).toBe('0 F CFA');
  });

  it('affiche un signe explicite pour les entrées et les sorties', () => {
    expect(flat(formatSigned(15_000, 'XOF', true))).toBe('+ 15 000 F CFA');
    expect(flat(formatSigned(15_000, 'XOF', false))).toBe('− 15 000 F CFA');
  });

  it('lit une saisie en entier, sans flottant', () => {
    expect(parseMoney('15000', 'XOF')).toBe(15_000);
    expect(parseMoney('15 000', 'XOF')).toBe(15_000);
    expect(parseMoney('15\u00a0000', 'XOF')).toBe(15_000);
    expect(parseMoney('12,5', 'EUR')).toBe(1_250);
    expect(parseMoney('12.50', 'EUR')).toBe(1_250);
    expect(parseMoney('0,07', 'EUR')).toBe(7);
    expect(parseMoney('19,99', 'EUR')).toBe(1_999);
  });

  it('refuse ce qui n’est pas un montant exact pour la devise', () => {
    expect(parseMoney('', 'XOF')).toBeNull();
    expect(parseMoney('abc', 'XOF')).toBeNull();
    expect(parseMoney('-5', 'XOF')).toBeNull();
    expect(parseMoney('1,5', 'XOF')).toBeNull(); // pas de décimale en francs CFA
    expect(parseMoney('12,505', 'EUR')).toBeNull(); // pas d'arrondi silencieux
    expect(parseMoney('1e3', 'XOF')).toBeNull();
    expect(parseMoney('99999999999999999999', 'XOF')).toBeNull();
  });

  it('remet un montant dans un champ de saisie', () => {
    expect(toInputValue(15_000, 'XOF')).toBe('15000');
    expect(toInputValue(1_250, 'EUR')).toBe('12,50');
    expect(toInputValue(5, 'EUR')).toBe('0,05');
    expect(parseMoney(toInputValue(1_999, 'EUR'), 'EUR')).toBe(1_999);
  });
});
