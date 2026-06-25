import type { NextApiRequest, NextApiResponse } from 'next';
import { loadTutorConfig, uniqueCampuses } from '../../lib/tutorConfig';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const tutors = await loadTutorConfig();
    const active = tutors.filter((t) => t.active);
    return res.status(200).json({
      ok: true,
      campuses: uniqueCampuses(active),
      tutors: active.map((t) => ({
        campusKey: t.campusKey,
        campusName: t.campusName,
        tutorName: t.tutorName,
        role: t.role,
      })),
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || 'Failed to load tutors' });
  }
}
