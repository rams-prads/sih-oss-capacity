"""Top up the seeded catalogue with what iGOT publishes about each course.

`fetch_igot.py` takes what a recommendation needs: identity, provider, duration,
competencies and the curriculum. The course page on iGOT shows more, and a
learner about to spend an hour on a video is entitled to the same: the full
description, the learning outcomes the author wrote, the keywords, the language,
the difficulty iGOT itself assigns, how it has been rated, whether it certifies,
when it was last published, and the Karmayogi Competency Model entries behind
our own competency mapping.

Everything here is read from the content API and written verbatim. Nothing is
inferred, nothing is generated, and a field the API does not return is simply
absent - see `app/integration/base.py`, which treats every one of them as
optional.

    python -m scripts.fetch_igot_about            # top up every iGOT course
    python -m scripts.fetch_igot_about --limit 5  # a few, to try it

Re-runnable: it rewrites only the fields below, leaving the rest of each entry
(and the whole NSSTA catalogue) untouched.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

SEED = Path(__file__).resolve().parents[1] / "seed" / "igot_courses_seed.json"
PORTAL = "https://portal.igotkarmayogi.gov.in"
READ = PORTAL + "/api/content/v1/read/{identifier}"

# Only what the about panel shows. Asking for the whole node returns the
# hierarchy with every child, which is a hundred times the payload.
FIELDS = ",".join(
    [
        "description",
        "instructions",
        "keywords",
        "language",
        "difficultyLevel",
        "avgRating",
        "totalNoOfRating",
        "credentials",
        "lastPublishedOn",
        "creator",
        "organisation",
        "sectorDetails_v1",
        "competencies_v6",
    ]
)

# The keys this script owns in the seed file.
WRITES = (
    "description",
    "instructions",
    "keywords",
    "languages",
    "difficulty",
    "rating",
    "rating_count",
    "certificate",
    "published_on",
    "author",
    "sector",
    "kcm",
)


def fetch(client: httpx.Client, identifier: str) -> dict | None:
    try:
        response = client.get(READ.format(identifier=identifier), params={"fields": FIELDS})
        response.raise_for_status()
        return response.json()["result"]["content"]
    except Exception as error:  # noqa: BLE001 - one course failing must not stop the run
        print(f"  ! {identifier}: {error}", file=sys.stderr)
        return None


def as_list(value) -> list[str]:
    if not value:
        return []
    if isinstance(value, str):
        return [value]
    return [str(v) for v in value if v]


def kcm_entries(node: dict) -> list[dict[str, str]]:
    """The Karmayogi Competency Model rows: area, theme, sub-theme, by name."""
    raw = node.get("competencies_v6") or []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return []
    entries = []
    for row in raw:
        area = row.get("competencyAreaName") or ""
        theme = row.get("competencyThemeName") or ""
        sub = row.get("competencySubThemeName") or ""
        if area or theme:
            entries.append({"area": area, "theme": theme, "sub_theme": sub})
    return entries


def about(node: dict) -> dict:
    """The seed fields, straight from the API's own values."""
    ratings = node.get("totalNoOfRating") or 0
    average = node.get("avgRating") or 0
    sectors = node.get("sectorDetails_v1") or []
    published = (node.get("lastPublishedOn") or "")[:10]
    return {
        "description": node.get("description") or "",
        # The learning outcomes, as HTML, exactly as iGOT's own page renders
        # them. Parsed where it is read, not here - see integration/base.py.
        "instructions": node.get("instructions") or "",
        "keywords": as_list(node.get("keywords")),
        "languages": as_list(node.get("language")),
        "difficulty": node.get("difficultyLevel") or "",
        "rating": round(float(average), 1) if average else 0,
        "rating_count": int(ratings),
        "certificate": (node.get("credentials") or {}).get("enabled") == "Yes",
        "published_on": published,
        "author": node.get("creator") or "",
        "sector": sectors[0].get("sectorName", "") if sectors else "",
        "kcm": kcm_entries(node),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=0, help="only the first N courses")
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()

    catalogue = json.loads(SEED.read_text(encoding="utf-8"))
    courses = [c for c in catalogue["content"] if (c.get("source") or "igot") == "igot"]
    if args.limit:
        courses = courses[: args.limit]
    print(f"{len(courses)} iGOT courses to top up")

    started = time.time()
    with httpx.Client(
        timeout=45, headers={"Accept": "application/json", "User-Agent": "sih-oss-capacity/1.0"}
    ) as client:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            nodes = list(pool.map(lambda c: fetch(client, c["identifier"]), courses))

    found = 0
    for course, node in zip(courses, nodes):
        if not node:
            continue
        found += 1
        fields = {k: v for k, v in about(node).items() if k in WRITES}
        # A published description is fuller than the one the search API gave;
        # an empty one must not wipe what the search API did give.
        if not fields["description"]:
            fields.pop("description")
        course.update(fields)

    SEED.write_text(
        json.dumps(catalogue, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    print(f"topped up {found} of {len(courses)} in {time.time() - started:.0f}s -> {SEED.name}")
    return 0 if found else 1


if __name__ == "__main__":
    raise SystemExit(main())
