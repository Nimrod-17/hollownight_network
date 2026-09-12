"""
Fragment generator helper — fetches short plain-text extracts from the
Hollow Knight Wiki for a batch of node titles, to use as raw factual
material for hand-writing original "Hunter's Journal"-style fragments.

This script does NOT generate the fragments itself (that's deliberately
a creative writing step, done by reading the extracts) - it only fetches
and prints the source material for a given batch of node ids.

Usage:
    python generate_fragments.py <node_id> [<node_id> ...]
"""

import json
import sys
import time
import requests

API_URL = "https://hollowknight.wiki/mw/api.php"
HEADERS = {
    "User-Agent": "HallownestDiaryCourseProject/1.0 (your-email@example.com)"
}


def api_get(params):
    params = {**params, "format": "json"}
    resp = requests.get(API_URL, params=params, headers=HEADERS, timeout=15)
    resp.raise_for_status()
    return resp.json()


def fetch_extract(title):
    """Fetch up to ~700 chars of plain-text from the page.

    Deliberately NOT using exintro=1: many area/infobox-heavy pages here
    have no prose at all before the first section heading, so exintro
    returns an empty extract for them even though the page has plenty of
    descriptive text further down. Dropping exintro and capping with
    exchars instead pulls from the whole article. The tradeoff: without
    exintro the API only honors exlimit=1, so titles have to be fetched
    one at a time rather than batched.
    """
    data = api_get({
        "action": "query",
        "prop": "extracts",
        "explaintext": "1",
        "exchars": "700",
        "titles": title,
    })
    pages = data.get("query", {}).get("pages", {})
    page = next(iter(pages.values()), {})
    return page.get("extract", "").strip()


def main():
    ids = sys.argv[1:]
    if not ids:
        print("Usage: python generate_fragments.py <node_id> [<node_id> ...]")
        return

    data = json.load(open("data.json", encoding="utf-8"))
    nodes_by_id = {n["id"]: n for n in data["nodes"]}

    extracts = {}
    for node_id in ids:
        node = nodes_by_id.get(node_id)
        if not node:
            print(f"[!] unknown node id: {node_id}")
            continue
        extracts[node["label"]] = fetch_extract(node["label"])
        time.sleep(0.3)

    out_lines = []
    for node_id in ids:
        node = nodes_by_id.get(node_id)
        if not node:
            continue
        label = node["label"]
        extract = extracts.get(label, "")
        out_lines.append("=" * 70)
        out_lines.append(f"id: {node_id}  |  label: {label}  |  type: {node['type']}  |  game: {node['game']}")
        out_lines.append("-" * 70)
        out_lines.append(extract[:900] if extract else "(no extract found)")
        out_lines.append("")

    text = "\n".join(out_lines)
    with open("_extracts_out.txt", "w", encoding="utf-8") as f:
        f.write(text)
    # console printing can hit Windows codepage issues on some unicode
    # chars (em dashes, curly quotes) - write the real output to a UTF-8
    # file above, and print a best-effort ascii-safe version here.
    print(text.encode("ascii", errors="replace").decode("ascii"))


if __name__ == "__main__":
    main()
