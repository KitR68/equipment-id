#!/usr/bin/env python3
"""Build client/src/data/seedKnowledge.json from research_serial_decoding.json.

Each entry conforms to ManufacturerEntry from client/src/lib/storage.ts:
  { name, serialFormat, dateDecoding, modelFormat?, sources?, updatedAt, usageCount }
"""
import json
import os
import re
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = "/home/ubuntu/research_serial_decoding.json"
OUT = os.path.join(ROOT, "client/src/data/seedKnowledge.json")

os.makedirs(os.path.dirname(OUT), exist_ok=True)

with open(SRC, "r", encoding="utf-8") as f:
    data = json.load(f)

now = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

URL_RE = re.compile(r"https?://\S+")

def split_sources(s: str):
    if not s:
        return []
    # Try comma split first, but also pull out URLs explicitly
    raw = [x.strip() for x in re.split(r"[,;\n]", s) if x.strip()]
    cleaned = []
    seen = set()
    for x in raw:
        x = x.rstrip(".)")
        if x and x not in seen:
            seen.add(x)
            cleaned.append(x)
    return cleaned[:6]

def slug(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip().lower())

entries = {}
for row in data.get("results", []):
    out = row.get("output") or {}
    name = (out.get("manufacturer_name") or "").strip()
    if not name:
        continue
    serial_format = (out.get("serial_format") or "").strip()
    date_rule = (out.get("date_decoding_rule") or "").strip()
    examples = (out.get("examples") or "").strip()
    confidence = (out.get("confidence") or "medium").strip().lower()
    if examples:
        # Append examples to the decoding rule so the LLM can see them at decode time
        date_rule = f"{date_rule}\n\nExamples: {examples}"
    sources = split_sources(out.get("sources") or "")
    sources.append(f"seed-knowledge:{confidence}-confidence")
    key = slug(name)
    # If we already have this slug (e.g. Rheem researched twice for HVAC + water heater),
    # merge: keep both descriptions under one entry.
    if key in entries:
        existing = entries[key]
        existing["serialFormat"] = (
            existing["serialFormat"].rstrip(". ")
            + ". Additional product-line format: "
            + serial_format
        )
        existing["dateDecoding"] = (
            existing["dateDecoding"]
            + "\n\n--- Additional product-line variant ---\n"
            + date_rule
        )
        # union sources
        for s in sources:
            if s not in existing["sources"]:
                existing["sources"].append(s)
        continue
    entries[key] = {
        "name": name,
        "serialFormat": serial_format,
        "dateDecoding": date_rule,
        "sources": sources,
        "updatedAt": now,
        "usageCount": 0,
    }

# Sort by name for stable diffs
sorted_entries = {k: entries[k] for k in sorted(entries.keys())}

payload = {
    "version": 1,
    "generatedAt": now,
    "description": (
        "Pre-loaded manufacturer serial-number decoding rules. Compiled from "
        "manufacturer service docs and established dating references. "
        "Merged into the user's local knowledge base on first run if the "
        "manufacturer is not already present."
    ),
    "entries": sorted_entries,
}

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(payload, f, indent=2, ensure_ascii=False)

print(f"Wrote {len(sorted_entries)} entries to {OUT}")
