# PowerMem TypeScript SDK — Architecture

## 1. Overview

Pure TypeScript port of [oceanbase/powermem](https://github.com/oceanbase/powermem). 89 source files across 10 modules, matching the Python directory layout. Zero Python dependency.

Two storage backends:
- **SQLite** (default) — `better-sqlite3`, brute-force cosine similarity
- **SeekDB** (optional) — OceanBase embedded engine, HNSW-indexed vector search

## 2. Module Structure

```
src/
├── core/                  Memory facade, NativeProvider, HttpProvider, Inferrer
├── storage/               VectorStore interface, SQLiteStore, SeekDBStore, factory, adapter
├── integrations/          Embeddings, LLM, Rerank — base interfaces + factories
├── intelligence/          Ebbinghaus decay, MemoryOptimizer, ImportanceEvaluator
├── prompts/               All LLM prompt templates (fact extraction, update, importance, graph)
├── utils/                 Cosine search, Snowflake IDs, filter parser, stats, IO
├── cli/                   Commander.js CLI (config, memory, stats, manage, shell)
├── dashboard/             Express server + HTML dashboard
├── agent/                 AgentMemory, scope/permission/collaboration management
├── user-memory/           UserMemory, query rewrite, SQLite profile storage
├── configs.ts             Zod schemas for MemoryConfig
├── config-loader.ts       autoConfig(), loadConfigFromEnv(), createConfig()
├── settings.ts            Default .env file resolution
├── version.ts             Version constant
├── errors/                Error hierarchy
├── types/                 TypeScript type definitions
└── index.ts               Public exports
```

## 3. Key Flows

### Memory.create()
```
Memory.create(options)
  ├─ serverUrl provided → HttpProvider
  ├─ seekdb config provided → SeekDBStore → NativeProvider
  └─ default → SQLiteStore → NativeProvider
```

### Intelligent add (infer=true)
```
add(content)
  → LLM extracts facts (FACT_RETRIEVAL_PROMPT)
  → Embed each fact → search for similar existing memories
  → No existing? → ADD all facts directly
  → Has existing? → LLM decides ADD/UPDATE/DELETE/NONE
  → Execute actions
```

### Search
```
search(query)
  → Embed query → cosine similarity (SQLite) or HNSW (SeekDB)
  → Apply Ebbinghaus decay (if enabled)
  → Apply threshold filter
  → Increment access counts
  → Apply reranker (if configured)
```

## 4. Storage Backends

### SQLite (default)
- Schema: `memories(id TEXT PK, vector TEXT, payload TEXT, created_at TIMESTAMP)`
- Vector search: brute-force cosine similarity in JavaScript
- Sorting: `ORDER BY json_extract(payload, '$.field')`

### SeekDB (HNSW-indexed)
- Embedded mode via `seekdb` npm package (local file, no server)
- HNSW vector index with configurable dimension/distance
- Metadata stored as base64-encoded JSON (bypasses C engine JSON parser)
- Score: `1 - cosine_distance`
- Requires `@seekdb/js-bindings` (macOS ARM64, Linux x64)

### VectorStore Interface (async)
All 11 methods return `Promise`. SQLiteStore and SeekDBStore both implement it.

## 5. CLI

```
pmem config show|validate|test
pmem memory add|search|list|get|delete|delete-all
pmem stats
pmem manage backup|restore|cleanup
pmem shell
```

## 6. Dashboard

Express server at `/dashboard/` with overview (stats cards, charts), memories page (table, search, pagination), settings page, dark/light theme.

REST API at `/api/v1/`: health, status, stats, memories CRUD, search.

## 7. Test Architecture

504 tests across 40 files, 7 CI jobs.

| Layer | Tests | Description |
|-------|-------|-------------|
| Unit | 284 | Per-module with mocks |
| Integration | 46 | Full stack with real SQLite |
| Regression | 58 | Scenarios, edge cases, language |
| E2E (Ollama) | 21 | Real qwen2.5:0.5b + nomic-embed-text |
| SeekDB | 63 | Unit + integration + e2e (macOS ARM64 + Linux x64) |
| BDD | 50 | CLI subprocess + dashboard UI via dev-browser |

### CI Jobs

| Job | Platform | Tests |
|-----|----------|-------|
| Test (Node 18/20/22) | Ubuntu | 370 unit/integration/regression |
| SeekDB (macOS ARM64) | macOS 14 | 63 SeekDB tests |
| SeekDB (Linux x64) | Ubuntu | 63 SeekDB tests |
| Build | Ubuntu | CJS + ESM + DTS + CLI |
| E2E (Ollama) | Ubuntu | 21 e2e tests |

### Running tests

```bash
npm test              # 370 unit/integration/regression
npm run test:e2e      # 21 e2e (requires Ollama)
npm run test:seekdb   # 63 SeekDB (requires native bindings)
npx vitest run tests/bdd/  # 50 BDD (CLI + dashboard)
```

## 8. Python Parity

| Python module | TS equivalent | Status |
|---|---|---|
| `core/` | `src/core/` | Done |
| `storage/` | `src/storage/` (SQLite + SeekDB) | Done |
| `integrations/` | `src/integrations/` (via LangChain.js) | Done |
| `intelligence/` | `src/intelligence/` | Done |
| `prompts/` | `src/prompts/` | Done |
| `utils/` | `src/utils/` | Done |
| `cli/` | `src/cli/` | Done |
| `agent/` | `src/agent/` | Done |
| `user_memory/` | `src/user-memory/` | Done |
| configs + settings | `src/configs.ts` etc | Done |
| dashboard (React) | `src/dashboard/` (vanilla HTML) | Done |
