import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Embeddings } from '@langchain/core/embeddings';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { MemoryProvider } from '../index.js';
import type {
  AddParams,
  SearchParams,
  UpdateParams,
  GetAllParams,
  FilterParams,
  BatchItem,
  BatchOptions,
  MemoryRecord,
} from '../../types/memory.js';
import type { AddResult, SearchResult, MemoryListResult } from '../../types/responses.js';
import { MemoryStore, type StoreFilter, type StoreRecord } from './store.js';
import { Embedder } from './embedder.js';
import { Inferrer, type MemoryAction } from './inferrer.js';
import { SnowflakeIDGenerator } from './snowflake.js';
import { createEmbeddingsFromEnv, createLLMFromEnv } from './provider-factory.js';
import { getDefaultHomeDir } from '../../utils/platform.js';

export interface NativeProviderOptions {
  embeddings?: Embeddings;
  llm?: BaseChatModel;
  dbPath?: string;
}

function md5(content: string): string {
  return crypto.createHash('md5').update(content, 'utf-8').digest('hex');
}

function nowISO(): string {
  return new Date().toISOString();
}

function storeRecordToMemoryRecord(rec: StoreRecord): MemoryRecord {
  return {
    id: rec.id,
    memoryId: rec.id,
    content: rec.content,
    userId: rec.userId,
    agentId: rec.agentId,
    runId: rec.runId,
    metadata: rec.metadata,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

export class NativeProvider implements MemoryProvider {
  private readonly store: MemoryStore;
  private readonly embedder: Embedder;
  private readonly inferrer?: Inferrer;
  private readonly idGen = new SnowflakeIDGenerator();

  private constructor(store: MemoryStore, embedder: Embedder, inferrer?: Inferrer) {
    this.store = store;
    this.embedder = embedder;
    this.inferrer = inferrer;
  }

  static async create(options: NativeProviderOptions = {}): Promise<NativeProvider> {
    // Resolve DB path
    const dbPath = options.dbPath ?? path.join(getDefaultHomeDir(), 'memories.db');
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    const store = new MemoryStore(dbPath);

    // Set up embedder
    const embeddingsInstance = options.embeddings ?? (await createEmbeddingsFromEnv());
    const embedder = new Embedder(embeddingsInstance);

    // Set up inferrer (optional — only if LLM available)
    let inferrer: Inferrer | undefined;
    if (options.llm) {
      inferrer = new Inferrer(options.llm);
    } else {
      try {
        const llm = await createLLMFromEnv();
        inferrer = new Inferrer(llm);
      } catch {
        // LLM not configured — infer will be unavailable
      }
    }

    return new NativeProvider(store, embedder, inferrer);
  }

  async add(params: AddParams): Promise<AddResult> {
    const shouldInfer = params.infer !== false && this.inferrer != null;

    if (shouldInfer) {
      return this.intelligentAdd(params);
    }
    return this.simpleAdd(params);
  }

  private async simpleAdd(params: AddParams): Promise<AddResult> {
    const id = this.idGen.nextId();
    const embedding = await this.embedder.embed(params.content);
    const now = nowISO();
    const hash = md5(params.content);

    const payload: Record<string, unknown> = {
      data: params.content,
      user_id: params.userId ?? null,
      agent_id: params.agentId ?? null,
      run_id: params.runId ?? null,
      hash,
      created_at: now,
      updated_at: now,
      category: null,
      metadata: params.metadata ?? {},
    };

    this.store.insert(id, embedding, payload);

    const record: MemoryRecord = {
      id,
      memoryId: id,
      content: params.content,
      userId: params.userId,
      agentId: params.agentId,
      runId: params.runId,
      metadata: params.metadata,
      createdAt: now,
      updatedAt: now,
    };

    return { memories: [record], message: 'Memory created successfully' };
  }

  private async intelligentAdd(params: AddParams): Promise<AddResult> {
    // Step 1: Extract facts
    const facts = await this.inferrer!.extractFacts(params.content);
    if (facts.length === 0) {
      return { memories: [], message: 'No memories were created (no facts extracted)' };
    }

    // Step 2: For each fact, find similar existing memories
    const filters: StoreFilter = {
      userId: params.userId,
      agentId: params.agentId,
      runId: params.runId,
    };

    const existingMap = new Map<string, { id: string; text: string; score: number }>();

    for (const fact of facts) {
      const factEmbedding = await this.embedder.embed(fact);
      const matches = this.store.search(factEmbedding, filters, 5);

      for (const match of matches) {
        const existing = existingMap.get(match.id);
        if (!existing || match.score > existing.score) {
          existingMap.set(match.id, {
            id: match.id,
            text: match.content,
            score: match.score,
          });
        }
      }
    }

    // Limit to 10 existing memories
    const existingMemories = Array.from(existingMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    // Optimization: if no existing memories, skip LLM decision — just ADD all facts
    if (existingMemories.length === 0) {
      const resultMemories: MemoryRecord[] = [];
      for (const fact of facts) {
        const id = this.idGen.nextId();
        const embedding = await this.embedder.embed(fact);
        const now = nowISO();
        const hash = md5(fact);
        const payload: Record<string, unknown> = {
          data: fact,
          user_id: params.userId ?? null,
          agent_id: params.agentId ?? null,
          run_id: params.runId ?? null,
          hash,
          created_at: now,
          updated_at: now,
          category: null,
          metadata: params.metadata ?? {},
        };
        this.store.insert(id, embedding, payload);
        resultMemories.push({
          id, memoryId: id, content: fact,
          userId: params.userId, agentId: params.agentId, runId: params.runId,
          metadata: params.metadata, createdAt: now, updatedAt: now,
        });
      }
      const count = resultMemories.length;
      return {
        memories: resultMemories,
        message: count === 1 ? 'Memory created successfully' : `Created ${count} memories successfully`,
      };
    }

    // Step 3: Build temp ID mapping
    const tempToReal = new Map<string, string>();
    const realToTemp = new Map<string, string>();
    existingMemories.forEach((m, idx) => {
      const tempId = String(idx);
      tempToReal.set(tempId, m.id);
      realToTemp.set(m.id, tempId);
    });

    // Step 4: Ask LLM to decide actions
    const tempMemories = existingMemories.map((m, idx) => ({
      id: String(idx),
      text: m.text,
    }));

    const actions = await this.inferrer!.decideActions(facts, tempMemories, tempToReal);

    // Step 5: Execute actions
    const resultMemories: MemoryRecord[] = [];

    for (const action of actions) {
      switch (action.event) {
        case 'ADD': {
          const id = this.idGen.nextId();
          const embedding = await this.embedder.embed(action.text);
          const now = nowISO();
          const hash = md5(action.text);

          const payload: Record<string, unknown> = {
            data: action.text,
            user_id: params.userId ?? null,
            agent_id: params.agentId ?? null,
            run_id: params.runId ?? null,
            hash,
            created_at: now,
            updated_at: now,
            category: null,
            metadata: params.metadata ?? {},
          };

          this.store.insert(id, embedding, payload);
          resultMemories.push({
            id,
            memoryId: id,
            content: action.text,
            userId: params.userId,
            agentId: params.agentId,
            runId: params.runId,
            metadata: params.metadata,
            createdAt: now,
            updatedAt: now,
          });
          break;
        }
        case 'UPDATE': {
          const realId = tempToReal.get(action.id) ?? action.id;
          const embedding = await this.embedder.embed(action.text);
          const now = nowISO();
          const hash = md5(action.text);

          // Get existing record to preserve created_at
          const existing = this.store.getById(realId);
          const createdAt = existing?.createdAt ?? now;

          const payload: Record<string, unknown> = {
            data: action.text,
            user_id: params.userId ?? existing?.userId ?? null,
            agent_id: params.agentId ?? existing?.agentId ?? null,
            run_id: params.runId ?? existing?.runId ?? null,
            hash,
            created_at: createdAt,
            updated_at: now,
            category: null,
            metadata: params.metadata ?? existing?.metadata ?? {},
          };

          this.store.update(realId, embedding, payload);
          resultMemories.push({
            id: realId,
            memoryId: realId,
            content: action.text,
            userId: params.userId ?? existing?.userId,
            agentId: params.agentId ?? existing?.agentId,
            runId: params.runId ?? existing?.runId,
            metadata: params.metadata ?? existing?.metadata,
            createdAt,
            updatedAt: now,
          });
          break;
        }
        case 'DELETE': {
          const realId = tempToReal.get(action.id) ?? action.id;
          this.store.remove(realId);
          break;
        }
        case 'NONE':
        default:
          break;
      }
    }

    const count = resultMemories.length;
    const message =
      count === 0
        ? 'No memories were created (likely duplicates detected or no facts extracted)'
        : count === 1
          ? 'Memory created successfully'
          : `Created ${count} memories successfully`;

    return { memories: resultMemories, message };
  }

  async search(params: SearchParams): Promise<SearchResult> {
    const queryEmbedding = await this.embedder.embed(params.query);
    const filters: StoreFilter = {
      userId: params.userId,
      agentId: params.agentId,
      runId: params.runId,
    };
    const limit = params.limit ?? 30;

    const matches = this.store.search(queryEmbedding, filters, limit);

    return {
      results: matches.map((m) => ({
        memoryId: m.id,
        content: m.content,
        score: m.score,
        metadata: m.metadata,
      })),
      total: matches.length,
      query: params.query,
    };
  }

  async get(memoryId: string): Promise<MemoryRecord | null> {
    const rec = this.store.getById(memoryId);
    if (!rec) return null;
    return storeRecordToMemoryRecord(rec);
  }

  async update(memoryId: string, params: UpdateParams): Promise<MemoryRecord> {
    const existing = this.store.getById(memoryId);
    if (!existing) {
      throw new Error(`Memory not found: ${memoryId}`);
    }

    const content = params.content ?? existing.content;
    const metadata = params.metadata ?? existing.metadata;
    const now = nowISO();

    // Re-embed if content changed
    let embedding = existing.embedding ?? [];
    if (params.content && params.content !== existing.content) {
      embedding = await this.embedder.embed(content);
    }

    const hash = md5(content);

    const payload: Record<string, unknown> = {
      data: content,
      user_id: existing.userId ?? null,
      agent_id: existing.agentId ?? null,
      run_id: existing.runId ?? null,
      hash,
      created_at: existing.createdAt,
      updated_at: now,
      category: null,
      metadata: metadata ?? {},
    };

    this.store.update(memoryId, embedding, payload);

    return {
      id: memoryId,
      memoryId,
      content,
      userId: existing.userId,
      agentId: existing.agentId,
      runId: existing.runId,
      metadata,
      createdAt: existing.createdAt,
      updatedAt: now,
    };
  }

  async delete(memoryId: string): Promise<boolean> {
    return this.store.remove(memoryId);
  }

  async getAll(params: GetAllParams = {}): Promise<MemoryListResult> {
    const filters: StoreFilter = {
      userId: params.userId,
      agentId: params.agentId,
    };
    const limit = params.limit ?? 100;
    const offset = params.offset ?? 0;

    const { records, total } = this.store.list(filters, limit, offset);

    return {
      memories: records.map(storeRecordToMemoryRecord),
      total,
      limit,
      offset,
    };
  }

  async addBatch(memories: BatchItem[], options: BatchOptions = {}): Promise<AddResult> {
    const allMemories: MemoryRecord[] = [];

    for (const item of memories) {
      const result = await this.add({
        content: item.content,
        metadata: item.metadata,
        userId: options.userId,
        agentId: options.agentId,
        runId: options.runId,
        infer: options.infer,
      });
      allMemories.push(...result.memories);
    }

    return {
      memories: allMemories,
      message: `Created ${allMemories.length} memories`,
    };
  }

  async deleteAll(params: FilterParams = {}): Promise<boolean> {
    const filters: StoreFilter = {
      userId: params.userId,
      agentId: params.agentId,
    };
    this.store.removeAll(filters);
    return true;
  }

  async reset(): Promise<void> {
    await this.deleteAll();
  }

  async close(): Promise<void> {
    this.store.close();
  }
}
