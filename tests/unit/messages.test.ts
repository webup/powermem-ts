import { describe, it, expect } from 'vitest';
import { extractTextFromContent, hasVisionContent, hasAudioContent, extractImageUrls, toLangChainMessages } from '../../src/utils/messages.js';
import type { MessageInput } from '../../src/types/memory.js';

describe('extractTextFromContent', () => {
  it('returns string as-is', () => {
    expect(extractTextFromContent('hello')).toBe('hello');
  });

  it('extracts text from messages array', () => {
    const msgs: MessageInput[] = [
      { role: 'user', content: 'first message' },
      { role: 'assistant', content: 'second message' },
    ];
    expect(extractTextFromContent(msgs)).toBe('first message\nsecond message');
  });

  it('extracts text parts from multimodal content', () => {
    const msgs: MessageInput[] = [
      { role: 'user', content: [
        { type: 'text', text: 'describe this' },
        { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
      ] },
    ];
    const text = extractTextFromContent(msgs);
    expect(text).toContain('describe this');
    expect(text).toContain('[image]');
  });

  it('handles audio parts', () => {
    const msgs: MessageInput[] = [
      { role: 'user', content: [
        { type: 'text', text: 'transcribe' },
        { type: 'audio', audio_url: 'https://example.com/audio.mp3' },
      ] },
    ];
    const text = extractTextFromContent(msgs);
    expect(text).toContain('[audio]');
  });
});

describe('hasVisionContent', () => {
  it('false for string', () => {
    expect(hasVisionContent('text')).toBe(false);
  });

  it('true when image_url present', () => {
    const msgs: MessageInput[] = [
      { role: 'user', content: [
        { type: 'image_url', image_url: { url: 'https://img.com/1.png' } },
      ] },
    ];
    expect(hasVisionContent(msgs)).toBe(true);
  });

  it('false when no images', () => {
    const msgs: MessageInput[] = [{ role: 'user', content: 'just text' }];
    expect(hasVisionContent(msgs)).toBe(false);
  });
});

describe('hasAudioContent', () => {
  it('false for string', () => {
    expect(hasAudioContent('text')).toBe(false);
  });

  it('true when audio present', () => {
    const msgs: MessageInput[] = [
      { role: 'user', content: [{ type: 'audio', audio_url: 'x.mp3' }] },
    ];
    expect(hasAudioContent(msgs)).toBe(true);
  });
});

describe('extractImageUrls', () => {
  it('empty for string', () => {
    expect(extractImageUrls('text')).toEqual([]);
  });

  it('extracts URLs', () => {
    const msgs: MessageInput[] = [
      { role: 'user', content: [
        { type: 'image_url', image_url: { url: 'https://a.com/1.png' } },
        { type: 'text', text: 'hi' },
        { type: 'image_url', image_url: { url: 'https://b.com/2.png' } },
      ] },
    ];
    expect(extractImageUrls(msgs)).toEqual(['https://a.com/1.png', 'https://b.com/2.png']);
  });
});

describe('toLangChainMessages', () => {
  it('wraps string in user message', () => {
    const result = toLangChainMessages('hello');
    expect(result).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('passes messages through', () => {
    const msgs: MessageInput[] = [
      { role: 'system', content: 'you are helpful' },
      { role: 'user', content: 'hi' },
    ];
    expect(toLangChainMessages(msgs)).toHaveLength(2);
  });
});
