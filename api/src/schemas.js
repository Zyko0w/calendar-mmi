import { z } from 'zod';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const TYPES = ['cours', 'sae', 'rendu', 'eval', 'stage', 'perso'];

export const eventSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_.:-]{1,80}$/, 'identifiant invalide'),
  title: z.string().trim().min(1).max(120),
  type: z.enum(TYPES),
  date: z.string().regex(DATE),
  start: z.string().regex(TIME),
  end: z.string().regex(TIME),
  location: z.string().max(80).default(''),
  notes: z.string().max(1000).default(''),
  alarm: z.number().int().min(0).max(10080).nullable().default(null),
  alarms: z.array(z.number().int().min(0).max(10080)).max(4).default([]),
  repeat: z.enum(['none', 'weekly']).default('none'),
  until: z.union([z.string().regex(DATE), z.literal('')]).default(''),
  skip: z.array(z.string().regex(DATE)).max(300).default([]),
  done: z.boolean().default(false),
  updatedAt: z.number().int().positive(),
});

/** Champs qu'un étudiant peut changer sur un cours importé d'Hyperplanning. */
export const hpPatchSchema = z.object({
  notes: z.string().max(1000).optional(),
  alarm: z.number().int().min(0).max(10080).nullable().optional(),
  alarms: z.array(z.number().int().min(0).max(10080)).max(4).optional(),
  done: z.boolean().optional(),
  updatedAt: z.number().int().positive(),
});

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8, 'Le mot de passe doit faire au moins 8 caractères.').max(200),
});

export const twoFactorCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{3}\s?\d{3}$/).transform((c) => c.replace(/\s/g, '')),
});

/** Désactivation : mot de passe, et code d'appli ou code de secours. */
export const twoFactorDisableSchema = z.object({
  password: z.string().min(1).max(200),
  code: z.string().trim().min(6).max(20),
});

export const hpUrlSchema = z.object({
  url: z.union([z.string().trim().max(2000), z.null()]),
});

/** Alarmes appliquées à tous les cours importés d'Hyperplanning (et aux prochains imports). */
export const hpAlarmsSchema = z.object({
  alarms: z.array(z.number().int().min(0).max(10080)).max(4),
});

/** Alarmes par défaut d'un étudiant pour ses cours Hyperplanning, triées du plus tôt au plus tard. */
export const normAlarms = (a) => [...new Set(Array.isArray(a) ? a : [10])].sort((x, y) => y - x).slice(0, 4);

export function issues(err) {
  return err.issues?.map((i) => `${i.path.join('.') || 'corps'} : ${i.message}`).join(' ; ') || 'Requête invalide.';
}
