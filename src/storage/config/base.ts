/**
 * Base vector store configuration.
 * Port of Python powermem/storage/config/base.py.
 */
export interface BaseVectorStoreConfig {
  collectionName?: string;
  embeddingModelDims?: number;
}
