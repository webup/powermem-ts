import { HttpProvider } from './provider/http-provider.js';
import { NativeProvider } from './provider/native/index.js';
import { loadEnvFile } from './utils/env.js';
import type { MemoryProvider } from './provider/index.js';
import type { InitOptions, MemoryOptions } from './types/options.js';
import type {
  AddParams,
  SearchParams,
  UpdateParams,
  GetAllParams,
  FilterParams,
  BatchItem,
  BatchOptions,
  MemoryRecord,
} from './types/memory.js';
import type { AddResult, SearchResult, MemoryListResult } from './types/responses.js';

export class Memory {
  private constructor(
    private readonly provider: MemoryProvider,
  ) {}

  /**
   * No-op — retained for backward compatibility.
   * Python environment is no longer needed with the native provider.
   */
  static async init(_options: InitOptions = {}): Promise<void> {
    // No-op: NativeProvider does not require Python setup.
  }

  /**
   * Create a Memory instance.
   * - With `serverUrl`: connects to an existing powermem-server via HTTP.
   * - Without `serverUrl` (default): uses pure-TS NativeProvider with SQLite.
   */
  static async create(options: MemoryOptions = {}): Promise<Memory> {
    loadEnvFile(options.envFile ?? '.env');

    // Direct connect mode: HttpProvider (backward compat)
    if (options.serverUrl) {
      const provider = new HttpProvider(options.serverUrl, options.apiKey);
      return new Memory(provider);
    }

    // Native mode (default): pure TypeScript
    const provider = await NativeProvider.create({
      embeddings: options.embeddings,
      llm: options.llm,
      dbPath: options.dbPath,
    });
    return new Memory(provider);
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  async add(content: string, options: Omit<AddParams, 'content'> = {}): Promise<AddResult> {
    return this.provider.add({ content, ...options });
  }

  async search(
    query: string,
    options: Omit<SearchParams, 'query'> = {}
  ): Promise<SearchResult> {
    return this.provider.search({ query, ...options });
  }

  async get(memoryId: string): Promise<MemoryRecord | null> {
    return this.provider.get(memoryId);
  }

  async update(
    memoryId: string,
    content: string,
    options: Omit<UpdateParams, 'content'> = {}
  ): Promise<MemoryRecord> {
    return this.provider.update(memoryId, { content, ...options });
  }

  async delete(memoryId: string): Promise<boolean> {
    return this.provider.delete(memoryId);
  }

  async getAll(options: GetAllParams = {}): Promise<MemoryListResult> {
    return this.provider.getAll(options);
  }

  async addBatch(memories: BatchItem[], options: BatchOptions = {}): Promise<AddResult> {
    return this.provider.addBatch(memories, options);
  }

  async deleteAll(options: FilterParams = {}): Promise<boolean> {
    return this.provider.deleteAll(options);
  }

  async reset(): Promise<void> {
    return this.provider.reset();
  }

  async close(): Promise<void> {
    await this.provider.close();
  }
}
