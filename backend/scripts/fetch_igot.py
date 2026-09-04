"""Pull the real iGOT Karmayogi catalogue into the seed file.

iGOT is a Sunbird deployment and its content search endpoint answers without
credentials, so the live course catalogue is reachable:

    POST https://portal.igotkarmayogi.gov.in/api/content/v1/search

Enrolment still needs a Keycloak user token, but the catalogue - the only part
the recommendation engine reads - does not.

Ingesting rather than calling live is deliberate: the demo then runs offline at
full speed, and judging day does not depend on venue wifi or the portal being
up. Re-run this to refresh the catalogue.

    python -m scripts.fetch_igot            # refresh
    python -m scripts.fetch_igot --dry-run  # show what would change

How courses are tagged
----------------------
Every iGOT course carries competencies_v6: the Karmayogi Competency Model, with
a competency *area* (Domain / Functional / Behavioural - the same three types
this project's FRAC model uses), a *theme*, and a *sub-theme*, all with readable
names and stable ref ids.

So we let iGOT's own taxonomy do the tagging and use the search query only to
discover candidates. Tagging by query instead would mean trusting a fuzzy
full-text match: searching "survey design sampling" returns "Borehole Planning
Core Logging and Sampling in Base Metal Exploration", which shares one word and
no subject. That course is tagged Mines in KCM, maps to nothing here, and drops
out on its own - no blocklist of unrelated domains to maintain.

The cost is recall: a genuinely relevant course whose KCM tags fall outside the
map is dropped. That is the right trade for a catalogue an officer is shown.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import httpx

PORTAL = "https://portal.igotkarmayogi.gov.in"
SEARCH_URL = f"{PORTAL}/api/content/v1/search"
HIERARCHY_URL = PORTAL + "/api/course/v1/hierarchy/{identifier}"
SEED_PATH = Path(__file__).resolve().parents[1] / "seed" / "igot_courses_seed.json"

# Search terms used only to surface candidates - the words officers actually use,
# not our competency names ("Classification Standards (NIC / NCO)" finds nothing).
QUERIES: dict[str, list[str]] = {
    "C01": ["survey design sampling", "sample survey methodology"],
    "C02": ["questionnaire design", "data collection field survey",
            "census enumeration", "field investigation survey"],
    "C03": ["data quality", "data validation editing"],
    "C04": ["statistics data analysis", "statistical tools"],
    "C05": ["national accounts GDP", "macroeconomic statistics"],
    "C06": ["price index inflation", "consumer price index"],
    "C07": ["sustainable development goals indicators"],
    "C08": ["industrial classification NIC", "occupation classification"],
    "C09": ["python programming", "data analysis using R"],
    "C10": ["data visualization", "dashboard reporting"],
    "C11": ["data ethics confidentiality", "right to information"],
    "C12": ["big data analytics", "data mining"],
    "C13": ["geospatial GIS mapping", "remote sensing"],
    "C14": ["metadata standards", "open data dissemination"],
    "C15": ["communication skills", "presentation skills"],
    "C16": ["labour force statistics", "employment unemployment survey"],
    "C17": ["agricultural statistics", "crop estimation"],
    "C18": ["annual survey of industries", "industrial statistics"],
    "C19": ["SQL database", "database management"],
    "C20": ["machine learning", "artificial intelligence"],
    "C21": ["cloud computing", "government cloud meghraj"],
    "C22": ["cyber security", "data privacy protection"],
    "C23": ["digital public infrastructure", "e-governance digital india"],
    "C24": ["leadership", "team building"],
    "C25": ["project management"],
    "C26": ["decision making", "change management"],
    "C27": ["policy analysis", "policy formulation"],
    "C28": ["strategic planning", "strategic management", "vision and strategy",
            "outcome budgeting", "governance strategy", "forward thinking"],
    "C29": ["noting and drafting", "office procedure", "file management"],
    "C30": ["public administration", "government service rules"],
    "C31": ["general financial rules", "public procurement", "budget government"],
    "C32": ["establishment rules", "human resource management"],
    "C33": ["parliament procedure", "parliamentary questions"],
    "C34": ["stakeholder management", "negotiation skills"],
    "C35": ["risk management"],
    "C36": ["organizational transformation", "institutional leadership",
            "transformational leadership", "organisational development",
            "leading change", "capacity building institution"],
}

# KCM sub-theme -> our competencies. Checked first: a sub-theme is specific
# enough to be trusted ("AI/ML tools" is unambiguous).
SUBTHEME_MAP: dict[str, list[str]] = {
    "statistics and programme implementation": ["C01", "C04"],
    "data analysis & visualization": ["C04", "C10"],
    "data management": ["C03", "C19"],
    "data use and governance": ["C03", "C11"],
    "data led decision making": ["C04", "C26"],
    "ai/ml tools": ["C20"],
    "emerging technology": ["C12", "C20"],
    "digital tools ( ms office, excel, & ppt) & platforms": ["C10"],
    "digital service design": ["C23"],
    "electronics and information technology": ["C23"],
    "science & technology": ["C12"],
    "rural and agriculture": ["C17"],
    "project planning": ["C25"],
    "project implementation": ["C25"],
    "project evaluation & monitoring": ["C25"],
    "change implementation": ["C26"],
    "change impact assessment": ["C26"],
    "change readiness": ["C26"],
    "sound judgement": ["C26"],
    "analytical thinking": ["C04", "C15"],
    "presentation skills": ["C15"],
    "verbal & non-verbal fluency": ["C15"],
    "active listening": ["C15"],
    "inspiring others": ["C24"],
    "mentoring": ["C24"],
    "rti responsiveness": ["C11"],
    "rti records management": ["C11", "C29"],

    # The administrative ladder. iGOT carries the real ISTM/DoPT material -
    # General Financial Rules, CCS (CCA) Rules, Noting and Drafting,
    # Parliamentary Procedures - and KCM names these precisely.
    "office procedures": ["C29"],
    "file/dak management": ["C29"],
    "noting & drafting of official communications": ["C29"],
    "expenditure management": ["C31"],
    "government accounts": ["C31"],
    "budget formulation & implementation": ["C31"],
    "procurement of services / goods / works": ["C31"],
    "contract management": ["C31"],
    "handling establishment matters": ["C32"],
    "handling leave and travel": ["C32"],
    "conduct rules": ["C30"],
    "provisions on suspension": ["C30"],
    "handling fundamental rules /supplementary rules": ["C30"],
    "submission of briefs, supply of information": ["C33"],
    "maintaining records of parliamentary matters": ["C33"],
    "policy design/ amendment": ["C27"],
    "policy implementation": ["C27"],
    "influencing and negotiation": ["C34"],
    "conflict management": ["C34"],
    "relationship management": ["C34"],
    "forward thinking": ["C28"],
}

# KCM theme -> our competencies. Fallback when the sub-theme is unmapped.
THEME_MAP: dict[str, list[str]] = {
    "data analytics": ["C04"],
    "data protection": ["C22"],
    "project management": ["C25"],
    "communication": ["C15"],
    "team leadership": ["C24"],
    "collaborative leadership": ["C24"],
    "strategic leadership": ["C24", "C28", "C36"],
    "change management": ["C26"],
    "decision making": ["C26"],
    "handling rti matters": ["C11"],
    "digital fluency": ["C23"],
    "technology": ["C23"],
    "rural and agriculture": ["C17"],
    "finance and economy": ["C05"],
    "commerce and industry": ["C18"],
    "office management": ["C29"],
    "administration matters": ["C30"],
    "governance": ["C30"],
    "vigilance administration": ["C30", "C35"],
    "financial management": ["C31"],
    "public procurement (gfr)": ["C31"],
    "establishment & hr": ["C32"],
    "handling parliamentary matters": ["C33"],
    "policy architecture": ["C27"],
    "information & communication management": ["C29"],
    "operational excellence": ["C29"],
}

PER_QUERY = 6
TIMEOUT = 30.0

# Level from the title. iGOT publishes no proficiency level per course, and
# inventing a precise one would dress a guess up as data - these three buckets
# are all the wording actually supports.
ADVANCED = re.compile(r"\b(advanc|expert|master|deep dive)", re.I)
FOUNDATION = re.compile(r"\b(foundation|basic|introduct|overview|primer|awareness)", re.I)


def infer_target_level(name: str) -> int:
    if ADVANCED.search(name):
        return 3
    if FOUNDATION.search(name):
        return 1
    return 2


# Lesson titles are frequently placeholders - "Database Design and Introduction
# to MySQL" names all 68 of its lessons SQL_Resource1..68 - and module titles
# occasionally are too. Anything matching this is not worth showing an officer.
# Anchoring on the end of the string is too strict: "SQL2_Resource8." slips past
# a $ anchor on its trailing full stop.
PLACEHOLDER = re.compile(
    r"(resource\s*\d+\W*$|_\d+\W*$|^untitled|^module\s*\d+\W*$|^video\s*\d+\W*$)", re.I
)


def _leaf_videos(node: dict) -> list[dict]:
    """Playable mp4 leaves under a node, in order."""
    videos = []
    for child in node.get("children") or []:
        if child.get("children"):
            videos.extend(_leaf_videos(child))
            continue
        if child.get("mimeType") != "video/mp4":
            continue  # the other leaf type is a Sunbird questionset, which is auth-gated
        url = child.get("artifactUrl") or child.get("previewUrl") or ""
        if not url:
            continue
        seconds = 0
        try:
            seconds = int(float(child.get("duration") or 0))
        except (TypeError, ValueError):
            seconds = 0
        title = clean(child.get("name"))
        videos.append(
            {
                "title": "" if (not title or PLACEHOLDER.search(title)) else title,
                "duration_min": max(1, round(seconds / 60)) if seconds else 5,
                "url": url,
            }
        )
    return videos


def fetch_curriculum(client: httpx.Client, identifier: str, course_name: str) -> dict:
    """The course's modules and the mp4s inside them, from the public hierarchy.

    iGOT's user-progress endpoints are auth-gated (401 without a Keycloak user
    token), so what an officer watched on the portal cannot be read back. The
    media itself is public and range-served, so the videos play here instead and
    the watch record is ours - the same mechanism the authored courses use.

    Placeholder lesson titles are common ("Database Design and Introduction to
    MySQL" names all 68 of its lessons SQL_Resource1..68). Those become "Video n"
    with a real duration rather than a meaningless string.
    """
    try:
        response = client.get(HIERARCHY_URL.format(identifier=identifier), timeout=TIMEOUT)
        response.raise_for_status()
        node = response.json().get("result", {}).get("content") or {}
    except Exception:
        return {}

    modules = []
    position = 0
    for child in node.get("children") or []:
        videos = _leaf_videos(child) if child.get("children") else []
        if not videos and child.get("mimeType") == "video/mp4":
            videos = _leaf_videos({"children": [child]})
        if not videos:
            continue
        for video in videos:
            position += 1
            if not video["title"]:
                video["title"] = f"Video {position}"
        title = clean(child.get("name"))
        if not title or PLACEHOLDER.search(title):
            title = f"Module {len(modules) + 1}"
        modules.append({"title": title, "lessons": videos})

    if not modules:
        return {}

    outline = [m["title"] for m in modules]
    # An outline that only repeats the course title is not a contents page.
    if len(outline) < 2 and all(t.lower() == course_name.lower() for t in outline):
        outline = []

    return {"modules": modules[:12], "outline": outline[:12]}


def clean(text: str | None) -> str:
    """iGOT descriptions carry HTML and entities; the UI renders plain text."""
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("&nbsp;", " ").replace("&amp;", "&")
    text = text.replace("&lt;", "<").replace("&gt;", ">").replace("&#39;", "'")
    return re.sub(r"\s+", " ", text).strip()


# KCM stops at "Data Analytics" and never names a tool, so a course called
# "Data Analysis using R" cannot reach C09 (Statistical Software) through the
# taxonomy alone. Titles are explicit where KCM is coarse, so these unambiguous
# title tokens top up the mapping. Kept deliberately small: only tools whose
# name cannot mean something else.
TITLE_HINTS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b(python|using r|in r|r programming|\br and python\b)", re.I), "C09"),
    (re.compile(r"\b(sql|rdbms|postgres|mysql)\b", re.I), "C19"),
    (re.compile(r"\b(gis|geospatial|remote sensing|cartograph)", re.I), "C13"),
    (re.compile(r"\b(machine learning|artificial intelligence|deep learning)\b", re.I), "C20"),
    (re.compile(r"\b(cloud|meghraj)\b", re.I), "C21"),
    (re.compile(r"\b(cyber ?security|information security|dpdpa|iso 27001)\b", re.I), "C22"),
    (re.compile(r"\b(power bi|tableau|excel|dashboard)\b", re.I), "C10"),
]


def competencies_from_kcm(node: dict, name: str) -> list[str]:
    """Map a course's Karmayogi Competency Model tags onto our competency ids.

    Sub-theme and theme are both consulted and unioned rather than taken as
    either/or: a privacy course tagged sub-theme "Data Use and Governance" under
    theme "Data Protection" is genuinely about both governance and security.
    """
    mapped: list[str] = []

    def add(cid: str) -> None:
        if cid not in mapped:
            mapped.append(cid)

    for tag in node.get("competencies_v6") or []:
        sub = (tag.get("competencySubThemeName") or "").strip().lower()
        theme = (tag.get("competencyThemeName") or "").strip().lower()
        for cid in SUBTHEME_MAP.get(sub, []):
            add(cid)
        for cid in THEME_MAP.get(theme, []):
            add(cid)

    # Only top up a course the taxonomy already recognised; a title hint alone is
    # how "Base Metal Exploration" sneaks back in on the word "sampling".
    if mapped:
        for pattern, cid in TITLE_HINTS:
            if pattern.search(name):
                add(cid)
    return mapped


def to_int(value: object) -> int:
    try:
        return int(float(str(value)))
    except (TypeError, ValueError):
        return 0


def search(client: httpx.Client, query: str) -> list[dict]:
    body = {
        "request": {
            "filters": {"primaryCategory": ["Course"], "status": ["Live"]},
            "query": query,
            "limit": PER_QUERY,
        }
    }
    response = client.post(SEARCH_URL, json=body, timeout=TIMEOUT)
    response.raise_for_status()
    payload = response.json()
    if payload.get("responseCode") != "OK":
        raise RuntimeError(f"iGOT search failed for {query!r}: {payload.get('params')}")
    return payload.get("result", {}).get("content", []) or []


def fetch_all() -> tuple[dict[str, dict], int]:
    """Real courses keyed by identifier, tagged from their own KCM competencies."""
    found: dict[str, dict] = {}
    seen: set[str] = set()
    with httpx.Client(headers={"Content-Type": "application/json"}) as client:
        for competency_id, queries in QUERIES.items():
            for query in queries:
                try:
                    nodes = search(client, query)
                except Exception as exc:  # one bad query must not lose the whole run
                    print(f"  ! {competency_id} {query!r}: {exc}", file=sys.stderr)
                    continue

                for node in nodes:
                    identifier = node.get("identifier")
                    name = clean(node.get("name"))
                    if not identifier or not name or identifier in seen:
                        continue
                    seen.add(identifier)

                    mapped = competencies_from_kcm(node, name)
                    if not mapped:
                        continue

                    found[identifier] = {
                        "identifier": identifier,
                        "name": name,
                        "description": clean(node.get("description"))[:400],
                        "se_competencies": mapped,
                        "targetLevel": infer_target_level(name),
                        "duration": to_int(node.get("duration")),
                        "provider": clean(node.get("source"))
                        or clean((node.get("organisation") or [""])[0])
                        or "iGOT Karmayogi",
                        "primaryCategory": "Course",
                        "source": "igot",
                    }
            print(f"  {competency_id}: catalogue now {len(found)} real courses")

        # One hierarchy call per kept course. Slow but one-off, and a failure
        # here must not cost us the course itself - it simply has no outline.
        print(f"Fetching curricula for {len(found)} courses...")
        with_video = lessons_total = 0
        for position, (identifier, course) in enumerate(found.items(), 1):
            curriculum = fetch_curriculum(client, identifier, course["name"])
            if curriculum:
                course["modules"] = curriculum["modules"]
                if curriculum["outline"]:
                    course["outline"] = curriculum["outline"]
                with_video += 1
                lessons_total += sum(len(m["lessons"]) for m in curriculum["modules"])
            if position % 40 == 0:
                print(f"  {position}/{len(found)} ({with_video} with playable video)")
        print(f"Playable video for {with_video}/{len(found)} courses, {lessons_total} lessons")

    return found, len(seen) - len(found)


def main() -> None:
    parser = argparse.ArgumentParser(description="Refresh the iGOT catalogue seed.")
    parser.add_argument("--dry-run", action="store_true", help="report, write nothing")
    args = parser.parse_args()

    seed = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    authored = [c for c in seed["content"] if c.get("source") != "igot"]

    print(f"Authored courses kept: {len(authored)}")
    print("Querying the live iGOT catalogue...")
    real, unmapped = fetch_all()

    if not real:
        print("No courses returned - leaving the seed untouched.", file=sys.stderr)
        raise SystemExit(1)

    authored_ids = {c["identifier"] for c in authored}
    merged = authored + [c for cid, c in sorted(real.items()) if cid not in authored_ids]

    covered = sorted({c for course in real.values() for c in course["se_competencies"]})
    print(f"\nReal iGOT courses kept: {len(real)}")
    print(f"Dropped - KCM tags map to nothing here: {unmapped}")
    print(f"Competencies with real course cover: {len(covered)} -> {', '.join(covered)}")
    print(f"Catalogue total: {len(merged)}")

    if args.dry_run:
        print("\n--dry-run: nothing written. Sample:")
        for course in list(real.values())[:10]:
            print(f"  * {course['name'][:68]}  [{','.join(course['se_competencies'])}]")
        return

    seed["_comment"] = (
        "Course catalogue for MockKarmayogiClient. Courses with source=igot were "
        "fetched from the live iGOT Karmayogi content search API "
        "(portal.igotkarmayogi.gov.in) by scripts/fetch_igot.py: real identifiers, "
        "titles, providers and durations, tagged by mapping each course's own "
        "Karmayogi Competency Model entries onto our competency ids. The remainder "
        "are authored courses carrying the local curriculum and question bank."
    )
    seed["content"] = merged
    SEED_PATH.write_text(
        json.dumps(seed, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"\nWrote {SEED_PATH}")


if __name__ == "__main__":
    main()
