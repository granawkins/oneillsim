#!/usr/bin/env python3
"""Build a searchable, responsive HTML reading edition of NASA SP-413.

The source PDF is not copied into the web root. Text and detected tables are
converted to HTML; report figures are extracted individually. Images on pages
with an explicit source/copyright credit are omitted and linked to the NASA
original instead.
"""
from __future__ import annotations

import argparse
import html
import os
import re
import shutil
import tempfile
from pathlib import Path
from urllib.parse import unquote, urlparse

from build_study_segments import finalize_existing_page_html, load_image_descriptions, rebuild_reader_shell

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PDF = Path(os.environ.get(
    "STUDY_SOURCE_PDF",
    Path.home() / ".local/share/oneillsim/study-source/nasa-sp-413-space-settlements-a-design-study.pdf",
))
DEFAULT_OUTPUT = ROOT / "study"
NTRS_RECORD = "https://ntrs.nasa.gov/citations/19770014162"
NTRS_PDF = "https://ntrs.nasa.gov/api/citations/19770014162/downloads/19770014162.pdf"
IMAGE_RE = re.compile(r"!\[([^\]]*)\]\(([^)]+)\)")
CREDIT_RE = re.compile(r"\b(?:source|courtesy|copyright)\s*:", re.IGNORECASE)
FIGURE_ANCHORS = {
    67: [("figure-4-8", "Figure 4-8")],
    108: [("figure-5-5", "Figure 5-5")],
    109: [("figure-5-6", "Figure 5-6"), ("figure-5-7", "Figure 5-7")],
    130: [("appendix-b", "Appendix B")],
}
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
IMAGE_ALTS = {
    (108, 1): "Figure 5-5: terrace housing exterior view",
    (108, 2): "Figure 5-5: terrace housing exterior view",
    (109, 2): "Figure 5-6: possible apartment plan",
    (109, 4): "Figure 5-7: view of housing",
}
ALLOWED_TAGS = {
    "a", "blockquote", "br", "code", "del", "em", "h1", "h2", "h3", "h4",
    "h5", "h6", "hr", "img", "li", "ol", "p", "pre", "strong", "sub",
    "sup", "table", "tbody", "td", "th", "thead", "tr", "ul",
}
ALLOWED_ATTRIBUTES = {
    "*": ["class", "id"],
    "a": ["href", "title"],
    "img": ["src", "alt", "title", "loading", "decoding"],
    "td": ["colspan", "rowspan"],
    "th": ["colspan", "rowspan", "scope"],
}


def clean_image(source: Path, destination: Path) -> bool:
    """Copy a usable report image as a bounded, optimized JPEG."""
    from PIL import Image

    try:
        with Image.open(source) as opened:
            if opened.width < 36 or opened.height < 36 or opened.width * opened.height < 4000:
                return False
            image = opened.convert("RGB")
            if max(image.size) > 1800:
                scale = 1800 / max(image.size)
                image = image.resize(
                    (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
                    Image.Resampling.LANCZOS,
                )
            image.save(destination, "JPEG", quality=86, optimize=True, progressive=True)
        return True
    except (OSError, ValueError):
        return False


def convert_page_images(text: str, page_number: int, temp_images: Path, output_images: Path) -> tuple[str, bool]:
    """Replace temporary absolute image URLs with safe, relative web assets."""
    credited_page = bool(CREDIT_RE.search(text))
    omitted = False

    def replace(match: re.Match[str]) -> str:
        nonlocal omitted
        if credited_page:
            omitted = True
            return ""
        raw_path = unquote(urlparse(match.group(2).strip("<>" )).path)
        source = temp_images / Path(raw_path).name
        suffix = re.search(r"-(\d{4})-(\d{2})\.[^.]+$", source.name)
        image_index = int(suffix.group(2)) if suffix else 0
        if not source.is_file():
            return ""
        filename = f"sp413-p{page_number:04d}-{image_index:02d}.jpg"
        destination = output_images / filename
        if not clean_image(source, destination):
            return ""
        alt = IMAGE_ALTS.get((page_number, image_index), match.group(1).strip())
        if not alt:
            alt = f"Report illustration on PDF page {page_number}"
        return f"![{alt}](images/{filename})"

    return IMAGE_RE.sub(replace, text), omitted


def major_heading(text: str) -> str | None:
    for line in text.splitlines():
        if not re.match(r"^#{1,2}\s+", line):
            continue
        label = re.sub(r"^#+\s+", "", line)
        label = re.sub(r"<[^>]+>", " ", label)
        label = re.sub(r"[*_`#]", "", label)
        label = re.sub(r"\s+", " ", label).strip(" .:-")
        if re.search(r"\b(?:CHAPTER|APPENDIX|UNITS AND CONVERSION FACTORS)\b", label, re.I) or re.match(r"^\d{1,2}(?:\.|\s)", label):
            return label[:110]
    return None


def build_navigation() -> str:
    return chr(10).join(
        f'<a href="#pdf-{page_number:03d}"><span>{page_number:03d}</span>{html.escape(label)}</a>'
        for page_number, label in REPORT_NAV
    )


def update_navigation(output: Path) -> None:
    rebuild_reader_shell(output)


def render(pdf_path: Path, output: Path, dpi: int) -> tuple[int, int]:
    import bleach
    import markdown
    import pymupdf4llm  # type: ignore[import-not-found]

    output.mkdir(parents=True, exist_ok=True)
    images_dir = output / "images"
    images_dir.mkdir(exist_ok=True)
    for old_image in images_dir.glob("sp413-p*.jpg"):
        old_image.unlink()

    scratch_root = Path(os.environ.get("TMPDIR", Path.home() / ".hermes/cache/scratch"))
    scratch_root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="sp413-html-", dir=scratch_root) as temporary:
        temp_images = Path(temporary) / "images"
        temp_images.mkdir()
        chunks = pymupdf4llm.to_markdown(
            str(pdf_path),
            page_chunks=True,
            write_images=True,
            image_path=str(temp_images),
            image_format="jpg",
            dpi=dpi,
            show_progress=False,
        )
        if not chunks:
            raise RuntimeError("The PDF converter returned no pages.")

        page_sections: list[str] = []
        omitted_count = 0
        for chunk in chunks:
            metadata = chunk.get("metadata", {})
            page_number = int(metadata.get("page_number", len(page_sections) + 1))
            text = chunk.get("text", "") or ""
            text, omitted = convert_page_images(text, page_number, temp_images, images_dir)
            if omitted:
                omitted_count += 1
            body = markdown.markdown(text, extensions=["tables", "fenced_code"], output_format="html")
            body = bleach.clean(
                body,
                tags=ALLOWED_TAGS,
                attributes=ALLOWED_ATTRIBUTES,
                protocols={"http", "https", "mailto"},
                strip=True,
                strip_comments=True,
            )
            body = re.sub(r"<img\b", '<img loading="lazy" decoding="async"', body, flags=re.IGNORECASE)
            if not body.strip():
                body = '<p class="empty-page">No selectable text was extracted from this page.</p>'

            printed_page = page_number - 17 if page_number >= 18 else None
            page_label = f"PDF page {page_number}"
            if printed_page is not None:
                page_label += f" · printed page {printed_page}"
            source_page = f"{NTRS_PDF}#page={page_number}"
            anchors = "".join(
                f'<span class="anchor-target" id="{html.escape(anchor, quote=True)}" aria-hidden="true"></span>'
                for anchor, _ in FIGURE_ANCHORS.get(page_number, [])
            )
            omission_note = ""
            if omitted:
                omission_note = (
                    '<aside class="image-rights-note" id="figure-4-8-omitted">'
                    'This page has an explicit source/copyright credit, so its embedded image is not reproduced here. '
                    f'<a href="{html.escape(source_page, quote=True)}" target="_blank" rel="noopener">Open this page in NASA’s original scan</a>.'
                    '</aside>'
                )
            page_sections.append(
                f'<article class="report-page" id="pdf-{page_number:03d}" data-pdf-page="{page_number}">'
                f'{anchors}<header class="page-heading"><h2>{html.escape(page_label)}</h2>'
                f'<a class="source-page-link" href="{html.escape(source_page, quote=True)}" target="_blank" rel="noopener">Original scan ↗</a></header>'
                f'{omission_note}<div class="page-content">{body}</div></article>'
            )

    nav_markup = build_navigation()
    page_count = len(page_sections)
    html_document = f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Searchable HTML reading edition of NASA SP-413, Space Settlements: A Design Study (1977).">
  <title>Space Settlements: A Design Study · NASA SP-413</title>
  <link rel="stylesheet" href="study.css">
  <script src="study.js" defer></script>
</head>
<body>
  <header class="study-header">
    <div class="brand-line"><a href="../assets/">← Asset gallery</a><span>REFERENCE LIBRARY · NASA SP-413</span></div>
    <h1>Space Settlements: A Design Study</h1>
    <p class="subtitle">NASA SP-413 · published 1977 · a searchable, responsive HTML reading edition</p>
    <div class="search-row">
      <label for="study-search">Search the extracted report</label>
      <input id="study-search" type="search" placeholder="Search phrases, table values, or figure numbers" autocomplete="off">
      <span id="search-count" aria-live="polite">{page_count} pages</span>
    </div>
  </header>
  <div class="study-layout">
    <aside class="study-sidebar">
      <section class="sidebar-card">
        <h2>Navigate</h2>
        <label for="page-jump">Jump to PDF page (1–{page_count})</label>
        <div class="jump-row"><input id="page-jump" type="number" min="1" max="{page_count}" inputmode="numeric"><button id="page-jump-button" type="button">Go</button></div>
        <p class="hint">Original printed page numbers are shown with each page.</p>
      </section>
      <section class="sidebar-card"><h2>Major sections</h2><nav class="chapter-nav">{nav_markup}</nav></section>
      <section class="sidebar-card source-card">
        <h2>Source & rights</h2>
        <p>Text and detected tables are transcribed from the report. Figures are included where the source page has no explicit third-party credit. Credited images are linked to the NASA-hosted original instead.</p>
        <a href="{NTRS_RECORD}" target="_blank" rel="noopener">NASA NTRS record ↗</a>
      </section>
    </aside>
    <main id="study-content" class="study-content">
      <section class="reading-note">
        <strong>Reading edition, not the archival master.</strong>
        <p>Built from the PDF’s text/OCR layer and layout-aware table extraction. OCR and automatic table reconstruction can contain errors; compare important wording, numbers, and figures with the original scan. The original report is not copied into this site.</p>
        <p>NASA NTRS identifies the report as publicly available and cautions that portions may contain third-party copyrighted material. For that reason, pages with explicit source/copyright credits have their embedded images omitted; their text/captions remain and the page links to the original scan.</p>
      </section>
      {''.join(page_sections)}
    </main>
  </div>
  <footer class="study-footer"><span>Unofficial searchable reading edition · NASA SP-413</span><a href="{NTRS_RECORD}" target="_blank" rel="noopener">Open NASA NTRS record ↗</a></footer>
</body>
</html>
'''
    (output / "index.html").write_text(html_document, encoding="utf-8")
    return page_count, omitted_count


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--dpi", type=int, default=125)
    parser.add_argument("--navigation-only", action="store_true", help="Update the chapter links in an existing site without re-extracting the PDF")
    args = parser.parse_args()
    pdf_path = args.pdf.resolve()
    output = args.output.resolve()
    if not args.navigation_only and not pdf_path.is_file():
        parser.error(f"PDF not found: {pdf_path}")
    if args.dpi < 72 or args.dpi > 300:
        parser.error("--dpi must be between 72 and 300")
    if args.navigation_only:
        update_navigation(output)
        print(f"Updated the major-section navigation in {output / 'index.html'}.")
        return 0
    pages, omitted = render(pdf_path, output, args.dpi)
    metadata = finalize_existing_page_html(
        output,
        load_image_descriptions(),
        source_pdf_pages=pages,
    )
    print(
        f"Built the continuous reading edition from {pages} PDF pages: "
        f"{metadata['segment_count']} segments, {metadata['image_count']} images, "
        f"{metadata['table_count']} tables."
    )
    if omitted:
        print(f"Omitted credited images on {omitted} PDF page(s).")
    print(f"Reader: {output / 'index.html'}")
    print(f"Segments: {output / 'segments.json'}")
    print(f"Figure images: {sum(1 for _ in (output / 'images').glob('sp413-p*.jpg'))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
