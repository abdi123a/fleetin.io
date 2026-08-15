import { z } from 'zod';

/**
 * Environment contract.
 *
 * This schema is the single gate every secret passes through. Two rules hold
 * across the codebase and are enforced here rather than by convention:
 *
 *  1. No secret has a default. If `JWT_SECRET` is missing the process refuses
 *     to boot — it does not fall back to a literal baked into source. A
 *     fallback secret is a published secret, and it fails silently in exactly
 *     the deployment where it matters.
 *  2. Anything reachable via `ConfigService` has been validated first, so
 *     consumers never re-check and never supply their own fallback.
 */
export const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    API_PREFIX: z.string().default('api/v1'),

    DATABASE_URL: z.string().url(),

    /* 32 chars is the floor for an HS256 signing key: below the 256-bit hash
     * width the secret, not the algorithm, becomes the weakest link. */
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_SECRET: z
      .string()
      .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

    REDIS_HOST: z.string().default('localhost'),
    REDIS_PORT: z.coerce.number().int().positive().default(6379),
    /* Empty string means "no auth", which is normal for a local Redis. */
    REDIS_PASSWORD: z.string().optional(),

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_PATH: z.string().default('./uploads'),
    S3_REGION: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    /* Set for S3-compatible providers (R2, MinIO, Spaces); omit for AWS. */
    S3_ENDPOINT: z.string().optional(),

    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default('FLEETIN System <noreply@fleetin.com>'),
  })
  /* Reusing one secret for both token types collapses the access/refresh
   * distinction: an access token would verify against the refresh secret and
   * vice versa, so a leaked short-lived token could be replayed as a
   * long-lived one. */
  .refine((env) => env.JWT_SECRET !== env.JWT_REFRESH_SECRET, {
    message: 'JWT_SECRET and JWT_REFRESH_SECRET must be different values',
    path: ['JWT_REFRESH_SECRET'],
  })
  /* The S3 block is only required once the driver actually selects it — this
   * keeps local development free of cloud credentials while still failing at
   * boot (not at first upload) in a deployment that means to use S3. */
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER !== 's3') return;

    const required = [
      'S3_REGION',
      'S3_BUCKET',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
    ] as const;

    for (const key of required) {
      if (!env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${key} is required when STORAGE_DRIVER is "s3"`,
          path: [key],
        });
      }
    }
  });

export type EnvironmentConfig = z.infer<typeof environmentSchema>;

export function validateEnvironment(config: Record<string, unknown>) {
  const result = environmentSchema.safeParse(config);

  if (!result.success) {
    /* Printed before the Nest logger exists, so this uses console directly.
     * Only the failing keys and reasons are shown — never the values. */
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `Invalid environment configuration:\n${issues}\n\n` +
        'See .env.example for the required variables.',
    );
  }

  return result.data;
}
