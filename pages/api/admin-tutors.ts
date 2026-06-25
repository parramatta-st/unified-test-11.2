import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin } from '../../lib/adminAuth';
import { cleanTutorInput, loadTutorConfig, saveTutorConfig, type TutorConfig } from '../../lib/tutorConfig';
import { privateSheetsConfigured } from '../../lib/googleSheets';

function norm(v: any) { return String(v ?? '').trim(); }
function lower(v: any) { return norm(v).toLowerCase(); }
function keyOf(t: TutorConfig) { return `${lower(t.campusKey)}|${lower(t.tutorName)}`; }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const admin = await requireAdmin(req);
  if (!admin.isAdmin) return res.status(403).json({ ok: false, error: 'Admin access required' });

  if (req.method === 'GET') {
    try {
      const tutors = await loadTutorConfig();
      return res.status(200).json({ ok: true, tutors, privateSheetsConfigured: privateSheetsConfigured() });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message || 'Could not load tutors' });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const action = norm(req.body?.action || '');
    let tutors = await loadTutorConfig();

    if (action === 'create') {
      const candidate = cleanTutorInput(req.body?.tutor || {}, undefined);
      if (tutors.some((t) => keyOf(t) === keyOf(candidate)) && !req.body?.force) return res.status(409).json({ ok: false, error: 'Tutor already exists for this campus.' });
      tutors = [...tutors, candidate];
      await saveTutorConfig(tutors);
      return res.status(200).json({ ok: true, tutor: candidate, tutors });
    }

    if (action === 'update') {
      const originalCampusKey = lower(req.body?.originalCampusKey || req.body?.campusKey || req.body?.tutor?.campusKey || 'parramatta');
      const originalTutorName = lower(req.body?.originalTutorName || req.body?.tutorName || req.body?.tutor?.tutorName);
      const idx = tutors.findIndex((t) => lower(t.campusKey) === originalCampusKey && lower(t.tutorName) === originalTutorName);
      if (idx < 0) return res.status(404).json({ ok: false, error: 'Tutor not found' });
      const updated = cleanTutorInput(req.body?.tutor || {}, tutors[idx]);
      const duplicate = tutors.some((t, i) => i !== idx && keyOf(t) === keyOf(updated));
      if (duplicate && !req.body?.force) return res.status(409).json({ ok: false, error: 'Another tutor already has that name for this campus.' });
      tutors[idx] = updated;
      await saveTutorConfig(tutors);
      return res.status(200).json({ ok: true, tutor: updated, tutors });
    }

    if (action === 'deactivate' || action === 'reactivate') {
      const campusKey = lower(req.body?.campusKey || 'parramatta');
      const tutorName = lower(req.body?.tutorName);
      const idx = tutors.findIndex((t) => lower(t.campusKey) === campusKey && lower(t.tutorName) === tutorName);
      if (idx < 0) return res.status(404).json({ ok: false, error: 'Tutor not found' });
      tutors[idx] = { ...tutors[idx], active: action === 'reactivate' };
      await saveTutorConfig(tutors);
      return res.status(200).json({ ok: true, tutor: tutors[idx], tutors });
    }

    if (action === 'import') {
      const incoming = Array.isArray(req.body?.rows) ? req.body.rows : [];
      if (!incoming.length) return res.status(400).json({ ok: false, error: 'No rows supplied' });
      const next = [...tutors];
      let created = 0;
      let updated = 0;
      const errors: string[] = [];
      for (let i = 0; i < incoming.length; i++) {
        try {
          const candidate = cleanTutorInput({ active: true, ...incoming[i] }, undefined);
          const idx = next.findIndex((t) => keyOf(t) === keyOf(candidate));
          if (idx >= 0) { next[idx] = candidate; updated++; }
          else { next.push(candidate); created++; }
        } catch (err: any) {
          errors.push(`Row ${i + 2}: ${err?.message || 'invalid row'}`);
        }
      }
      if (errors.length && !req.body?.saveValidRows) return res.status(400).json({ ok: false, error: 'Import has invalid rows.', errors });
      await saveTutorConfig(next);
      return res.status(200).json({ ok: true, created, updated, errors, tutors: next });
    }

    return res.status(400).json({ ok: false, error: 'Unknown action' });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || 'Could not save tutors' });
  }
}
