#!/usr/bin/env node
/**
 * PowerMem Dashboard — minimal Express server.
 * Serves REST API + static HTML dashboard (matching Python edition's React dashboard).
 */
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Memory } from '../core/memory.js';
import type { Embeddings } from '@langchain/core/embeddings';
import { calculateStatsFromMemories } from '../utils/stats.js';
import { VERSION } from '../version.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function createDashboardServer(options: {
  port?: number;
  dbPath?: string;
  embeddings?: Embeddings;
  memory?: Memory;
} = {}) {
  const app = express();
  app.use(express.json());

  const memory = options.memory ?? await Memory.create({
    dbPath: options.dbPath ?? ':memory:',
    embeddings: options.embeddings,
  });
  const startTime = Date.now();

  // ─── REST API ──────────────────────────────────────────────────────

  app.get('/api/v1/system/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });

  app.get('/api/v1/system/status', (_req, res) => {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    res.json({
      success: true,
      data: {
        version: VERSION,
        storageType: 'sqlite',
        uptime,
        status: 'running',
      },
    });
  });

  app.get('/api/v1/memories/stats', async (req, res) => {
    try {
      const userId = req.query.user_id as string | undefined;
      const agentId = req.query.agent_id as string | undefined;
      const all = await memory.getAll({ userId, agentId, limit: 10000 });
      const stats = calculateStatsFromMemories(
        all.memories as unknown as Array<Record<string, unknown>>
      );
      res.json({ success: true, data: stats });
    } catch (err) {
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  app.get('/api/v1/memories', async (req, res) => {
    try {
      const userId = req.query.user_id as string | undefined;
      const agentId = req.query.agent_id as string | undefined;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const sortBy = req.query.sort_by as string | undefined;
      const order = req.query.order as 'asc' | 'desc' | undefined;
      const result = await memory.getAll({ userId, agentId, limit, offset, sortBy, order });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  app.post('/api/v1/memories', async (req, res) => {
    try {
      const { content, user_id, agent_id, infer, metadata } = req.body;
      const result = await memory.add(content, {
        userId: user_id, agentId: agent_id,
        infer: infer ?? false, metadata,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  app.delete('/api/v1/memories/:id', async (req, res) => {
    try {
      const ok = await memory.delete(req.params.id);
      res.json({ success: true, data: { deleted: ok } });
    } catch (err) {
      res.status(500).json({ success: false, message: String(err) });
    }
  });

  app.post('/api/v1/memories/search', async (req, res) => {
    try {
      const { query, user_id, agent_id, limit } = req.body;
      const result = await memory.search(query, {
        userId: user_id, agentId: agent_id, limit,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, message: String(err) });
    }
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
      docs: '/api/v1/system/status',
    });
  });

  return { app, memory };
}

// CLI entry: npx tsx src/dashboard/server.ts
if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  const port = parseInt(process.env.PORT ?? '8000');

  // Try Ollama embeddings, fall back to a simple mock for demo
  let embeddings: Embeddings | undefined;
  try {
    const { OllamaEmbeddings } = await import('@langchain/ollama');
    embeddings = new OllamaEmbeddings({ model: 'nomic-embed-text', baseUrl: 'http://localhost:11434' });
  } catch {
    // Use a minimal mock embeddings for demo
    const { Embeddings: EmbBase } = await import('@langchain/core/embeddings');
    class DemoEmbeddings extends EmbBase {
      async embedQuery(text: string) { return Array.from({ length: 8 }, (_, i) => text.charCodeAt(i % text.length) / 256); }
      async embedDocuments(docs: string[]) { return docs.map(d => this.embedQuery(d) as any); }
    }
    embeddings = new DemoEmbeddings({});
  }

  createDashboardServer({ dbPath: process.env.DB_PATH, embeddings }).then(({ app }) => {
    app.listen(port, () => {
      console.log(`PowerMem Dashboard running at http://localhost:${port}/dashboard/`);
      console.log(`API at http://localhost:${port}/api/v1/`);
    });
  });
}
