import { useState, useEffect } from 'react';
import NavBar from '../components/layout/NavBar';
import { supabase } from '../supabaseClient';
import { checkHealth, listFiles } from '../services/api';
import { useAuth } from '../services/auth';

const BACKEND = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001';

const SEV_BADGE = {
  critical: 'badge-red', high: 'badge-amber', medium: 'badge-blue', low: 'badge-green', none: 'badge-gray',
};

function timeAgo(d) {
  const diff = Math.floor((Date.now() - new Date(d)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function Admin() {
  const { session, orgId } = useAuth();
  const [backendOnline, setBackendOnline] = useState(false);
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);

  // Data
  const [org, setOrg] = useState(null);
  const [analysts, setAnalysts] = useState([]);
  const [files, setFiles] = useState([]);

  // Delete states
  const [deletingUser, setDeletingUser] = useState(null);
  const [deletingFile, setDeletingFile] = useState(null);
  const [actionMsg, setActionMsg] = useState('');

  useEffect(() => {
  checkHealth().then(() => setBackendOnline(true)).catch(() => setBackendOnline(false));
}, []);

useEffect(() => {
  if (orgId) fetchAll();
}, [orgId]);

  async function fetchAll() {
    setLoading(true);
    try {
      // Fetch org info
      const { data: orgData } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', orgId)
        .single();
      setOrg(orgData);

      // Fetch analysts in this org
      const { data: userOrgs } = await supabase
        .from('user_organizations')
        .select('user_id, created_at')
        .eq('org_id', orgId);
      setAnalysts(userOrgs || []);

      // Fetch log files
      const fileData = await listFiles(orgId);
      setFiles(fileData || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function deleteUser(userId) {
    if (!window.confirm('Are you sure you want to remove this analyst?')) return;
    setDeletingUser(userId);
    setActionMsg('');
    try {
      const res = await fetch(`${BACKEND}/admin/delete-user`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      if (!res.ok) throw new Error('Failed to delete user');
      setActionMsg('✓ Analyst removed successfully');
      setAnalysts(prev => prev.filter(a => a.user_id !== userId));
    } catch (err) {
      setActionMsg(`✗ ${err.message}`);
    } finally {
      setDeletingUser(null);
    }
  }

  async function deleteFile(fileId, filename) {
    if (!window.confirm(`Delete "${filename}"? This cannot be undone.`)) return;
    setDeletingFile(fileId);
    setActionMsg('');
    try {
      const { error } = await supabase.from('log_files').delete().eq('id', fileId);
      if (error) throw error;
      setActionMsg('✓ Log file deleted');
      setFiles(prev => prev.filter(f => f.id !== fileId));
    } catch (err) {
      setActionMsg(`✗ ${err.message}`);
    } finally {
      setDeletingFile(null);
    }
  }

  // Stats
  const completed  = files.filter(f => f.status === 'completed');
  const critical   = files.filter(f => f.threat_level === 'critical');
  const high       = files.filter(f => f.threat_level === 'high');
  const totalEntries = files.reduce((s, f) => s + (f.entry_count || 0), 0);

  const tabs = [
    { id: 'overview',  label: 'Overview' },
    { id: 'analysts',  label: `Analysts (${analysts.length})` },
    { id: 'logs',      label: `Log Files (${files.length})` },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)' }}>
      <NavBar backendOnline={backendOnline} />

      <div style={{ flex: 1, padding: '1.75rem', maxWidth: '1100px', width: '100%', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '1.75rem' }} className="fade-in">
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text)', marginBottom: '4px' }}>
            {org?.name || 'Admin Panel'}
          </h1>
          <p style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)' }}>
            // organization management · {session?.user?.email}
          </p>
        </div>

        {!orgId ? (
          <div className="card" style={{ padding: '2rem' }}>
            <p style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--amber)', textAlign: 'center' }}>
              ⚠ Your account is not linked to an organization.
            </p>
          </div>
        ) : (
          <>
            {/* Action message */}
            {actionMsg && (
              <div style={{ background: actionMsg.startsWith('✓') ? 'var(--accent-dim)' : 'var(--red-dim)', border: `1px solid ${actionMsg.startsWith('✓') ? 'var(--accent-border)' : 'var(--red-border)'}`, color: actionMsg.startsWith('✓') ? 'var(--accent)' : 'var(--red)', fontFamily: 'var(--mono)', fontSize: '12px', padding: '10px 16px', borderRadius: '8px', marginBottom: '1rem' }}>
                {actionMsg}
              </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '2px', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
              {tabs.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)} style={{
                  padding: '8px 18px', fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: '500',
                  cursor: 'pointer', border: 'none', background: 'transparent', transition: 'all 0.15s',
                  color: tab === t.id ? 'var(--accent)' : 'var(--muted)',
                  borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                  marginBottom: '-1px',
                }}>
                  {t.label}
                </button>
              ))}
            </div>

            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner" /></div>
            ) : (
              <>
                {/* Overview Tab */}
                {tab === 'overview' && (
                  <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {/* Stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                      {[
                        { label: 'Total Analysts',   value: analysts.length,         color: 'var(--text)' },
                        { label: 'Log Files',        value: files.length,            color: 'var(--text)' },
                        { label: 'Analyzed',         value: completed.length,        color: 'var(--accent)' },
                        { label: 'Total Entries',    value: totalEntries.toLocaleString(), color: 'var(--blue)' },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="card" style={{ padding: '18px 20px' }}>
                          <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '10px' }}>{label}</p>
                          <p style={{ fontSize: '26px', fontWeight: '700', color }}>{value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Threat summary */}
                    <div className="card">
                      <div className="card-header">
                        <span className="card-title">Threat Summary</span>
                      </div>
                      <div style={{ padding: '1.25rem', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                        {[
                          { label: 'Critical', count: critical.length,  badge: 'badge-red' },
                          { label: 'High',     count: high.length,      badge: 'badge-amber' },
                          { label: 'Medium',   count: files.filter(f => f.threat_level === 'medium').length, badge: 'badge-blue' },
                          { label: 'Low',      count: files.filter(f => f.threat_level === 'low').length,    badge: 'badge-green' },
                        ].map(({ label, count, badge }) => (
                          <div key={label} style={{ background: 'var(--surface2)', borderRadius: '8px', padding: '14px 16px', textAlign: 'center' }}>
                            <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>{label}</p>
                            <span className={`badge ${badge}`} style={{ fontSize: '18px', padding: '4px 12px' }}>{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Org Info */}
                    <div className="card">
                      <div className="card-header">
                        <span className="card-title">Organization Info</span>
                      </div>
                      <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', gap: '12px' }}>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)', minWidth: '120px' }}>Name</span>
                          <span style={{ fontSize: '13px', color: 'var(--text2)' }}>{org?.name}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)', minWidth: '120px' }}>Organization ID</span>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>{orgId}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)', minWidth: '120px' }}>API Key</span>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>{org?.api_key}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)', minWidth: '120px' }}>Created</span>
                          <span style={{ fontSize: '13px', color: 'var(--text2)' }}>{org?.created_at ? new Date(org.created_at).toLocaleDateString() : '—'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Analysts Tab */}
                {tab === 'analysts' && (
                  <div className="card fade-in">
                    <div className="card-header">
                      <span className="card-title">Analysts in Your Organization</span>
                      <span className="badge badge-gray">{analysts.length} total</span>
                    </div>
                    {analysts.length === 0 ? (
                      <div className="empty-state">No analysts found</div>
                    ) : (
                      analysts.map(a => (
                        <div key={a.user_id} style={{ padding: '14px 18px', borderBottom: '1px solid var(--surface2)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ width: '36px', height: '36px', background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--accent)', flexShrink: 0 }}>
                            👤
                          </div>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text2)', marginBottom: '3px' }}>{a.user_id}</p>
                            <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)' }}>
                              Joined {timeAgo(a.created_at)}
                            </p>
                          </div>
                          {a.user_id !== session?.user?.id ? (
                            <button
                              className="btn btn-danger"
                              style={{ fontSize: '11px', padding: '5px 12px' }}
                              onClick={() => deleteUser(a.user_id)}
                              disabled={deletingUser === a.user_id}
                            >
                              {deletingUser === a.user_id ? 'Removing...' : 'Remove'}
                            </button>
                          ) : (
                            <span className="badge badge-green">You</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Log Files Tab */}
                {tab === 'logs' && (
                  <div className="card fade-in">
                    <div className="card-header">
                      <span className="card-title">Log Files</span>
                      <span className="badge badge-gray">{files.length} total</span>
                    </div>
                    {files.length === 0 ? (
                      <div className="empty-state">No log files uploaded yet</div>
                    ) : (
                      files.map(f => (
                        <div key={f.id} style={{ padding: '13px 18px', borderBottom: '1px solid var(--surface2)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '3px' }}>{f.filename}</p>
                            <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)' }}>
                              {f.source_type} · {f.entry_count?.toLocaleString()} entries · {timeAgo(f.created_at)}
                            </p>
                          </div>
                          <span className={`badge ${f.status === 'completed' ? 'badge-green' : f.status === 'analyzing' ? 'badge-amber' : 'badge-red'}`}>{f.status}</span>
                          {f.threat_level && f.threat_level !== 'none' && (
                            <span className={`badge ${SEV_BADGE[f.threat_level]}`}>{f.threat_level}</span>
                          )}
                          <button
                            className="btn btn-danger"
                            style={{ fontSize: '11px', padding: '5px 12px', flexShrink: 0 }}
                            onClick={() => deleteFile(f.id, f.filename)}
                            disabled={deletingFile === f.id}
                          >
                            {deletingFile === f.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
