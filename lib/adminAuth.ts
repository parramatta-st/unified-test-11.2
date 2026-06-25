import { parse } from 'cookie';
import type { NextApiRequest } from 'next';
import { isAdminTutor } from './tutorConfig';

export function getTutorFromRequest(req: NextApiRequest) {
  const cookies = parse(req.headers.cookie || '');
  return decodeURIComponent(cookies.st_tutor || '').trim();
}

export function getCampusFromRequest(req: NextApiRequest) {
  const cookies = parse(req.headers.cookie || '');
  return decodeURIComponent(cookies.st_campus || '').trim();
}

export async function requireAdmin(req: NextApiRequest) {
  const cookies = parse(req.headers.cookie || '');
  const authed = cookies.st_auth === '1';
  const tutor = getTutorFromRequest(req);
  const campus = getCampusFromRequest(req);
  const isAdmin = authed && await isAdminTutor(tutor, campus);
  return { authed, tutor, campus, isAdmin };
}
