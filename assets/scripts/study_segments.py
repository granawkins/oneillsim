"""Turn one PDF page's converted HTML into ordered, cited content segments.

This module is intentionally conservative: it normalizes whitespace and obvious
HTML/OCR artifacts, but never asks a language model to rewrite report prose.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from html.parser import HTMLParser
import re
import unicodedata
from typing import Any
from urllib.parse import unquote, urlparse

NTRS_PDF_PAGE = "https://ntrs.nasa.gov/api/citations/19770014162/downloads/19770014162.pdf#page={}"
OMITTED_IMAGE_FILENAMES = frozenset({"sp413-p0026-13.jpg", "sp413-p0038-09.jpg"})
RASTER_TEXT_REPLACEMENTS = {
    "sp413-p0027-09.jpg": "Solar radiation: an abundant, essential source of energy",
}
VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
HEADING_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6"}
BLOCK_TAGS = HEADING_TAGS | {"p", "table", "ul", "ol", "blockquote", "pre", "hr", "figure", "div"}
CAPTION_RE = re.compile(r"^\s*(?:Figure|Fig\.?|Table)\s+[A-Z0-9][A-Z0-9.-]*\s*[-–—.]?\s*", re.IGNORECASE)
ABBREVIATIONS = (
    "e.g.", "i.e.", "etc.", "Fig.", "Figs.", "ref.", "refs.", "ch.", "chs.",
    "Dr.", "Mr.", "Mrs.", "Ms.", "St.", "No.", "vs.", "approx.", "vol.",
    "pp.", "p.", "U.S.", "U.S.A.", "NASA.",
)


@dataclass
class Node:
    tag: str
    attrs: dict[str, str] = field(default_factory=dict)
    children: list["Node | str"] = field(default_factory=list)


class _TreeBuilder(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = Node("#root")
        self.stack = [self.root]

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        node = Node(tag.lower(), {key.lower(): value or "" for key, value in attrs})
        self.stack[-1].children.append(node)
        if tag.lower() not in VOID_TAGS:
            self.stack.append(node)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        if tag.lower() not in VOID_TAGS:
            self.handle_endtag(tag)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        for position in range(len(self.stack) - 1, 0, -1):
            if self.stack[position].tag == tag:
                del self.stack[position:]
                break

    def handle_data(self, data: str) -> None:
        if data:
            self.stack[-1].children.append(data)



def _descendants(node: Node, tag: str) -> list[Node]:
    found: list[Node] = []
    for child in node.children:
        if isinstance(child, Node):
            if child.tag == tag:
                found.append(child)
            found.extend(_descendants(child, tag))
    return found


def _find_content(root: Node) -> Node:
    for node in _descendants(root, "div"):
        classes = node.attrs.get("class", "").split()
        if "page-content" in classes:
            return node
    return root


def _raw_text(node: Node) -> str:
    pieces: list[str] = []
    for child in node.children:
        if isinstance(child, str):
            pieces.append(child)
        elif child.tag == "br":
            pieces.append("\n")
        elif child.tag not in {"img", "table"}:
            pieces.append(_raw_text(child))
    return "".join(pieces)


def clean_text(value: str) -> str:
    """Normalize extraction whitespace/punctuation without guessing at wording."""
    value = unicodedata.normalize("NFKC", value).replace("\u00ad", "")
    value = value.replace("\r", "\n")
    value = re.sub(r"[\t\f\v ]+", " ", value)
    value = re.sub(r" *\n *", "\n", value)
    value = re.sub(r"\n+", " ", value)
    value = re.sub(r"\s+([,.;:!?])", r"\1", value)
    value = re.sub(r"([([{])\s+", r"\1", value)
    value = re.sub(r"\s+([)\]}])", r"\1", value)
    return value.strip()


def split_sentences(text: str) -> list[str]:
    """Split prose on clear sentence boundaries while protecting common initials."""
    text = clean_text(text)
    if not text:
        return []
    protected = text
    marker = "\ue000"
    for abbreviation in sorted(ABBREVIATIONS, key=len, reverse=True):
        protected = re.sub(re.escape(abbreviation), abbreviation[:-1] + marker, protected, flags=re.IGNORECASE)
    protected = re.sub(r"\b([A-Z])\.", rf"\1{marker}", protected)
    pieces = re.split(r'(?<=[.!?])\s+(?=[A-Z0-9“"(\[])', protected)
    return [piece.replace(marker, ".").strip() for piece in pieces if piece.strip()]


def _visual_ocr_noise(text: str, page_has_image: bool) -> bool:
    """Drop only strongly diagram-like OCR blocks on pages containing images."""
    if not page_has_image:
        return False
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if len(lines) < 5:
        return False
    if CAPTION_RE.match(clean_text(text)):
        return False
    chars = [char for char in text if char.isalpha()]
    if not chars:
        return True
    uppercase_ratio = sum(char.isupper() for char in chars) / len(chars)
    short_line_ratio = sum(len(line) <= 35 for line in lines) / len(lines)
    return uppercase_ratio >= 0.58 and short_line_ratio >= 0.6


def _table_markdown(table: Node) -> str:
    rows: list[list[str]] = []
    for row in _descendants(table, "tr"):
        cells = [clean_text(_raw_text(cell)).replace("|", "\\|") for cell in row.children
                 if isinstance(cell, Node) and cell.tag in {"td", "th"}]
        if cells:
            rows.append(cells)
    if not rows:
        return ""
    width = max(len(row) for row in rows)
    rows = [row + [""] * (width - len(row)) for row in rows]
    has_header = any(node.tag == "th" for node in _descendants(table, "th"))
    if not has_header:
        rows.insert(0, [f"Column {number}" for number in range(1, width + 1)])
    header = rows[0]
    divider = ["---"] * width
    return "\n".join(
        ["| " + " | ".join(header) + " |", "| " + " | ".join(divider) + " |"]
        + ["| " + " | ".join(row) + " |" for row in rows[1:]]
    )


def _figure_anchor(text: str) -> str | None:
    match = re.match(r"^ *(?:Figure|Fig[.]?) +([0-9]+(?:[-.][0-9]+)*)", clean_text(text), re.IGNORECASE)
    if not match:
        return None
    number = match.group(1).replace(".", "-")
    return f"figure-{number}"


def _table_description(table_id: str, table: Node, caption: str, pdf_page: int) -> str:
    rows = _table_markdown(table).splitlines()
    if not rows:
        return f"Table {table_id} on PDF page {pdf_page}; no rows were extracted."
    headers = [cell.strip() for cell in rows[0].strip("|").split("|") if cell.strip()]
    row_count = max(0, len(rows) - 2)
    topic = CAPTION_RE.sub("", clean_text(caption), count=1).strip(" .:–—-")
    subject = topic or f"Data from PDF page {pdf_page}"
    columns = ", ".join(headers) if headers else "unlabeled columns"
    return f"{subject}. The table contains {row_count} data rows with columns for {columns}."


def _direct_blocks(node: Node) -> list[Node]:
    blocks: list[Node] = []
    for child in node.children:
        if not isinstance(child, Node):
            continue
        if child.tag in {"ul", "ol"}:
            blocks.extend(_descendants(child, "li"))
        elif child.tag in BLOCK_TAGS:
            if child.tag == "div" and "page-content" not in child.attrs.get("class", "").split():
                blocks.extend(_direct_blocks(child))
            else:
                blocks.append(child)
        else:
            blocks.extend(_direct_blocks(child))
    return blocks


def _image_filename(node: Node) -> str:
    raw = unquote(urlparse(node.attrs.get("src", "")).path)
    return raw.rsplit("/", 1)[-1]


def _make_segment(index: int, kind: str, pdf_page: int, text: str, **extra: Any) -> dict[str, Any]:
    segment: dict[str, Any] = {
        "id": f"sp413-s{index:05d}",
        "index": index,
        "type": kind,
        "pdf_page": pdf_page,
        "printed_page": pdf_page - 17 if pdf_page >= 18 else None,
        "source_url": NTRS_PDF_PAGE.format(pdf_page),
        "text": clean_text(text),
    }
    segment.update(extra)
    segment["search_text"] = clean_text(" ".join(
        part for part in [segment.get("text", ""), segment.get("caption", ""),
                          segment.get("table_markdown", "")] if part
    ))
    return segment


def parse_page_html(
    page_html: str,
    pdf_page: int,
    index_start: int = 1,
    image_descriptions: dict[str, str] | None = None,
    table_descriptions: dict[str, str] | None = None,
) -> tuple[list[dict[str, Any]], int]:
    """Extract ordered heading, sentence, image, and table segments from one page."""
    images = image_descriptions or {}
    tables = table_descriptions or {}
    parser = _TreeBuilder()
    parser.feed(page_html)
    content = _find_content(parser.root)
    page_has_image = bool(_descendants(content, "img"))
    segments: list[dict[str, Any]] = []
    next_index = index_start
    pending_images: list[dict[str, Any]] = []
    pending_table_caption = ""
    table_number = 0
    block_number = 0

    def add(kind: str, text: str, **extra: Any) -> dict[str, Any]:
        nonlocal next_index
        segment = _make_segment(next_index, kind, pdf_page, text, **extra)
        segments.append(segment)
        next_index += 1
        return segment

    def add_image(node: Node) -> None:
        filename = _image_filename(node)
        if filename in OMITTED_IMAGE_FILENAMES:
            return
        replacement_heading = RASTER_TEXT_REPLACEMENTS.get(filename)
        if replacement_heading:
            pending_images.clear()
            add("heading", replacement_heading, level=4)
            return
        description = clean_text(images.get(filename, ""))
        if not description:
            raise ValueError(f"Missing reviewed description for image {filename!r} on PDF page {pdf_page}")
        relative_path = unquote(urlparse(node.attrs.get("src", "")).path).lstrip("/")
        segment = add("image", description, image_path=relative_path, description=description, caption="")
        pending_images.append(segment)

    for block in _direct_blocks(content):
        block_number += 1
        paragraph_id = f"p{pdf_page:04d}-b{block_number:03d}"
        if "empty-page" in block.attrs.get("class", "").split():
            continue
        if block.tag == "hr":
            continue
        if block.tag in HEADING_TAGS:
            pending_images.clear()
            pending_table_caption = ""
            title = clean_text(_raw_text(block))
            if title:
                anchor = "appendix-b" if title.upper().startswith("APPENDIX B") else None
                extras = {"anchor": anchor} if anchor else {}
                add("heading", title, level=int(block.tag[1]), **extras)
            continue
        if block.tag == "img":
            add_image(block)
            continue
        if block.tag == "table":
            table_number += 1
            table_id = f"p{pdf_page:04d}-t{table_number:02d}"
            description = clean_text(tables.get(table_id, "")) or _table_description(
                table_id, block, pending_table_caption, pdf_page
            )
            markdown = _table_markdown(block)
            if markdown:
                add("table", description, table_id=table_id, description=description,
                    caption=pending_table_caption, table_markdown=markdown)
            pending_table_caption = ""
            pending_images.clear()
            continue

        images_in_block = _descendants(block, "img")
        block_text = _raw_text(block)
        if images_in_block:
            for image in images_in_block:
                add_image(image)
        if _visual_ocr_noise(block_text, page_has_image):
            continue
        text = clean_text(block_text)
        if not text:
            continue
        if pdf_page == 1 and "NASA-SP-413" in text.upper() and "SPACE SETTLEMENTS" in text.upper():
            continue
        if pdf_page == 4 and text.casefold() == "nasa sp-413":
            continue

        if CAPTION_RE.match(text):
            if pending_images:
                figure_anchor = _figure_anchor(text)
                for image_index, image_segment in enumerate(pending_images):
                    image_segment["caption"] = text
                    if image_index == 0 and figure_anchor:
                        image_segment["anchor"] = figure_anchor
                    image_segment["search_text"] = clean_text(
                        " ".join([image_segment["description"], text])
                    )
                pending_images.clear()
                continue
            if text.lower().startswith("table "):
                pending_table_caption = text
                continue

        pending_images.clear()
        if block.tag == "li":
            add("text", text, line=True, paragraph_id=paragraph_id)
        elif block.tag == "pre":
            add("text", text, line=True, paragraph_id=paragraph_id)
        else:
            figure_anchor = _figure_anchor(text)
            for sentence_index, sentence in enumerate(split_sentences(text)):
                extras = {"anchor": figure_anchor} if sentence_index == 0 and figure_anchor else {}
                add("text", sentence, paragraph_id=paragraph_id, **extras)

    return segments, next_index
