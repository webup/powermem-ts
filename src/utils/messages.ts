/**
 * Message parsing utilities — extract text from multimodal message inputs.
 * Mirrors Python powermem's parse_vision_messages and message handling.
 */
import type { MemoryContent, MessageInput, ContentPart } from '../types/memory.js';

/**
 * Extract plain text from MemoryContent (string or messages array).
 * For multimodal messages, concatenates all text parts.
 * Image URLs are noted as [image] placeholders.
 * Audio URLs are noted as [audio] placeholders.
 */
export function extractTextFromContent(content: MemoryContent): string {
  if (typeof content === 'string') return content;

  const parts: string[] = [];
  for (const msg of content) {
    if (typeof msg.content === 'string') {
      parts.push(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'text' && part.text) {
          parts.push(part.text);
        } else if (part.type === 'image_url') {
          parts.push('[image]');
        } else if (part.type === 'audio') {
          parts.push('[audio]');
        }
      }
    }
  }
  return parts.join('\n');
}

/**
 * Check if content contains vision (image) parts.
 */
export function hasVisionContent(content: MemoryContent): boolean {
  if (typeof content === 'string') return false;
  return content.some(msg => {
    if (typeof msg.content === 'string') return false;
    return msg.content.some(part => part.type === 'image_url');
  });
}

/**
 * Check if content contains audio parts.
 */
export function hasAudioContent(content: MemoryContent): boolean {
  if (typeof content === 'string') return false;
  return content.some(msg => {
    if (typeof msg.content === 'string') return false;
    return msg.content.some(part => part.type === 'audio');
  });
}

/**
 * Extract image URLs from multimodal content.
 */
export function extractImageUrls(content: MemoryContent): string[] {
  if (typeof content === 'string') return [];
  const urls: string[] = [];
  for (const msg of content) {
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'image_url' && part.image_url?.url) {
          urls.push(part.image_url.url);
        }
      }
    }
  }
  return urls;
}

/**
 * Convert MemoryContent to LangChain message format for LLM processing.
 * Used when passing multimodal content through vision-capable LLMs.
 */
export function toLangChainMessages(content: MemoryContent): Array<{ role: string; content: string | ContentPart[] }> {
  if (typeof content === 'string') return [{ role: 'user', content }];
  return content.map(msg => ({ role: msg.role, content: msg.content }));
}
