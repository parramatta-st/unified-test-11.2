import type { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';

export default function handler(req:NextApiRequest, res:NextApiResponse) {
  const secure = req.headers['x-forwarded-proto'] === 'https' || process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
  const cookies = [
    serialize('st_auth', '', { path:'/', httpOnly:true, sameSite:'lax', secure, maxAge:0 }),
    serialize('st_tutor', '', { path:'/', httpOnly:true, sameSite:'lax', secure, maxAge:0 }),
    serialize('st_campus', '', { path:'/', httpOnly:true, sameSite:'lax', secure, maxAge:0 }),
  ];
  res.setHeader('Set-Cookie', cookies);

  if (req.method === 'GET') return res.redirect('/login');
  return res.status(200).json({ ok:true });
}
