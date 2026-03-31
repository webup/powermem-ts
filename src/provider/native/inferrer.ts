import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getFactRetrievalPrompt, buildUpdateMemoryPrompt } from './prompts.js';

export interface MemoryAction {
  id: string;
  text: string;
  event: 'ADD' | 'UPDATE' | 'DELETE' | 'NONE';
  oldMemory?: string;
}

/** Strip ```json ... ``` wrappers from LLM output. */
function removeCodeBlocks(content: string): string {
  const trimmed = content.trim();
  const match = trimmed.match(/^```[a-zA-Z0-9]*\n([\s\S]*?)\n```$/);
  return match ? match[1].trim() : trimmed;
}

export class Inferrer {
  constructor(private readonly llm: BaseChatModel) {}

  /** Extract atomic facts from input text using LLM. */
  async extractFacts(content: string): Promise<string[]> {
    const systemPrompt = getFactRetrievalPrompt();
    const userPrompt = `Input:\n${content}`;

    const response = await this.llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ]);

    const text = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

    const cleaned = removeCodeBlocks(text);

    try {
      const parsed = JSON.parse(cleaned) as { facts?: unknown };
      // Defensive: handle various LLM output formats
      if (Array.isArray(parsed.facts)) {
        return parsed.facts.filter((f): f is string => typeof f === 'string' && f.trim().length > 0);
      }
      // Some small models return facts as a single string instead of array
      if (typeof parsed.facts === 'string' && parsed.facts.trim().length > 0) {
        return [parsed.facts.trim()];
      }
      return [];
    } catch {
      return [];
    }
  }

  /**
   * Decide memory actions (ADD/UPDATE/DELETE/NONE) by comparing new facts
   * against existing memories via LLM.
   *
   * @param facts - Newly extracted facts
   * @param existingMemories - Existing memories with temp IDs
   * @param idMapping - Map of temp ID ("0","1") → real Snowflake ID
   * @returns Actions with temp IDs (caller maps back to real IDs)
   */
  async decideActions(
    facts: string[],
    existingMemories: Array<{ id: string; text: string }>,
    idMapping: Map<string, string>
  ): Promise<MemoryAction[]> {
    const prompt = buildUpdateMemoryPrompt(existingMemories, facts);

    const response = await this.llm.invoke([new HumanMessage(prompt)]);

    const text = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

    const cleaned = removeCodeBlocks(text);

    try {
      const parsed = JSON.parse(cleaned) as {
        memory?: Array<{
          id: string;
          text: string;
          event: string;
          old_memory?: string;
        }>;
      };

      return (parsed.memory ?? []).map((action) => ({
        id: action.id,
        text: action.text,
        event: action.event.toUpperCase() as MemoryAction['event'],
        oldMemory: action.old_memory,
      }));
    } catch {
      return [];
    }
  }
}
