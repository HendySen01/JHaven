export function testDatabaseUrl(value: string | undefined): URL {
  const url = value ? URL.parse(value) : null;
  if (
    !url ||
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    !/^\/jhaven_test_[a-z0-9_]+$/.test(url.pathname)
  )
    throw new Error('数据库集成测试仅允许本机 jhaven_test_ 前缀的 PostgreSQL 隔离库。');
  return url;
}
