"""Dump pdfplumber tables from each price-list PDF so the extractor can be tuned."""
import sys
from pathlib import Path

import pdfplumber

src = Path(sys.argv[1])
out = Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)

for pdf_path in sorted(src.glob("*.pdf")):
    lines = []
    with pdfplumber.open(pdf_path) as pdf:
        for pno, page in enumerate(pdf.pages, 1):
            for tno, table in enumerate(page.extract_tables(), 1):
                lines.append(f"=== page {pno} table {tno} ({len(table)} rows)")
                for row in table:
                    cells = [(c or "").replace("\n", " ").strip() for c in row]
                    lines.append(" | ".join(cells))
    (out / (pdf_path.stem + ".txt")).write_text("\n".join(lines), encoding="utf-8")
    print(pdf_path.name, sum(1 for l in lines if not l.startswith("===")), "rows")
