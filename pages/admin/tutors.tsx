import { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import Header from '../../components/Header';
import useAuthGuard from '../../hooks/useAuthGuard';

type Tutor = { campusKey: string; campusName: string; tutorName: string; role: 'admin'|'tutor'; active: boolean; email: string };
type FormState = Tutor;
const emptyForm: FormState = { campusKey: 'parramatta', campusName: 'Parramatta', tutorName: '', role: 'tutor', active: true, email: '' };

function keyOf(t: Tutor) { return `${t.campusKey}|${t.tutorName}`; }
function toCsv(rows: Tutor[]) {
  const headers = ['campusKey','tutorName','role','active','email','campusName'];
  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc((r as any)[h])).join(','))].join('\n');
}
function download(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function AdminTutorsPage() {
  useAuthGuard();
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [privateConfigured, setPrivateConfigured] = useState(false);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'active'|'inactive'>('active');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Tutor | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importError, setImportError] = useState('');

  async function load() {
    setLoading(true); setError(''); setMessage('');
    try {
      const res = await fetch('/api/admin-tutors', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Could not load tutors');
      setTutors(Array.isArray(json.tutors) ? json.tutors : []);
      setPrivateConfigured(!!json.privateSheetsConfigured);
    } catch (e: any) { setError(e?.message || 'Could not load tutors'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tutors
      .filter((t) => tab === 'active' ? t.active : !t.active)
      .filter((t) => !q || [t.tutorName, t.role, t.campusKey, t.campusName, t.email].join(' ').toLowerCase().includes(q))
      .sort((a, b) => a.tutorName.localeCompare(b.tutorName));
  }, [tutors, query, tab]);

  function openAdd() { setEditing(null); setForm(emptyForm); setFormOpen(true); setError(''); setMessage(''); }
  function openEdit(t: Tutor) { setEditing(t); setForm({ ...t }); setFormOpen(true); setError(''); setMessage(''); }

  async function post(body: any) {
    setSaving(true); setError(''); setMessage('');
    try {
      const res = await fetch('/api/admin-tutors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Save failed');
      if (Array.isArray(json.tutors)) setTutors(json.tutors);
      else await load();
      return json;
    } catch (e: any) { setError(e?.message || 'Save failed'); throw e; }
    finally { setSaving(false); }
  }

  async function saveForm(e: React.FormEvent) {
    e.preventDefault();
    try {
      await post(editing ? { action: 'update', originalCampusKey: editing.campusKey, originalTutorName: editing.tutorName, tutor: form } : { action: 'create', tutor: form });
      setFormOpen(false); setEditing(null); setMessage(editing ? 'Tutor updated.' : 'Tutor added.');
    } catch {}
  }

  async function changeActive(t: Tutor, active: boolean) {
    if (!window.confirm(`${active ? 'Reactivate' : 'Deactivate'} ${t.tutorName}?`)) return;
    try { await post({ action: active ? 'reactivate' : 'deactivate', campusKey: t.campusKey, tutorName: t.tutorName }); setMessage(active ? 'Tutor reactivated.' : 'Tutor moved to inactive.'); }
    catch {}
  }


  async function checkSheets() {
    setError(''); setMessage('Checking private Google Sheets connection…');
    try {
      const res = await fetch('/api/admin-sheets-status', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Could not check connection');
      setMessage(`Private Sheets OK. Service account: ${json.email || 'configured'}. Tabs found: ${(json.sheetTitles || []).join(', ') || 'none'}.`);
    } catch (e: any) { setMessage(''); setError(e?.message || 'Private Google Sheets connection failed'); }
  }

  function handleImportFile(file?: File | null) {
    setImportRows([]); setImportError('');
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => { const rows = (result.data || []) as any[]; setImportRows(rows); if (!rows.length) setImportError('No rows found in the file.'); },
      error: (err) => setImportError(err.message),
    });
  }

  async function submitImport() {
    if (!importRows.length) { setImportError('Choose a CSV file first.'); return; }
    try { const json = await post({ action: 'import', rows: importRows }); setImportOpen(false); setImportRows([]); setMessage(`Import complete. Created ${json.created || 0}, updated ${json.updated || 0}.`); }
    catch {}
  }

  const activeCount = tutors.filter((t) => t.active).length;
  const inactiveCount = tutors.filter((t) => !t.active).length;

  return (
    <div>
      <Header />
      <main className="container">
        <div className="card">
          <div className="flex items-center justify-between" style={{ gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h2 className="section-title">Tutors</h2>
              <p className="text-muted">Manage tutor login list and admin roles from the portal.</p>
              <p className="text-sm text-muted">Private Sheets: {privateConfigured ? 'configured' : 'not configured / using fallback'}</p>
            </div>
            <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
              <button className="btn" onClick={checkSheets}>Check Sheets</button>
              <button className="btn" onClick={() => download('success-tutoring-tutors.csv', toCsv(tutors))}>Export CSV</button>
              <button className="btn" onClick={() => setImportOpen(true)}>Import CSV</button>
              <button className="btn-primary" onClick={openAdd}>Add Tutor</button>
            </div>
          </div>
          {error && <div className="mt-4" style={{ color: '#fca5a5' }}>{error}</div>}
          {message && <div className="mt-4 badge-success">{message}</div>}

          <div className="mt-4 flex gap-2" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="segmented">
              <button className={`seg-btn ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>Active ({activeCount})</button>
              <button className={`seg-btn ${tab === 'inactive' ? 'active' : ''}`} onClick={() => setTab('inactive')}>Inactive ({inactiveCount})</button>
            </div>
            <input className="input" style={{ maxWidth: 420 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tutor, role, campus..." />
            <button className="btn" onClick={load} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
          </div>

          <section className="card mt-4" style={{ overflowX: 'auto' }}>
            <div className="admin-table-head tutors-grid"><span>Tutor</span><span>Role</span><span>Campus</span><span>Email</span><span>Actions</span></div>
            {loading ? <div className="text-muted p-4">Loading tutors…</div> : filtered.length ? filtered.map((t) => (
              <div className="admin-table-row tutors-grid" key={keyOf(t)}>
                <div><strong>{t.tutorName}</strong><div className="text-sm text-muted">{t.active ? 'Active' : 'Inactive'}</div></div>
                <div>{t.role}</div>
                <div>{t.campusName || t.campusKey}<div className="text-sm text-muted">{t.campusKey}</div></div>
                <div className="text-sm">{t.email || '—'}</div>
                <div className="flex gap-2" style={{ flexWrap: 'wrap' }}><button className="btn" onClick={() => openEdit(t)}>Edit</button>{t.active ? <button className="btn" onClick={() => changeActive(t, false)}>Deactivate</button> : <button className="btn" onClick={() => changeActive(t, true)}>Reactivate</button>}</div>
              </div>
            )) : <div className="text-muted p-4">No {tab} tutors found.</div>}
          </section>
        </div>
      </main>

      {formOpen && (
        <div className="modal-backdrop" onClick={() => setFormOpen(false)}>
          <form className="card modal-card" onSubmit={saveForm} onClick={(e) => e.stopPropagation()}>
            <h3 className="section-title" style={{ fontSize: '1.25rem' }}>{editing ? 'Edit Tutor' : 'Add Tutor'}</h3>
            <div className="grid grid-2 grid-col">
              <label><span className="label">Tutor name</span><input className="input" value={form.tutorName} onChange={(e) => setForm({ ...form, tutorName: e.target.value })} required /></label>
              <label><span className="label">Role</span><select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as any })}><option value="tutor">tutor</option><option value="admin">admin</option></select></label>
              <label><span className="label">Campus key</span><input className="input" value={form.campusKey} onChange={(e) => setForm({ ...form, campusKey: e.target.value })} required /></label>
              <label><span className="label">Campus name</span><input className="input" value={form.campusName} onChange={(e) => setForm({ ...form, campusName: e.target.value })} /></label>
              <label><span className="label">Email optional</span><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
              <label className="flex gap-2" style={{ alignItems: 'center', marginTop: 28 }}><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active</label>
            </div>
            <div className="flex gap-2 mt-4" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn" onClick={() => setFormOpen(false)}>Cancel</button><button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></div>
          </form>
        </div>
      )}

      {importOpen && (
        <div className="modal-backdrop" onClick={() => setImportOpen(false)}>
          <div className="card modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="section-title" style={{ fontSize: '1.25rem' }}>Import Tutors CSV</h3>
            <p className="text-muted">Upload a CSV with these headers. Existing tutors are updated by matching campusKey + tutorName.</p>
            <pre className="import-format">campusKey,tutorName,role,active,email,campusName{"\n"}parramatta,Kevin,admin,TRUE,kevin@example.com,Parramatta</pre>
            <input className="input mt-4" type="file" accept=".csv,text/csv" onChange={(e) => handleImportFile(e.target.files?.[0])} />
            {importError && <div className="mt-2" style={{ color: '#fca5a5' }}>{importError}</div>}
            {!!importRows.length && <div className="text-sm text-muted mt-2">Ready to import {importRows.length} row{importRows.length === 1 ? '' : 's'}.</div>}
            <div className="flex gap-2 mt-4" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={() => setImportOpen(false)}>Cancel</button><button className="btn-primary" onClick={submitImport} disabled={saving || !importRows.length}>{saving ? 'Importing…' : 'Import'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
