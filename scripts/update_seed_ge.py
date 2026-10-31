"""Refresh only GE household-appliance seed guidance from the official GE chart."""
import datetime
import json
import pathlib

SEED_PATH = pathlib.Path(__file__).parent.parent / "client/src/data/seedKnowledge.json"
GE_NAMES = {"ge", "ge appliance", "ge appliances", "general electric", "general electric company"}
SOURCES = [
    "https://products.geappliances.com/appliance/gea-support-search-content?contentId=16195",
    "https://products.geappliances.com/appliance/gea-specs/GTS17DTNRWW/troubleshoot",
]
SERIAL_FORMAT = (
    "GE household-appliance serials only: 8 characters (two letters + six digits) "
    "or 9 characters with an optional final letter. Character 1 = month; character 2 "
    "= repeating year code. Other formats and auxiliary label codes need separate evidence."
)
DATE_DECODING = (
    "Use the SERIAL NUMBER, not an auxiliary part/publication code, to date GE household appliances.\n\n"
    "MONTH (first letter): A=January, D=February, F=March, G=April, H=May, L=June, "
    "M=July, R=August, S=September, T=October, V=November, Z=December. B is not a month code.\n\n"
    "YEAR (second letter; official published years, not an extrapolation): "
    "A=2025/2013/2001/1989/1977/1944; D=2026/2014/2002/1990/1978/1947; "
    "F=2015/2003/1991/1979/1949; G=2016/2004/1992/1980/1950; "
    "H=2017/2005/1993/1981/1951; L=2018/2006/1994/1982/1970/1954; "
    "M=2019/2007/1995/1983/1971/1955; R=2020/2008/1996/1984/1972/1958; "
    "S=2021/2009/1997/1985/1973/1959; T=2022/2010/1998/1986/1974/1960; "
    "V=2023/2011/1999/1987/1975; Z=2024/2012/2000/1988/1976. "
    "Historical whole-prefix exceptions such as DB=1968 require the separate official chart; "
    "do not generalize modern cycling rules to them.\n\n"
    "DISAMBIGUATION: Codes repeat approximately every 12 years. Exclude future dates and "
    "use verified model production dates or a reliably explicit manufacture date to select "
    "the cycle. Never simply select the newest year. Report possible years when the model "
    "era is unknown; request a clear nameplate if the evidence conflicts.\n\n"
    "VERIFIED MODEL ERA: GE lists GTS17DTNRWW as manufactured September 2019-present. "
    "For that retail model and its GTS17DTNNRWW engineering model only, exclude dates before "
    "September 2019. A DD prefix then resolves to February 2026 as of October 2026, not "
    "March 2024 or February 2014. Do not apply this era to all GE refrigerators. "
    "The published serial code identifies month/year, not an exact day."
)


def main():
    seed = json.loads(SEED_PATH.read_text())
    updated_at = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
    count = 0
    for entry in seed["entries"].values():
        if entry.get("name", "").strip().lower() not in GE_NAMES:
            continue
        entry.update({
            "serialFormat": SERIAL_FORMAT,
            "dateDecoding": DATE_DECODING,
            "sources": SOURCES,
            "examples": [
                "DD123456 + model GTS17DTNNRWW -> February 2026 as of October 2026",
                "HA123456P -> May; year A=2025/2013/2001 or earlier (model era required)",
                "TT123456A -> October; year T=2022/2010/1998 or earlier (model era required)",
                "VZ123456X -> November; year Z=2024/2012/2000 or earlier (model era required)",
            ],
            "updatedAt": updated_at,
        })
        count += 1
    if not count:
        raise RuntimeError("No existing GE entries found; refusing an unscoped seed update")
    seed["version"] = int(seed["version"]) + 1
    SEED_PATH.write_text(json.dumps(seed, indent=2, ensure_ascii=False) + "\n")
    print(f"Updated {count} existing GE entries; seed version {seed['version']}")


if __name__ == "__main__":
    main()
