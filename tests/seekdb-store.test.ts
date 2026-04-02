/**
 * SeekDBStore unit tests — mirrors store.test.ts structure.
 * Requires `seekdb` + `@seekdb/js-bindings` to be installed. Skipped otherwise.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SeekDBStore } from '../src/provider/native/seekdb-store.js';

/** Try to create a SeekDBStore — returns null if seekdb native bindings unavailable */
async function tryCreateStore(tmpDir: string, collectionName: string) {
  try {
    return await SeekDBStore.create({
      path: tmpDir,
      database: 'test',
      collectionName,
      distance: 'cosine',
      dimension: 3,
    });
  } catch {
    return null;
  }
}

let seekdbAvailable = false;
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seekdb-check-'));
  try {
    const s = await tryCreateStore(dir, 'check');
    seekdbAvailable = s != null;
    await s?.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const describeIf = seekdbAvailable ? describe : describe.skip;

describeIf('SeekDBStore', () => {
  let store: SeekDBStore;
  let tmpDir: string;

  function makePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      data: 'test content',
      user_id: null,
      agent_id: null,
      run_id: null,
      hash: 'abc123',
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      scope: null,
      category: null,
      access_count: 0,
      metadata: {},
      ...overrides,
    };
  }

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seekdb-test-'));
    store = (await tryCreateStore(tmpDir, `mem_${Date.now()}`))!;
  });

  afterEach(async () => {
    if (store) await store.close();
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('insert and retrieve by ID', async () => {
    await store.insert('1000', [1, 0, 0], makePayload({ data: 'hello' }));
    const rec = await store.getById('1000');
    expect(rec).not.toBeNull();
    expect(rec!.id).toBe('1000');
    expect(rec!.content).toBe('hello');
  });

  it('returns null for non-existent ID', async () => {
    expect(await store.getById('9999')).toBeNull();
  });

  it('access control — userId mismatch returns null', async () => {
    await store.insert('1000', [1, 0, 0], makePayload({ user_id: 'alice' }));
    expect(await store.getById('1000', 'alice')).not.toBeNull();
    expect(await store.getById('1000', 'bob')).toBeNull();
  });

  it('update content', async () => {
    await store.insert('1000', [1, 0, 0], makePayload({ data: 'old' }));
    await store.update('1000', [0, 1, 0], makePayload({ data: 'new' }));
    const rec = await store.getById('1000');
    expect(rec!.content).toBe('new');
  });

  it('delete record', async () => {
    await store.insert('1000', [1, 0, 0], makePayload());
    expect(await store.remove('1000')).toBe(true);
    expect(await store.getById('1000')).toBeNull();
  });

  it('delete non-existent returns false', async () => {
    expect(await store.remove('9999')).toBe(false);
  });

  it('list returns all records', async () => {
    await store.insert('1', [1, 0, 0], makePayload({ data: 'a' }));
    await store.insert('2', [0, 1, 0], makePayload({ data: 'b' }));
    const { records, total } = await store.list();
    expect(total).toBe(2);
    expect(records).toHaveLength(2);
  });

  it('list with filters', async () => {
    await store.insert('1', [1, 0, 0], makePayload({ user_id: 'alice', data: 'a1' }));
    await store.insert('2', [0, 1, 0], makePayload({ user_id: 'bob', data: 'b1' }));
    await store.insert('3', [0, 0, 1], makePayload({ user_id: 'alice', data: 'a2' }));

    const { records, total } = await store.list({ userId: 'alice' });
    expect(total).toBe(2);
    expect(records).toHaveLength(2);
  });

  it('list with pagination', async () => {
    for (let i = 1; i <= 5; i++) {
      await store.insert(String(i), [i, 0, 0], makePayload({ data: `item${i}` }));
    }
    const page = await store.list({}, 2, 0);
    expect(page.total).toBe(5);
    expect(page.records).toHaveLength(2);
  });

  it('search returns ranked results', async () => {
    await store.insert('1', [1, 0, 0], makePayload({ data: 'x-axis' }));
    await store.insert('2', [0, 1, 0], makePayload({ data: 'y-axis' }));
    await store.insert('3', [0.9, 0.1, 0], makePayload({ data: 'near-x' }));

    const results = await store.search([1, 0, 0], {}, 10);
    expect(results.length).toBe(3);
    expect(results[0].content).toBe('x-axis');
    expect(results[0].score).toBeGreaterThan(results[2].score);
  });

  it('search respects filters', async () => {
    await store.insert('1', [1, 0, 0], makePayload({ user_id: 'alice', data: 'alice data' }));
    await store.insert('2', [1, 0, 0], makePayload({ user_id: 'bob', data: 'bob data' }));

    const results = await store.search([1, 0, 0], { userId: 'alice' }, 10);
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('alice data');
  });

  it('count', async () => {
    await store.insert('1', [1, 0, 0], makePayload({ user_id: 'alice' }));
    await store.insert('2', [0, 1, 0], makePayload({ user_id: 'bob' }));
    expect(await store.count()).toBe(2);
    expect(await store.count({ userId: 'alice' })).toBe(1);
  });

  it('removeAll clears everything', async () => {
    await store.insert('1', [1, 0, 0], makePayload());
    await store.insert('2', [0, 1, 0], makePayload());
    await store.removeAll();
    expect(await store.count()).toBe(0);
  });

  it('removeAll with filter', async () => {
    await store.insert('1', [1, 0, 0], makePayload({ user_id: 'alice' }));
    await store.insert('2', [0, 1, 0], makePayload({ user_id: 'bob' }));
    await store.removeAll({ userId: 'alice' });
    expect(await store.count()).toBe(1);
  });

  it('incrementAccessCount', async () => {
    await store.insert('1', [1, 0, 0], makePayload({ access_count: 0 }));
    await store.incrementAccessCount('1');
    await store.incrementAccessCount('1');
    const rec = await store.getById('1');
    expect(rec!.accessCount).toBe(2);
  });

  it('metadata round-trip', async () => {
    await store.insert('1', [1, 0, 0], makePayload({
      data: 'with meta',
      metadata: { key: 'value', nested: { deep: true }, tags: [1, 2, 3] },
    }));
    const rec = await store.getById('1');
    expect(rec!.metadata).toEqual({ key: 'value', nested: { deep: true }, tags: [1, 2, 3] });
  });

  it('scope and category round-trip', async () => {
    await store.insert('1', [1, 0, 0], makePayload({ scope: 'personal', category: 'pref' }));
    const rec = await store.getById('1');
    expect(rec!.scope).toBe('personal');
    expect(rec!.category).toBe('pref');
  });
});
