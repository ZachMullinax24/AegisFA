-- Create organizations table first
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    api_key TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create raw_logs table
CREATE TABLE IF NOT EXISTS raw_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    source_id TEXT,
    payload JSONB,
    received_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create correlation_rules table
CREATE TABLE IF NOT EXISTS correlation_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES organizations(id),
    name TEXT NOT NULL,
    mitre_technique TEXT,
    severity TEXT,
    rule_logic JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create detections table
CREATE TABLE IF NOT EXISTS detections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    rule_id UUID REFERENCES correlation_rules(id),
    matched_indices JSONB,
    confidence FLOAT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create normalized_events table
CREATE TABLE IF NOT EXISTS normalized_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    raw_log_id UUID REFERENCES raw_logs(id),
    source_id TEXT,
    event_type TEXT,
    severity TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert a demo organization
INSERT INTO organizations (name, api_key)
VALUES ('Demo Organization', 'demo-api-key-123')
ON CONFLICT DO NOTHING;