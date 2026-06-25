import { parse } from 'cookie';
import type { NextApiRequest } from 'next';

export function getAuthStatus(req: NextApiRequest) {
  const cookies = parse(req.headers.cookie || '');
  return {
    authed: cookies.st_auth === '1',
    tutor: decodeURIComponent(cookies.st_tutor || '').trim(),
    campus: decodeURIComponent(cookies.st_campus || '').trim(),
  };
}
