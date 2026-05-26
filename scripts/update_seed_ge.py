"""
Update the GE Appliances entry in seedKnowledge.json with the full
letter-based month/year coding system, aliases, and bump seed version to v3.

The seed file uses a dict-of-entries structure:
  { "version": 2, "entries": { "ge appliances": {...}, ... } }
"""
import json, pathlib, datetime

SEED_PATH = pathlib.Path(__file__).parent.parent / "client/src/data/seedKnowledge.json"

seed = json.loads(SEED_PATH.read_text())
entries: dict = seed["entries"]

# ── Build the updated GE entry (matches ManufacturerEntry shape) ──────────────
ge_entry = {
    "name": "GE Appliances",
    "category": "Appliances",
    "aliases": ["GE", "GE Appliance", "GE Appliances", "General Electric"],
    "serialFormat": (
        "Two-letter date prefix + sequential digits. "
        "Character 1 = Month code (letter, skipping C/E/I/J/K/N/O/P/Q/U). "
        "Character 2 = Year code (letter, cycling ~12-year cycle). "
        "Remaining characters = sequential production number."
    ),
    "dateDecoding": (
        "GE Appliances uses a two-letter date code at the start of the serial number.\n\n"
        "MONTH (1st character — letter code):\n"
        "  A=January, B=February, D=March, F=April, G=May, H=June,\n"
        "  L=July, M=August, R=September, S=October, T=November, V=December.\n"
        "  Note: the letters C, E, I, J, K, N, O, P, Q, U are intentionally skipped.\n\n"
        "YEAR (2nd character — letter code, cycling):\n"
        "  The year letter follows a fixed sequence that repeats approximately every 12 years:\n"
        "  D=2000/2012/2024, F=2001/2013/2025, G=2002/2014, H=2003/2015,\n"
        "  L=2004/2016, A=2005/2017, M=2006/2018, R=2007/2019,\n"
        "  S=2008/2020, T=2009/2021, V=2010/2022, Z=2011/2023.\n\n"
        "DISAMBIGUATION: Because the year letter cycles, use the model number, product line "
        "introduction date, or known production era to determine which cycle applies. "
        "For example, a unit with model features consistent with 2005–2011 production should "
        "use the first cycle; a unit consistent with 2017–2023 production should use the "
        "second cycle. When ambiguous, report both possible years.\n\n"
        "EXAMPLE: Serial HA301348P → H (1st char) = June; A (2nd char) = 2005 or 2017. "
        "Manufacture date: June 2005 or June 2017 depending on production era."
    ),
    "modelFormat": (
        "GE model numbers typically start with 2–3 letters indicating the product category "
        "(e.g., GTS=top-freezer refrigerator, GTW=top-load washer, JB=range, PFE=French-door "
        "refrigerator), followed by digits for capacity/features and letters for color/series."
    ),
    "examples": [
        "HA301348P → H=June, A=2005 or 2017 → June 2005 or June 2017",
        "TT123456A → T=November, T=2009 or 2021 → November 2009 or November 2021",
        "DS987654B → D=March, S=2008 or 2020 → March 2008 or March 2020",
        "VZ112233X → V=December, Z=2011 or 2023 → December 2011 or December 2023"
    ],
    "confidence": "high",
    "sources": [
        "https://www.geapplianceparts.com/store/parts/spec/Serial_Number_Decode.pdf",
        "https://producthelp.geappliances.com/Refrigerators/GE_Refrigerators/Product_Information_&_Specifications/How_to_Read_GE_Appliances_Serial_Numbers",
        "https://www.appliancepartspros.com/repair-help/ge-model-number-search.html"
    ],
    "updatedAt": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    "usageCount": 0
}

# ── Replace or insert the GE entry ───────────────────────────────────────────
old_key = None
for k in list(entries.keys()):
    if "ge" in k and ("appliance" in k or k == "ge"):
        old_key = k
        break

if old_key:
    print(f"  Replacing existing entry at key {old_key!r}")
    del entries[old_key]
else:
    print("  No existing GE entry found — inserting new entry.")

entries["ge appliances"] = ge_entry

# ── Also register alias keys pointing to the same entry ──────────────────────
# (The seedLoader registers these at runtime; we add them here for completeness
#  so direct key lookups on "ge" or "general electric" also resolve.)
for alias in ge_entry["aliases"]:
    alias_key = alias.strip().lower()
    if alias_key != "ge appliances":
        entries[alias_key] = ge_entry
        print(f"  Added alias key: {alias_key!r}")

# ── Bump seed version ─────────────────────────────────────────────────────────
old_version = seed.get("version", 2)
seed["version"] = 3
print(f"  Seed version: {old_version} → 3")
print(f"  Total entry keys: {len(entries)}")

seed["entries"] = entries
SEED_PATH.write_text(json.dumps(seed, indent=2, ensure_ascii=False) + "\n")
print(f"  Written: {SEED_PATH}")
