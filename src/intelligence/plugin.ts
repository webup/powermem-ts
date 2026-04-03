/**
 * Intelligence plugin interfaces.
 * Port of Python powermem/intelligence/plugin.py.
 */
import type { VectorStoreSearchMatch } from '../storage/base.js';

export interface IntelligencePlugin {
  name: string;
  processMetadata?(content: string, metadata: Record<string, unknown>): Record<string, unknown>;
  processSearchResults?(results: VectorStoreSearchMatch[], query: string): VectorStoreSearchMatch[];
}
