import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

export default function Header(){
  const router = useRouter();
  const [tutor,setTutor] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(()=>{
    try { setTutor(localStorage.getItem('st_tutor') || ''); } catch {}
    fetch('/api/admin-status').then(r => r.json()).then(j => setIsAdmin(!!j?.isAdmin)).catch(() => setIsAdmin(false));
  },[]);

  // On the login screen, the nav can be confusing (it just bounces you back to login).
  const hideNav = router.pathname === '/login';

  async function doLogout(e: React.MouseEvent){
    e.preventDefault();
    await fetch('/api/logout', { method:'POST' });
    try { localStorage.removeItem('st_tutor'); localStorage.removeItem('st_campus'); } catch {}
    window.location.href = '/login';
  }

  return (
    <header className="header">
      <div className="header-inner container" style={{paddingLeft:'1rem', paddingRight:'1rem'}}>
        <div className="brand">
          <span className="accent">Success</span>{' '}
          <span>Tutoring</span>
          <span className="brand-portal"> Portal</span>
        </div>
        {!hideNav && (
          <nav className="nav">
            <Link className="btn" href="/feedback" prefetch={false}>Feedback</Link>
            <Link className="btn" href="/print" prefetch={false}>Print</Link>
            <Link className="btn" href="/progress" prefetch={false}>Progress</Link>
            {isAdmin && <Link className="btn" href="/admin" prefetch={false}>Admin</Link>}
            <button className="btn" onClick={doLogout} aria-label="Logout">
              Logout{tutor ? ` (${tutor})` : ''}
            </button>
          </nav>
        )}
      </div>
    </header>
  );
}
