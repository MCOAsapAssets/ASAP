#!/usr/bin/env python3
"""Mechanical gate for an ASAP concept batch.

Usage: python3 check_batch.py BATCH.md [LEDGER.md]

Exit code 0 = PASS (warnings allowed), 1 = FAIL. Fix every FAIL before delivering.
"""
import re
import sys

BANNED = [
    "hey guys", "welcome back", "in today's video", "not only", "game changer",
    "game-changer", "look no further", "elevate", "unlock", "transform your",
    "so a lot of you", "don't forget to like", "smash that",
]
BLANK = re.compile(r"\[(?!in your own words:)[^\]]*\]|\bTBC\b|\bTBD\b|\$X+\b|\bXX+\b", re.I)
HEADER = re.compile(r"^Concept\s+(\d+)\s+-\s+(.+?)\s+\((.+?),\s*(\d+)s\)\s*$")
SHOT = re.compile(r"^Shot\s+(\d+)\s+\((\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)s\):\s*(.+)$")
MAX_SHOT_SECONDS = 6
MAX_AVG_WORDS = 9


def sentences(text):
    parts = re.split(r"(?<=[.?!])\s+", text.strip())
    return [p for p in parts if re.search(r"\w", p)]


def opening(text, n=3):
    words = re.findall(r"[a-z0-9$']+", text.lower())
    return " ".join(words[:n])


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    lines = open(sys.argv[1], encoding="utf-8").read().splitlines()
    ledger_openings = set()
    if len(sys.argv) > 2:
        # Ledger rows: Batch | Concept | Person | Hook opening words | Idea | Length
        for row in open(sys.argv[2], encoding="utf-8"):
            cells = [c.strip() for c in row.strip().strip("|").split("|")]
            if len(cells) >= 4 and not set(cells[3]) <= set("-: ") and cells[3].lower() != "hook opening words":
                ledger_openings.add(opening(cells[3]))

    fails, warns = [], []
    concepts = []
    cur = None
    for i, raw in enumerate(lines, 1):
        line = raw.strip()
        m = HEADER.match(line)
        if m:
            cur = {"no": int(m[1]), "name": m[2], "length": int(m[4]), "line": i,
                   "shots": [], "vo": [], "fields": {}, "pending_shot": False}
            concepts.append(cur)
            continue
        if line.lower().startswith("concept ") and not m:
            fails.append(f"line {i}: header not in format 'Concept N - Name (Person, Ns)'")
        if cur is None:
            continue
        if re.search(r"(^|\s)#\w", line):
            fails.append(f"C{cur['no']} line {i}: hashtag found")
        if BLANK.search(line) and not line.startswith("["):
            fails.append(f"C{cur['no']} line {i}: blank/placeholder: {BLANK.search(line)[0]}")
        for b in BANNED:
            if b in line.lower():
                fails.append(f"C{cur['no']} line {i}: banned phrase '{b}'")
        s = SHOT.match(line)
        if s:
            if cur["pending_shot"]:
                fails.append(f"C{cur['no']} line {i}: previous shot has no VO/Text line under it")
            cur["shots"].append((float(s[2]), float(s[3]), i))
            cur["pending_shot"] = True
            continue
        if line.startswith("VO:") or line.startswith("Text:"):
            cur["pending_shot"] = False
            if line.startswith("VO:"):
                vo = line[3:].strip()
                if vo.lower() != "none" and not vo.startswith("[in your own words:"):
                    cur["vo"].append((vo.strip('"'), i))
            continue
        for field in ("On-screen hook", "Caption line", "Post caption"):
            if line.startswith(field + ":"):
                cur["fields"][field] = line.split(":", 1)[1].strip()

    if not concepts:
        print("FAIL: no concepts found")
        return 1
    if len(concepts) != 10:
        warns.append(f"{len(concepts)} concepts (expected 10, say why in Flags)")

    seen = {}
    for c in concepts:
        tag = f"C{c['no']}"
        if c["pending_shot"]:
            fails.append(f"{tag}: last shot has no VO/Text line")
        if not c["shots"]:
            fails.append(f"{tag}: no shots")
            continue
        t = 0.0
        for a, b, ln in c["shots"]:
            if abs(a - t) > 0.01:
                fails.append(f"{tag} line {ln}: timecode starts at {a}s, expected {t}s")
            if b <= a:
                fails.append(f"{tag} line {ln}: shot ends before it starts")
            if b - a > MAX_SHOT_SECONDS:
                warns.append(f"{tag} line {ln}: shot held {b - a:g}s (> {MAX_SHOT_SECONDS}s); cut it up unless it's deliberate")
            t = b
        if abs(t - c["length"]) > 0.01:
            fails.append(f"{tag}: shots end at {t:g}s but header says {c['length']}s")
        if c["shots"][0][1] > 3:
            warns.append(f"{tag}: first shot runs past 3s")
        for field in ("On-screen hook", "Caption line", "Post caption"):
            if not c["fields"].get(field):
                fails.append(f"{tag}: missing '{field}'")
        all_sents = [s for vo, _ in c["vo"] for s in sentences(vo)]
        if all_sents:
            avg = sum(len(s.split()) for s in all_sents) / len(all_sents)
            if avg > MAX_AVG_WORDS:
                fails.append(f"{tag}: VO averages {avg:.1f} words/sentence (max {MAX_AVG_WORDS})")
            for vo, ln in c["vo"]:
                for s in sentences(vo):
                    if len(s.split()) > 16:
                        warns.append(f"{tag} line {ln}: {len(s.split())}-word sentence: '{s[:60]}...'")
                if "!" in vo:
                    warns.append(f"{tag} line {ln}: exclamation mark in VO")
        first = c["vo"][0][0] if c["vo"] else c["fields"].get("On-screen hook", "")
        for key in {opening(first), opening(c["fields"].get("On-screen hook", ""))} - {""}:
            if key in seen and seen[key] != tag:
                fails.append(f"{tag}: opens the same way as {seen[key]} ('{key}...')")
            if key in ledger_openings:
                fails.append(f"{tag}: opening '{key}...' already used in the ledger")
            seen.setdefault(key, tag)

    for w in warns:
        print("WARN:", w)
    for f in fails:
        print("FAIL:", f)
    print(f"\n{'FAIL' if fails else 'PASS'}: {len(concepts)} concepts, {len(fails)} fails, {len(warns)} warnings")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
