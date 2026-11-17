import { healthResponseSchema, type HealthResponse } from '@jhaven/shared';

export async function fetchHealth(fetcher: typeof fetch = fetch): Promise<HealthResponse> {
  const response = await fetcher('/api/health', {
    signal: AbortSignal.timeout(5000),
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!response.ok) throw new Error('服务暂时不可用');
  return healthResponseSchema.parse(await response.json());
}
