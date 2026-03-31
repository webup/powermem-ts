# Changelog

## v0.1.0 — NativeProvider (2026-04-01)

First release with pure TypeScript implementation. **Zero Python dependency.**

### Highlights

- **NativeProvider** replaces the Python subprocess backend — `Memory.create()` now runs entirely in TypeScript
- **SQLite storage** via `better-sqlite3` — persistent, single-file database at `~/.powermem/memories.db`
- **LangChain.js integration** — plug in any `@langchain/*` provider for embeddings and LLM
- **Intelligent memory add** (`infer=true`) — LLM extracts atomic facts, deduplicates against existing memories, decides ADD/UPDATE/DELETE/NONE
- **Semantic search** — cosine similarity over real embedding vectors
- **Multi-tenant isolation** — userId/agentId/runId filtering on all operations
- **Backward compatible** — `Memory.create({ serverUrl })` still connects to a remote powermem-server via HTTP

### Architecture

```
Memory.create()
  ├─ serverUrl provided → HttpProvider (backward compat)
  └─ default            → NativeProvider
                            ├─ SQLite (better-sqlite3)
                            ├─ Embeddings (@langchain/core)
                            ├─ LLM inference (@langchain/core)
                            ├─ Cosine similarity search
                            └─ Snowflake ID generator
```

### API

All operations go through the `Memory` facade — unchanged from the original design:

```ts
const memory = await Memory.create({
  embeddings: new OpenAIEmbeddings({ model: 'text-embedding-3-small' }),
  llm: new ChatOpenAI({ model: 'gpt-4o-mini' }),
});

await memory.add('User likes coffee', { userId: 'u1' });
const results = await memory.search('preferences', { userId: 'u1' });
```

Or zero-config with `.env`:

```ts
const memory = await Memory.create(); // reads EMBEDDING_PROVIDER, LLM_PROVIDER, etc.
```

### Full API surface

| Method | Description |
|--------|-------------|
| `Memory.create(options?)` | Create instance (NativeProvider by default) |
| `Memory.init()` | No-op (retained for backward compat) |
| `add(content, options?)` | Add memory (with optional LLM fact extraction) |
| `search(query, options?)` | Semantic similarity search |
| `get(id)` | Retrieve by ID |
| `update(id, content, options?)` | Update content (re-embeds automatically) |
| `delete(id)` | Delete by ID |
| `getAll(options?)` | List with filtering + pagination |
| `addBatch(items, options?)` | Batch add |
| `deleteAll(options?)` | Delete filtered or all |
| `reset()` | Clear everything |
| `close()` | Release resources |

### Dependencies

- **Runtime**: `better-sqlite3`, `@langchain/core`, `dotenv`
- **Peer** (install what you need): `@langchain/openai`, `@langchain/anthropic`, `@langchain/ollama`

### Tests

- 95 unit tests (mocked, fast)
- 18 e2e tests with real Ollama models (`qwen2.5:0.5b` + `nomic-embed-text`)
- 95% line coverage, 83% branch coverage
