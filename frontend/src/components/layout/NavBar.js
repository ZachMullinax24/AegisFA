import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../services/auth';
import { FaShieldAlt } from 'react-icons/fa';
import { FiLogOut } from 'react-icons/fi';

const tabs = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/investigation', label: 'Investigation' },
  { href: '/ai', label: 'AI Analyst' },
];

export default function NavBar({ backendOnline }) {
  const { session, signOut } = useAuth();
  const location = useLocation();

  return (
    <nav style={{ background: '#0d1117', borderBottom: '1px solid #21262d', padding: '0 1.5rem', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ width: '30px', height: '30px', background: '#00ff9d22', border: '1px solid #00ff9d55', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FaShieldAlt style={{ color: '#00ff9d', width: '14px', height: '14px' }} />
        </div>
        <span style={{ fontSize: '16px', fontWeight: '700', color: '#e6edf3', fontFamily: 'Syne, sans-serif' }}>
          Aegis<span style={{ color: '#00ff9d' }}>FA</span>
        </span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '3px' }}>
        {tabs.map(({ href, label }) => {
          const active = location.pathname === href;
          return (
            <Link key={href} to={href} style={{
              padding: '6px 16px', fontSize: '12px', fontWeight: '500', borderRadius: '6px',
              fontFamily: 'JetBrains Mono, monospace', border: '1px solid',
              textDecoration: 'none', transition: 'all 0.15s',
              color: active ? '#00ff9d' : '#6e7681',
              background: active ? '#00ff9d15' : 'transparent',
              borderColor: active ? '#00ff9d33' : 'transparent',
            }}>
              {label}
            </Link>
          );
        })}
      </div>

      {/* Right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: backendOnline ? '#00ff9d' : '#ff5555', boxShadow: backendOnline ? '0 0 8px #00ff9daa' : '0 0 8px #ff555588' }} />
          <span className="mono" style={{ fontSize: '11px', color: '#6e7681' }}>{backendOnline ? 'LIVE' : 'OFFLINE'}</span>
        </div>
        <span className="mono" style={{ fontSize: '11px', color: '#6e7681' }}>{session?.user?.email}</span>
        <button onClick={signOut} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#6e7681', cursor: 'pointer', padding: '5px 10px', border: '1px solid #21262d', borderRadius: '5px', background: 'transparent', fontFamily: 'JetBrains Mono, monospace', transition: 'all 0.15s' }}
          onMouseEnter={e => { e.target.style.color = '#ff5555'; e.target.style.borderColor = '#ff555555'; }}
          onMouseLeave={e => { e.target.style.color = '#6e7681'; e.target.style.borderColor = '#21262d'; }}>
          <FiLogOut size={12} /> logout
        </button>
      </div>
    </nav>
  );
}
