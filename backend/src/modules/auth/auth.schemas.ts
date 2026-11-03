import { z } from 'zod';
import { isValidTimezone } from '../../core/dates.ts';

const email = z.string().trim().toLowerCase().email('Adresse e-mail invalide').max(254);

export const registerSchema = z.object({
  email,
  password: z.string().min(8, 'Au moins 8 caractères').max(128, '128 caractères maximum'),
  displayName: z.string().trim().min(1, 'Indique ton prénom').max(80),
  timezone: z.string().refine(isValidTimezone, 'Fuseau horaire inconnu').optional(),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Mot de passe requis').max(128),
});

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  timezone: z.string().refine(isValidTimezone, 'Fuseau horaire inconnu').optional(),
});
