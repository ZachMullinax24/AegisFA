import { useState } from 'react';
import { useAuth } from '../services/auth';
import { Link } from 'react-router-dom';
import { FaShieldAlt } from 'react-icons/fa';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await signIn(email, password);
    } catch (err) {
      setError('Invalid credentials. Access denied.');
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem', background: '#0a0c0f' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
        <div style={{ width: '54px', height: '54px', background: '#00ff9d22', border: '1.5px solid #00ff9d', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FaShieldAlt style={{ color: '#00ff9d', width: '26px', height: '26px' }} />
        </div>
        <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#e6edf3', letterSpacing: '-1px' }}>
          Aegis<span style={{ color: '#00ff9d' }}>FA</span>
        </h1>
      </div>

      <p className="mono" style={{ fontSize: '11px', color: '#6e7681', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '2.5rem' }}>
        Forensic Intelligence Platform
      </p>

      <div style={{ width: '100%', maxWidth: '400px', background: '#111318', border: '1px solid #21262d', borderRadius: '14px', padding: '2.25rem' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '500', color: '#e6edf3', marginBottom: '1.75rem' }}>Secure Access</h2>

        {error && (
          <div style={{ background: '#ff555511', border: '1px solid #ff555533', color: '#ff5555', fontSize: '12px', padding: '10px 14px', borderRadius: '7px', marginBottom: '1rem', fontFamily: 'JetBrains Mono, monospace' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label className="mono" style={{ display: 'block', fontSize: '10px', color: '#6e7681', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '7px' }}>Analyst ID</label>
            <input className="input" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="analyst@org.com" />
          </div>
          <div>
            <label className="mono" style={{ display: 'block', fontSize: '10px', color: '#6e7681', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '7px' }}>Passphrase</label>
            <input className="input" type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••••••" />
          </div>
          <button type="submit" disabled={loading} style={{ marginTop: '0.5rem', width: '100%', background: '#00ff9d', color: '#0a0c0f', border: 'none', borderRadius: '7px', padding: '12px', fontFamily: 'Syne, sans-serif', fontSize: '14px', fontWeight: '600', cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Authenticating...' : 'Authenticate'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: '12px', color: '#6e7681', marginTop: '1.5rem', fontFamily: 'JetBrains Mono, monospace' }}>
          No account?{' '}
          <Link to="/register" style={{ color: '#00ff9d', textDecoration: 'none' }}>Request access</Link>
        </p>
        <p style={{ textAlign: 'center', fontSize: '10px', color: '#3a3f47', marginTop: '0.75rem', fontFamily: 'JetBrains Mono, monospace' }}>
          Unauthorized access is monitored and logged
        </p>
      </div>
    </div>
  );
}
