// Montants : le serveur manipule des entiers dans la plus petite unité de la devise
// (XOF : 1 franc, EUR : 1 centime). Ici on ne fait que formater et lire la saisie : aucun calcul métier.

const LOCALE = 'fr-FR';

/** Nombre de décimales de la devise (XOF : 0, EUR : 2). */
export function fractionDigits(currency: string): number {
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

/** « 15 000 F CFA », « 12,50 € ». */
export function formatMoney(minor: number, currency: string): string {
  const digits = fractionDigits(currency);
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(minor / 10 ** digits);
}

/** Idem avec un signe explicite pour une entrée (+) ou une sortie (−) : le sens n'est jamais porté par la seule couleur. */
export function formatSigned(minor: number, currency: string, income: boolean): string {
  return `${income ? '+' : '−'}\u202f${formatMoney(Math.abs(minor), currency)}`;
}

/**
 * Lit un montant saisi (« 15 000 », « 15000 », « 12,5 ») et le convertit en entier dans la plus petite
 * unité, sans passer par un flottant. `null` si la saisie n'est pas un montant valide pour la devise.
 */
export function parseMoney(input: string, currency: string): number | null {
  const clean = input.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(clean)) return null;
  const digits = fractionDigits(currency);
  const [whole = '0', fraction = ''] = clean.split('.');
  if (fraction.length > digits) return null;
  const minor = Number(whole + fraction.padEnd(digits, '0'));
  return Number.isSafeInteger(minor) ? minor : null;
}

/** Montant à remettre dans un champ de saisie (sans séparateur de milliers). */
export function toInputValue(minor: number, currency: string): string {
  const digits = fractionDigits(currency);
  if (digits === 0) return String(minor);
  const sign = minor < 0 ? '-' : '';
  const abs = String(Math.abs(minor)).padStart(digits + 1, '0');
  return `${sign}${abs.slice(0, -digits)},${abs.slice(-digits)}`;
}

/** Symbole de la devise (« F CFA », « € »), pour l'afficher à côté d'un champ de saisie. */
export function currencySymbol(currency: string): string {
  return (
    new Intl.NumberFormat(LOCALE, { style: 'currency', currency }).formatToParts(0).find((p) => p.type === 'currency')
      ?.value ?? currency
  );
}

/** Nouvelle clé d'idempotence : une par ouverture de formulaire, rejouée telle quelle en cas de nouvel essai. */
export function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
