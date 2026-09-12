"""
Hollow Knight Wiki crawler
--------------------------
Fetches pages from a set of categories on the Hollow Knight Wiki
(hollowknight.wiki, the independent MediaWiki install the community
moved to in 2023 - NOT the abandoned hollowknight.fandom.com mirror)
and builds a nodes/links dataset in the same shape as data.json.

Usage:
    pip install requests
    python crawler.py
"""

import json
import re
import time
import requests

API_URL = "https://hollowknight.wiki/mw/api.php"

# Wikipedia/Fandom-style wikis often 403 requests with no identifiable
# User-Agent. Put your own contact info here, it's good etiquette.
HEADERS = {
    "User-Agent": "HallownestDiaryCourseProject/1.0 (your-email@example.com)"
}

# Categories to pull nodes from, and what (type, game) to tag them with.
# Verify these titles exist first (see check_categories() below) before
# a full crawl - category names on this wiki are of the form
# "Category:NPCs (Hollow Knight)", with the "(Hollow Knight)" /
# "(Silksong)" suffix distinguishing the two games. Locations are filed
# under "Areas", not "Locations". Enemies (generic mobs) are deliberately
# left out - the category is huge and mostly low-lore-value trash mobs.
CATEGORIES = {
    "Category:NPCs (Hollow Knight)": ("npc", "Hollow Knight"),
    "Category:Bosses (Hollow Knight)": ("boss", "Hollow Knight"),
    "Category:Areas (Hollow Knight)": ("location", "Hollow Knight"),
    "Category:NPCs (Silksong)": ("npc", "Silksong"),
    "Category:Bosses (Silksong)": ("boss", "Silksong"),
    "Category:Areas (Silksong)": ("location", "Silksong"),
}

# The two games' protagonists are playable characters, not NPCs/bosses, so
# the wiki doesn't file them under any category in CATEGORIES above and the
# crawl would otherwise miss them entirely - added by hand instead.
EXTRA_TITLES = {
    "The Knight": ("protagonist", "Hollow Knight"),
    "Hornet (Silksong)": ("protagonist", "Silksong"),
}

REQUEST_DELAY_SECONDS = 0.3  # be polite, don't hammer the API


def api_get(params):
    params = {**params, "format": "json"}
    resp = requests.get(API_URL, params=params, headers=HEADERS, timeout=15)
    resp.raise_for_status()
    return resp.json()


def check_categories():
    """Quick sanity check: confirm the API endpoint works and list how
    many pages are in each configured category, so you can fix category
    names before doing a full crawl.

    Note: list=categorymembers returns an empty list both for a category
    that doesn't exist and for one that's genuinely empty, so it can't
    tell them apart. prop=categoryinfo does: a nonexistent category page
    comes back with a "missing" marker instead of a categoryinfo block.
    """
    for cat in CATEGORIES:
        data = api_get({
            "action": "query",
            "prop": "categoryinfo",
            "titles": cat,
        })
        pages = data.get("query", {}).get("pages", {})
        page = next(iter(pages.values()), {})
        if "missing" in page:
            print(f"[!] '{cat}' - does not exist, fix the name")
        else:
            size = page.get("categoryinfo", {}).get("size", 0)
            print(f"[ok] '{cat}' - {size} members")
        time.sleep(REQUEST_DELAY_SECONDS)


def get_category_members(category):
    """Return all page titles (namespace 0 only) in a category, handling
    pagination via cmcontinue."""
    titles = []
    cmcontinue = None
    while True:
        params = {
            "action": "query",
            "list": "categorymembers",
            "cmtitle": category,
            "cmlimit": "500",
            "cmnamespace": "0",
        }
        if cmcontinue:
            params["cmcontinue"] = cmcontinue

        data = api_get(params)
        members = data.get("query", {}).get("categorymembers", [])
        titles.extend(m["title"] for m in members)

        cmcontinue = data.get("continue", {}).get("cmcontinue")
        if not cmcontinue:
            break
        time.sleep(REQUEST_DELAY_SECONDS)

    return titles


WIKILINK_RE = re.compile(r"\[\[([^\]|#]+)")


def get_links_from_page(title):
    """Return internal wikilink targets found in a page's raw wikitext.

    This deliberately does NOT use prop=links, which returns links after
    template expansion: character/boss pages transclude navbox footers
    (e.g. "Template:SS Nav Enemies", "Template:SS Nav NPCs") that link to
    every other boss/NPC in the game, which would make the graph a near-
    complete clique instead of reflecting real narrative relationships.
    Reading the unexpanded wikitext and regexing out [[...]] links avoids
    that, since the navbox's own links live on the template page, not in
    the article's source text.
    """
    params = {
        "action": "query",
        "prop": "revisions",
        "titles": title,
        "rvslots": "main",
        "rvprop": "content",
    }
    data = api_get(params)
    pages = data.get("query", {}).get("pages", {})
    page = next(iter(pages.values()), {})
    revisions = page.get("revisions", [])
    if not revisions:
        return []
    wikitext = revisions[0].get("slots", {}).get("main", {}).get("*", "")

    links = []
    for match in WIKILINK_RE.finditer(wikitext):
        target = match.group(1).strip()
        if not target or ":" in target:
            continue  # skip Category:/File:/Template:/interwiki links
        target = target.replace("_", " ")
        target = target[0].upper() + target[1:]
        links.append(target)
    return links


def slugify(title):
    return title.lower().replace(" ", "-").replace("(", "").replace(")", "")


def build_dataset():
    # 1. Collect all nodes from the configured categories. Each category
    # also has a mainspace "overview" page sharing its exact name (e.g.
    # "NPCs (Silksong)") that's itself tagged into the category, so it
    # shows up as a namespace-0 category member too - skip those, they're
    # not characters/locations and every article links to them.
    overview_titles = {cat.removeprefix("Category:") for cat in CATEGORIES}
    node_meta_by_title = {}
    for category, meta in CATEGORIES.items():
        for title in get_category_members(category):
            if title in overview_titles:
                continue
            node_meta_by_title[title] = meta
    node_meta_by_title.update(EXTRA_TITLES)
    print(f"Collected {len(node_meta_by_title)} candidate nodes.")

    # 2. For each node, fetch its outgoing links and keep only the ones
    #    that point at another node we already collected (so the graph
    #    stays within our chosen categories, like the Marvel dataset does).
    links = []
    titles = list(node_meta_by_title.keys())
    for i, title in enumerate(titles):
        page_links = get_links_from_page(title)
        for target in page_links:
            if target in node_meta_by_title and target != title:
                links.append({"source": slugify(title), "target": slugify(target)})
        time.sleep(REQUEST_DELAY_SECONDS)
        if i % 20 == 0:
            print(f"  ...processed {i}/{len(titles)} pages")

    # 3. Assemble nodes. `fragment` is left as a placeholder: write it
    #    yourself, in your own words, rather than copying wiki text.
    nodes = [
        {
            "id": slugify(title),
            "label": title,
            "area": "",
            "fragment": "TODO: write a short original description.",
            "type": node_type,
            "game": game,
        }
        for title, (node_type, game) in node_meta_by_title.items()
    ]

    # de-duplicate links (A->B and B->A both appearing is fine/expected,
    # but exact duplicates from multiple mentions on the same page aren't useful)
    seen = set()
    unique_links = []
    for l in links:
        key = tuple(sorted([l["source"], l["target"]]))
        if key not in seen:
            seen.add(key)
            unique_links.append(l)

    return {"nodes": nodes, "links": unique_links}


if __name__ == "__main__":
    print("Checking category names against the live API...")
    check_categories()

    print("\nBuilding dataset (this can take a few minutes)...")
    dataset = build_dataset()

    with open("data.json", "w", encoding="utf-8") as f:
        json.dump(dataset, f, indent=2, ensure_ascii=False)

    print(f"\nDone: {len(dataset['nodes'])} nodes, {len(dataset['links'])} links -> data.json")
