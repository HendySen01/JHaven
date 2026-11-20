import type { Request } from 'express';

export const sessionCookieName = (secure: boolean) =>
  secure ? '__Host-jhaven_session' : 'jhaven_session';

export function sessionToken(request: Request, secure: boolean) {
  const name = sessionCookieName(secure);
  const matches = (request.headers.cookie ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  if (matches.length !== 1) return undefined;
  const token = matches[0]!.slice(name.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
}
