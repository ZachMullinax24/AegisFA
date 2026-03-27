const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001';

// ─── HELPER ───────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const res = await fetch(`${BACKEND_URL}${path}`, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── FILES ────────────────────────────────────────────────────
export async function listFiles(orgId) {
  return apiFetch(`/files?org_id=${orgId}`);
}

// ─── UPLOAD LOG FILE ──────────────────────────────────────────
export async function uploadLogFile(file, sourceType, orgId) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('source_type', sourceType);
  formData.append('org_id', orgId);

  const res = await fetch(`${BACKEND_URL}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── ANALYSIS ─────────────────────────────────────────────────
export async function getAnalysis(fileId) {
  return apiFetch(`/analysis/${fileId}`);
}

export async function reAnalyzeFile(fileId) {
  return apiFetch(`/analyze/${fileId}`, { method: 'POST' });
}

// ─── TIMELINE ─────────────────────────────────────────────────
export async function getFileTimeline(fileId, filters = {}) {
  const params = new URLSearchParams(filters).toString();
  return apiFetch(`/timeline/${fileId}${params ? '?' + params : ''}`);
}

export async function getOrgTimeline(orgId, filters = {}) {
  const params = new URLSearchParams({ org_id: orgId, ...filters }).toString();
  return apiFetch(`/timeline?${params}`);
}

// ─── DETECTIONS ───────────────────────────────────────────────
export async function getDetections(orgId, fileId = null) {
  const params = new URLSearchParams({ org_id: orgId });
  if (fileId) params.append('file_id', fileId);
  return apiFetch(`/detections?${params}`);
}

// ─── CORRELATION RULES ────────────────────────────────────────
export async function listRules(orgId) {
  return apiFetch(`/rules?org_id=${orgId}`);
}

// ─── HEALTH ───────────────────────────────────────────────────
export async function checkHealth() {
  return apiFetch('/health');
}
