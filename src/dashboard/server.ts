#!/usr/bin/env node
/**
 * PowerMem Dashboard — Express server with full REST API.
 * Modular architecture matching Python FastAPI edition.
 */
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Memory } from '../core/memory.js';
import type { Embeddings } from '@langchain/core/embeddings';
import { VERSION } from '../version.js';
import { loadServerConfig, type ServerConfig } from './config.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { createRateLimitMiddleware } from './middleware/rate-limit.js';
import { createMetricsMiddleware } from './middleware/metrics.js';
import { createSystemRouter } from './routers/system.js';
import { createMemoriesRouter } from './routers/memories.js';
import { createAgentsRouter } from './routers/agents.js';
import { createUsersRouter } from './routers/users.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface DashboardServerOptions {
  port?: number;
  dbPath?: string;
  embeddings?: Embeddings;
  memory?: Memory;
  config?: Partial<ServerConfig>;
}

export async function createDashboardServer(options: DashboardServerOptions = {}) {
  const app = express();
  const config = { ...loadServerConfig(), ...options.config };

  app.use(express.json({ limit: '10mb' }));

  // ─── CORS ──────────────────────────────────────────────────────────
  if (config.corsEnabled) {
    app.use((_req, res, next) => {
      res.set('Access-Control-Allow-Origin', config.corsOrigins);
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
      if (_req.method === 'OPTIONS') { res.sendStatus(204); return; }
      next();
    });
  }

  // ─── Middleware ─────────────────────────────────────────────────────
  app.use(createMetricsMiddleware());
  app.use(createAuthMiddleware(config));
  app.use(createRateLimitMiddleware(config));

  // ─── Memory instance ──────────────────────────────────────────────
  const memory = options.memory ?? await Memory.create({
    dbPath: options.dbPath ?? ':memory:',
    embeddings: options.embeddings,
  });
  const startTime = Date.now();

  // ─── Routers ───────────────────────────────────────────────────────
  app.use('/api/v1/system', createSystemRouter(memory, startTime));
  app.use('/api/v1/memories', createMemoriesRouter(memory));
  app.use('/api/v1/agents', createAgentsRouter(memory));
  app.use('/api/v1/users', createUsersRouter(memory));

  // ─── OpenAPI / Docs ────────────────────────────────────────────────
  app.get('/openapi.json', (_req, res) => {
    res.json({
      openapi: '3.0.3',
      info: { title: 'PowerMem API', version: VERSION, description: 'PowerMem TypeScript REST API' },
      servers: [{ url: '/api/v1' }],
      paths: {
        '/system/health': { get: { summary: 'Health check', tags: ['system'], responses: { '200': { description: 'OK' } } } },
        '/system/status': { get: { summary: 'System status', tags: ['system'], responses: { '200': { description: 'Status info' } } } },
        '/system/metrics': { get: { summary: 'Prometheus metrics', tags: ['system'], responses: { '200': { description: 'Prometheus text' } } } },
        '/memories': {
          get: { summary: 'List memories', tags: ['memories'], parameters: [
            { name: 'user_id', in: 'query', schema: { type: 'string' } },
            { name: 'agent_id', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          ], responses: { '200': { description: 'Memory list' } } },
          post: { summary: 'Create memory', tags: ['memories'], responses: { '200': { description: 'Created' } } },
          delete: { summary: 'Delete all memories', tags: ['memories'], responses: { '200': { description: 'Deleted' } } },
        },
        '/memories/{id}': {
          get: { summary: 'Get memory by ID', tags: ['memories'], responses: { '200': { description: 'Memory' }, '404': { description: 'Not found' } } },
          put: { summary: 'Update memory', tags: ['memories'], responses: { '200': { description: 'Updated' } } },
          delete: { summary: 'Delete memory', tags: ['memories'], responses: { '200': { description: 'Deleted' } } },
        },
        '/memories/search': {
          get: { summary: 'Search via query params', tags: ['memories'], responses: { '200': { description: 'Results' } } },
          post: { summary: 'Search via body', tags: ['memories'], responses: { '200': { description: 'Results' } } },
        },
        '/memories/batch': {
          post: { summary: 'Batch create', tags: ['memories'], responses: { '200': { description: 'Created' } } },
          put: { summary: 'Batch update', tags: ['memories'], responses: { '200': { description: 'Updated' } } },
          delete: { summary: 'Batch delete', tags: ['memories'], responses: { '200': { description: 'Deleted' } } },
        },
        '/memories/stats': { get: { summary: 'Memory statistics', tags: ['memories'], responses: { '200': { description: 'Stats' } } } },
        '/memories/count': { get: { summary: 'Memory count', tags: ['memories'], responses: { '200': { description: 'Count' } } } },
        '/memories/users': { get: { summary: 'Unique users', tags: ['memories'], responses: { '200': { description: 'Users' } } } },
        '/memories/export': { get: { summary: 'Export memories', tags: ['memories'], responses: { '200': { description: 'Export' } } } },
        '/memories/import': { post: { summary: 'Import memories', tags: ['memories'], responses: { '200': { description: 'Import result' } } } },
        '/agents/{agentId}/memories': {
          get: { summary: 'List agent memories', tags: ['agents'], responses: { '200': { description: 'Memories' } } },
          post: { summary: 'Add agent memory', tags: ['agents'], responses: { '200': { description: 'Created' } } },
        },
        '/agents/{agentId}/memories/share': {
          get: { summary: 'Get shared memories', tags: ['agents'], responses: { '200': { description: 'Shared' } } },
          post: { summary: 'Share memories', tags: ['agents'], responses: { '200': { description: 'Shared count' } } },
        },
        '/users/profiles': { get: { summary: 'List user profiles', tags: ['users'], responses: { '200': { description: 'Profiles' } } } },
        '/users/{userId}/profile': {
          get: { summary: 'Get user profile', tags: ['users'], responses: { '200': { description: 'Profile' } } },
          post: { summary: 'Extract profile', tags: ['users'], responses: { '200': { description: 'Extraction result' } } },
          delete: { summary: 'Delete profile', tags: ['users'], responses: { '200': { description: 'Deleted' } } },
        },
        '/users/{userId}/memories': {
          get: { summary: 'List user memories', tags: ['users'], responses: { '200': { description: 'Memories' } } },
          delete: { summary: 'Delete user memories', tags: ['users'], responses: { '200': { description: 'Deleted' } } },
        },
        '/users/{userId}/memories/{memoryId}': {
          put: { summary: 'Update user memory', tags: ['users'], responses: { '200': { description: 'Updated' } } },
        },
      },
      components: {
        securitySchemes: {
          ApiKeyHeader: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
          ApiKeyQuery: { type: 'apiKey', in: 'query', name: 'api_key' },
        },
      },
    });
  });

  app.get('/docs', (_req, res) => {
    res.send(`<!DOCTYPE html><html><head><title>PowerMem API Docs</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head><body><div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({ url: '/openapi.json', dom_id: '#swagger-ui' })</script>
</body></html>`);
  });

  // ─── Dashboard HTML ────────────────────────────────────────────────
  const publicDir = path.join(__dirname, 'public');
  app.get('/dashboard', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
  app.use('/dashboard', express.static(publicDir));

  // ─── Root ──────────────────────────────────────────────────────────
  app.get('/', (_req, res) => {
    res.json({
      name: 'PowerMem TS',
      version: VERSION,
      dashboard: '/dashboard/',
      api: '/api/v1/',
      docs: '/docs',
      openapi: '/openapi.json',
    });
  });

  app.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send('User-agent: *\nDisallow: /\n');
  });

  return { app, memory };
}

// CLI entry: npx tsx src/dashboard/server.ts
if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  const config = loadServerConfig();

  let embeddings: Embeddings | undefined;
  try {
    const { OllamaEmbeddings } = await import('@langchain/ollama');
    embeddings = new OllamaEmbeddings({ model: 'nomic-embed-text', baseUrl: 'http://localhost:11434' });
  } catch {
    const { Embeddings: EmbBase } = await import('@langchain/core/embeddings');
    class DemoEmbeddings extends EmbBase {
      async embedQuery(text: string) { return Array.from({ length: 8 }, (_, i) => text.charCodeAt(i % text.length) / 256); }
      async embedDocuments(docs: string[]) { return docs.map(d => this.embedQuery(d) as any); }
    }
    embeddings = new DemoEmbeddings({});
  }

  createDashboardServer({ dbPath: process.env.DB_PATH, embeddings }).then(({ app }) => {
    app.listen(config.port, config.host, () => {
      console.log(`PowerMem Dashboard running at http://${config.host}:${config.port}/dashboard/`);
      console.log(`API at http://${config.host}:${config.port}/api/v1/`);
      console.log(`Docs at http://${config.host}:${config.port}/docs`);
    });
  });
}
