import { createHash } from 'node:crypto';
import { test as base } from '@playwright/test';

export const test = base.extend({
  extraHTTPHeaders: async ({ extraHTTPHeaders }, use, info) => {
    const hash = createHash('sha256').update(info.testId).digest('hex');
    await use({
      ...extraHTTPHeaders,
      'X-Forwarded-For': `2001:db8::${hash.slice(0, 4)}:${hash.slice(4, 8)}`,
    });
  },
});
