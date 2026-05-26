"""
Update seedKnowledge.json to:
1. Add aliases to the existing "State Water Heaters" entry.
2. Add a dedicated "State Industries" entry with the exact YY-WW serial format.
3. Bump the seed version so the seedLoader re-imports on next app load.
"""
import json
from pathlib import Path

SEED_PATH = Path(__file__).parent.parent / "client/src/data/seedKnowledge.json"

with open(SEED_PATH) as f:
    data = json.load(f)

entries = data["entries"]

# ── 1. Patch the existing State Water Heaters entry ──────────────────────────
swh_key = "state water heaters"
if swh_key in entries:
    existing = entries[swh_key]
    existing["aliases"] = [
        "State Industries",
        "State Industries INC",
        "State Industries, INC",
        "State Ind",
    ]
    # Ensure the dateDecoding mentions the YY-WW format clearly
    if "2339135877683" not in existing.get("dateDecoding", ""):
        existing["dateDecoding"] = (
            existing["dateDecoding"].rstrip()
            + "\n\nState Industries (pre-A.O. Smith acquisition) serial format: "
            "First 2 digits = year (YY), next 2 digits = week of manufacture (WW), "
            "remaining digits = sequential production number. "
            "Example: 2339135877683 → 23 = 2023, 39 = week 39 (late September 2023)."
        )
    print(f"Patched: {swh_key}")

# ── 2. Add a dedicated State Industries entry ─────────────────────────────────
si_key = "state industries"
if si_key not in entries:
    entries[si_key] = {
        "name": "State Industries",
        "serialFormat": (
            "State Industries (now part of A.O. Smith) serial numbers follow a "
            "YYWWXXXXXXXXX format. The first two digits encode the two-digit year (YY), "
            "the next two digits encode the week of manufacture (WW, 01–53), and the "
            "remaining digits are a sequential production number. "
            "Example: 2339135877683 → Year 2023, Week 39."
        ),
        "dateDecoding": (
            "Digits 1–2 = year (YY, e.g. 23 = 2023). "
            "Digits 3–4 = week of manufacture (WW, e.g. 39 = week 39, approximately late September). "
            "Remaining digits = sequential unit number. "
            "To convert week to approximate month: week 1–4 ≈ January, 5–8 ≈ February, "
            "9–13 ≈ March, 14–17 ≈ April, 18–21 ≈ May, 22–26 ≈ June, "
            "27–30 ≈ July, 31–35 ≈ August, 36–39 ≈ September, "
            "40–43 ≈ October, 44–48 ≈ November, 49–53 ≈ December. "
            "Example: 2339135877683 → 23=2023, 39=week 39 → late September 2023."
        ),
        "modelFormat": (
            "State Industries is now part of A.O. Smith. "
            "Product lines include ProLine, Vertex, and Proline Master. "
            "Model numbers typically follow A.O. Smith conventions post-acquisition."
        ),
        "aliases": [
            "State Industries INC",
            "State Industries, INC",
            "State Ind",
            "State Water Heaters",
        ],
        "sources": [
            "https://www.building-center.org/state-water-heater-age/",
            "https://www.howtolookatahouse.com/Blog/Entries/2018/9/how-can-i-tell-the-age-of-a-state-industries-water-heater-from-the-serial-number.html",
            "seed-knowledge:high-confidence",
        ],
        "updatedAt": "2026-05-26T00:00:00Z",
        "usageCount": 0,
    }
    print(f"Added: {si_key}")
else:
    print(f"Already exists: {si_key} — updating aliases and format")
    entries[si_key]["aliases"] = [
        "State Industries INC",
        "State Industries, INC",
        "State Ind",
        "State Water Heaters",
    ]

# ── 3. Bump seed version so seedLoader re-imports ────────────────────────────
old_version = data.get("version", 1)
data["version"] = old_version + 1
print(f"Bumped seed version: {old_version} → {data['version']}")

# ── 4. Write back ─────────────────────────────────────────────────────────────
with open(SEED_PATH, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")

print(f"Done. Total entries: {len(entries)}")
