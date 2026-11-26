"""Extract every variant row from the dealer price-list PDFs into JSON.

A row is accepted only when its numbers pass the arithmetic check:
sum(components) == on-road total (the 3+3 insurance column is excluded
from the 1+3 total). Usage: python extract_prices.py <pdf_dir> <out.json>
"""
import json, re, sys
from pathlib import Path
import pypdf

NUM = re.compile(r"\d{1,3}(?:,\d{2})*,\d{3}|\d{4,7}")
SUFFIX = re.compile(r"\b([A-Z0-9]{5})(?:\s*/\s*[A-Z0-9]{5})*\b")

def val(s): return int(s.replace(",", ""))

def solve(nums):
    """Return (on13_idx, ins33_idx|None) such that sum of the components equals the total."""
    for j in range(3, len(nums)):
        s = sum(nums[:j])
        if s == nums[j]:
            return j, None
        for k in range(2, j):
            if s - nums[k] == nums[j]:
                return j, k
    return None

def rows(text):
    label = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        found = NUM.findall(line)
        if len(found) >= 6:
            nums = [val(x) for x in found]
            head = NUM.sub("", line)
            sol = solve(nums)
            yield {"label": " ".join(label[-2:]), "head": head.strip(), "nums": nums, "sol": sol}
            label = []
        elif len(line) < 40 and not line.startswith("*"):
            label.append(line)

def main(src, out):
    result = {}
    for pdf in sorted(Path(src).glob("*.pdf")):
        text = "\n".join(p.extract_text() or "" for p in pypdf.PdfReader(str(pdf)).pages)
        items = []
        for r in rows(text):
            if not r["sol"]:
                items.append({"ok": False, "label": r["label"], "head": r["head"], "nums": r["nums"]})
                continue
            j, k = r["sol"]
            n = r["nums"]
            item = {"ok": True, "label": r["label"], "head": r["head"], "ex": n[0], "tcs": n[1],
                    "parts": n[2:j] if k is None else [x for i, x in enumerate(n[2:j], 2) if i != k],
                    "onroad13": n[j]}
            if k is not None:
                item["ins13"] = n[k - 1]
                item["ins33"] = n[k]
                item["onroad33"] = n[j] - n[k - 1] + n[k]
            items.append(item)
        result[pdf.stem] = items
        ok = sum(1 for i in items if i["ok"])
        print(f"{pdf.name}: {ok}/{len(items)} rows pass the sum check")
    Path(out).write_text(json.dumps(result, indent=1, ensure_ascii=False), encoding="utf-8")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
