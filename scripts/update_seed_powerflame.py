"""
Add Power Flame Inc to seedKnowledge.json and bump seed version to v4.
"""
import json, pathlib, datetime

SEED_PATH = pathlib.Path(__file__).parent.parent / "client/src/data/seedKnowledge.json"

seed = json.loads(SEED_PATH.read_text())
entries: dict = seed["entries"]

pf_entry = {
    "name": "Power Flame Inc",
    "category": "Burners / Combustion Equipment",
    "aliases": ["Power Flame", "Power Flame Inc", "PowerFlame"],
    "serialFormat": (
        "Sequential production number only — the serial number itself does NOT encode "
        "the manufacture date. The manufacture date is encoded in the Job Order number, "
        "which appears separately on the nameplate."
    ),
    "dateDecoding": (
        "Power Flame nameplates carry two distinct numbers: a Serial# and a Job Order#. "
        "The SERIAL NUMBER is a sequential production number and contains no date information.\n\n"
        "The JOB ORDER NUMBER is the primary source for the manufacture date. "
        "Format: J + MM + DD + YY\n"
        "  J  = literal prefix character\n"
        "  MM = two-digit month (01–12)\n"
        "  DD = two-digit day of month (01–31)\n"
        "  YY = two-digit year\n\n"
        "EXAMPLE: Job Order# J072806 → J + 07 + 28 + 06 → July 28, 2006.\n\n"
        "When analyzing a Power Flame nameplate, always look for both the 'Serial#' field "
        "and the 'Job Order#' (or 'Job No.') field. Use the Job Order number to determine "
        "the manufacture date; the serial number alone is insufficient for dating."
    ),
    "modelFormat": (
        "Power Flame model numbers typically encode burner type, fuel type, and firing rate. "
        "Example: C-2-G-10 = C-series, size 2, gas-fired, 10 MMBtu/hr."
    ),
    "examples": [
        "Job Order# J072806 → July 28, 2006",
        "Job Order# J010115 → January 1, 2015",
        "Job Order# J123121 → December 31, 2021"
    ],
    "confidence": "high",
    "sources": [
        "https://www.powerflame.com",
        "https://www.powerflame.com/resources/manuals"
    ],
    "updatedAt": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    "usageCount": 0
}

# ── Insert main entry and alias keys ─────────────────────────────────────────
main_key = "power flame inc"
entries[main_key] = pf_entry
print(f"  Added entry: {main_key!r}")

for alias in pf_entry["aliases"]:
    alias_key = alias.strip().lower()
    if alias_key != main_key:
        entries[alias_key] = pf_entry
        print(f"  Added alias key: {alias_key!r}")

# ── Bump seed version ─────────────────────────────────────────────────────────
old_version = seed.get("version", 3)
seed["version"] = 4
print(f"  Seed version: {old_version} → 4")
print(f"  Total entry keys: {len(entries)}")

seed["entries"] = entries
SEED_PATH.write_text(json.dumps(seed, indent=2, ensure_ascii=False) + "\n")
print(f"  Written: {SEED_PATH}")
