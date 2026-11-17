import { describe, expect, it, vi } from 'vitest';
import { fetchHealth } from './health';
import { APP_INFO } from '@jhaven/shared';

describe('服务状态读取', () => {
  it('接受真实 API 契约', async () => {
    const body = { status: 'ok', service: 'jhaven-api', stage: APP_INFO.stage };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body)));
    await expect(fetchHealth(fetcher)).resolves.toEqual(body);
  });

  it('拒绝 HTTP 错误', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
    await expect(fetchHealth(fetcher)).rejects.toThrow('服务暂时不可用');
  });

  it('拒绝不符合契约的响应，避免误报连接成功', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"status":"ok"}'));
    await expect(fetchHealth(fetcher)).rejects.toThrow();
  });

  it('传递网络故障供界面处理', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(fetchHealth(fetcher)).rejects.toThrow('Failed to fetch');
  });
});
