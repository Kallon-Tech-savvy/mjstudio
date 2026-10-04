import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const normalizeUrl = (value: unknown) => {
  if (typeof value !== 'string' || value.trim() === '') {
    return value;
  }

  return new URL(value).toString();
};

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.preprocess(normalizeUrl, z.string().url().optional()),
  APP_BASE_URL: z.preprocess(normalizeUrl, z.string().url().optional()),
  FRONTEND_ORIGINS: z.string().default(''),
  SESSION_SECRET: z.string().min(32).optional(),
});

export const env = envSchema.parse(process.env);

export const isProduction = env.NODE_ENV === 'production';
