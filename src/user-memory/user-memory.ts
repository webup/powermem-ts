/**
 * UserMemory — user profile extraction and profile-aware search.
 * Port of Python powermem/user_memory/user_memory.py.
 */
import type { Memory } from '../core/memory.js';
import type { UserProfileStore, UserProfile } from './storage/user-profile.js';
import type { QueryRewriter } from './query-rewrite/rewriter.js';

export interface UserMemoryConfig {
  memory: Memory;
  profileStore: UserProfileStore;
  queryRewriter?: QueryRewriter;
}

export class UserMemory {
  private readonly memory: Memory;
  private readonly profileStore: UserProfileStore;
  private readonly queryRewriter?: QueryRewriter;

  constructor(config: UserMemoryConfig) {
    this.memory = config.memory;
    this.profileStore = config.profileStore;
    this.queryRewriter = config.queryRewriter;
  }

  /** Add memory + optionally extract user profile from content. */
  async add(
    content: string,
    options: {
      userId: string;
      agentId?: string;
      metadata?: Record<string, unknown>;
      infer?: boolean;
      extractProfile?: boolean;
      profileContent?: string;
    }
  ): Promise<Record<string, unknown>> {
    const memResult = await this.memory.add(content, {
      userId: options.userId,
      agentId: options.agentId,
      metadata: options.metadata,
      infer: options.infer,
    });

    const result: Record<string, unknown> = { ...memResult, profileExtracted: false };

    if (options.extractProfile && options.profileContent) {
      await this.profileStore.saveProfile(options.userId, options.profileContent);
      result.profileExtracted = true;
      result.profileContent = options.profileContent;
    }

    return result;
  }

  /** Search with optional profile-aware query rewriting. */
  async search(
    query: string,
    options: {
      userId?: string;
      agentId?: string;
      limit?: number;
      threshold?: number;
      addProfile?: boolean;
    } = {}
  ): Promise<Record<string, unknown>> {
    let effectiveQuery = query;

    // Query rewrite with user profile context
    if (this.queryRewriter && options.userId) {
      const profile = await this.profileStore.getProfileByUserId(options.userId);
      if (profile?.profileContent) {
        const rewriteResult = await this.queryRewriter.rewrite(query, profile.profileContent);
        if (rewriteResult.isRewritten) {
          effectiveQuery = rewriteResult.rewrittenQuery;
        }
      }
    }

    const searchResult = await this.memory.search(effectiveQuery, {
      userId: options.userId,
      agentId: options.agentId,
      limit: options.limit,
      threshold: options.threshold,
    });

    const result: Record<string, unknown> = { ...searchResult };

    if (options.addProfile && options.userId) {
      const profile = await this.profileStore.getProfileByUserId(options.userId);
      if (profile) {
        result.profileContent = profile.profileContent;
        result.topics = profile.topics;
      }
    }

    return result;
  }

  /** Get user profile. */
  async profile(userId: string): Promise<UserProfile | null> {
    return this.profileStore.getProfileByUserId(userId);
  }

  /** Delete user profile. */
  async deleteProfile(userId: string): Promise<boolean> {
    const profile = await this.profileStore.getProfileByUserId(userId);
    if (!profile) return false;
    return this.profileStore.deleteProfile(profile.id);
  }

  /** Delete all memories + profile for a user. */
  async deleteAll(userId: string, options: { deleteProfile?: boolean } = {}): Promise<boolean> {
    await this.memory.deleteAll({ userId });
    if (options.deleteProfile) {
      const profile = await this.profileStore.getProfileByUserId(userId);
      if (profile) await this.profileStore.deleteProfile(profile.id);
    }
    return true;
  }

  async close(): Promise<void> {
    await this.memory.close();
    await this.profileStore.close();
  }
}
