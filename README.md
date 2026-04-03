# PowerMem TypeScript SDK

**Pure TypeScript memory system for AI agents — a full port of [PowerMem](https://github.com/oceanbase/powermem).**

[![Node.js 18+](https://img.shields.io/badge/node-18+-green.svg)](https://nodejs.org/)
[![License Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

PowerMem combines vector-based semantic search with LLM-driven intelligent memory extraction, Ebbinghaus time-decay, and multi-tenant isolation. This package is a complete TypeScript reimplementation — **zero Python dependency**.

## Features

- **Pure TypeScript** — no Python, no subprocess, no server needed
- **Dual storage backend** — SQLite (default) or SeekDB (HNSW-indexed, OceanBase compatible)
- **LLM-driven intelligent add** — extracts facts, deduplicates, merges with existing memories
- **Semantic search** — cosine similarity over real embedding vectors
- **Pluggable providers** — any LangChain.js embedding/LLM provider (OpenAI, Qwen, Ollama, Anthropic, etc.)
- **Multi-tenant** — userId/agentId/runId isolation on all operations
- **CLI** — `pmem` command for memory CRUD, stats, backup/restore, interactive shell
- **Dashboard** — Express-based web dashboard with stats, charts, memory management
- **Agent memory** — scope/permission/collaboration management for multi-agent systems
- **User profiles** — profile extraction, profile-aware search, query rewriting
- **Ebbinghaus decay** — time-based memory score adjustment with access reinforcement
- **504 tests** — unit, integration, regression, e2e (Ollama), SeekDB (macOS + Linux), BDD

## Quick Start

```bash
npm install powermem-ts
```

### Simplest usage (env vars)

```env
# .env
EMBEDDING_PROVIDER=openai
EMBEDDING_API_KEY=sk-...
EMBEDDING_MODEL=text-embedding-3-small
LLM_PROVIDER=openai
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini
```

```typescript
import { Memory } from 'powermem-ts';

const memory = await Memory.create(); // reads from .env

await memory.add('User likes coffee', { userId: 'user1' });
const results = await memory.search('preferences', { userId: 'user1' });
console.log(results.results);

await memory.close();
```

### Explicit LangChain instances

```typescript
import { Memory } from 'powermem-ts';
import { OpenAIEmbeddings, ChatOpenAI } from '@langchain/openai';

const memory = await Memory.create({
  embeddings: new OpenAIEmbeddings({ model: 'text-embedding-3-small' }),
  llm: new ChatOpenAI({ model: 'gpt-4o-mini' }),
});
```

### SeekDB backend (HNSW-indexed)

```typescript
const memory = await Memory.create({
  embeddings: myEmbeddings,
  seekdb: { path: './seekdb_data', dimension: 1536 },
});
```

### Connect to existing PowerMem server

```typescript
const memory = await Memory.create({
  serverUrl: 'http://127.0.0.1:19527',
});
```

## CLI

```bash
npx pmem memory add "User likes coffee" --user-id user1
npx pmem memory search "preferences" --user-id user1
npx pmem memory list --user-id user1 --sort created_at --order desc
npx pmem stats --json
npx pmem config show
npx pmem manage backup --output backup.json
npx pmem shell  # Interactive REPL
```

## API

### Memory facade

| Method | Description |
|--------|-------------|
| `Memory.create(options?)` | Create instance (NativeProvider default, HttpProvider with serverUrl) |
| `add(content, options?)` | Add memory (optional LLM fact extraction with `infer: true`) |
| `search(query, options?)` | Semantic search with scores, threshold, limit |
| `get(id)` | Get by ID |
| `update(id, content)` | Update content (auto re-embeds) |
| `delete(id)` | Delete by ID |
| `getAll(options?)` | List with pagination, sorting, filtering |
| `count(options?)` | Count with optional filters |
| `addBatch(items, options?)` | Batch add |
| `deleteAll(options?)` | Bulk delete with filters |
| `reset()` | Clear all |
| `close()` | Release resources |

### Configuration

| Option | Description |
|--------|-------------|
| `embeddings` | LangChain Embeddings instance |
| `llm` | LangChain BaseChatModel instance |
| `dbPath` | SQLite file path (default: `~/.powermem/memories.db`) |
| `seekdb` | SeekDB config: `{ path, database?, dimension?, distance? }` |
| `serverUrl` | Connect to existing server (HttpProvider mode) |
| `customFactExtractionPrompt` | Override LLM fact extraction prompt |
| `customUpdateMemoryPrompt` | Override LLM action decision prompt |
| `fallbackToSimpleAdd` | Fall back to simple add when LLM extracts nothing |
| `reranker` | Async function to re-score search results |
| `enableDecay` | Enable Ebbinghaus time-based score decay |
| `decayWeight` | Decay influence weight (0-1, default 0.3) |

## Architecture

```
src/
├── core/           Memory facade, NativeProvider, HttpProvider, Inferrer
├── storage/        VectorStore interface, SQLiteStore, SeekDBStore, factory, adapter
├── integrations/   Embeddings, LLM, Rerank — base interfaces + factories
├── intelligence/   Ebbinghaus decay, MemoryOptimizer, ImportanceEvaluator
├── prompts/        All LLM prompt templates (fact extraction, update, importance, graph)
├── utils/          Cosine search, Snowflake IDs, filter parser, stats, IO
├── cli/            Commander.js CLI (config, memory, stats, manage, shell)
├── dashboard/      Express server + HTML dashboard
├── agent/          AgentMemory, scope/permission/collaboration management
└── user-memory/    UserMemory, query rewrite, SQLite profile storage
```

89 source files, 40 test files. See [docs/architecture.md](docs/architecture.md) for details.

## Testing

```bash
npm test          # 370 unit/integration/regression tests
npm run test:e2e  # 21 e2e tests (requires Ollama + nomic-embed-text + qwen2.5:0.5b)
npm run test:seekdb # 63 SeekDB tests (requires @seekdb/js-bindings)
npx vitest run tests/bdd/  # 50 BDD tests (CLI + dashboard UI)
```

CI runs 7 jobs: Node 18/20/22 unit tests, SeekDB on macOS ARM64, SeekDB on Linux x64, build verification, e2e with Ollama.

## Dependencies

**Runtime**: `better-sqlite3`, `@langchain/core`, `commander`, `express`, `zod`, `dotenv`

**Peer (install what you need)**: `@langchain/openai`, `@langchain/anthropic`, `@langchain/ollama`, `seekdb`

## Related

- [PowerMem](https://github.com/oceanbase/powermem) — Original Python implementation
- [SeekDB](https://github.com/oceanbase/seekdb-js) — OceanBase embedded vector database

## License

Apache License 2.0
