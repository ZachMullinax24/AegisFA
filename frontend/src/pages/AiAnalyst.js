import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import NavBar from '../components/layout/NavBar';
import { listFiles, getAnalysis, checkHealth } from '../services/api';

const ORG_ID = '0e3103d8-b4d8-4dc3-8db3-c060c47a88ac';
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001';

const QUICK_PROMPTS = [
  'Summarize this incident in plain English',
  'What are the remediation steps?',
  'Explain the attack timeline for a non-technical audience',
  'What MITRE techniques were used and why?',
  'What IOCs should I hunt for?',
  'What immediate containment actions should I take?',
];

export default function AiAnalyst() {
  const [searchParams] = useSearchParams();
  const [backendOnline, setBackendOnline] = useState(false);
  const [files, setFiles] = useState([]);
  const [selectedFileId, setSelectedFileId] = useState(searchParams.get('file') || '');
  const [analysis, setAnalysis] = useState(null);
  const [messages, setMessages] = useState([{
    role: 'ai',
    text: '**AegisFA AI Analyst — Online**\n\nI have access to your incident analysis results from the backend. Select a log file from the dropdown above, then ask me anything about the threats detected, MITRE techniques, remediation steps, or attack timeline.',
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [messages, loading]);

  const fetchFiles = useCallback(async () => {
    try {
      await checkHealth();
      setBackendOnline(true);
      const data = await listFiles(ORG_ID);
      setFiles(data || []);
    } catch { setBackendOnline(false); }
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  useEffect(() => {
    if (selectedFileId) {
      getAnalysis(selectedFileId).then(setAnalysis).catch(() => setAnalysis(null));
    } else {
      setAnalysis(null);
    }
  }, [selectedFileId]);

  async function sendMessage(text) {
    const msg = text || input.trim();
    if (!msg) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: msg }]);
    setLoading(true);

    try {
      // Build context from analysis data
      let contextText = '';
      if (analysis) {
        contextText = `
Incident Analysis Context:
- Threat Level: ${analysis.threat_level}
- Threats Found: ${analysis.threats_found}
- Attack Vector: ${analysis.attack_vector || 'Unknown'}
- Confidence Score: ${Math.round((analysis.confidence_score || 0) * 100)}%
- Summary: ${analysis.summary || 'N/A'}
- MITRE Techniques: ${(analysis.mitre_techniques || []).map(m => `${m.id} (${m.name})`).join(', ') || 'None'}
- Impacted Assets: ${(analysis.impacted_assets || []).join(', ') || 'None'}
- Remediation Steps: ${(analysis.remediation_steps || []).join(' | ') || 'None'}
        `.trim();
      }

      // Call the backend AI endpoint
      const res = await fetch(`${BACKEND_URL}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, context: contextText, file_id: selectedFileId }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'ai', text: data.response || data.message || 'No response received.' }]);
    } catch (err) {
      // Fallback: answer using analysis data directly if backend AI endpoint not available
      if (analysis) {
        const fallback = buildFallbackResponse(msg, analysis);
        setMessages(prev => [...prev, { role: 'ai', text: fallback }]);
      } else {
        setMessages(prev => [...prev, { role: 'ai', text: `⚠ **AI endpoint unavailable**\n\nThe /ai/chat endpoint is not yet implemented on the backend. Select a log file and I can answer using the analysis data directly.\n\nError: ${err.message}`, error: true }]);
      }
    } finally {
      setLoading(false);
    }
  }

  function buildFallbackResponse(question, analysis) {
    const q = question.toLowerCase();
    if (q.includes('summar') || q.includes('what happened')) {
      return `**Incident Summary**\n\n${analysis.summary || 'No summary available.'}\n\n**Threat Level:** ${analysis.threat_level}\n**Confidence:** ${Math.round((analysis.confidence_score || 0) * 100)}%`;
    }
    if (q.includes('remediat') || q.includes('fix') || q.includes('contain')) {
      const steps = (analysis.remediation_steps || []).map((s, i) => `${i + 1}. ${s}`).join('\n');
      return `**Remediation Steps**\n\n${steps || 'No remediation steps available.'}`;
    }
    if (q.includes('mitre') || q.includes('technique') || q.includes('tactic')) {
      const techniques = (analysis.mitre_techniques || []).map(m => `- **${m.id}** (${m.name}): ${m.relevance || m.description || ''}`).join('\n');
      return `**MITRE ATT&CK Techniques**\n\n${techniques || 'No MITRE techniques mapped.'}`;
    }
    if (q.includes('asset') || q.includes('affected') || q.includes('impacted')) {
      const assets = (analysis.impacted_assets || []).join('\n- ');
      return `**Impacted Assets**\n\n${assets ? '- ' + assets : 'No impacted assets identified.'}`;
    }
    if (q.includes('attack vector') || q.includes('how did')) {
      return `**Attack Vector**\n\n${analysis.attack_vector || 'Unknown attack vector.'}\n\n${analysis.summary || ''}`;
    }
    return `**Analysis Results**\n\nThreat Level: **${analysis.threat_level}**\nThreats Found: **${analysis.threats_found}**\nAttack Vector: **${analysis.attack_vector || 'Unknown'}**\n\n${analysis.summary || 'No additional details available.'}`;
  }

  function renderText(text) {
    return text.split('\n').map((line, i) => {
      const parts = line.split(/\*\*(.*?)\*\*/g);
      return (
        <span key={i}>
          {parts.map((p, j) => j % 2 === 1 ? <strong key={j} style={{ color: '#c9d1d9', fontWeight: '500' }}>{p}</strong> : p)}
          {i < text.split('\n').length - 1 && <br />}
        </span>
      );
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a0c0f' }}>
      <NavBar backendOnline={backendOnline} />

      {/* Config Bar */}
      <div style={{ background: '#0d1117', borderBottom: '1px solid #21262d', padding: '10px 1.5rem', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0, flexWrap: 'wrap' }}>
        <span className="mono" style={{ fontSize: '10px', color: '#6e7681', textTransform: 'uppercase', letterSpacing: '1.5px', whiteSpace: 'nowrap' }}>Incident Context</span>
        <select className="select" style={{ flex: 1, maxWidth: '350px' }} value={selectedFileId} onChange={e => setSelectedFileId(e.target.value)}>
          <option value="">— no file selected —</option>
          {files.map(f => <option key={f.id} value={f.id}>{f.filename} ({f.source_type})</option>)}
        </select>
        {analysis && (
          <span className="mono" style={{ fontSize: '11px', color: '#6e7681' }}>
            Threat: <span style={{ color: analysis.threat_level === 'critical' ? '#ff5555' : analysis.threat_level === 'high' ? '#f1a230' : '#00ff9d' }}>{analysis.threat_level}</span>
            {' · '}Confidence: <span style={{ color: '#00ff9d' }}>{Math.round((analysis.confidence_score || 0) * 100)}%</span>
          </span>
        )}
      </div>

      {/* Quick Prompts */}
      <div style={{ background: '#0d1117', borderBottom: '1px solid #21262d', padding: '10px 1.5rem', display: 'flex', gap: '8px', flexWrap: 'wrap', flexShrink: 0 }}>
        {QUICK_PROMPTS.map(p => (
          <button key={p} onClick={() => sendMessage(p)} disabled={loading}
            className="mono"
            style={{ fontSize: '10px', padding: '5px 11px', borderRadius: '5px', background: '#111318', border: '1px solid #21262d', color: '#6e7681', cursor: 'pointer', transition: 'all 0.15s', opacity: loading ? 0.5 : 1 }}
            onMouseEnter={e => { e.target.style.borderColor = '#00ff9d55'; e.target.style.color = '#00ff9d'; }}
            onMouseLeave={e => { e.target.style.borderColor = '#21262d'; e.target.style.color = '#6e7681'; }}>
            {p}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div ref={containerRef} style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '600', flexShrink: 0, fontFamily: 'JetBrains Mono, monospace', border: '1px solid', background: msg.role === 'user' ? '#58a6ff22' : '#00ff9d22', borderColor: msg.role === 'user' ? '#58a6ff44' : '#00ff9d44', color: msg.role === 'user' ? '#58a6ff' : '#00ff9d' }}>
              {msg.role === 'user' ? 'YOU' : 'AI'}
            </div>
            <div style={{ maxWidth: '72%', padding: '12px 16px', borderRadius: '10px', fontSize: '13px', lineHeight: 1.65, border: '1px solid', background: msg.error ? '#ff555511' : msg.role === 'user' ? '#0d1117' : '#111318', borderColor: msg.error ? '#ff555533' : msg.role === 'user' ? '#1d2129' : '#21262d', color: msg.role === 'user' ? '#8b949e' : '#c9d1d9', borderBottomLeftRadius: msg.role === 'ai' ? '3px' : '10px', borderBottomRightRadius: msg.role === 'user' ? '3px' : '10px' }}>
              {renderText(msg.text)}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontFamily: 'JetBrains Mono, monospace', border: '1px solid #00ff9d44', background: '#00ff9d22', color: '#00ff9d', flexShrink: 0 }}>AI</div>
            <div style={{ background: '#111318', border: '1px solid #21262d', borderRadius: '10px', borderBottomLeftRadius: '3px', padding: '14px 18px', display: 'flex', gap: '5px', alignItems: 'center' }}>
              {[0, 1, 2].map(i => <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00ff9d', animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />)}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #21262d', display: 'flex', gap: '10px', alignItems: 'flex-end', background: '#0d1117', flexShrink: 0 }}>
        <textarea value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder="Ask about the incident, attack patterns, MITRE techniques, remediation..."
          rows={1}
          style={{ flex: 1, background: '#111318', border: '1px solid #21262d', borderRadius: '10px', padding: '11px 15px', color: '#e6edf3', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', resize: 'none', outline: 'none', minHeight: '44px', maxHeight: '140px', lineHeight: 1.5, transition: 'border-color 0.15s' }}
          onFocus={e => e.target.style.borderColor = '#00ff9d55'}
          onBlur={e => e.target.style.borderColor = '#21262d'}
        />
        <button onClick={() => sendMessage()} disabled={loading || !input.trim()}
          style={{ width: '44px', height: '44px', background: '#00ff9d', border: 'none', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: loading || !input.trim() ? 0.4 : 1, transition: 'opacity 0.15s' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13" stroke="#0a0c0f" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M22 2L15 22 11 13 2 9l20-7Z" stroke="#0a0c0f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:0.2} 50%{opacity:1} }`}</style>
    </div>
  );
}
