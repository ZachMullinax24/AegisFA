"""
Correlation Rules Engine for AegisFA.

Evaluates parsed log entries against correlation rules stored in the database.
Produces deterministic, auditable detections mapped to MITRE ATT&CK techniques.

Supports 5 rule types:
  - threshold:      count of matching events >= N per group within time window
  - sequence:       ordered event chain within time window
  - distinct_value: too many distinct values of a field per group
  - existence:      any event matching a filter exists
  - time_rate:      events/minute exceeds threshold
"""

import re
from collections import defaultdict
from datetime import datetime, timezone
from typing import Optional

from . import supabase_client


# ---------------------------------------------------------------------------
# Filter operators
# ---------------------------------------------------------------------------

_OPS = {
    "eq": lambda val, rule_val: val == rule_val,
    "neq": lambda val, rule_val: val != rule_val,
    "in": lambda val, rule_val: val in rule_val,
    "contains": lambda val, rule_val: rule_val in str(val) if val else False,
    "regex": lambda val, rule_val: bool(re.search(rule_val, str(val))) if val else False,
    "exists": lambda val, _: val is not None,
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def run_correlation(
    entries: list[dict],
    org_id: str,
    file_id: str,
) -> list[dict]:
    """
    Fetch active correlation rules, evaluate each against entries,
    persist detections, and return results.
    """
    rules = _fetch_rules(org_id)
    detections = []

    for rule in rules:
        result = _evaluate_rule(rule, entries)
        if result is not None:
            # Save to database
            detection_id = _save_detection(
                org_id=org_id,
                file_id=file_id,
                rule=rule,
                matched_indices=result["matched_indices"],
                confidence=result["confidence"],
                description=result["description"],
            )
            detections.append({
                "detection_id": detection_id,
                "rule_name": rule["name"],
                "mitre_technique": rule.get("mitre_technique", ""),
                "severity": rule.get("severity", "medium"),
                "confidence": result["confidence"],
                "matched_event_indices": result["matched_indices"],
                "description": result["description"],
            })

    return detections


# ---------------------------------------------------------------------------
# Rule fetching
# ---------------------------------------------------------------------------

def _fetch_rules(org_id: str) -> list[dict]:
    """Fetch org-specific rules + global defaults (org_id IS NULL)."""
    org_rules = (
        supabase_client.table("correlation_rules")
        .select("*")
        .eq("org_id", org_id)
        .execute()
    )
    default_rules = (
        supabase_client.table("correlation_rules")
        .select("*")
        .is_("org_id", "null")
        .execute()
    )
    return (default_rules.data or []) + (org_rules.data or [])


# ---------------------------------------------------------------------------
# Rule evaluation dispatcher
# ---------------------------------------------------------------------------

_EVALUATORS = {}  # populated below


def _evaluate_rule(rule: dict, entries: list[dict]) -> Optional[dict]:
    """Dispatch to the appropriate evaluator based on rule_logic['type']."""
    logic = rule.get("rule_logic", {})
    rule_type = logic.get("type")
    evaluator = _EVALUATORS.get(rule_type)
    if evaluator is None:
        return None
    return evaluator(logic, entries)


# ---------------------------------------------------------------------------
# Filter & grouping helpers
# ---------------------------------------------------------------------------

def _entry_matches_filter(entry: dict, filters: list[dict]) -> bool:
    """Check if an entry matches ALL filter conditions (AND)."""
    for condition in filters:
        field = condition.get("field", "")
        op = condition.get("op", "eq")
        rule_val = condition.get("value")
        entry_val = entry.get(field)

        op_fn = _OPS.get(op)
        if op_fn is None:
            return False
        if not op_fn(entry_val, rule_val):
            return False
    return True


def _filter_entries(
    entries: list[dict], filters: list[dict]
) -> list[tuple[int, dict]]:
    """Return (original_index, entry) for entries matching the filters."""
    return [
        (i, e) for i, e in enumerate(entries) if _entry_matches_filter(e, filters)
    ]


def _group_entries(
    indexed_entries: list[tuple[int, dict]],
    group_by: list[str],
) -> dict[tuple, list[tuple[int, dict]]]:
    """Partition indexed entries by group_by field values."""
    groups = defaultdict(list)
    for idx, entry in indexed_entries:
        key = tuple(entry.get(f, "") for f in group_by)
        groups[key].append((idx, entry))
    return dict(groups)


# ---------------------------------------------------------------------------
# Timestamp helpers
# ---------------------------------------------------------------------------

_TS_FIELDS = ("timestamp", "Timestamp", "time", "Time", "datetime", "received_at")
_TS_FORMATS = (
    "%Y-%m-%dT%H:%M:%SZ",
    "%Y-%m-%dT%H:%M:%S%z",
    "%Y-%m-%dT%H:%M:%S.%fZ",
    "%Y-%m-%dT%H:%M:%S.%f%z",
    "%Y-%m-%d %H:%M:%S",
    "%m/%d/%Y %H:%M:%S",
)


def _parse_timestamp(entry: dict) -> Optional[datetime]:
    """Try to parse a timestamp from common field names and formats."""
    raw = None
    for field in _TS_FIELDS:
        if field in entry and entry[field]:
            raw = str(entry[field])
            break
    if raw is None:
        return None

    # Try fromisoformat first (handles most ISO 8601)
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return dt
    except (ValueError, TypeError):
        pass

    # Try common formats
    for fmt in _TS_FORMATS:
        try:
            return datetime.strptime(raw, fmt)
        except (ValueError, TypeError):
            continue
    return None


def _entries_within_window(
    indexed_entries: list[tuple[int, dict]], window_seconds: Optional[int]
) -> bool:
    """Check if all entries fall within the time window."""
    if window_seconds is None:
        return True
    timestamps = [_parse_timestamp(e) for _, e in indexed_entries]
    timestamps = [t for t in timestamps if t is not None]
    if len(timestamps) < 2:
        return True  # Can't verify window, assume ok
    span = (max(timestamps) - min(timestamps)).total_seconds()
    return span <= window_seconds


# ---------------------------------------------------------------------------
# Confidence calculation
# ---------------------------------------------------------------------------

def _compute_confidence(base: float, actual: int, threshold: int) -> float:
    """Scale confidence based on how much actual exceeds threshold."""
    if threshold <= 0:
        return min(base, 1.0)
    ratio = actual / threshold
    adjusted = base * min(ratio, 2.0) / 2.0 + base / 2.0
    return min(adjusted, 1.0)


# ---------------------------------------------------------------------------
# Type-specific evaluators
# ---------------------------------------------------------------------------

def _evaluate_threshold(logic: dict, entries: list[dict]) -> Optional[dict]:
    """Fires when count of matching events per group >= threshold."""
    filters = logic.get("filter", [])
    group_by = logic.get("group_by", [])
    threshold = logic.get("threshold", 1)
    window = logic.get("window_seconds")
    base_conf = logic.get("base_confidence", 0.7)

    matched = _filter_entries(entries, filters)
    if not matched:
        return None

    if group_by:
        groups = _group_entries(matched, group_by)
    else:
        groups = {"_all": matched}

    for group_key, group_entries in groups.items():
        if not _entries_within_window(group_entries, window):
            continue
        count = len(group_entries)
        if count >= threshold:
            indices = [i for i, _ in group_entries]
            return {
                "matched_indices": indices,
                "confidence": _compute_confidence(base_conf, count, threshold),
                "description": (
                    f"Threshold rule triggered: {count} events "
                    f"(threshold: {threshold}) for group {group_key}"
                ),
            }
    return None


def _evaluate_sequence(logic: dict, entries: list[dict]) -> Optional[dict]:
    """Fires when entries matching steps appear in chronological order."""
    steps = logic.get("steps", [])
    group_by = logic.get("group_by", [])
    window = logic.get("window_seconds")
    base_conf = logic.get("base_confidence", 0.8)

    if not steps:
        return None

    # Find matching entries for each step
    step_matches = []
    for step_filter in steps:
        step_matches.append(_filter_entries(entries, step_filter))

    # If any step has zero matches, sequence can't complete
    if any(len(sm) == 0 for sm in step_matches):
        return None

    # Group entries across all steps
    if group_by:
        # Build per-group step matches
        all_groups = defaultdict(lambda: [[] for _ in steps])
        for step_idx, matches in enumerate(step_matches):
            for idx, entry in matches:
                key = tuple(entry.get(f, "") for f in group_by)
                all_groups[key][step_idx].append((idx, entry))
    else:
        all_groups = {"_all": step_matches}

    for group_key, group_step_matches in all_groups.items():
        # Check each step has at least one match in this group
        if any(len(sm) == 0 for sm in group_step_matches):
            continue

        # Greedy: pick earliest entry for each step in order
        sequence_indices = []
        last_ts = None
        valid = True

        for step_entries in group_step_matches:
            # Sort by index (proxy for chronological order)
            sorted_entries = sorted(step_entries, key=lambda x: x[0])
            found = False
            for idx, entry in sorted_entries:
                ts = _parse_timestamp(entry)
                if last_ts is None or ts is None or ts >= last_ts:
                    sequence_indices.append(idx)
                    last_ts = ts
                    found = True
                    break
            if not found:
                valid = False
                break

        if not valid:
            continue

        # Check time window
        if window is not None and len(sequence_indices) >= 2:
            first_entries = [(i, entries[i]) for i in sequence_indices]
            if not _entries_within_window(first_entries, window):
                continue

        return {
            "matched_indices": sequence_indices,
            "confidence": base_conf,
            "description": (
                f"Sequence rule triggered: {len(steps)}-step chain "
                f"detected for group {group_key}"
            ),
        }
    return None


def _evaluate_distinct_value(logic: dict, entries: list[dict]) -> Optional[dict]:
    """Fires when distinct values of a field per group >= threshold."""
    filters = logic.get("filter", [])
    group_by = logic.get("group_by", [])
    distinct_field = logic.get("distinct_field", "")
    distinct_threshold = logic.get("distinct_threshold", 2)
    window = logic.get("window_seconds")
    base_conf = logic.get("base_confidence", 0.7)

    matched = _filter_entries(entries, filters)
    if not matched:
        return None

    if group_by:
        groups = _group_entries(matched, group_by)
    else:
        groups = {"_all": matched}

    for group_key, group_entries in groups.items():
        if not _entries_within_window(group_entries, window):
            continue
        distinct_values = {e.get(distinct_field) for _, e in group_entries}
        distinct_values.discard(None)
        count = len(distinct_values)
        if count >= distinct_threshold:
            indices = [i for i, _ in group_entries]
            return {
                "matched_indices": indices,
                "confidence": _compute_confidence(base_conf, count, distinct_threshold),
                "description": (
                    f"Distinct value rule triggered: {count} distinct "
                    f"'{distinct_field}' values (threshold: {distinct_threshold}) "
                    f"for group {group_key}"
                ),
            }
    return None


def _evaluate_existence(logic: dict, entries: list[dict]) -> Optional[dict]:
    """Fires if ANY entry matches the filter."""
    filters = logic.get("filter", [])
    base_conf = logic.get("base_confidence", 0.7)

    matched = _filter_entries(entries, filters)
    if not matched:
        return None

    indices = [i for i, _ in matched]
    return {
        "matched_indices": indices,
        "confidence": base_conf,
        "description": f"Existence rule triggered: {len(matched)} matching events found",
    }


def _evaluate_time_rate(logic: dict, entries: list[dict]) -> Optional[dict]:
    """Fires when events/minute exceeds threshold."""
    filters = logic.get("filter", [])
    group_by = logic.get("group_by", [])
    rate_per_minute = logic.get("rate_per_minute", 10)
    base_conf = logic.get("base_confidence", 0.7)

    matched = _filter_entries(entries, filters)
    if not matched:
        return None

    if group_by:
        groups = _group_entries(matched, group_by)
    else:
        groups = {"_all": matched}

    for group_key, group_entries in groups.items():
        # Parse timestamps and sort
        timed = []
        for idx, entry in group_entries:
            ts = _parse_timestamp(entry)
            if ts is not None:
                timed.append((idx, entry, ts))

        if len(timed) < 2:
            continue

        timed.sort(key=lambda x: x[2])
        span_seconds = (timed[-1][2] - timed[0][2]).total_seconds()
        if span_seconds <= 0:
            continue

        rate = len(timed) / (span_seconds / 60.0)
        if rate >= rate_per_minute:
            indices = [i for i, _, _ in timed]
            return {
                "matched_indices": indices,
                "confidence": _compute_confidence(base_conf, int(rate), rate_per_minute),
                "description": (
                    f"Time rate rule triggered: {rate:.1f} events/min "
                    f"(threshold: {rate_per_minute}/min) for group {group_key}"
                ),
            }
    return None


# Register evaluators
_EVALUATORS = {
    "threshold": _evaluate_threshold,
    "sequence": _evaluate_sequence,
    "distinct_value": _evaluate_distinct_value,
    "existence": _evaluate_existence,
    "time_rate": _evaluate_time_rate,
}


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------

def _save_detection(
    org_id: str,
    file_id: str,
    rule: dict,
    matched_indices: list[int],
    confidence: float,
    description: str,
) -> str:
    """Insert a detection record and return its UUID."""
    result = supabase_client.table("detections").insert({
        "org_id": org_id,
        "rule_id": rule["id"],
        "file_id": file_id,
        "event_ids": matched_indices,
        "confidence": round(confidence, 4),
        "severity": rule.get("severity", "medium"),
        "description": description,
    }).execute()
    return result.data[0]["id"]
