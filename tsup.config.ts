import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    external: ['better-sqlite3', 'seekdb', 'commander', /^@langchain\//, /^@seekdb\//],
  },
  {
    entry: { cli: 'src/cli/main.ts' },
    format: ['esm'],
    banner: { js: '#!/usr/bin/env node' },
    clean: false,
    sourcemap: true,
    external: ['better-sqlite3', 'seekdb', 'commander', /^@langchain\//, /^@seekdb\//],
  },
]);
