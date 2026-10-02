# NASA SP-413 HTML reading edition

The public reading edition is served at `/study/`. It is a static continuous-reader shell plus ordered `study/segments.json`. The roughly 90 MB source PDF is not committed or stored under the app's public root; on the production host it is kept at `~/.local/share/oneillsim/study-source/nasa-sp-413-space-settlements-a-design-study.pdf`. Set `STUDY_SOURCE_PDF` to a private local copy before a full rebuild. Paragraphs, headings, figures, and tables are cited to their PDF pages. Generated figure images live in `study/images/`, which is intentionally ignored by Git to keep derived images out of history. The segment manifest still references those paths, so a fresh checkout needs a local rebuild from the private PDF or a separate copy of the directory before figure images appear. Keyword search uses local SQLite FTS5/BM25; semantic vectors live in a private SQLite database outside the public directory, and query embeddings are requested server-side.

## Rebuild

Use Python 3.10 or newer. From the project root:

```sh
python3 -m venv .venv-study
.venv-study/bin/python -m pip install -r assets/scripts/study-requirements.txt
.venv-study/bin/python assets/scripts/build_study_html.py
```

The PDF build can take several minutes because the source is a scanned, OCR-layer PDF. It uses `pymupdf4llm` for page/layout/table extraction, Python-Markdown for table-aware HTML, Bleach to sanitize converted markup, and Pillow to optimize extracted images. The finalization step creates the continuous `index.html` shell and cited `segments.json`, omitting blank scans and the three identified text-artifact images. The web app itself only serves generated static files; these Python packages are not runtime dependencies.

Build the private BM25/semantic index after generating the segments:

```sh
node assets/scripts/build_study_search.mjs
```

The index builder reads `OPENROUTER_API_KEY` from the process environment or the shared `/home/granawkins/.env`, then writes SQLite data to `/home/granawkins/.local/share/oneillsim/study-search.sqlite3` (mode 600, outside the public tree). Do not put the key or database in the repository or static `study/` directory.

If only the chapter links need updating, run:

```sh
.venv-study/bin/python assets/scripts/build_study_html.py --navigation-only
```

`--navigation-only` rebuilds the responsive reader shell from the existing `segments.json` metadata; it does not re-extract the PDF or regenerate search vectors. The builder writes `study/index.html`, `study/segments.json`, and described figure images under `study/images/`. The responsive stylesheet and reader/search script live in `study/study.css` and `study/study.js`.

## Rights and fidelity

NASA NTRS lists the report as publicly distributed and warns that portions may include copyright-protected material. The builder omits extracted images from pages with explicit source, courtesy, or copyright credits; it retains page text/captions and links to the original NASA-hosted scan. Remaining figures are not individually rights-cleared by this filter, and their inclusion here is not permission to reuse them. Do not add omitted third-party artwork to the public site without checking its credit and reuse rights.

The HTML is a reading aid, not a facsimile or engineering authority. OCR and automatic table reconstruction can contain errors. Check important text, table values, figure captions, and dimensions against the source scan before using them in the simulation.

## Current coverage

The generated reader contains 204 ordered PDF pages, 4,329 cited segments, 84 described HTML tables, and 106 described figure images. Blank scan pages, a garbled cover OCR line, two blank image fragments, and one rasterized subheading image are excluded from the prose/image stream; the subheading is restored as text. Figure 4-8's credited image is intentionally omitted. The asset gallery still links to Figures 5-5, 5-6, and 5-7 and Appendix B, "Structural System for Housing," with preview images for the three housing figures.
