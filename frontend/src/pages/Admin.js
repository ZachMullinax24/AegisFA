import { useState, useEffect } from 'react';
import NavBar from '../components/layout/NavBar';
import { supabase } from '../supabaseClient';
import { checkHealth } from '../services/api';

const BACKEND = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001';

export default function Admin() {
  const [backendOnline, setBackendOnline] = useState(false);
  const [tab, setTab] = useState('orgs');
  const [orgs, setOrgs] = useState([]);
  const [codes, setCodes] = useState([]);
  const [users, setUsers] = useState([]);
  const [firewallEvents, setFirewallEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  // New org form
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgMsg, setNewOrgMsg] = useState('');

  // New code form
  const [codeOrgId, setCodeOrgId] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');

  // Firewall block form
  const [blockIp, setBlockIp] = useState('');
  const [blockReason, setBlockReason] = useState('');
  const [blockMsg, setBlockMsg] = useState('');

  useEffect(() => {
    checkHealth().then(() => setBackendOnline(true)).catch(() => setBackendOnline(false));
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    try {
      const [orgsRes, codesRes, fwRes] = await Promise.all([
        supabase.from('organizations').select('*').order('created_at', { ascending: false }),
        supabase.from('access_codes').select('*, organizations(name)').order('created_at', { ascending: false }),
        supabase.from('firewall_events').select('*').order('timestamp', { ascending: false }).limit(50),
      ]);
      setOrgs(orgsRes.data || []);
      setCodes(codesRes.data || []);
      setFirewallEvents(fwRes.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function createOrg() {
    if (!newOrgName.trim()) return;
    setNewOrgMsg('');
    const apiKey = 'ak_' + Math.random().toString(36).slice(2, 18);
    const { error } = await supabase.from('organizations').insert({ name: newOrgName.trim(), api_key: apiKey });
    if (error) { setNewOrgMsg(`✗ ${error.message}`); return; }
    setNewOrgMsg(`✓ Organization created`);
    setNewOrgName('');
    fetchAll();
  }

  function generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const part = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `AEGIS-${part()}-${part()}`;
  }

  async function createAccessCode() {
    if (!codeOrgId) return;
    const code = generateCode();
    const { error } = await supabase.from('access_codes').insert({ code, org_id: codeOrgId, used: false });
    if (error) { setGeneratedCode(`✗ ${error.message}`); return; }
    setGeneratedCode(code);
    fetchAll();
  }

  async function blockIpAddress() {
    if (!blockIp.trim()) return;
    setBlockMsg('');
    const { error } = await supabase.from('firewall_rules').insert({ ip_address: blockIp.trim(), action: 'block', reason: blockReason || 'Manual block' });
    if (error) { setBlockMsg(`✗ ${error.message}`); return; }
    setBlockMsg(`✓ ${blockIp} blocked`);
    setBlockIp('');
    setBlockReason('');
  }

  const tabs = [
    { id: 'orgs', label: 'Organizations' },
    { id: 'codes', label: 'Access Codes' },
    { id: 'firewall', label: 'Firewall' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)' }}>
      <NavBar backendOnline={backendOnline} />

      <div style={{ flex: 1, padding: '1.75rem', maxWidth: '1100px', width: '100%', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '1.75rem' }} className="fade-in">
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text)', marginBottom: '4px' }}>Admin Panel</h1>
          <p style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)' }}>
            // manage organizations, access codes, and firewall rules
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '2px', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0' }}>
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
            {/* Organizations Tab */}
            {tab === 'orgs' && (
              <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Create org */}
                <div className="card" style={{ padding: '1.25rem' }}>
                  <h3 style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text2)', marginBottom: '1rem' }}>Add New Organization</h3>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input className="input" placeholder="Company name" value={newOrgName} onChange={e => setNewOrgName(e.target.value)} style={{ flex: 1 }} />
                    <button className="btn btn-primary" onClick={createOrg}>Create</button>
                  </div>
                  {newOrgMsg && <p style={{ fontFamily: 'var(--mono)', fontSize: '11px', marginTop: '8px', color: newOrgMsg.startsWith('✓') ? 'var(--accent)' : 'var(--red)' }}>{newOrgMsg}</p>}
                </div>

                {/* Org list */}
                <div className="card">
                  <div className="card-header">
                    <span className="card-title">Organizations</span>
                    <span className="badge badge-gray">{orgs.length} total</span>
                  </div>
                  {orgs.length === 0 ? <div className="empty-state">No organizations yet</div> : orgs.map(org => (
                    <div key={org.id} style={{ padding: '14px 18px', borderBottom: '1px solid var(--surface2)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '13px', color: 'var(--text2)', fontWeight: '500', marginBottom: '3px' }}>{org.name}</p>
                        <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)' }}>ID: {org.id}</p>
                      </div>
                      <span className="badge badge-green">Active</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Access Codes Tab */}
            {tab === 'codes' && (
              <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Generate code */}
                <div className="card" style={{ padding: '1.25rem' }}>
                  <h3 style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text2)', marginBottom: '1rem' }}>Generate Access Code</h3>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <select className="select" style={{ flex: 1 }} value={codeOrgId} onChange={e => setCodeOrgId(e.target.value)}>
                      <option value="">— select organization —</option>
                      {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                    <button className="btn btn-primary" onClick={createAccessCode} disabled={!codeOrgId}>Generate</button>
                  </div>
                  {generatedCode && (
                    <div style={{ marginTop: '12px', background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', borderRadius: '8px', padding: '12px 16px' }}>
                      <p style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>Generated code — share with the company:</p>
                      <p style={{ fontFamily: 'var(--mono)', fontSize: '18px', fontWeight: '700', color: 'var(--accent)', letterSpacing: '3px' }}>{generatedCode}</p>
                    </div>
                  )}
                </div>

                {/* Code list */}
                <div className="card">
                  <div className="card-header">
                    <span className="card-title">Access Codes</span>
                    <span className="badge badge-gray">{codes.length} total</span>
                  </div>
                  {codes.length === 0 ? <div className="empty-state">No access codes yet</div> : codes.map(c => (
                    <div key={c.id} style={{ padding: '12px 18px', borderBottom: '1px solid var(--surface2)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontFamily: 'var(--mono)', fontSize: '13px', color: 'var(--text2)', letterSpacing: '1px', marginBottom: '3px' }}>{c.code}</p>
                        <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)' }}>
                          {c.organizations?.name || 'Unknown org'}
                          {c.used_by && ` · used by ${c.used_by}`}
                        </p>
                      </div>
                      <span className={`badge ${c.used ? 'badge-red' : 'badge-green'}`}>{c.used ? 'Used' : 'Available'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Firewall Tab */}
            {tab === 'firewall' && (
              <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Block IP */}
                <div className="card" style={{ padding: '1.25rem' }}>
                  <h3 style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text2)', marginBottom: '1rem' }}>Block IP Address</h3>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <input className="input" placeholder="IP address (e.g. 192.168.1.1)" value={blockIp} onChange={e => setBlockIp(e.target.value)} style={{ flex: 1, minWidth: '180px' }} />
                    <input className="input" placeholder="Reason (optional)" value={blockReason} onChange={e => setBlockReason(e.target.value)} style={{ flex: 1, minWidth: '180px' }} />
                    <button className="btn btn-danger" onClick={blockIpAddress}>Block</button>
                  </div>
                  {blockMsg && <p style={{ fontFamily: 'var(--mono)', fontSize: '11px', marginTop: '8px', color: blockMsg.startsWith('✓') ? 'var(--accent)' : 'var(--red)' }}>{blockMsg}</p>}
                </div>

                {/* Firewall Events */}
                <div className="card">
                  <div className="card-header">
                    <span className="card-title">Recent Firewall Events</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <span className="badge badge-red">{firewallEvents.filter(e => e.action === 'blocked').length} blocked</span>
                      <span className="badge badge-green">{firewallEvents.filter(e => e.action === 'allowed').length} allowed</span>
                    </div>
                  </div>
                  {firewallEvents.length === 0 ? <div className="empty-state">No firewall events yet</div> : firewallEvents.map(e => (
                    <div key={e.id} style={{ padding: '10px 18px', borderBottom: '1px solid var(--surface2)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span className={`badge ${e.action === 'blocked' ? 'badge-red' : 'badge-green'}`}>{e.action}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text2)', minWidth: '120px' }}>{e.ip_address}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)', flex: 1 }}>{e.reason}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)' }}>{e.method} {e.path}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)', flexShrink: 0 }}>
                        {new Date(e.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
