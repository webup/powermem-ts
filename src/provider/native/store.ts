import Database from 'better-sqlite3';
import { cosineSimilarity } from './search.js';

export interface StoreRecord {
  id: string;
  content: string;
  userId?: string;
  agentId?: string;
  runId?: string;
  hash?: string;
  metadata?: Record<string, unknown>;
  embedding?: number[];
  createdAt: string;
  updatedAt: string;
}

export interface StoreFilter {
  userId?: string;
  agentId?: string;
  runId?: string;
}

export interface SearchMatch {
  id: string;
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export class MemoryStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        vector TEXT,
        payload TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  /** Parse a payload JSON blob into a StoreRecord */
  private toRecord(row: { id: string; vector: string; payload: string; created_at: string }): StoreRecord {
    const payload = JSON.parse(row.payload) as Record<string, unknown>;
    const vector = row.vector ? (JSON.parse(row.vector) as number[]) : undefined;
    return {
      id: String(row.id),
      content: (payload.data as string) ?? '',
      userId: payload.user_id as string | undefined,
      agentId: payload.agent_id as string | undefined,
      runId: payload.run_id as string | undefined,
      hash: payload.hash as string | undefined,
      metadata: payload.metadata as Record<string, unknown> | undefined,
      embedding: vector,
      createdAt: (payload.created_at as string) ?? row.created_at,
      updatedAt: (payload.updated_at as string) ?? row.created_at,
    };
  }

  insert(id: string, vector: number[], payload: Record<string, unknown>): void {
    const stmt = this.db.prepare('INSERT INTO memories (id, vector, payload) VALUES (?, ?, ?)');
    stmt.run(id, JSON.stringify(vector), JSON.stringify(payload));
  }

  getById(id: string, userId?: string, agentId?: string): StoreRecord | null {
    const row = this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as
      | { id: string; vector: string; payload: string; created_at: string }
      | undefined;
    if (!row) return null;

    const record = this.toRecord(row);

    // Access control (matching Python behavior)
    if (userId && record.userId !== userId) return null;
    if (agentId && record.agentId !== agentId) return null;

    return record;
  }

  update(id: string, vector: number[], payload: Record<string, unknown>): void {
    const stmt = this.db.prepare('UPDATE memories SET vector = ?, payload = ? WHERE id = ?');
    stmt.run(JSON.stringify(vector), JSON.stringify(payload), id);
  }

  remove(id: string): boolean {
    const result = this.db.prepare('DELETE FROM memories WHERE id = ?').run(id);
    return result.changes > 0;
  }

  list(
    filters: StoreFilter = {},
    limit = 100,
    offset = 0
  ): { records: StoreRecord[]; total: number } {
    const { where, params } = this.buildWhereClause(filters);

    const countRow = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM memories${where}`)
      .get(...params) as { cnt: number };

    const rows = this.db
      .prepare(`SELECT * FROM memories${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as Array<{
      id: string;
      vector: string;
      payload: string;
      created_at: string;
    }>;

    return {
      records: rows.map((r) => this.toRecord(r)),
      total: countRow.cnt,
    };
  }

  search(queryVector: number[], filters: StoreFilter = {}, limit = 30): SearchMatch[] {
    const { where, params } = this.buildWhereClause(filters);

    const rows = this.db
      .prepare(`SELECT id, vector, payload FROM memories${where}`)
      .all(...params) as Array<{ id: string; vector: string; payload: string }>;

    const scored: SearchMatch[] = [];
    for (const row of rows) {
      if (!row.vector) continue;
      const vec = JSON.parse(row.vector) as number[];
      const payload = JSON.parse(row.payload) as Record<string, unknown>;
      const score = cosineSimilarity(queryVector, vec);
      scored.push({
        id: String(row.id),
        content: (payload.data as string) ?? '',
        score,
        metadata: payload.metadata as Record<string, unknown> | undefined,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  removeAll(filters: StoreFilter = {}): void {
    const { where, params } = this.buildWhereClause(filters);
    this.db.prepare(`DELETE FROM memories${where}`).run(...params);
  }

  close(): void {
    this.db.close();
  }

  private buildWhereClause(filters: StoreFilter): {
    where: string;
    params: unknown[];
  } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.userId) {
      conditions.push("json_extract(payload, '$.user_id') = ?");
      params.push(filters.userId);
    }
    if (filters.agentId) {
      conditions.push("json_extract(payload, '$.agent_id') = ?");
      params.push(filters.agentId);
    }
    if (filters.runId) {
      conditions.push("json_extract(payload, '$.run_id') = ?");
      params.push(filters.runId);
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    return { where, params };
  }
}
