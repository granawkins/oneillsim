# NASA SP-413 HTML reading edition

The public reading edition is served at `/study/`. Its Next.js route is `app/study/page.jsx`; the React shell mounts the shared continuous-reader controller in `study/study.js` and loads ordered `study/segments.json`. The extraction pipeline also keeps a standalone HTML shell for compatibility and testing. The roughly 90 MB source PDF is not committed or stored under the app's public root; on the production host it is kept at `~/.local/share/oneillsim/study-source/nasa-sp-413-space-settlements-a-design-study.pdf`. Set `STUDY_SOURCE_PDF` to a private local copy before a full rebuild. Paragraphs, headings, figures, and tables retain PDF-page citations in the source data; the reader does not display those links. Generated figure images live in `study/images/`, which is intentionally ignored by Git to keep derived images out of history. The segment manifest still references those paths, so a fresh checkout needs a local rebuild from the private PDF or a separate copy of the directory before figure images appear. Keyword search uses local SQLite FTS5/BM25; semantic vectors live in a private SQLite database outside the public directory, and query embeddings are requested server-side.

## Reader presentation

The page has a title, a sticky sidebar with search above a collapsible chapter/section outline and a NASA source link, and a continuous reading column. `study/reader-layout.json` records reviewed heading levels, source-page reading order, paragraph joins, figure dimensions, captions, and bibliography membership. Segments remain independently addressable, while their sentences render as paragraphs; small figures float beside prose on desktop and stack on mobile. The participant roster, duplicate contents/imprint pages, blank-page notices, and page-number artifacts are omitted from the presentation.

Chapter bibliographies are collapsed, not discarded. Inline references resolve within their chapter (or an explicitly named chapter); clicking a reference expands the bibliography, scrolls to the numbered entry, and briefly highlights it. All source IDs are retained for search and existing links.

Typing switches to search immediately; after a 350 ms debounce, `?q=` is pushed into browser history and keyword/semantic matches appear in one deduplicated list. Selecting a match removes the query and opens its segment anchor, including collapsed references. Back/Forward restores the search, reading position, outline scroll, and disclosure state.

## Reviewed transcription data

`study/ocr-corrections.json` contains exact, auditable before/after prose repairs. A chapter-by-chapter review was supported by fresh, column-separated Tesseract comparisons on representative scans; the original extraction mostly reused the PDF's existing OCR layer. Corrections preserve scientific notation rather than guessing at damaged formulas.

`study/table-transcriptions.json` stores visual transcriptions of all 84 extracted table segments plus restored animal-feeding and aluminum-production power tables missed by the extractor, with source PDF page numbers, full column labels/units, footnotes, and explicit uncertainty notes. This includes contents and formula-like tables detected by the extractor. Printed blanks, dashes, zeroes, inequalities, and exponents have distinct meanings and must be preserved. Source inconsistencies are annotated rather than silently repaired. These are human-readable transcriptions, not a normalized simulation input schema; review source discrepancies before deriving model parameters.

To reapply the reviewed data and refresh the local keyword index:

```sh
python3 scripts/repair-study.py
```

The script validates IDs and exact prose patches, applies the authoritative table transcriptions, rebuilds SQLite FTS in a transaction, and writes `segments.json`. It is idempotent. It preserves the existing semantic vectors; embeddings are **not** recomputed by this repair command. Run the full search-index builder with a configured embedding key to regenerate vectors. Keep a database/manifest backup before editing. A new PDF extraction may change segment IDs and requires reconciling the correction and layout manifests before applying them.

Search results preview the corrected manifest content: sentences, figure thumbnails, and up to six matching table rows per panel (or the first six for semantic-only matches). Table units, matching notes, and captions remain visible; selecting a preview opens the complete source segment. The compact search API supplies ranked IDs; the browser uses its already-loaded manifest for full previews.

The reader requests up to 12 BM25 and 12 semantic matches, displays keyword matches first, deduplicates IDs, and excludes reader-hidden artifacts. Semantic ranking uses cosine similarity with a floor of zero, not a calibrated relevance threshold. Query embeddings require `OPENROUTER_API_KEY` in the running server's environment; stored document vectors alone do not enable semantic queries. The reader explicitly reports keyword-only results when `semantic_available` is false, including when credentials are absent or an embedding request fails.

The cover and inside-cover artwork are presentation images from PDF pages 1–2, outside the search segment manifest. They live in the ignored `study/images/` directory alongside the extracted figures. Copy `sp413-cover.jpg` and `sp413-frontispiece.jpg` when deploying, or regenerate them with Poppler installed:

```sh
python3 assets/scripts/build_study_html.py --front-matter-only
```

## Rebuild

Use Python 3.10 or newer. From the project root:

```sh
python3 -m venv .venv-study
.venv-study/bin/python -m pip install -r assets/scripts/study-requirements.txt
.venv-study/bin/python assets/scripts/build_study_html.py
```

A full build also uses Poppler (`pdftoppm`) for the two opening scans. The PDF build can take several minutes because the source is a scanned, OCR-layer PDF. It uses `pymupdf4llm` for page/layout/table extraction, Python-Markdown for table-aware HTML, Bleach to sanitize converted markup, and Pillow to optimize extracted images. The finalization step creates the continuous `index.html` shell and cited `segments.json`, omitting blank scans and the three identified text-artifact images. The Next.js reader loads the generated data and figures; these Python packages are not runtime dependencies.

Build the private BM25/semantic index after generating the segments:

```sh
node assets/scripts/build_study_search.mjs
```

The index builder reads `OPENROUTER_API_KEY` from the process environment or the shared `/home/granawkins/.env`, then writes SQLite data to `/home/granawkins/.local/share/oneillsim/study-search.sqlite3` (mode 600, outside the public tree). Do not put the key or database in the repository or static `study/` directory.

If only the chapter links need updating, run:

```sh
.venv-study/bin/python assets/scripts/build_study_html.py --navigation-only
```

`--navigation-only` rebuilds the standalone HTML shell from the existing `segments.json` metadata (the Next React shell lives in `app/study/reader.jsx`); it does not re-extract the PDF or regenerate search vectors. The builder writes `study/index.html`, `study/segments.json`, and described figure images under `study/images/`. The responsive stylesheet and reader/search script live in `study/study.css` and `study/study.js`.

## Rights and fidelity

NASA NTRS lists the report as publicly distributed and warns that portions may include copyright-protected material. The builder omits extracted images from pages with explicit source, courtesy, or copyright credits; it retains page text/captions and links to the original NASA-hosted scan. Remaining figures are not individually rights-cleared by this filter, and their inclusion here is not permission to reuse them. Do not add omitted third-party artwork to the public site without checking its credit and reuse rights.

The HTML is a reading edition, not a facsimile. Tables have been visually reviewed, but the printed report itself includes inconsistencies. Transcription notes identify unresolved cells or source discrepancies. Equations and numerical claims outside tables have not received the same exhaustive cell-by-cell verification; check these against the scan before using them as simulation inputs.

## Current coverage

The generated reader contains 204 ordered PDF pages, 4,329 cited segments, 86 reviewed HTML tables, and 106 described figure images. Blank scan pages, a garbled cover OCR line, two blank image fragments, and one rasterized subheading image are excluded from the prose/image stream; the subheading is restored as text. Figure 4-8's credited image is intentionally omitted. The asset gallery still links to Figures 5-5, 5-6, and 5-7 and Appendix B, "Structural System for Housing," with preview images for the three housing figures.
