import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from '../components/layout/NavBar';
import { listFiles, checkHealth } from '../services/api';
import { useAuth } from '../services/auth';

const SEV_DOT = { critical: 'sev-critical', high: 'sev-high', medium: 'sev-medium', low: 'sev-low', none: 'sev-none' };
const SEV_BADGE = { critical: 'badge-red', high: 'badge-amber', medium: 'badge-blue', low: 'badge-green', none: 'badge-gray' };

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// Use a fixed demo org_id for now — replace with real org from Supabase auth later
const ORG_ID = '0e3103d8-b4d8-4dc3-8db3-c060c47a88ac';

export default function Dashboard() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backendOnline, setBackendOnline] = useState(false);
  const [lastSync, setLastSync] = useState('');

  const fetchData = useCallback(async () => {
    try {
      await checkHealth();
      setBackendOnline(true);
      const data = await listFiles(ORG_ID);
      setFiles(data || []);
      setLastSync(new Date().toLocaleTimeString());
    } catch (err) {
      setBackendOnline(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // auto-refresh every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  const analyzing = files.filter(f => f.status === 'analyzing').length;
  const completed = files.filter(f => f.status === 'completed').length;
  const failed = files.filter(f => f.status === 'failed').length;
  const totalEntries = files.reduce((s, f) => s + (f.entry_count || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a0c0f' }}>
      <NavBar backendOnline={backendOnline} />

      <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
        {/* Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '20px', fontWeight: '600', color: '#e6edf3' }}>SOC Operations Center</h1>
          <p className="mono" style={{ fontSize: '11px', color: '#6e7681', marginTop: '4px' }}>
            // real-time threat monitoring · analyst: {session?.user?.email}
            {lastSync && ` · last sync ${lastSync}`}
          </p>
        </div>

        {/* Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
          {[
            { label: 'Total Log Files', value: files.length, color: '#e6edf3' },
            { label: 'Analyzing', value: analyzing, color: analyzing > 0 ? '#f1a230' : '#e6edf3' },
            { label: 'Completed', value: completed, color: '#00ff9d' },
            { label: 'Log Entries', value: totalEntries.toLocaleString(), color: '#58a6ff' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: '#111318', border: '1px solid #21262d', borderRadius: '10px', padding: '16px 18px' }}>
              <p className="mono" style={{ fontSize: '10px', color: '#6e7681', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '10px' }}>{label}</p>
              <p style={{ fontSize: '26px', fontWeight: '600', color }}>{loading ? '—' : value}</p>
            </div>
          ))}
        </div>

        {/* Files Panel */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Uploaded Log Files</span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {!backendOnline && <span className="badge badge-red">Backend Offline</span>}
              <button className="btn btn-primary" onClick={() => navigate('/investigation')} style={{ fontSize: '11px', padding: '5px 12px' }}>
                Upload Logs ↗
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '2rem', display: 'flex', justifyContent: 'center' }}><div className="spinner" /></div>
          ) : !backendOnline ? (
            <div className="empty-state">
              Cannot reach backend at localhost:5001.<br />Make sure the Flask server is running.
            </div>
          ) : files.length === 0 ? (
            <div className="empty-state">
              No log files uploaded yet.<br />Go to Investigation to upload your first log file.
            </div>
          ) : (
            files.map(file => (
              <div key={file.id}
                onClick={() => navigate(`/investigation?file=${file.id}`)}
                style={{ padding: '12px 16px', borderBottom: '1px solid #161b22', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', transition: 'background 0.1s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#161b22'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div className={`sev-dot ${SEV_DOT[file.threat_level || 'none']}`} />
                <span className="mono" style={{ fontSize: '11px', color: '#6e7681', minWidth: '85px' }}>{file.source_type?.toUpperCase()}</span>
                <span style={{ fontSize: '12px', color: '#c9d1d9', flex: 1 }}>{file.filename}</span>
                <span className={`badge ${file.status === 'completed' ? 'badge-green' : file.status === 'analyzing' ? 'badge-amber' : file.status === 'failed' ? 'badge-red' : 'badge-gray'}`}>
                  {file.status}
                </span>
                <span className="mono" style={{ fontSize: '10px', color: '#6e7681' }}>{file.entry_count?.toLocaleString()} entries</span>
                <span className="mono" style={{ fontSize: '10px', color: '#6e7681' }}>{timeAgo(file.created_at)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
