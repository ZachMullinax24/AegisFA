from flask import Blueprint, request, jsonify
from . import supabase_client
from .normalization import normalize_log
from .file_parser import parse_file
from .rag_service import analyze_threats
from .correlation_engine import run_correlation
from .storage import upload_file
from datetime import datetime, timezone

main = Blueprint('main', __name__)

@main.route('/ingest', methods=['POST'])
def ingest():
    data = request.get_json()
    source = data.get('source')
    raw_data = data.get('raw_data')
    timestamp = data.get('timestamp', datetime.now(timezone.utc).isoformat())

    # 1. Insert raw log
    raw_result = supabase_client.table('raw_logs').insert({
        'org_id': data.get('org_id'),
        'source_id': data.get('source_id'),
        'payload': raw_data,
        'received_at': timestamp
    }).execute()

    raw_log_id = raw_result.data[0]['id']

    # 2. Normalize and insert normalized event
    normalized = normalize_log(source, raw_data)
    norm_result = supabase_client.table('normalized_events').insert({
        'org_id': data.get('org_id'),
        'raw_log_id': raw_log_id,
        'source_id': data.get('source_id'),
        'event_type': normalized.get('action'),
        'severity': normalized.get('status')
    }).execute()

    return jsonify({
        'raw_log_id': raw_log_id,
        'normalized_event_id': norm_result.data[0]['id'],
        'normalized_data': normalized
    }), 201

@main.route('/upload', methods=['POST'])
def upload_log_file():
    # Validate file is present
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    source_type = request.form.get('source_type')
    org_id = request.form.get('org_id')

    if not source_type or source_type not in {'windows', 'firewall', 'auth', 'syslog', 'custom'}:
        return jsonify({'error': 'source_type must be one of: windows, firewall, auth, syslog, custom'}), 400

    if not org_id:
        return jsonify({'error': 'org_id is required'}), 400

    file_bytes = file.read()

    # 1. Parse the file into individual log entries
    try:
        entries = parse_file(file_bytes, file.filename)
    except Exception as e:
        return jsonify({'error': f'Failed to parse file: {str(e)}'}), 400

    # 2. Upload raw file to Supabase Storage
    try:
        storage_path = upload_file(file_bytes, file.filename, org_id)
    except Exception as e:
        return jsonify({'error': f'Failed to upload file to storage: {str(e)}'}), 500

    # 3. Create log_files record with status "analyzing"
    try:
        file_record = supabase_client.table('log_files').insert({
            'filename': file.filename,
            'org_id': org_id,
            'source_type': source_type,
            'storage_path': storage_path,
            'status': 'analyzing',
            'entry_count': len(entries)
        }).execute()

        file_id = file_record.data[0]['id']
    except Exception as e:
        return jsonify({'error': f'Failed to save file record: {str(e)}'}), 500

    # 4. Insert each parsed entry into raw_logs
    try:
        for entry in entries:
            supabase_client.table('raw_logs').insert({
                'org_id': org_id,
                'payload': entry,
                'file_id': file_id
            }).execute()
    except Exception as e:
        supabase_client.table('log_files').update({'status': 'failed'}).eq('id', file_id).execute()
        return jsonify({'error': f'Failed to store log entries: {str(e)}'}), 500

    # 5. Run correlation engine (non-fatal if it fails)
    try:
        detections = run_correlation(entries, org_id, file_id)
    except Exception as e:
        detections = []
        print(f"Correlation engine warning: {e}")

    # 6. Run RAG threat analysis (with correlation context)
    try:
        analysis = analyze_threats(entries, source_type, detections=detections)
    except Exception as e:
        supabase_client.table('log_files').update({'status': 'failed'}).eq('id', file_id).execute()
        return jsonify({'error': f'Threat analysis failed: {str(e)}'}), 500

    # 7. Store analysis results
    try:
        supabase_client.table('analysis_results').insert({
            'file_id': file_id,
            'threat_level': analysis['threat_level'],
            'threats_found': analysis['threats_found'],
            'summary': analysis['summary'],
            'detailed_findings': analysis['detailed_findings'],
            'mitre_techniques': analysis.get('mitre_techniques'),
            'attack_vector': analysis.get('attack_vector'),
            'timeline': analysis.get('timeline'),
            'impacted_assets': analysis.get('impacted_assets'),
            'confidence_score': analysis.get('confidence_score'),
            'remediation_steps': analysis.get('remediation_steps'),
            'correlation_detections': detections,
        }).execute()
    except Exception as e:
        supabase_client.table('log_files').update({'status': 'failed'}).eq('id', file_id).execute()
        return jsonify({'error': f'Failed to store analysis: {str(e)}'}), 500

    # 8. Mark file as completed
    supabase_client.table('log_files').update({'status': 'completed'}).eq('id', file_id).execute()

    return jsonify({
        'file_id': file_id,
        'filename': file.filename,
        'entry_count': len(entries),
        'detections': detections,
        'detection_count': len(detections),
        'analysis': {
            'threat_level': analysis['threat_level'],
            'threats_found': analysis['threats_found'],
            'summary': analysis['summary'],
            'mitre_techniques': analysis.get('mitre_techniques'),
            'attack_vector': analysis.get('attack_vector'),
            'confidence_score': analysis.get('confidence_score'),
        }
    }), 201


@main.route('/analysis/<file_id>', methods=['GET'])
def get_analysis(file_id):
    result = supabase_client.table('analysis_results').select('*').eq('file_id', file_id).execute()

    if not result.data:
        return jsonify({'error': 'No analysis found for this file'}), 404

    return jsonify(result.data[0]), 200


@main.route('/files', methods=['GET'])
def list_files():
    org_id = request.args.get('org_id')

    if org_id:
        result = supabase_client.table('log_files').select('*').eq('org_id', org_id).execute()
    else:
        result = supabase_client.table('log_files').select('*').execute()

    return jsonify(result.data), 200


@main.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'}), 200


# ------------------------------------------------------------------
# Correlation Rules CRUD
# ------------------------------------------------------------------

@main.route('/rules', methods=['GET'])
def list_rules():
    org_id = request.args.get('org_id')
    if not org_id:
        return jsonify({'error': 'org_id is required'}), 400

    org_rules = supabase_client.table('correlation_rules').select('*').eq('org_id', org_id).execute()
    default_rules = supabase_client.table('correlation_rules').select('*').is_('org_id', 'null').execute()
    all_rules = (default_rules.data or []) + (org_rules.data or [])
    return jsonify(all_rules), 200


@main.route('/rules', methods=['POST'])
def create_rule():
    data = request.get_json()
    required = ['org_id', 'name', 'severity', 'rule_logic']
    missing = [f for f in required if f not in data]
    if missing:
        return jsonify({'error': f'Missing fields: {missing}'}), 400

    valid_types = {'threshold', 'sequence', 'distinct_value', 'existence', 'time_rate'}
    rule_type = data['rule_logic'].get('type')
    if rule_type not in valid_types:
        return jsonify({'error': f'rule_logic.type must be one of: {valid_types}'}), 400

    result = supabase_client.table('correlation_rules').insert({
        'org_id': data['org_id'],
        'name': data['name'],
        'mitre_technique': data.get('mitre_technique'),
        'severity': data['severity'],
        'rule_logic': data['rule_logic'],
    }).execute()

    return jsonify(result.data[0]), 201


@main.route('/rules/<rule_id>', methods=['PUT'])
def update_rule(rule_id):
    data = request.get_json()
    allowed = {'name', 'mitre_technique', 'severity', 'rule_logic'}
    update_data = {k: v for k, v in data.items() if k in allowed}

    if not update_data:
        return jsonify({'error': 'No valid fields to update'}), 400

    result = supabase_client.table('correlation_rules').update(update_data).eq('id', rule_id).execute()

    if not result.data:
        return jsonify({'error': 'Rule not found'}), 404

    return jsonify(result.data[0]), 200


@main.route('/rules/<rule_id>', methods=['DELETE'])
def delete_rule(rule_id):
    result = supabase_client.table('correlation_rules').delete().eq('id', rule_id).execute()

    if not result.data:
        return jsonify({'error': 'Rule not found'}), 404

    return jsonify({'deleted': rule_id}), 200


# ------------------------------------------------------------------
# Detections
# ------------------------------------------------------------------

@main.route('/detections', methods=['GET'])
def list_detections():
    org_id = request.args.get('org_id')
    if not org_id:
        return jsonify({'error': 'org_id is required'}), 400

    query = supabase_client.table('detections').select('*').eq('org_id', org_id)

    file_id = request.args.get('file_id')
    if file_id:
        query = query.eq('file_id', file_id)

    result = query.execute()
    return jsonify(result.data), 200
