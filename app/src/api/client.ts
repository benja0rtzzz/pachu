import type { HealthResponse } from '@pachu/shared';

const ENV_BASE = process.env.EXPO_PUBLIC_API_BASE_URL;

/**
 * Resolve the backend base URL.
 * - On a real device, you must set EXPO_PUBLIC_API_BASE_URL to the dev laptop's LAN IP.
 * - On the iOS simulator or web, localhost works.
 * - Android emulator's localhost is 10.0.2.2; users should set EXPO_PUBLIC_API_BASE_URL accordingly.
 */
export const API_BASE_URL = ENV_BASE && ENV_BASE.length > 0
  ? ENV_BASE
  : 'http://localhost:4000';

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE_URL}/health`);
  if (!res.ok) throw new Error(`health failed: ${res.status}`);
  return (await res.json()) as HealthResponse;
}
