import { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import Header from '../../components/Header';
import useAuthGuard from '../../hooks/useAuthGuard';

type Member = { id: string; firstName: string; lastName: string; gender: string; parentName: string; parentEmail: string; years: string; active: boolean };
type FormState = { id?: string; firstName: string; lastName: string; gender: string; parentName: string; parentEmail: string; years: string; active: boolean };

const emptyForm: FormState = { firstName: '', lastName: '', gender: 'female', parentName: '', parentEmail: '', years: '', active: true };

function fullName(m: Member) { return `${m.firstName} ${m.lastName}`.trim(); }
function cleanGender(v: any) {
  const g = String(v || '').trim().toLowerCase();
  if (g === 'f' || g === 'female') return 'female';
  if (g === 'm' || g === 'male') return 'male';
  return 'female';
}
function displayGender(v: any) {
  const g = cleanGender(v);
  return g === 'female' ? 'Female' : 'Male';
}
function toCsv(rows: Member[]) {
  const headers = ['id','firstName','lastName','gender','parentName','parentEmail','years','active'];
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

export default function AdminMembersPage() {
  useAuthGuard();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [warning, setWarning] = useState('');
  const [source, setSource] = useState('');
  const [privateConfigured, setPrivateConfigured] = useState(false);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'active'|'inactive'>('active');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [viewing, setViewing] = useState<Member | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importError, setImportError] = useState('');

  function setMembersSorted(rows: Member[]) {
    setMembers([...(rows || [])].sort((a, b) => fullName(a).localeCompare(fullName(b))));
  }

  async function load() {
    setLoading(true); setError(''); setMessage(''); setWarning('');
    try {
      const res = await fetch('/api/admin-members', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Could not load members');
      setMembersSorted(Array.isArray(json.members) ? json.members : []);
      setSource(json.source || '');
      setPrivateConfigured(!!json.privateSheetsConfigured);
      setWarning(json.warning || '');
    } catch (e: any) {
      setError(e?.message || 'Could not load members');
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members
      .filter((m) => tab === 'active' ? m.active : !m.active)
      .filter((m) => !q || [fullName(m), m.parentName, m.parentEmail, m.years, m.gender, m.id].join(' ').toLowerCase().includes(q))
      .sort((a, b) => fullName(a).localeCompare(fullName(b)));
  }, [members, query, tab]);

  function openAdd() { setEditing(null); setForm(emptyForm); setFormOpen(true); setMessage(''); setError(''); }
  function openEdit(m: Member) { setEditing(m); setForm({ ...m, gender: cleanGender(m.gender) }); setFormOpen(true); setMessage(''); setError(''); }

  async function post(body: any) {
    setSaving(true); setError(''); setMessage('');
    try {
      const res = await fetch('/api/admin-members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Save failed');
      if (Array.isArray(json.members)) setMembersSorted(json.members);
      else await load();
      setSource(json.source || 'private-sheet');
      setWarning('');
      return json;
    } catch (e: any) { setError(e?.message || 'Save failed'); throw e; }
    finally { setSaving(false); }
  }

  async function saveForm(e: React.FormEvent) {
    e.preventDefault();
    try {
      await post(editing ? { action: 'update', id: editing.id, member: form } : { action: 'create', member: form });
      setFormOpen(false); setEditing(null); setMessage(editing ? 'Member updated.' : 'Member added.');
    } catch {}
  }

  async function changeActive(m: Member, active: boolean) {
    if (!window.confirm(`${active ? 'Reactivate' : 'Deactivate'} ${fullName(m)}?`)) return;
    try { await post({ action: active ? 'reactivate' : 'deactivate', id: m.id }); setMessage(active ? 'Member reactivated.' : 'Member moved to inactive.'); }
    catch {}
  }

  async function checkSheets() {
    setError(''); setMessage('Checking private Google Sheets connection…');
    try {
      const res = await fetch('/api/admin-sheets-status', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Could not check connection');
      setMessage(`Private Sheets OK. Service account: ${json.email || 'configured'}. Tabs found: ${(json.sheetTitles || []).join(', ') || 'none'}.`);
    } catch (e: any) {
      setMessage('');
      setError(e?.message || 'Private Google Sheets connection failed');
    }
  }

  function handleImportFile(file?: File | null) {
    setImportRows([]); setImportError('');
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const rows = (result.data || []) as any[];
        setImportRows(rows);
        if (!rows.length) setImportError('No rows found in the file.');
      },
      error: (err) => setImportError(err.message),
    });
  }

  async function submitImport() {
    if (!importRows.length) { setImportError('Choose a CSV file first.'); return; }
    try {
      const json = await post({ action: 'import', rows: importRows });
      setImportOpen(false); setImportRows([]); setMessage(`Import complete. Created ${json.created || 0}, updated ${json.updated || 0}.`);
    } catch {}
  }

  const activeCount = members.filter((m) => m.active).length;
  const inactiveCount = members.filter((m) => !m.active).length;
  const sourceLabel = source === 'private-sheet' ? 'Private Google Sheet' : source ? 'Legacy CSV fallback' : 'Unknown source';

  return (
    <div>
      <Header />
      <main className="container">
        <div className="card">
          <div className="flex items-center justify-between" style={{ gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h2 className="section-title">Members</h2>
              <p className="text-muted">Manage student contacts from the portal. Google Sheets stays private in the background.</p>
              <p className="text-sm text-muted">Data source: {sourceLabel}{privateConfigured ? '' : ' · private Sheets not configured'}</p>
            </div>
            <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
              <button className="btn" onClick={checkSheets}>Check Sheets</button>
              <button className="btn" onClick={() => download('success-tutoring-members.csv', toCsv(members))}>Export CSV</button>
              <button className="btn" onClick={() => setImportOpen(true)}>Import CSV</button>
              <button className="btn-primary" onClick={openAdd}>Add Member</button>
            </div>
          </div>

          {warning && <div className="mt-4" style={{ color: '#fbbf24' }}>{warning}</div>}
          {error && <div className="mt-4" style={{ color: '#fca5a5' }}>{error}</div>}
          {message && <div className="mt-4 badge-success">{message}</div>}

          <div className="mt-4 flex gap-2" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="segmented">
              <button className={`seg-btn ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>Active ({activeCount})</button>
              <button className={`seg-btn ${tab === 'inactive' ? 'active' : ''}`} onClick={() => setTab('inactive')}>Inactive ({inactiveCount})</button>
            </div>
            <input className="input" style={{ maxWidth: 420 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search student, parent, email, year..." />
            <button className="btn" onClick={load} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
          </div>

          <section className="card mt-4" style={{ overflowX: 'auto' }}>
            <div className="admin-table-head members-grid"><span>Student</span><span>Year</span><span>Gender</span><span>Parent</span><span>Email</span><span>Actions</span></div>
            {loading ? <div className="text-muted p-4">Loading members…</div> : filtered.length ? filtered.map((m) => (
              <div className="admin-table-row members-grid" key={m.id}>
                <div><strong>{fullName(m)}</strong><div className="text-sm text-muted">{m.id}</div></div>
                <div>{m.years || '—'}</div>
                <div>{displayGender(m.gender)}</div>
                <div>{m.parentName || '—'}</div>
                <div className="text-sm">{m.parentEmail || '—'}</div>
                <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                  <button className="btn" onClick={() => setViewing(m)}>View</button>
                  <button className="btn" onClick={() => openEdit(m)}>Edit</button>
                  {m.active ? <button className="btn" onClick={() => changeActive(m, false)}>Deactivate</button> : <button className="btn" onClick={() => changeActive(m, true)}>Reactivate</button>}
                </div>
              </div>
            )) : <div className="text-muted p-4">No {tab} members found.</div>}
          </section>
        </div>
      </main>

      {formOpen && (
        <div className="modal-backdrop" onClick={() => setFormOpen(false)}>
          <form className="card modal-card" onSubmit={saveForm} onClick={(e) => e.stopPropagation()}>
            <h3 className="section-title" style={{ fontSize: '1.25rem' }}>{editing ? 'Edit Member' : 'Add Member'}</h3>
            {editing && <div className="text-sm text-muted mb-4">Permanent ID: {editing.id}</div>}
            <div className="grid grid-2 grid-col">
              <label><span className="label">Student first name</span><input className="input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></label>
              <label><span className="label">Student last name</span><input className="input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required /></label>
              <label><span className="label">Gender</span><select className="input" value={cleanGender(form.gender)} onChange={(e) => setForm({ ...form, gender: e.target.value })} required><option value="female">female</option><option value="male">male</option></select></label>
              <label><span className="label">School year</span><input className="input" value={form.years} onChange={(e) => setForm({ ...form, years: e.target.value })} placeholder="Year 3" required /></label>
              <label><span className="label">Parent first name</span><input className="input" value={form.parentName} onChange={(e) => setForm({ ...form, parentName: e.target.value })} required /></label>
              <label><span className="label">Parent email</span><input className="input" type="email" value={form.parentEmail} onChange={(e) => setForm({ ...form, parentEmail: e.target.value })} required /></label>
            </div>
            {editing && <label className="mt-4 flex gap-2"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active</label>}
            <div className="flex gap-2 mt-4" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setFormOpen(false)}>Cancel</button>
              <button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}

      {viewing && (
        <div className="modal-backdrop" onClick={() => setViewing(null)}>
          <div className="card modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="section-title" style={{ fontSize: '1.25rem' }}>{fullName(viewing)}</h3>
            <div className="profile-list-row"><strong>ID</strong><div className="text-muted">{viewing.id}</div></div>
            <div className="profile-list-row"><strong>Year</strong><div className="text-muted">{viewing.years}</div></div>
            <div className="profile-list-row"><strong>Gender</strong><div className="text-muted">{displayGender(viewing.gender)}</div></div>
            <div className="profile-list-row"><strong>Parent first name</strong><div className="text-muted">{viewing.parentName}</div></div>
            <div className="profile-list-row"><strong>Parent email</strong><div className="text-muted">{viewing.parentEmail}</div></div>
            <div className="profile-list-row"><strong>Status</strong><div className="text-muted">{viewing.active ? 'Active' : 'Inactive'}</div></div>
            <div className="flex gap-2 mt-4" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={() => setViewing(null)}>Close</button><button className="btn-primary" onClick={() => { setViewing(null); openEdit(viewing); }}>Edit</button></div>
          </div>
        </div>
      )}

      {importOpen && (
        <div className="modal-backdrop" onClick={() => setImportOpen(false)}>
          <div className="card modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="section-title" style={{ fontSize: '1.25rem' }}>Import Members CSV</h3>
            <p className="text-muted">Upload a CSV with these headers. Existing rows are updated by ID, or by matching student name + parent email. Gender accepts male/female or M/F.</p>
            <pre className="import-format">id,firstName,lastName,gender,parentName,parentEmail,years,active{"\n"}mem_abc123,Lily,Dasouqi,female,Laurise,parent@email.com,Year 6,TRUE</pre>
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
