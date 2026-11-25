import { healthResponseSchema, type HealthResponse } from '@jhaven/shared';
import { withRequestDeadline } from './requestDeadline';

export async function fetchHealth(fetcher: typeof fetch = fetch): Promise<HealthResponse> {
  return withRequestDeadline(5000, async (signal) => {
    const response = await fetcher('/api/health', {
      signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error('服务暂时不可用');
    return healthResponseSchema.parse(await response.json());
  });
}
