import { describe, it, expect } from 'vitest';
import { BM25SparseEmbedder, tokenize, sparseDotProduct, ENGLISH_STOPWORDS } from '../../src/integrations/embeddings/sparse.js';

describe('BM25SparseEmbedder', () => {
  it('produces sparse vectors with indices and values', async () => {
    const bm25 = new BM25SparseEmbedder();
    bm25.fit(['hello world', 'foo bar']);
    const result = await bm25.embedSparse('hello world');
    expect(result.indices.length).toBeGreaterThan(0);
    expect(result.values.length).toBe(result.indices.length);
    expect(result.values.every(v => v > 0)).toBe(true);
  });

  it('returns empty for empty input', async () => {
    const bm25 = new BM25SparseEmbedder();
    const result = await bm25.embedSparse('   ');
    expect(result.indices).toEqual([]);
    expect(result.values).toEqual([]);
  });

  it('ranks relevant docs higher via sparseDotProduct', async () => {
    const bm25 = new BM25SparseEmbedder();
    bm25.fit([
      'TypeScript programming language',
      'Python machine learning',
      'The weather is sunny today',
    ]);
    const query = await bm25.embedSparse('programming language');
    const doc1 = await bm25.embedSparse('TypeScript programming language');
    const doc2 = await bm25.embedSparse('The weather is sunny today');
    expect(sparseDotProduct(query, doc1)).toBeGreaterThan(sparseDotProduct(query, doc2));
  });

  it('batch embedding works', async () => {
    const bm25 = new BM25SparseEmbedder();
    bm25.fit(['a b c']);
    const results = await bm25.embedSparseBatch(['hello', 'world']);
    expect(results).toHaveLength(2);
    expect(results[0].indices.length).toBeGreaterThan(0);
  });

  it('addDocument incrementally updates IDF', async () => {
    const bm25 = new BM25SparseEmbedder();
    bm25.addDocument('first document');
    bm25.addDocument('second document');
    const result = await bm25.embedSparse('document');
    expect(result.indices.length).toBeGreaterThan(0);
  });

  it('custom config works', async () => {
    const bm25 = new BM25SparseEmbedder({ k1: 2.0, b: 0.5, vocabSize: 1000 });
    bm25.fit(['test']);
    const result = await bm25.embedSparse('test');
    expect(result.indices.length).toBeGreaterThan(0);
  });
});

describe('tokenize', () => {
  it('lowercases and splits', () => {
    expect(tokenize('Hello World')).toEqual(['hello', 'world']);
  });

  it('removes punctuation', () => {
    expect(tokenize('Hello, World!')).toEqual(['hello', 'world']);
  });

  it('removes stopwords when provided', () => {
    const result = tokenize('this is a test', ENGLISH_STOPWORDS);
    expect(result).toEqual(['test']);
  });

  it('handles empty string', () => {
    expect(tokenize('')).toEqual([]);
  });
});
