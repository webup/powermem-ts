/**
 * Settings utilities — env file resolution.
 * Port of Python powermem/settings.py.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Resolve the default .env file path by checking common locations. */
export function getDefaultEnvFile(): string | undefined {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '..', '..', '.env'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}
