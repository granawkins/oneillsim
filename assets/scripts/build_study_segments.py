#!/usr/bin/env python3
"""Transform the page-wise PDF extraction into a linear, cited reading edition."""
from __future__ import annotations

import argparse
import html
import json
import re
from pathlib import Path
from typing import Any

from study_segments import OMITTED_IMAGE_FILENAMES, RASTER_TEXT_REPLACEMENTS, clean_text, parse_page_html

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = ROOT / "study"
DEFAULT_SOURCE_HTML = DEFAULT_OUTPUT / "index.html"
DEFAULT_IMAGE_DESCRIPTIONS = ROOT / "assets/scripts/study-image-descriptions.json"
NTRS_RECORD = "https://ntrs.nasa.gov/citations/19770014162"
REPORT_NAV = [
    (18, "Chapter 1 — The Colonization of Space"),
    (26, "Chapter 2 — Physical Properties of Space"),
    (38, "Chapter 3 — Human Needs in Space"),
    (56, "Chapter 4 — Choosing Among Alternatives"),
    (104, "Chapter 5 — A Tour of the Colony"),
    (130, "Appendix B — Structural System for Housing"),
    (156, "Chapter 6 — Building the Colony and Making It Prosper"),
    (188, "Chapter 7 — View to the Future"),
    (196, "Chapter 8 — Recommendations and Conclusions"),
]


def _page_parts(document: str) -> list[tuple[int, str]]:
    pages: list[tuple[int, str]] = []
    for match in re.finditer(r'<article class="report-page"[^>]*>.*?</article>', document, re.IGNORECASE | re.DOTALL):
        article = match.group(0)
        page_match = re.search(r'data-pdf-page="(\d+)"', article, re.IGNORECASE)
        body_match = re.search(r'<div class="page-content">(.*?)</div>\s*</article>', article, re.IGNORECASE | re.DOTALL)
        if not page_match or not body_match:
            continue
        pages.append((int(page_match.group(1)), body_match.group(1)))
    if not pages:
        raise ValueError("No page-wise report sections were found in the extraction HTML")
    return pages


def load_image_descriptions(path: Path = DEFAULT_IMAGE_DESCRIPTIONS) -> dict[str, str]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict) or not all(isinstance(key, str) and isinstance(text, str) for key, text in value.items()):
        raise ValueError(f"Image-description file must be a JSON object of filename to text: {path}")
    return value


def build_navigation() -> str:
    return "\n".join(
        f'<a href="#pdf-{page:03d}">{html.escape(label)}</a>'
        for page, label in REPORT_NAV
    )


def _reader_shell(pdf_pages: int) -> str:
    nav = build_navigation()
    return f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Space Settlements: A Design Study, NASA SP-413 (1977).">
  <title>Space Settlements: A Design Study · NASA SP-413</title>
  <link rel="stylesheet" href="study.css">
  <script type="module" src="bootstrap.js"></script>
</head>
<body id="top" class="study-page">
  <header class="study-header">
    <h1>Space Settlements: A Design Study</h1>

  </header>
  <main>

    <div class="study-layout">
      <aside class="study-sidebar" aria-label="Report navigation">
    <form id="study-search-form" role="search">
      <input id="study-search" name="q" type="search" aria-label="Search the study" placeholder="Search the study" autocomplete="off" maxlength="400">
      <button type="submit">Search</button>
    </form>
        <div id="outline-scroll" class="outline-scroll">
        <nav id="chapter-navigation" aria-label="Chapters">
          {nav}
        </nav>
        <a class="source-link" href="https://ntrs.nasa.gov/api/citations/19770014162/downloads/19770014162.pdf" target="_blank" rel="noopener">Original document at NASA ↗</a>
        </div>
      </aside>
      <div class="study-content">
    <section id="search-results" class="search-results" aria-label="Search results" hidden>
      <p id="search-status" role="status"></p>
      <ol id="result-list"></ol>
    </section>
        <div id="reading-view">
        <p id="reader-status" role="status">Loading…</p>
        <article id="study-article" aria-label="Space Settlements: A Design Study"></article>
        <noscript>This reader needs JavaScript to display the study.</noscript>
        </div>
      </div>
    </div>
  </main>
</body>
</html>
'''



def build_reading_edition(
    source_html: str,
    output_dir: Path,
    image_descriptions: dict[str, str],
    table_descriptions: dict[str, str] | None = None,
    source_pdf_pages: int | None = None,
) -> dict[str, int]:
    """Build segments.json and a responsive reader shell from extracted page HTML."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    page_parts = _page_parts(source_html)
    all_segments: list[dict[str, Any]] = []
    next_index = 1
    heading_stack: list[tuple[int, str]] = []
    for pdf_page, body in page_parts:
        page_segments, next_index = parse_page_html(
            f'<div class="page-content">{body}</div>',
            pdf_page=pdf_page,
            index_start=next_index,
            image_descriptions=image_descriptions,
            table_descriptions=table_descriptions,
        )
        for segment in page_segments:
            if segment["type"] == "heading":
                level = int(segment.get("level", 6))
                heading_stack = [(current_level, title) for current_level, title in heading_stack if current_level < level]
                heading_stack.append((level, segment["text"]))
            context = " / ".join(title for _, title in heading_stack)
            if context:
                segment["heading_context"] = context
                segment["search_text"] = clean_text(f"{context} {segment.get('search_text', '')}")
        all_segments.extend(page_segments)

    excluded_images = OMITTED_IMAGE_FILENAMES | frozenset(RASTER_TEXT_REPLACEMENTS)
    image_dir = output_dir / "images"
    for filename in excluded_images:
        excluded_path = image_dir / filename
        if excluded_path.is_file():
            excluded_path.unlink()

    pdf_page_count = source_pdf_pages or max(page for page, _ in page_parts)
    table_count = sum(segment["type"] == "table" for segment in all_segments)
    image_count = sum(segment["type"] == "image" for segment in all_segments)
    metadata = {
        "title": "Space Settlements: A Design Study",
        "report": "NASA SP-413",
        "published": 1977,
        "pdf_pages": pdf_page_count,
        "segment_count": len(all_segments),
        "table_count": table_count,
        "image_count": image_count,
    }
    payload = {"metadata": metadata, "segments": all_segments}
    (output_dir / "segments.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (output_dir / "index.html").write_text(_reader_shell(pdf_page_count), encoding="utf-8")
    return metadata


def finalize_existing_page_html(
    output_dir: Path,
    image_descriptions: dict[str, str],
    table_descriptions: dict[str, str] | None = None,
    source_pdf_pages: int | None = None,
) -> dict[str, int]:
    output_dir = Path(output_dir)
    source_path = output_dir / "index.html"
    if not source_path.is_file():
        raise FileNotFoundError(f"Page extraction HTML not found: {source_path}")
    source_html = source_path.read_text(encoding="utf-8")
    return build_reading_edition(
        source_html,
        output_dir,
        image_descriptions,
        table_descriptions=table_descriptions,
        source_pdf_pages=source_pdf_pages,
    )


def rebuild_reader_shell(output_dir: Path) -> Path:
    output_dir = Path(output_dir)
    segments_path = output_dir / "segments.json"
    payload = json.loads(segments_path.read_text(encoding="utf-8"))
    pdf_pages = int(payload["metadata"]["pdf_pages"])
    if not 1 <= pdf_pages <= 1000:
        raise ValueError("Stored PDF page count is outside the supported range")
    index_path = output_dir / "index.html"
    index_path.write_text(_reader_shell(pdf_pages), encoding="utf-8")
    return index_path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-html", type=Path, default=DEFAULT_SOURCE_HTML)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--image-descriptions", type=Path, default=DEFAULT_IMAGE_DESCRIPTIONS)
    parser.add_argument("--pdf-pages", type=int, default=None)
    args = parser.parse_args()
    metadata = build_reading_edition(
        args.source_html.read_text(encoding="utf-8"),
        args.output,
        load_image_descriptions(args.image_descriptions),
        source_pdf_pages=args.pdf_pages,
    )
    print(
        f"Built {metadata['segment_count']} ordered segments from {metadata['pdf_pages']} PDF pages "
        f"({metadata['image_count']} images, {metadata['table_count']} tables)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
