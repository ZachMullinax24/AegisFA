import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import NavBar from '../components/layout/NavBar';
import { listFiles, uploadLogFile, getAnalysis, getFileTimeline, getDetections, checkHealth } from '../services/api';

const ORG_ID = '0e3103d8-b4d8-4dc3-8db3-c060c47a88ac';

const SEV_COLOR = { critical: '#ff5555', high: '#f1a230', medium: '#58a6ff', low: '#00ff9d', none: '#6e7681' };
const EVENT_BADGE = {
  event: 'badge-blue', detection: 'badge-red', ai_narrative: 'badge-green',
};

function formatTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function Investigation() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [backendOnline, setBackendOnline] = useState(false);
  const [files, setFiles] = useState([]);
  const [selectedFileId, setSelectedFileId] = useState(searchParams.get('file') || '');
  const [analysis, setAnalysis] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [detections, setDetections] = useState([]);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [sourceType, setSourceType] = useState('windows');

  const fetchFiles = useCallback(async () => {
    try {
      await checkHealth();
      setBackendOnline(true);
      const data = await listFiles(ORG_ID);
      setFiles(data || []);
    } catch { setBackendOnline(false); }
  }, []);

  const fetchAnalysis = useCallback(async (fileId) => {
    if (!fileId) return;
    setLoadingAnalysis(true);
    setAnalysis(null);
    setTimeline([]);
    setDetections([]);
    try {
      const [a, t, d] = await Promise.all([
        getAnalysis(fileId),
        getFileTimeline(fileId),
        getDetections(ORG_ID, fileId),
      ]);
      setAnalysis(a);
      setTimeline(t?.items || t || []);
      setDetections(d || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAnalysis(false);
    }
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  useEffect(() => {
    if (selectedFileId) fetchAnalysis(selectedFileId);
  }, [selectedFileId, fetchAnalysis]);

  async function handleUpload() {
    if (!selectedFile) return;
    setUploading(true);
    setUploadStatus('');
    try {
      const result = await uploadLogFile(selectedFile, sourceType, ORG_ID);
      setUploadStatus(`✓ ${result.filename} uploaded — ${result.entry_count} entries analyzed`);
      setSelectedFile(null);
      await fetchFiles();
      setSelectedFileId(result.file_id);
    } catch (err) {
      setUploadStatus(`✗ Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  }

  const currentFile = files.find(f => f.id === selectedFileId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a0c0f' }}>
      <NavBar backendOnline={backendOnline} />

      <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '20px', fontWeight: '600', color: '#e6edf3' }}>
                {currentFile ? currentFile.filename : 'Incident Investigation'}
              </h1>
              <select className="select" value={selectedFileId} onChange={e => setSelectedFileId(e.target.value)}>
                <option value="">— select log file —</option>
                {files.map(f => <option key={f.id} value={f.id}>{f.filename} ({f.source_type})</option>)}
              </select>
            </div>
            {currentFile && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                <span className={`badge ${currentFile.status === 'completed' ? 'badge-green' : currentFile.status === 'analyzing' ? 'badge-amber' : 'badge-red'}`}>{currentFile.status}</span>
                <span className="badge badge-blue">{currentFile.source_type}</span>
                <span className="badge badge-gray">{currentFile.entry_count?.toLocaleString()} entries</span>
                {analysis?.threat_level && <span className={`badge badge-${analysis.threat_level === 'critical' ? 'red' : analysis.threat_level === 'high' ? 'amber' : analysis.threat_level === 'medium' ? 'blue' : 'green'}`}>{analysis.threat_level} threat</span>}
              </div>
            )}
          </div>
          <button className="btn" onClick={() => navigate('/ai' + (selectedFileId ? `?file=${selectedFileId}` : ''))}>Ask AI Analyst ↗</button>
        </div>

        {/* Upload Panel */}
        <div style={{ background: '#111318', border: '1px solid #21262d', borderRadius: '10px', padding: '1.25rem', marginBottom: '1rem' }}>
          <h3 className="mono" style={{ fontSize: '11px', color: '#c9d1d9', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '1rem' }}>Upload Log File</h3>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label className="mono" style={{ fontSize: '10px', color: '#6e7681', textTransform: 'uppercase', letterSpacing: '1px' }}>Source Type</label>
              <select className="select" value={sourceType} onChange={e => setSourceType(e.target.value)}>
                <option value="windows">Windows Event</option>
                <option value="firewall">Firewall</option>
                <option value="auth">Auth Log</option>
                <option value="syslog">Syslog</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label className="mono" style={{ fontSize: '10px', color: '#6e7681', textTransform: 'uppercase', letterSpacing: '1px' }}>Log File (.txt, .csv, .json, .log)</label>
              <label style={{ border: '1px dashed #30363d', borderRadius: '8px', padding: '12px 16px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#00ff9d55'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#30363d'}>
                <input type="file" style={{ display: 'none' }} accept=".txt,.csv,.json,.log,.evtx" onChange={e => setSelectedFile(e.target.files[0])} />
                {selectedFile
                  ? <span className="mono" style={{ fontSize: '12px', color: '#c9d1d9' }}>{selectedFile.name}</span>
                  : <span className="mono" style={{ fontSize: '12px', color: '#6e7681' }}>Drop file here or <span style={{ color: '#00ff9d' }}>browse</span></span>}
              </label>
            </div>
            <button className="btn btn-primary" onClick={handleUpload} disabled={!selectedFile || uploading || !backendOnline}>
              {uploading ? 'Uploading...' : 'Upload & Analyze'}
            </button>
          </div>
          {uploadStatus && (
            <p className="mono" style={{ fontSize: '11px', marginTop: '8px', color: uploadStatus.startsWith('✓') ? '#00ff9d' : '#ff5555' }}>{uploadStatus}</p>
          )}
        </div>

        {/* Analysis Results */}
        {selectedFileId && (
          loadingAnalysis ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><div className="spinner" /></div>
          ) : analysis ? (
            <>
              {/* AI Summary */}
              {analysis.summary && (
                <div style={{ background: '#111318', border: '1px solid #21262d', borderRadius: '10px', padding: '1.25rem', marginBottom: '1rem' }}>
                  <h3 className="mono" style={{ fontSize: '11px', color: '#00ff9d', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '0.75rem' }}>AI Incident Summary</h3>
                  <p style={{ fontSize: '13px', color: '#c9d1d9', lineHeight: 1.7 }}>{analysis.summary}</p>
                  {analysis.attack_vector && (
                    <p className="mono" style={{ fontSize: '11px', color: '#6e7681', marginTop: '8px' }}>Attack vector: <span style={{ color: '#f1a230' }}>{analysis.attack_vector}</span></p>
                  )}
                  {analysis.confidence_score && (
                    <p className="mono" style={{ fontSize: '11px', color: '#6e7681', marginTop: '4px' }}>Confidence: <span style={{ color: '#00ff9d' }}>{Math.round(analysis.confidence_score * 100)}%</span></p>
                  )}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                {/* Timeline */}
                <div className="panel">
                  <div className="panel-header">
                    <span className="panel-title">Attack Timeline</span>
                    <span className="badge badge-blue">{timeline.length} events</span>
                  </div>
                  {timeline.length === 0 ? <div className="empty-state">No timeline events</div> : (
                    timeline.slice(0, 10).map((e, i) => (
                      <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid #161b22', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <span className="mono" style={{ fontSize: '10px', color: '#6e7681', minWidth: '78px', paddingTop: '2px' }}>{formatTime(e.timestamp || e.event_time)}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '3px' }}>
                            <span style={{ fontSize: '12px', color: '#c9d1d9' }}>{e.event || e.description}</span>
                            {e.type && <span className={`badge ${EVENT_BADGE[e.type] || 'badge-gray'}`} style={{ fontSize: '9px' }}>{e.type}</span>}
                            {e.severity && <span style={{ fontSize: '9px', color: SEV_COLOR[e.severity] }} className="mono">{e.severity}</span>}
                          </div>
                          {e.detail && <p className="mono" style={{ fontSize: '11px', color: '#6e7681' }}>{e.detail}</p>}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* MITRE ATT&CK */}
                <div className="panel">
                  <div className="panel-header">
                    <span className="panel-title">MITRE ATT&CK</span>
                    <span className="badge badge-blue">{(analysis.mitre_techniques || []).length} techniques</span>
                  </div>
                  {!analysis.mitre_techniques?.length ? <div className="empty-state">No MITRE mappings</div> : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '16px' }}>
                      {analysis.mitre_techniques.map((m, i) => (
                        <div key={i} style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: '7px', padding: '12px 14px' }}>
                          <p className="mono" style={{ fontSize: '9px', color: '#6e7681', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '5px' }}>{m.tactic || 'Technique'}</p>
                          <p style={{ fontSize: '12px', color: '#c9d1d9', fontWeight: '500', marginBottom: '4px' }}>{m.name}</p>
                          <p className="mono" style={{ fontSize: '10px', color: '#58a6ff' }}>{m.id || m.technique_id}</p>
                          {m.relevance && <p style={{ fontSize: '10px', color: '#6e7681', marginTop: '6px', lineHeight: 1.5 }}>{m.relevance}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                {/* Impacted Assets */}
                <div className="panel">
                  <div className="panel-header">
                    <span className="panel-title">Impacted Assets</span>
                    <span className="badge badge-red">{(analysis.impacted_assets || []).length} affected</span>
                  </div>
                  {!analysis.impacted_assets?.length ? <div className="empty-state">No assets identified</div> : (
                    analysis.impacted_assets.map((asset, i) => (
                      <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid #161b22', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '28px', height: '28px', background: '#21262d', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>
                          {typeof asset === 'string' && asset.match(/^\d{1,3}\./) ? '🌐' : '🖥'}
                        </div>
                        <span style={{ fontSize: '12px', color: '#c9d1d9' }}>{typeof asset === 'string' ? asset : asset.name || JSON.stringify(asset)}</span>
                      </div>
                    ))
                  )}
                </div>

                {/* Remediation Steps */}
                <div className="panel">
                  <div className="panel-header">
                    <span className="panel-title">Remediation Steps</span>
                  </div>
                  {!analysis.remediation_steps?.length ? <div className="empty-state">No remediation steps</div> : (
                    analysis.remediation_steps.map((step, i) => (
                      <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid #161b22', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <span className="mono" style={{ fontSize: '11px', color: '#00ff9d', minWidth: '20px' }}>{i + 1}.</span>
                        <span style={{ fontSize: '12px', color: '#c9d1d9', lineHeight: 1.6 }}>{step}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Correlation Detections */}
              {detections.length > 0 && (
                <div className="panel">
                  <div className="panel-header">
                    <span className="panel-title">Correlation Detections</span>
                    <span className="badge badge-red">{detections.length} rules triggered</span>
                  </div>
                  {detections.map((d, i) => (
                    <div key={i} style={{ padding: '12px 16px', borderBottom: '1px solid #161b22', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <div className={`sev-dot sev-${d.severity || 'medium'}`} />
                      <span style={{ fontSize: '12px', color: '#c9d1d9', flex: 1 }}>{d.description}</span>
                      {d.mitre_technique && <span className="badge badge-blue">{d.mitre_technique}</span>}
                      <span className="mono" style={{ fontSize: '10px', color: '#6e7681' }}>conf: {Math.round((d.confidence || 0) * 100)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">No analysis found for this file. It may still be processing.</div>
          )
        )}

        {!selectedFileId && (
          <div className="empty-state" style={{ padding: '4rem' }}>
            Select a log file above or upload a new one to view its analysis.
          </div>
        )}
      </div>
    </div>
  );
}
