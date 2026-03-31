import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NativeProvider } from '../src/provider/native/index.js';
import { MockEmbeddings, MockLLM } from './mocks.js';

describe('NativeProvider', () => {
  let provider: NativeProvider;
  let embeddings: MockEmbeddings;

  function createProvider(llmResponses?: string[]) {
    embeddings = new MockEmbeddings();
    const llm = llmResponses ? new MockLLM(llmResponses) : undefined;
    // Use in-memory SQLite for tests
    return NativeProvider.create({
      embeddings,
      llm,
      dbPath: ':memory:',
    });
  }

  afterEach(async () => {
    if (provider) await provider.close();
  });

  // ── Simple Add ──────────────────────────────────────────────────────────

  describe('simple add (infer=false)', () => {
    beforeEach(async () => {
      provider = await createProvider();
    });

    it('adds a single memory', async () => {
      const result = await provider.add({ content: 'hello world', infer: false });
      expect(result.memories).toHaveLength(1);
      expect(result.memories[0].content).toBe('hello world');
      expect(result.memories[0].id).toBeTruthy();
      expect(result.memories[0].memoryId).toBe(result.memories[0].id);
      expect(result.message).toBe('Memory created successfully');
    });

    it('memory is retrievable via get', async () => {
      const result = await provider.add({ content: 'test', infer: false });
      const mem = await provider.get(result.memories[0].id);
      expect(mem).not.toBeNull();
      expect(mem!.content).toBe('test');
    });

    it('respects userId/agentId', async () => {
      const result = await provider.add({
        content: 'with user',
        userId: 'user1',
        agentId: 'agent1',
        infer: false,
      });
      expect(result.memories[0].userId).toBe('user1');
      expect(result.memories[0].agentId).toBe('agent1');
    });

    it('has valid timestamps', async () => {
      const result = await provider.add({ content: 'ts test', infer: false });
      const mem = result.memories[0];
      expect(mem.createdAt).toBeTruthy();
      expect(mem.updatedAt).toBeTruthy();
      expect(new Date(mem.createdAt!).getTime()).toBeGreaterThan(0);
    });
  });

  // ── Intelligent Add ─────────────────────────────────────────────────────

  describe('intelligent add (infer=true)', () => {
    it('creates multiple memories from extracted facts', async () => {
      const factResponse = JSON.stringify({
        facts: ['Likes coffee', 'Lives in Shanghai'],
      });
      const actionResponse = JSON.stringify({
        memory: [
          { id: '0', text: 'Likes coffee', event: 'ADD' },
          { id: '1', text: 'Lives in Shanghai', event: 'ADD' },
        ],
      });
      provider = await createProvider([factResponse, actionResponse]);

      const result = await provider.add({ content: 'I like coffee and live in Shanghai' });
      expect(result.memories).toHaveLength(2);
      expect(result.memories.map((m) => m.content).sort()).toEqual(
        ['Likes coffee', 'Lives in Shanghai'].sort()
      );
    });

    it('UPDATE modifies existing memory', async () => {
      // First: simple add
      provider = await createProvider([
        // extractFacts for second add
        JSON.stringify({ facts: ['Went to Hawaii in May 2023'] }),
        // decideActions — UPDATE existing
        JSON.stringify({
          memory: [
            {
              id: '0',
              text: 'Went to Hawaii in May 2023',
              event: 'UPDATE',
              old_memory: 'Went to Hawaii',
            },
          ],
        }),
      ]);

      const first = await provider.add({ content: 'Went to Hawaii', infer: false });
      const originalId = first.memories[0].id;

      // Second: intelligent add triggers UPDATE
      const second = await provider.add({ content: 'Went to Hawaii in May 2023' });

      expect(second.memories).toHaveLength(1);
      expect(second.memories[0].id).toBe(originalId);
      expect(second.memories[0].content).toBe('Went to Hawaii in May 2023');

      // Verify the original memory was updated
      const updated = await provider.get(originalId);
      expect(updated!.content).toBe('Went to Hawaii in May 2023');
    });

    it('DELETE removes existing memory', async () => {
      provider = await createProvider([
        JSON.stringify({ facts: ['Dislikes pizza'] }),
        JSON.stringify({
          memory: [{ id: '0', text: '', event: 'DELETE' }],
        }),
      ]);

      const first = await provider.add({ content: 'Loves pizza', infer: false });
      const originalId = first.memories[0].id;

      await provider.add({ content: 'Actually I dislike pizza' });

      // Original memory should be deleted
      const deleted = await provider.get(originalId);
      expect(deleted).toBeNull();
    });

    it('NONE skips duplicates', async () => {
      provider = await createProvider([
        JSON.stringify({ facts: ['Likes coffee'] }),
        JSON.stringify({
          memory: [{ id: '0', text: 'Likes coffee', event: 'NONE' }],
        }),
      ]);

      await provider.add({ content: 'Likes coffee', infer: false });
      const result = await provider.add({ content: 'Likes coffee' });

      expect(result.memories).toHaveLength(0);
    });

    it('returns empty when no facts extracted', async () => {
      provider = await createProvider([JSON.stringify({ facts: [] })]);
      const result = await provider.add({ content: 'Hi.' });
      expect(result.memories).toHaveLength(0);
    });
  });

  // ── Search ──────────────────────────────────────────────────────────────

  describe('search', () => {
    beforeEach(async () => {
      provider = await createProvider();
    });

    it('returns results sorted by relevance', async () => {
      await provider.add({ content: 'alpha', infer: false });
      await provider.add({ content: 'beta', infer: false });
      await provider.add({ content: 'alpha beta', infer: false });

      const result = await provider.search({ query: 'alpha' });
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.query).toBe('alpha');
      // Most relevant result should have highest score
      for (let i = 1; i < result.results.length; i++) {
        expect(result.results[i - 1].score!).toBeGreaterThanOrEqual(result.results[i].score!);
      }
    });

    it('respects limit', async () => {
      for (let i = 0; i < 10; i++) {
        await provider.add({ content: `memory ${i}`, infer: false });
      }
      const result = await provider.search({ query: 'memory', limit: 3 });
      expect(result.results).toHaveLength(3);
    });

    it('filters by userId', async () => {
      await provider.add({ content: 'alice data', userId: 'alice', infer: false });
      await provider.add({ content: 'bob data', userId: 'bob', infer: false });

      const result = await provider.search({ query: 'data', userId: 'alice' });
      expect(result.results).toHaveLength(1);
      // The matched result should be alice's
    });

    it('returns scores in 0-1 range', async () => {
      await provider.add({ content: 'test content', infer: false });
      const result = await provider.search({ query: 'test content' });
      expect(result.results[0].score).toBeGreaterThanOrEqual(0);
      expect(result.results[0].score).toBeLessThanOrEqual(1);
    });
  });

  // ── Get ─────────────────────────────────────────────────────────────────

  describe('get', () => {
    beforeEach(async () => {
      provider = await createProvider();
    });

    it('returns MemoryRecord for existing ID', async () => {
      const res = await provider.add({ content: 'test', infer: false });
      const mem = await provider.get(res.memories[0].id);
      expect(mem).not.toBeNull();
      expect(mem!.content).toBe('test');
      expect(mem!.id).toBe(res.memories[0].id);
      expect(mem!.memoryId).toBe(mem!.id);
    });

    it('returns null for non-existent ID', async () => {
      expect(await provider.get('999999999')).toBeNull();
    });
  });

  // ── Update ──────────────────────────────────────────────────────────────

  describe('update', () => {
    beforeEach(async () => {
      provider = await createProvider();
    });

    it('updates content', async () => {
      const res = await provider.add({ content: 'old', infer: false });
      const id = res.memories[0].id;

      const updated = await provider.update(id, { content: 'new' });
      expect(updated.content).toBe('new');
      expect(updated.id).toBe(id);

      const fetched = await provider.get(id);
      expect(fetched!.content).toBe('new');
    });

    it('preserves createdAt, updates updatedAt', async () => {
      const res = await provider.add({ content: 'orig', infer: false });
      const id = res.memories[0].id;
      const createdAt = res.memories[0].createdAt;

      // Wait a tiny bit to ensure different timestamp
      await new Promise((r) => setTimeout(r, 10));

      const updated = await provider.update(id, { content: 'changed' });
      expect(updated.createdAt).toBe(createdAt);
      expect(updated.updatedAt).not.toBe(createdAt);
    });

    it('re-embeds when content changes', async () => {
      const res = await provider.add({ content: 'cat', infer: false });
      const id = res.memories[0].id;

      await provider.update(id, { content: 'dog' });

      // Search for 'dog' should find it, search for 'cat' should rank lower
      const dogSearch = await provider.search({ query: 'dog' });
      const catSearch = await provider.search({ query: 'cat' });
      expect(dogSearch.results[0].score!).toBeGreaterThan(catSearch.results[0].score!);
    });
  });

  // ── Delete ──────────────────────────────────────────────────────────────

  describe('delete', () => {
    beforeEach(async () => {
      provider = await createProvider();
    });

    it('deletes existing memory', async () => {
      const res = await provider.add({ content: 'to delete', infer: false });
      const ok = await provider.delete(res.memories[0].id);
      expect(ok).toBe(true);
      expect(await provider.get(res.memories[0].id)).toBeNull();
    });

    it('returns false for non-existent', async () => {
      expect(await provider.delete('999999999')).toBe(false);
    });
  });

  // ── GetAll ──────────────────────────────────────────────────────────────

  describe('getAll', () => {
    beforeEach(async () => {
      provider = await createProvider();
    });

    it('returns all memories', async () => {
      for (let i = 0; i < 5; i++) {
        await provider.add({ content: `mem ${i}`, infer: false });
      }
      const result = await provider.getAll();
      expect(result.total).toBe(5);
      expect(result.memories).toHaveLength(5);
    });

    it('pagination works', async () => {
      for (let i = 0; i < 10; i++) {
        await provider.add({ content: `mem ${i}`, infer: false });
      }
      const page = await provider.getAll({ limit: 3, offset: 2 });
      expect(page.total).toBe(10);
      expect(page.memories).toHaveLength(3);
      expect(page.limit).toBe(3);
      expect(page.offset).toBe(2);
    });

    it('filters by userId', async () => {
      await provider.add({ content: 'a1', userId: 'alice', infer: false });
      await provider.add({ content: 'b1', userId: 'bob', infer: false });
      await provider.add({ content: 'a2', userId: 'alice', infer: false });

      const result = await provider.getAll({ userId: 'alice' });
      expect(result.total).toBe(2);
    });
  });

  // ── AddBatch ────────────────────────────────────────────────────────────

  describe('addBatch', () => {
    beforeEach(async () => {
      provider = await createProvider();
    });

    it('adds multiple memories', async () => {
      const result = await provider.addBatch(
        [{ content: 'a' }, { content: 'b' }, { content: 'c' }],
        { infer: false }
      );
      expect(result.memories).toHaveLength(3);

      // All retrievable
      for (const mem of result.memories) {
        expect(await provider.get(mem.id)).not.toBeNull();
      }
    });

    it('respects batch options', async () => {
      const result = await provider.addBatch(
        [{ content: 'x' }],
        { userId: 'batch-user', infer: false }
      );
      expect(result.memories[0].userId).toBe('batch-user');
    });
  });

  // ── DeleteAll ───────────────────────────────────────────────────────────

  describe('deleteAll', () => {
    beforeEach(async () => {
      provider = await createProvider();
    });

    it('deletes all memories', async () => {
      for (let i = 0; i < 5; i++) {
        await provider.add({ content: `mem ${i}`, infer: false });
      }
      await provider.deleteAll();
      const result = await provider.getAll();
      expect(result.total).toBe(0);
    });

    it('deletes only filtered memories', async () => {
      await provider.add({ content: 'a', userId: 'alice', infer: false });
      await provider.add({ content: 'b', userId: 'bob', infer: false });
      await provider.deleteAll({ userId: 'alice' });

      const result = await provider.getAll();
      expect(result.total).toBe(1);
    });
  });

  // ── Reset ───────────────────────────────────────────────────────────────

  describe('reset', () => {
    it('clears all memories', async () => {
      provider = await createProvider();
      await provider.add({ content: 'a', infer: false });
      await provider.add({ content: 'b', infer: false });
      await provider.reset();
      const result = await provider.getAll();
      expect(result.total).toBe(0);
    });
  });
});
