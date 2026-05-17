import type {
  ExtractTermsResponse,
  Space,
} from '@pachu/shared';
import { ApiError, apiFetch } from './client';

// MOCK — sample spaces shown when the backend is unreachable, so the
// landing/spaces flow stays demoable offline. REPLACE: drop this constant
// once `GET /spaces` is reliably available in every dev environment.
const MOCK_SPACES: Space[] = [
  {
    id: 'mock-space-cardio',
    title: 'Cardio (clinical)',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    byteLength: 1820,
    summary: {
      termCount: 18,
      dueCount: 7,
      newCount: 4,
      stableCount: 5,
      dueToday: 3,
      playedTodayKinds: [],
      streakDays: 2,
      lastPuzzleKind: 'cloze',
      lastReviewedAt: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
    },
  },
  {
    id: 'mock-space-jp',
    title: 'Japanese 101',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
    byteLength: 940,
    summary: {
      termCount: 22,
      dueCount: 5,
      newCount: 0,
      stableCount: 12,
      dueToday: 0,
      playedTodayKinds: ['flashcards'],
      streakDays: 4,
      lastPuzzleKind: 'flashcards',
      lastReviewedAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    },
  },
];

/**
 * Fetch the user's spaces. Falls back to `MOCK_SPACES` on any
 * network/parse failure so the landing screen stays demoable offline.
 * The fallback is logged so it's easy to spot in dev.
 */
export async function listSpaces(): Promise<Space[]> {
  try {
    const body = await apiFetch<{ spaces: Space[] }>('/spaces');
    return body.spaces;
  } catch (err) {
    if (__DEV__) {
      console.warn('[spaces] live fetch failed, returning MOCK_SPACES:', err);
    }
    return MOCK_SPACES;
  }
}

/** Fetch a single space. Throws `ApiError` on 404 / network failure. */
export async function getSpace(spaceId: string): Promise<Space> {
  return apiFetch<Space>(`/spaces/${encodeURIComponent(spaceId)}`);
}

/** Rename a space. Backend returns the refreshed `Space`. */
export async function renameSpace(spaceId: string, title: string): Promise<Space> {
  return apiFetch<Space>(`/spaces/${encodeURIComponent(spaceId)}`, {
    method: 'PATCH',
    body: { title },
  });
}

/** Delete a space + every term, FSRS row, session, and review event under it. */
export async function deleteSpace(spaceId: string): Promise<void> {
  await apiFetch<void>(`/spaces/${encodeURIComponent(spaceId)}`, { method: 'DELETE' });
}

/**
 * Run the LLM term extractor against a space's stored raw notes.
 *
 * - 200 → terms persisted, refreshed `Space` returned in `response.space`.
 * - 409 (`ApiError.status === 409`) → terms already extracted; caller can
 *   treat this as success and refetch the space.
 * - 422 (`ApiError.status === 422`) → extractor produced no candidates that
 *   passed verification; surface as a user-facing "richer notes please".
 * - 502 → LLM unreachable; surface as "backend lost the LLM".
 */
export async function extractSpaceTerms(spaceId: string): Promise<ExtractTermsResponse> {
  return apiFetch<ExtractTermsResponse>(
    `/spaces/${encodeURIComponent(spaceId)}/extract`,
    { method: 'POST' },
  );
}

export { ApiError };
