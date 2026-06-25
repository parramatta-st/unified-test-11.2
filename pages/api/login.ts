import type { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';
import { findTutor, hasTutorConfigSource } from '../../lib/tutorConfig';

export default async function handler(req:NextApiRequest, res:NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const { campus, tutor, password } = req.body || {};
  const expected = process.env.TUTOR_PASSWORD || '';
  if (!tutor || !password) return res.status(400).json({ ok:false, error:'Missing tutor or password' });
  if (expected && password !== expected) {
    return res.status(401).json({ ok:false, error:'Incorrect password' });
  }

  const tutorRecord = await findTutor(String(tutor || ''), String(campus || ''));
  if (tutorRecord && !tutorRecord.active) {
    return res.status(403).json({ ok:false, error:'This tutor is inactive. Please contact admin.' });
  }

  // If a tutor config sheet is configured, require the tutor to exist in it.
  if (hasTutorConfigSource() && !tutorRecord) {
    return res.status(403).json({ ok:false, error:'Tutor not found in active tutor list.' });
  }

  const isHttps = (req.headers['x-forwarded-proto'] === 'https');
  const secure = isHttps || process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
  const tutorName = (tutorRecord?.tutorName || String(tutor || '')).trim();
  const campusKey = (tutorRecord?.campusKey || String(campus || '')).trim();

  const cookies = [
    serialize('st_auth', '1', { path: '/', httpOnly: true, sameSite: 'lax', secure, maxAge: 60*60*24*30 }),
    serialize('st_tutor', tutorName, { path: '/', httpOnly: true, sameSite: 'lax', secure, maxAge: 60*60*24*30 }),
    serialize('st_campus', campusKey, { path: '/', httpOnly: true, sameSite: 'lax', secure, maxAge: 60*60*24*30 }),
  ];

  res.setHeader('Set-Cookie', cookies);
  return res.status(200).json({ ok:true, tutor: tutorName, campus: campusKey, role: tutorRecord?.role || 'tutor' });
}
