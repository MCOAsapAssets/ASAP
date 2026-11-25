#!/usr/bin/env python3
"""Mechanical gate (Gate 5) for an ASAP concept burst.

Usage:
  python3 check_batch.py CONCEPTS.md [--ledger LEDGER.md] [--count 12] [--hashtags-asked]

Exit code 0 = PASS (warnings allowed), 1 = FAIL. Fix every FAIL before delivering.
"""
import argparse
import re
import sys

BANNED = [
    "hey guys", "welcome back", "in today's video", "not only", "game changer",
    "game-changer", "look no further", "elevate your", "unlock your", "transform your",
    "so a lot of you", "don't forget to like", "smash that", "link in bio",
]
WEAK_DISCLOSURE = re.compile(r"(^|\s)#?(collab|gifted)\b", re.I)
BLANK = re.compile(r"\[(?!in your own words:)[^\]]*\]|\bTBC\b|\bTBD\b|\$X+\b|\bXX+\b", re.I)
HEADER = re.compile(r"^Concept\s+(\d+)\s+-\s+(.+?)\s+\((.+?),\s*(\d+)s\)\s*$")
SHOT = re.compile(r"^Shot\s+(\d+)\s+\((\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)s\):\s*(.+)$")
REQUIRED = ["On-screen hook", "Caption line", "Post caption", "Job", "Pillar", "Where filmed", "Short cut"]
OPTIONAL = ["Compliance"]
MAX_SHOT_SECONDS = 8
MAX_AVG_WORDS = 9


def sentences(text):
    parts = re.split(r"(?<=[.?!])\s+", text.strip())
    return [p for p in parts if re.search(r"\w", p)]


def opening(text, n=3):
    words = re.findall(r"[a-z0-9$']+", text.lower())
    return " ".join(words[:n])


def read_ledger(path):
    """Ledger columns: Burst | Concept | Person | Hook opening words | Idea | Length | Job | ..."""
    openings = set()
    for row in open(path, encoding="utf-8"):
        cells = [c.strip() for c in row.strip().strip("|").split("|")]
        if len(cells) < 4:
            continue
        hook = cells[3]
        if not hook or set(hook) <= set("-: ") or hook.lower() == "hook opening words":
            continue
        openings.add(opening(hook))
    return openings


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("concepts")
    ap.add_argument("--ledger")
    ap.add_argument("--count", type=int, default=12)
    ap.add_argument("--hashtags-asked", action="store_true")
    args = ap.parse_args()

    lines = open(args.concepts, encoding="utf-8").read().splitlines()
    ledger_openings = read_ledger(args.ledger) if args.ledger else set()

    fails, warns = [], []
    concepts = []
    cur = None
    for i, raw in enumerate(lines, 1):
        line = raw.strip()
        m = HEADER.match(line)
        if m:
            cur = {"no": int(m[1]), "length": int(m[4]), "shots": {}, "order": [],
                   "vo": [], "fields": {}, "pending": False}
            concepts.append(cur)
            continue
        if re.match(r"^concept\s+\d", line, re.I):
            fails.append(f"line {i}: header not in format 'Concept N - Name (Person, Ns)'")
            continue
        if cur is None:
            continue
        tag = f"C{cur['no']} line {i}"

        tags = re.findall(r"(?:^|\s)#\w+", line)
        if tags:
            if not args.hashtags_asked:
                fails.append(f"{tag}: hashtag found (hashtags only if asked; pass --hashtags-asked)")
            elif len(tags) > 5:
                fails.append(f"{tag}: {len(tags)} hashtags (max 5)")
        if BLANK.search(line) and not line.startswith("["):
            fails.append(f"{tag}: blank/placeholder: {BLANK.search(line)[0]}")
        for b in BANNED:
            if b in line.lower():
                fails.append(f"{tag}: banned phrase '{b}'")
        if WEAK_DISCLOSURE.search(line):
            warns.append(f"{tag}: 'collab'/'gifted' is not plain disclosure; use 'Paid partnership' or 'We swapped: ...'")

        s = SHOT.match(line)
        if s:
            if cur["pending"]:
                fails.append(f"{tag}: previous shot has no VO/Text line under it")
            n, a, b = int(s[1]), float(s[2]), float(s[3])
            cur["shots"][n] = (a, b)
            cur["order"].append((n, a, b, i, s[4]))
            cur["pending"] = True
            continue
        if line.startswith("VO:") or line.startswith("Text:"):
            cur["pending"] = False
            if line.startswith("VO:"):
                vo = line[3:].strip()
                if vo.lower() != "none" and not vo.startswith("[in your own words:"):
                    cur["vo"].append((vo.strip('"'), i))
            continue
        for field in REQUIRED + OPTIONAL:
            if line.startswith(field + ":"):
                cur["fields"][field] = (line.split(":", 1)[1].strip(), i)

    if not concepts:
        print("FAIL: no concepts found")
        return 1
    if len(concepts) != args.count:
        warns.append(f"{len(concepts)} concepts (asked for {args.count}; say why in Flags)")

    seen = {}
    for c in concepts:
        tag = f"C{c['no']}"
        if c["pending"]:
            fails.append(f"{tag}: last shot has no VO/Text line")
        if not c["order"]:
            fails.append(f"{tag}: no shots")
            continue
        t = 0.0
        for idx, (n, a, b, ln, desc) in enumerate(c["order"]):
            if n != idx + 1:
                fails.append(f"{tag} line {ln}: shot numbered {n}, expected {idx + 1}")
            if abs(a - t) > 0.01:
                fails.append(f"{tag} line {ln}: timecode starts at {a:g}s, expected {t:g}s")
            if b <= a:
                fails.append(f"{tag} line {ln}: shot ends before it starts")
            if b - a > MAX_SHOT_SECONDS:
                warns.append(f"{tag} line {ln}: one frame held {b - a:g}s; is something changing, or a loop carrying it?")
            if "logo" in desc.lower() and idx < len(c["order"]) - 1:
                warns.append(f"{tag} line {ln}: logo on screen before the end card")
            t = b
        if abs(t - c["length"]) > 0.01:
            fails.append(f"{tag}: shots end at {t:g}s but header says {c['length']}s")
        first = c["order"][0][4].lower()
        if any(w in first for w in ("logo", "slow pan", "title card")):
            fails.append(f"{tag}: frame one is a logo/slow pan/title card; open on something happening")

        for field in REQUIRED:
            if not c["fields"].get(field, ("", 0))[0]:
                fails.append(f"{tag}: missing '{field}'")
        job = c["fields"].get("Job", ("", 0))[0]
        if job and not re.match(r"^(Send|Save|Book)\b", job, re.I):
            fails.append(f"{tag}: Job must start with Send, Save or Book")
        sc = c["fields"].get("Short cut", ("", 0))[0]
        if sc:
            nums = [int(x) for x in re.findall(r"\d+", sc.split("-")[0])]
            missing = [x for x in nums if x not in c["shots"]]
            if not nums:
                fails.append(f"{tag}: Short cut must list shot numbers, e.g. 'Shots 1, 3, 5 - ...'")
            elif missing:
                fails.append(f"{tag}: Short cut lists shots that don't exist: {missing}")
            else:
                dur = sum(c["shots"][x][1] - c["shots"][x][0] for x in set(nums))
                if not 6 <= dur <= 10:
                    warns.append(f"{tag}: short cut shots add to {dur:g}s (target 6-10s; fine if trimmed in the edit)")

        all_sents = [s for vo, _ in c["vo"] for s in sentences(vo)]
        if all_sents:
            avg = sum(len(s.split()) for s in all_sents) / len(all_sents)
            if avg > MAX_AVG_WORDS:
                fails.append(f"{tag}: VO averages {avg:.1f} words/sentence (max {MAX_AVG_WORDS})")
            for vo, ln in c["vo"]:
                for s in sentences(vo):
                    if len(s.split()) >= 16:
                        warns.append(f"{tag} line {ln}: {len(s.split())}-word sentence: '{s[:60]}...'")
                if "!" in vo:
                    warns.append(f"{tag} line {ln}: exclamation mark in VO")

        hook = c["fields"].get("On-screen hook", ("", 0))[0]
        first_vo = c["vo"][0][0] if c["vo"] else ""
        for key in {opening(first_vo), opening(hook)} - {""}:
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
