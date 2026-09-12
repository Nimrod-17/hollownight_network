"""
Applies a batch of hand-written fragments (id -> text) onto data.json,
overwriting only the "fragment" field for the matching node ids. Leaves
everything else untouched.

Usage:
    python apply_fragments.py path/to/batch.json
"""

import json
import sys

MAX_WORDS = 25


def main():
    if len(sys.argv) != 2:
        print("Usage: python apply_fragments.py path/to/batch.json")
        return

    batch = json.load(open(sys.argv[1], encoding="utf-8"))
    data = json.load(open("data.json", encoding="utf-8"))
    nodes_by_id = {n["id"]: n for n in data["nodes"]}

    applied, missing, overlong = [], [], []
    for node_id, fragment in batch.items():
        node = nodes_by_id.get(node_id)
        if not node:
            missing.append(node_id)
            continue
        word_count = len(fragment.split())
        if word_count > MAX_WORDS:
            overlong.append((node_id, word_count))
        node["fragment"] = fragment
        applied.append(node_id)

    with open("data.json", "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Applied {len(applied)} fragments.")
    if missing:
        print(f"[!] unknown ids skipped: {missing}")
    if overlong:
        print(f"[!] over {MAX_WORDS} words: {overlong}")


if __name__ == "__main__":
    main()
