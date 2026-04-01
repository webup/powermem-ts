# PowerMem TypeScript SDK — Architecture

## 1. Overview

PowerMem TS SDK is a pure TypeScript memory system for AI agents. It stores, retrieves, and semantically searches memories using vector embeddings, with optional LLM-driven intelligent memory extraction.

The SDK operates in two modes:

- **Native mode** (default): Pure TypeScript — SQLite storage, LangChain.js for embeddings/LLM, cosine similarity search. Zero Python dependency.
- **HTTP mode** (`serverUrl`): Connects to an existing powermem-server via HTTP. Retained for backward compatibility.

## 2. Core design concept

### Provider abstraction

The SDK is built around a single architectural idea: **the `MemoryProvider` interface decouples the public API from the implementation**.

```
┌──────────────────────────────────────────┐
│           Memory (Facade)                │  ← User-facing, never changes
│  - create() / close()                   │
│  - add / search / get / update / ...     │
├──────────────────────────────────────────┤
│        MemoryProvider (interface)         │  ← The contract
├──────────────────┬───────────────────────┤
│  NativeProvider  │    HttpProvider       │
│  Default         │    Backward compat    │
│  Pure TS         │    Remote server      │
└──────────────────┴───────────────────────┘
```

`Memory.create()` inspects options and picks the right provider. User code never references a provider directly. This made it possible to replace the entire Python backend with native TypeScript without changing a single line of user-facing API.

### Pluggable LLM/Embedding via LangChain.js

Rather than hardcoding API clients for each provider (OpenAI, Qwen, Anthropic, etc.), the SDK accepts LangChain.js base types:

- `Embeddings` from `@langchain/core/embeddings`
- `BaseChatModel` from `@langchain/core/language_models/chat_models`

Users plug in any LangChain-compatible provider. The SDK also auto-creates instances from `.env` configuration for zero-config usage.

### Faithful port of Python powermem

The NativeProvider is a direct port of the [oceanbase/powermem](https://github.com/oceanbase/powermem) Python implementation. Key behaviors preserved exactly:

- **Two-step intelligent add** (`infer=true`): extract facts via LLM → search for similar existing memories → ask LLM to decide ADD/UPDATE/DELETE/NONE → execute actions
- **Same LLM prompts**: `FACT_RETRIEVAL_PROMPT` and `DEFAULT_UPDATE_MEMORY_PROMPT` copied verbatim
- **Snowflake IDs**: 64-bit IDs matching Python's SnowflakeIDGenerator, serialized as strings
- **Cosine similarity**: Same algorithm, brute-force over filtered records
- **SQLite storage**: Same schema pattern (id, vector as JSON, payload as JSON)
- **MD5 content hashing** for deduplication
- **Access control**: userId/agentId check on get operations

## 3. Architecture layers — NativeProvider

```
NativeProvider
  │
  ├── Embedder              Wraps LangChain Embeddings
  │     └── embedQuery / embedDocuments
  │
  ├── Inferrer              Two-step LLM memory extraction
  │     ├── extractFacts()    → FACT_RETRIEVAL_PROMPT → ["fact1", "fact2"]
  │     └── decideActions()   → UPDATE_MEMORY_PROMPT  → ADD/UPDATE/DELETE/NONE
  │
  ├── SQLiteStore           SQLite via better-sqlite3
  │     ├── insert / getById / update / remove
  │     ├── list (filtered, paginated)
  │     └── search (load vectors → cosine similarity → rank)
  │
  ├── SnowflakeIDGenerator  64-bit monotonic IDs (BigInt → string)
  │
  └── cosineSimilarity()    Pure math, no dependencies
```

## 4. Project structure

```
powermem-ts/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── .env.example
├── src/
│   ├── index.ts                    # Public exports
│   ├── memory.ts                   # Memory facade
│   ├── types/
│   │   ├── index.ts                #   Re-exports
│   │   ├── memory.ts               #   MemoryRecord, AddParams, SearchParams, etc.
│   │   ├── options.ts              #   MemoryOptions (embeddings, llm, dbPath, serverUrl)
│   │   └── responses.ts            #   AddResult, SearchResult, etc.
│   ├── errors/
│   │   └── index.ts                # PowerMemError hierarchy
│   ├── provider/
│   │   ├── index.ts                # MemoryProvider interface
│   │   ├── http-provider.ts        # HTTP implementation (backward compat)
│   │   └── native/
│   │       ├── index.ts            # NativeProvider (main class)
│   │       ├── store.ts            # SQLite storage layer
│   │       ├── embedder.ts         # LangChain Embeddings wrapper
│   │       ├── inferrer.ts         # LLM fact extraction + action decision
│   │       ├── prompts.ts          # LLM prompt templates (from Python)
│   │       ├── search.ts           # Cosine similarity
│   │       ├── snowflake.ts        # Snowflake ID generator
│   │       └── provider-factory.ts # Env-based auto-creation
│   ├── server/                     # (Legacy) Python server management
│   │   ├── python-env.ts
│   │   └── server-manager.ts
│   └── utils/
│       ├── platform.ts             # Cross-platform path helpers
│       ├── case-convert.ts         # camelCase ↔ snake_case
│       └── env.ts                  # .env file loader
├── tests/
│   ├── mocks.ts                    # MockEmbeddings, MockLLM
│   ├── snowflake.test.ts
│   ├── search.test.ts
│   ├── store.test.ts
│   ├── embedder.test.ts
│   ├── inferrer.test.ts
│   ├── native-provider.test.ts
│   ├── memory-facade.test.ts
│   ├── provider-factory.test.ts
│   └── coverage-gaps.test.ts
└── examples/
    └── basic-usage.ts
```

Runtime data directory (auto-created):

```
~/.powermem/
└── memories.db               # SQLite database (NativeProvider)
```

## 5. Key flows

### 5.1 Instance creation (`Memory.create()`)

```
Memory.create(options?)
  │
  ├─ Load .env file
  │
  ├─ Has serverUrl?
  │   ├─ Yes → HttpProvider (backward compat)
  │   └─ No  → NativeProvider (default)
  │
  └─ NativeProvider.create():
      ├─ Resolve dbPath (default ~/.powermem/memories.db)
      ├─ Create SQLite database (SQLiteStore)
      ├─ Set up Embedder:
      │   ├─ options.embeddings provided? → Use it
      │   └─ Not provided → createEmbeddingsFromEnv()
      ├─ Set up Inferrer (optional):
      │   ├─ options.llm provided? → Use it
      │   ├─ Not provided → try createLLMFromEnv()
      │   └─ No LLM config → inferrer = undefined (infer disabled)
      └─ Return NativeProvider instance
```

### 5.2 Simple add (`infer=false`)

```
add({ content, userId, ... , infer: false })
  │
  ├─ Generate Snowflake ID
  ├─ Embed content → vector
  ├─ MD5 hash content
  ├─ Store in SQLite: { id, vector, payload }
  └─ Return AddResult with 1 MemoryRecord
```

### 5.3 Intelligent add (`infer=true`, default)

```
add({ content, userId, ... })
  │
  ├─ Step 1: Extract facts
  │   └─ LLM(FACT_RETRIEVAL_PROMPT, content) → ["fact1", "fact2", ...]
  │
  ├─ Step 2: Find similar existing memories
  │   └─ For each fact:
  │       ├─ Embed fact → vector
  │       └─ Search SQLite for top-5 similar (filtered by userId/agentId/runId)
  │   └─ Deduplicate, keep best scores, max 10 candidates
  │
  ├─ Step 3: Map IDs
  │   └─ Real Snowflake IDs → temp sequential IDs ("0","1","2"...)
  │       (prevents LLM from hallucinating IDs)
  │
  ├─ Step 4: Decide actions
  │   └─ LLM(UPDATE_MEMORY_PROMPT, existing_memories, new_facts)
  │       → [{ id, text, event: ADD|UPDATE|DELETE|NONE }]
  │
  └─ Step 5: Execute actions
      ├─ ADD    → new Snowflake ID, embed, store
      ├─ UPDATE → map temp→real ID, embed new text, update store
      ├─ DELETE → map temp→real ID, remove from store
      └─ NONE   → skip (duplicate)
```

### 5.4 Search

```
search({ query, userId, limit })
  │
  ├─ Embed query → vector
  ├─ Load all matching records from SQLite (filtered by userId/agentId/runId)
  ├─ Compute cosine similarity for each
  ├─ Sort descending by score
  ├─ Return top-k as SearchResult
  └─ Each result: { memoryId, content, score, metadata }
```

## 6. Storage — SQLite schema

```sql
CREATE TABLE memories (
  id TEXT PRIMARY KEY,          -- Snowflake ID as string
  vector TEXT,                  -- JSON array of floats
  payload TEXT,                 -- JSON blob (see below)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Payload JSON structure:
```json
{
  "data": "the actual content text",
  "user_id": "user123",
  "agent_id": "agent1",
  "run_id": "run1",
  "hash": "md5-hex-of-content",
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T00:00:00.000Z",
  "category": null,
  "metadata": { "custom": "user metadata" }
}
```

Filtering uses `json_extract()` on the payload column. Vector search is brute-force cosine similarity in JavaScript — efficient for datasets up to ~100K records.

## 7. Dependencies

**Runtime:**
- `better-sqlite3` — Synchronous SQLite bindings (native addon)
- `@langchain/core` — Base types for Embeddings and LLM
- `dotenv` — .env file loading

**Peer (user installs what they need):**
- `@langchain/openai` — OpenAI, Qwen, SiliconFlow, DeepSeek (OpenAI-compatible)
- `@langchain/anthropic` — Anthropic Claude
- `@langchain/ollama` — Local Ollama models

**Dev:**
- `typescript`, `tsup`, `vitest`, `@vitest/coverage-v8`, `@types/better-sqlite3`

## 8. Configuration

Two ways to configure embeddings/LLM:

**Explicit (recommended for libraries):**
```ts
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';

const memory = await Memory.create({
  embeddings: new OpenAIEmbeddings({ model: 'text-embedding-3-small' }),
  llm: new ChatOpenAI({ model: 'gpt-4o-mini' }),
});
```

**Env-based (zero-config):**
```bash
# .env
EMBEDDING_PROVIDER=openai
EMBEDDING_API_KEY=sk-...
EMBEDDING_MODEL=text-embedding-3-small
LLM_PROVIDER=openai
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini
```
```ts
const memory = await Memory.create(); // reads from .env
```

Supported providers for env-based auto-creation:

| Provider | Embedding | LLM | Package |
|----------|-----------|-----|---------|
| `openai` | Yes | Yes | `@langchain/openai` |
| `qwen` | Yes | Yes | `@langchain/openai` |
| `siliconflow` | Yes | Yes | `@langchain/openai` |
| `deepseek` | Yes | Yes | `@langchain/openai` |
| `anthropic` | No | Yes | `@langchain/anthropic` |
| `ollama` | Yes | Yes | `@langchain/ollama` |

## 9. Error hierarchy

| Error class | Code | Trigger |
|-------------|------|---------|
| `PowerMemError` | (base) | Base class for all SDK errors |
| `PowerMemInitError` | `INIT_ERROR` | Missing env config, LangChain package not installed |
| `PowerMemStartupError` | `STARTUP_ERROR` | Server timeout (HTTP mode only) |
| `PowerMemConnectionError` | `CONNECTION_ERROR` | Cannot reach server (HTTP mode only) |
| `PowerMemAPIError` | `API_ERROR` | Server error response (HTTP mode only) |

## 10. Build output

Dual-format via `tsup`:

| File | Format | Purpose |
|------|--------|---------|
| `dist/index.js` | ESM | `import from 'powermem-ts'` |
| `dist/index.cjs` | CommonJS | `require('powermem-ts')` |
| `dist/index.d.ts` | TypeScript declarations | Type support |

`better-sqlite3` and `@langchain/*` are externalized (not bundled).

## 11. Test architecture

113 tests total: **95 unit tests** (mocked, fast) + **18 e2e tests** (real Ollama models).

### Unit tests

9 files using **vitest** with mock LangChain instances:

- `MockEmbeddings` — Deterministic vectors from character frequency (no API calls)
- `MockLLM` — Pre-configured response queue with call tracking

Coverage: **95% lines, 83% branches, 98.5% functions**.

| Test file | Tests | Layer |
|-----------|-------|-------|
| `snowflake.test.ts` | 4 | ID generation |
| `search.test.ts` | 6 | Cosine similarity |
| `store.test.ts` | 14 | SQLite CRUD + vector search |
| `embedder.test.ts` | 4 | Embedding wrapper |
| `inferrer.test.ts` | 9 | LLM fact extraction + actions |
| `native-provider.test.ts` | 28 | Full integration |
| `memory-facade.test.ts` | 7 | Public API end-to-end |
| `provider-factory.test.ts` | 9 | Env-based factory |
| `coverage-gaps.test.ts` | 14 | Edge cases + filter branches |

### E2E tests with real models

`e2e-ollama.test.ts` — 18 tests using local Ollama models:
- **LLM**: `qwen2.5:0.5b` (397 MB) — fact extraction + memory action decisions
- **Embedding**: `nomic-embed-text` (274 MB, 768-dim vectors)

Auto-skipped when Ollama is not available.

| Test | Design purpose verified |
|------|------------------------|
| Embedding produces vectors | Real model returns valid number arrays |
| Similar texts → similar vectors | Semantic similarity works (coffee > weather) |
| Add + retrieve | SQLite storage round-trip with real embeddings |
| Semantic search ranks correctly | Coffee memories ranked top for "coffee preferences" |
| Search limit respected | Limit=2 returns ≤2 results |
| userId filter isolation | Filtered search returns only matching user |
| Infer: fact extraction | Real LLM extracts facts → embeds → stores |
| Infer: trivial input | "Hi." doesn't crash, returns gracefully |
| Infer: UPDATE existing | Enhanced info updates pre-existing memory |
| Full CRUD lifecycle | add → search → update → re-search → delete |
| Batch add + searchable | 3 items batched, all semantically findable |
| deleteAll | Clears filtered user's memories |
| Multi-user isolation | Same store, user A cannot see user B's data |
| agentId filter | getAll and search filter by agentId |
| Pagination | limit/offset returns correct pages with no overlap |
| Metadata round-trip | Custom metadata stored and retrieved correctly |
| Metadata survives update | Metadata preserved when content changes |
| reset() | Clears all memories |

### Running tests

```bash
npm test          # Unit tests only (fast, no external deps)
npm run test:e2e  # E2E tests (requires Ollama + models)
npm run test:all  # Both
```
