import Papa from 'papaparse';
import { loadRowsPrivateFirst, overwriteSheetRows, privateSheetsConfigured, sheetNames, spreadsheetIdFor } from './googleSheets';

export type TutorRole = 'admin' | 'tutor';

export type TutorConfig = {
  campusKey: string;
  campusName: string;
  tutorName: string;
  role: TutorRole;
  active: boolean;
  email: string;
};

export const TUTOR_HEADERS = ['campusKey', 'tutorName', 'role', 'active', 'email', 'campusName'];

function norm(v: any) { return String(v ?? '').trim(); }
function lower(v: any) { return norm(v).toLowerCase(); }

function truthyActive(v: any) {
  const s = lower(v);
  if (!s) return true;
  return ['true', 'yes', 'y', '1', 'active', 'enabled'].includes(s);
}

function roleOf(v: any): TutorRole {
  return lower(v).includes('admin') ? 'admin' : 'tutor';
}

function splitAdmins(value: string) {
  return (value || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeRow(row: any): TutorConfig | null {
  const tutorName = norm(row.tutorName || row.TutorName || row.tutor || row.Tutor || row.name || row.Name);
  if (!tutorName) return null;
  const campusKey = norm(row.campusKey || row.CampusKey || row.campus || row.Campus || 'parramatta').toLowerCase();
  const campusName = norm(row.campusName || row.CampusName || row.centreName || row.CentreName || row.centerName || row.CenterName || campusKey);
  return {
    campusKey,
    campusName,
    tutorName,
    role: roleOf(row.role || row.Role),
    active: truthyActive(row.active ?? row.Active ?? row.enabled ?? row.Enabled),
    email: norm(row.email || row.Email),
  };
}

function fromCampusesJson(): TutorConfig[] {
  const raw = process.env.NEXT_PUBLIC_CAMPUSES_JSON || '';
  const admins = splitAdmins(process.env.ADMIN_TUTORS || process.env.NEXT_PUBLIC_ADMIN_TUTORS || '');
  try {
    const campuses = JSON.parse(raw || '[]');
    if (!Array.isArray(campuses)) return [];
    const out: TutorConfig[] = [];
    for (const campus of campuses) {
      const campusKey = norm(campus.id || campus.campusKey || 'parramatta').toLowerCase();
      const campusName = norm(campus.name || campus.campusName || campusKey);
      const tutors = Array.isArray(campus.tutors) ? campus.tutors : [];
      for (const t of tutors) {
        const tutorName = norm(t);
        if (!tutorName) continue;
        const clean = tutorName.toLowerCase();
        const first = clean.split(/\s+/)[0];
        out.push({ campusKey, campusName, tutorName, role: admins.includes(clean) || admins.includes(first) ? 'admin' : 'tutor', active: true, email: '' });
      }
    }
    return out;
  } catch {
    return [];
  }
}

function fromInlineJson(): TutorConfig[] {
  const raw = process.env.TUTOR_CONFIG_JSON || process.env.NEXT_PUBLIC_TUTOR_CONFIG_JSON || '';
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    const rows = Array.isArray(data) ? data : Array.isArray(data.tutors) ? data.tutors : [];
    return rows.map(normalizeRow).filter(Boolean) as TutorConfig[];
  } catch {
    return [];
  }
}

export function tutorConfigUrl() {
  return process.env.TUTOR_CONFIG_CSV_URL || process.env.NEXT_PUBLIC_TUTOR_CONFIG_CSV_URL || '';
}

async function loadTutorConfigFromCsv(): Promise<TutorConfig[]> {
  const url = tutorConfigUrl();
  if (url) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const text = await res.text();
        const parsed = Papa.parse<Record<string, any>>(text, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
        const rows = (parsed.data || []).map(normalizeRow).filter(Boolean) as TutorConfig[];
        if (rows.length) return rows;
      }
    } catch (error) {
      console.error('Failed to load tutor config CSV', error);
    }
  }
  return [];
}

export async function loadTutorConfig(): Promise<TutorConfig[]> {
  const inline = fromInlineJson();
  if (inline.length) return inline;

  if (privateSheetsConfigured()) {
    try {
      const result = await loadRowsPrivateFirst({ kind: 'TUTOR_CONFIG', sheetName: sheetNames.tutors(), csvUrls: [] });
      const rows = (result.rows || []).map(normalizeRow).filter(Boolean) as TutorConfig[];
      if (rows.length) return rows;
    } catch (error) {
      console.error('Failed to load tutor config from private sheet', error);
    }
  }

  const csvRows = await loadTutorConfigFromCsv();
  if (csvRows.length) return csvRows;

  return fromCampusesJson();
}

export function hasTutorConfigSource() {
  return !!(
    process.env.TUTOR_CONFIG_JSON || process.env.NEXT_PUBLIC_TUTOR_CONFIG_JSON ||
    tutorConfigUrl() || privateSheetsConfigured()
  );
}

export async function saveTutorConfig(rows: TutorConfig[]) {
  if (!privateSheetsConfigured()) throw new Error('Private Google Sheets is required to save tutors. Configure the service account first.');
  const out = rows.map((t) => ({
    campusKey: t.campusKey,
    tutorName: t.tutorName,
    role: t.role,
    active: t.active ? 'TRUE' : 'FALSE',
    email: t.email || '',
    campusName: t.campusName || t.campusKey,
  }));
  await overwriteSheetRows(sheetNames.tutors(), TUTOR_HEADERS, out, spreadsheetIdFor('TUTOR_CONFIG'));
}

export function cleanTutorInput(input: any, existing?: TutorConfig): TutorConfig {
  const campusKey = lower(input?.campusKey || existing?.campusKey || 'parramatta') || 'parramatta';
  const campusName = norm(input?.campusName || existing?.campusName || campusKey);
  const tutorName = norm(input?.tutorName || existing?.tutorName);
  const role = roleOf(input?.role || existing?.role || 'tutor');
  const active = input?.active === undefined ? (existing?.active ?? true) : truthyActive(input.active);
  const email = norm(input?.email || existing?.email || '');
  if (!tutorName) throw new Error('Tutor name is required');
  return { campusKey, campusName, tutorName, role, active, email };
}

export async function getActiveTutors(campusKey?: string) {
  const key = lower(campusKey || '');
  const rows = await loadTutorConfig();
  return rows
    .filter((t) => t.active)
    .filter((t) => !key || t.campusKey === key)
    .sort((a, b) => a.tutorName.localeCompare(b.tutorName));
}

export async function findTutor(tutorName: string, campusKey?: string) {
  const name = lower(tutorName);
  const first = name.split(/\s+/)[0];
  if (!name) return null;
  const rows = await loadTutorConfig();
  const key = lower(campusKey || '');
  return rows.find((t) => {
    if (key && t.campusKey !== key) return false;
    const clean = lower(t.tutorName);
    const firstClean = clean.split(/\s+/)[0];
    return clean === name || firstClean === name || clean === first || firstClean === first;
  }) || null;
}

export async function isAdminTutor(tutorName: string, campusKey?: string) {
  const tutor = await findTutor(tutorName, campusKey);
  if (tutor) return tutor.active && tutor.role === 'admin';

  const clean = lower(tutorName);
  const first = clean.split(/\s+/)[0];
  const admins = splitAdmins(process.env.ADMIN_TUTORS || process.env.NEXT_PUBLIC_ADMIN_TUTORS || '');
  return !!clean && (admins.includes(clean) || admins.includes(first));
}

export function uniqueCampuses(tutors: TutorConfig[]) {
  const map = new Map<string, { id: string; name: string }>();
  for (const t of tutors) {
    if (!map.has(t.campusKey)) map.set(t.campusKey, { id: t.campusKey, name: t.campusName || t.campusKey });
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}
