import { describe, expect, test } from 'bun:test';
import type { LlmAdapter } from '../src/llm/adapter.js';
import { ingestNotes, splitIntoChunks } from '../src/llm/pipeline/ingestNotes.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLlm(response: string | ((call: number) => string)): LlmAdapter {
  let calls = 0;
  return {
    provider: 'mock',
    model: 'mock',
    ping: async () => true,
    chat: async () => {
      const r = typeof response === 'function' ? response(calls) : response;
      calls++;
      return r;
    },
  };
}

/** Build a minimal valid JSON response for a list of TermCandidates, verified against `notes`. */
function jsonResponse(
  notes: string,
  terms: Array<{ term: string; definition: string }>,
): string {
  const items = terms.map(({ term, definition }) => {
    // Locate a verbatim sentence in `notes` that contains the term.
    const sentences = notes.split(/(?<=[.!?])\s+/);
    const anchor = sentences.find((s) => s.toLowerCase().includes(term.toLowerCase())) ?? notes;
    return {
      term,
      definition,
      source_span: anchor,
      style_anchor: anchor,
    };
  });
  return JSON.stringify({ terms: items });
}

// ---------------------------------------------------------------------------
// splitIntoChunks
// ---------------------------------------------------------------------------

describe('splitIntoChunks', () => {
  test('short text stays as one chunk', () => {
    const text = 'Hello world.';
    expect(splitIntoChunks(text, 4000)).toEqual([text]);
  });

  test('text at exactly chunkSize stays as one chunk', () => {
    const text = 'a'.repeat(4000);
    expect(splitIntoChunks(text, 4000)).toEqual([text]);
  });

  test('splits on double newline when text exceeds chunkSize', () => {
    const para1 = 'a'.repeat(30);
    const para2 = 'b'.repeat(30);
    const text = `${para1}\n\n${para2}`;
    const chunks = splitIntoChunks(text, 50);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe(para1);
    expect(chunks[1]).toBe(para2);
  });

  test('does not produce empty chunks', () => {
    const text = 'p1\n\np2\n\np3';
    const chunks = splitIntoChunks(text, 4);
    expect(chunks.every((c) => c.trim().length > 0)).toBe(true);
  });

  test('three paragraphs that each exceed chunkSize split into three chunks', () => {
    const para = 'x'.repeat(60);
    const text = `${para}\n\n${para}\n\n${para}`;
    const chunks = splitIntoChunks(text, 100);
    expect(chunks).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// ingestNotes — single chunk
// ---------------------------------------------------------------------------

describe('ingestNotes', () => {
  const NOTES =
    'Hiragana is the rounded script, used for grammar and Japanese words. ' +
    'Katakana is the angular script, used for foreign loanwords.';

  test('returns accepted terms from a single LLM call', async () => {
    const response = jsonResponse(NOTES, [
      { term: 'Hiragana', definition: 'The rounded Japanese script.' },
      { term: 'Katakana', definition: 'The angular Japanese script.' },
    ]);
    const result = await ingestNotes({ llm: makeLlm(response), rawText: NOTES });
    expect(result.terms).toHaveLength(2);
    expect(result.terms.map((t) => t.term)).toContain('Hiragana');
    expect(result.terms.map((t) => t.term)).toContain('Katakana');
    expect(result.chunks).toHaveLength(1);
    expect(result.totalRejected).toBe(0);
  });

  test('rejected candidates (hallucinated spans) are not in terms', async () => {
    const bad = JSON.stringify({
      terms: [
        // hallucinated sourceSpan — not in NOTES
        { term: 'Romaji', definition: 'Latin alphabet.', source_span: 'Romaji is the Latin alphabet.', style_anchor: 'Romaji is the Latin alphabet.' },
        // valid
        { term: 'Hiragana', definition: 'Rounded script.', source_span: 'Hiragana is the rounded script, used for grammar and Japanese words.', style_anchor: 'Hiragana is the rounded script, used for grammar and Japanese words.' },
      ],
    });
    const result = await ingestNotes({ llm: makeLlm(bad), rawText: NOTES });
    expect(result.terms.map((t) => t.term)).toEqual(['Hiragana']);
    expect(result.totalRejected).toBe(1);
  });

  test('deduplicates identical terms across two chunks', async () => {
    // Force two chunks by setting chunkSize small enough to split the notes.
    // Both chunks contain "Hiragana" so the LLM returns it from each chunk.
    let call = 0;
    const llm = makeLlm(() => {
      call++;
      // Both LLM calls return Hiragana (simulating the same term appearing in both halves).
      return jsonResponse(
        NOTES,
        [{ term: 'Hiragana', definition: 'Rounded script.' }],
      );
    });
    const result = await ingestNotes({ llm, rawText: NOTES, chunkSize: 50 });
    const hiraganaCount = result.terms.filter((t) => t.term === 'Hiragana').length;
    expect(hiraganaCount).toBe(1);
  });

  test('deduplication is case-insensitive', async () => {
    // First call returns "Hiragana", second call returns "hiragana" (different casing).
    const calls: string[] = [
      jsonResponse(NOTES, [{ term: 'Hiragana', definition: 'Rounded.' }]),
      jsonResponse(NOTES, [{ term: 'hiragana', definition: 'rounded.' }]),
    ];
    const llm = makeLlm((i) => calls[i] ?? '{"terms":[]}');
    const result = await ingestNotes({ llm, rawText: NOTES, chunkSize: 50 });
    const hiraganaCount = result.terms.filter(
      (t) => t.term.toLowerCase() === 'hiragana',
    ).length;
    expect(hiraganaCount).toBe(1);
  });

  test('empty LLM response yields no terms and no error', async () => {
    const result = await ingestNotes({ llm: makeLlm('{}'), rawText: NOTES });
    expect(result.terms).toHaveLength(0);
    expect(result.chunks[0]?.accepted).toBe(0);
  });

  test('chunk diagnostics contain rawOutput and per-chunk counts', async () => {
    const response = jsonResponse(NOTES, [
      { term: 'Hiragana', definition: 'Rounded script.' },
    ]);
    const result = await ingestNotes({ llm: makeLlm(response), rawText: NOTES });
    expect(result.chunks[0]?.rawOutput).toBe(response);
    expect(result.chunks[0]?.accepted).toBe(1);
    expect(result.chunks[0]?.chunkLength).toBe(NOTES.length);
  });
});
