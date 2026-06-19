import { PrismaClient } from '@prisma/client';

let _prisma: PrismaClient | null = null;

export function prisma() {
  if (_prisma) return _prisma;
  _prisma = new PrismaClient();
  return _prisma;
}

/**
 * Minimal raw SQL helpers using Prisma's query engine.
 * This keeps the rest of the code working while we progressively move to
 * fully model-based Prisma queries.
 */
export async function query<T = any>(text: string, params: any[] = []): Promise<{ rows: T[] }> {
  // $queryRawUnsafe supports positional params for Postgres ($1, $2, ...)
  const rows = (await prisma().$queryRawUnsafe(text, ...params)) as T[];
  return { rows };
}

export async function one<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const r = await query<T>(text, params);
  return r.rows[0] ?? null;
}

export async function many<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const r = await query<T>(text, params);
  return r.rows;
}

/**
 * Prisma migrations should be run via `prisma migrate deploy`.
 * This helper is kept so server startup can validate connectivity.
 */
export async function migrate(): Promise<void> {
  await prisma().$queryRaw`SELECT 1`;
}

