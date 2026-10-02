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
        f'<a href="#pdf-{page:03d}"><span>{page:03d}</span>{html.escape(label)}</a>'
        for page, label in REPORT_NAV
    )


def _reader_shell(pdf_pages: int) -> str:
    nav = build_navigation()
    return f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="A searchable, continuous HTML reading edition of NASA SP-413, Space Settlements: A Design Study (1977).">
  <title>Space Settlements: A Design Study · NASA SP-413</title>
  <link rel="stylesheet" href="study.css">
  <script src="study.js" defer></script>
</head>
<body id="top" class="study-linear">
  <header class="study-header">
    <div class="header-topline">
      <a class="back-link" href="../assets/">← Asset gallery</a>
      <span class="library-label">REFERENCE LIBRARY · NASA SP-413</span>
      <button id="chapter-menu-toggle" class="chapter-menu-toggle" type="button" aria-expanded="false" aria-controls="chapter-navigation" aria-label="Open chapter menu">
        <span></span><span></span><span></span>
      </button>
    </div>
    <h1>Space Settlements: A Design Study</h1>
    <p class="subtitle">NASA SP-413 · published 1977</p>
    <form id="study-search-form" class="search-panel" role="search">
      <label for="study-search">Search the report</label>
      <div class="search-input-row">
        <input id="study-search" type="search" placeholder="Try “terraced housing” or “radiation shielding”" autocomplete="off" maxlength="400">
        <button id="study-search-button" type="submit">Search</button>
      </div>
      <fieldset class="search-modes">
        <legend>Search using</legend>
        <label><input id="search-bm25" type="checkbox" checked> Keyword (BM25)</label>
        <label><input id="search-semantic" type="checkbox" checked> Meaning (semantic)</label>
        <span id="search-status" aria-live="polite"></span>
      </fieldset>
    </form>
    <section id="search-results" class="search-results" aria-label="Search results" aria-live="polite" hidden>
      <div class="search-results-heading"><h2>Search results</h2><button id="search-results-close" type="button" aria-label="Close search results">×</button></div>
      <div class="search-result-columns">
        <section class="search-result-group" aria-labelledby="bm25-results-title">
          <h3 id="bm25-results-title">Keyword matches · BM25</h3>
          <ol id="bm25-results"></ol>
        </section>
        <section class="search-result-group" aria-labelledby="semantic-results-title">
          <h3 id="semantic-results-title">Meaning matches · semantic</h3>
          <ol id="semantic-results"></ol>
        </section>
      </div>
    </section>
  </header>
  <button id="chapter-menu-backdrop" class="chapter-menu-backdrop" type="button" aria-label="Close chapter menu" hidden></button>
  <div class="study-layout">
    <aside class="study-sidebar" aria-label="Report navigation">
      <nav id="chapter-navigation" class="chapter-navigation" aria-label="Chapters">
        <h2>Chapters</h2>
        {nav}
      </nav>
      <section class="source-card">
        <h2>Source & notes</h2>
        <p>This is a searchable reading edition, not a page facsimile. Text, OCR, and reconstructed tables can contain errors; check important details against the original scan.</p>
        <p>NASA NTRS cautions that portions may include third-party copyrighted material. Explicitly credited figures are omitted here and linked to the source. Figures shown here have not been individually rights-cleared; their inclusion is not permission to reuse them.</p>
        <a href="{NTRS_RECORD}" target="_blank" rel="noopener">NASA NTRS record ↗</a>
      </section>
    </aside>
    <main id="study-content" class="study-content">
      <div class="reading-note">
        <strong>One continuous reading flow</strong>
        <p>Segments follow the report’s original order. Each paragraph, image, and table links back to its PDF page. Use the chapter menu to jump to a section.</p>
      </div>
      <p id="reader-status" class="reader-status" role="status">Loading report segments…</p>
      <article id="study-article" class="study-article" aria-label="Space Settlements: A Design Study"></article>
      <noscript><p>This reader needs JavaScript enabled to load the report segments.</p></noscript>
      <a class="top-link" href="#top">Back to top ↑</a>
    </main>
  </div>
  <footer class="study-footer"><span>Unofficial searchable reading edition · {pdf_pages} PDF pages</span><a href="{NTRS_RECORD}" target="_blank" rel="noopener">Open NASA NTRS record ↗</a></footer>
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
