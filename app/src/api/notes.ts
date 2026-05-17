import type { NotesFile } from '@pachu/shared';

export async function ingestNotes(body: {
  title: string;
  content: string;
}): Promise<NotesFile> {
  return {
    id: `local-${Date.now()}`,
    title: body.title,
    createdAt: new Date().toISOString(),
    byteLength: new TextEncoder().encode(body.content).length,
  };
}
