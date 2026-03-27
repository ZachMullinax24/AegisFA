import { useState } from 'react';
import { useAuth } from '../services/auth';
import { Link } from 'react-router-dom';
import { FaShieldAlt } from 'react-icons/fa';

export default function Register() {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function validateAccessCode(code, email) {
    const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/validate-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, email }),
    });
    return res.ok;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (!accessCode) { setError('Access code is required'); return; }
    setLoading(true);
    setError('');

    try {
      const valid = await validateAccessCode(accessCode, email);
      if (!valid) {
        setError('Invalid or already used access code. Please contact AegisFA to get access.');
        setLoading(false);
        return;
      }

      await signUp(email, password);
      setSuccess('Account created! Check your email to confirm, then sign in.');
    } catch (err) {
      setError(err.message || 'Registration failed.');
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
        Request Analyst Access
      </p>

      <div style={{ width: '100%', maxWidth: '400px', background: '#111318', border: '1px solid #21262d', borderRadius: '14px', padding: '2.25rem' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '500', color: '#e6edf3', marginBottom: '1.75rem' }}>Create Account</h2>

        {error && (
          <div style={{ background: '#ff555511', border: '1px solid #ff555533', color: '#ff5555', fontSize: '12px', padding: '10px 14px', borderRadius: '7px', marginBottom: '1rem', fontFamily: 'JetBrains Mono, monospace' }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ background: '#00ff9d11', border: '1px solid #00ff9d33', color: '#00ff9d', fontSize: '12px', padding: '10px 14px', borderRadius: '7px', marginBottom: '1rem', fontFamily: 'JetBrains Mono, monospace' }}>
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label className="mono" style={{ display: 'block', fontSize: '10px', color: '#6e7681', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '7px' }}>
              Access Code
            </label>
            <input
              className="input"
              type="text"
              required
              value={accessCode}
              onChange={e => setAccessCode(e.target.value.toUpperCase())}
              placeholder="AEGIS-XXXX-XXXX"
              style={{ fontFamily: 'JetBrains Mono, monospace', letterSpacing: '2px' }}
            />
            <p style={{ fontSize: '10px', color: '#6e7681', fontFamily: 'JetBrains Mono, monospace', marginTop: '5px' }}>
              Contact AegisFA to receive your access code
            </p>
          </div>

          <div>
            <label className="mono" style={{ display: 'block', fontSize: '10px', color: '#6e7681', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '7px' }}>
              Analyst ID (Email)
            </label>
            <input
              className="input"
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="analyst@org.com"
            />
          </div>

          <div>
            <label className="mono" style={{ display: 'block', fontSize: '10px', color: '#6e7681', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '7px' }}>
              Passphrase
            </label>
            <input
              className="input"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
            />
          </div>

          <div>
            <label className="mono" style={{ display: 'block', fontSize: '10px', color: '#6e7681', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '7px' }}>
              Confirm Passphrase
            </label>
            <input
              className="input"
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repeat passphrase"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !!success}
            style={{ marginTop: '0.5rem', width: '100%', background: '#00ff9d', color: '#0a0c0f', border: 'none', borderRadius: '7px', padding: '12px', fontFamily: 'Syne, sans-serif', fontSize: '14px', fontWeight: '600', cursor: 'pointer', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Verifying...' : 'Create Account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: '12px', color: '#6e7681', marginTop: '1.5rem', fontFamily: 'JetBrains Mono, monospace' }}>
          Already have access?{' '}
          <Link to="/login" style={{ color: '#00ff9d', textDecoration: 'none' }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}