import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (value: string) => createHash('sha256').update(value).digest();

export function hasAdminAccess(headers: Headers) {
  const user = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  const header = headers.get('authorization') ?? '';
  if (!user || !password || !header.startsWith('Basic ')) return false;
  const supplied = Buffer.from(header.slice(6), 'base64');
  return timingSafeEqual(digest(supplied.toString('utf8')), digest(`${user}:${password}`));
}

export function adminChallenge() {
  return new Response('Acesso restrito', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="MotorDeck", charset="UTF-8"', 'Cache-Control': 'private, no-store' },
  });
}
