---
name: space-settlements-design-study-reference
description: Use when researching NASA SP-413 design requirements.
version: 0.1.0
author: Grant (granawkins), Hermes Agent
license: MIT
platforms: [linux]
metadata:
  hermes:
    tags: [nasa-sp-413, study, reference, research, semantic-search]
    related_skills: [stanford-torus, 3d-assets]
---

# Space Settlements Design Study Reference

Use the project's reviewed NASA SP-413 reading edition as the first lookup tool for what the original study says. It is the design authority for Stanford Torus reproduction. The original scan remains the arbiter when transcription, equations, figures, or source inconsistencies matter; the website is a searchable reading edition, not a replacement engineering specification.

## When to use

Use whenever Grant asks what the study says about a topic, and before choosing historical requirements for geometry, neighborhoods, assets, agriculture, industry (including smelting), life support, or infrastructure. Do not start with model memory or generic web summaries. Use modern research separately for explicitly identified extensions.

## Storage and architecture

Relative paths refer to the project root:

- `/study/` is a Next.js route (`app/study/page.jsx`, `reader.jsx`) mounting `study/study.js` and `study/study.css`; `study/index.html` is a standalone extraction/test shell.
- `study/segments.json`: ordered, cited text/headings/tables/images and stable segment IDs; local full content for lookup.
- `study/reader-layout.json`: reviewed reading order, paragraph joins, headings, figure layout, bibliography and presentation decisions.
- `study/ocr-corrections.json`: exact audited prose corrections; `study/table-transcriptions.json`: visually reviewed tables, units, notes, uncertainties.
- `study/images/`: extracted diagrams/figures and cover images; ignored by Git, separately copied/rebuilt, not guaranteed in a fresh checkout.
- Private PDF: `~/.local/share/oneillsim/study-source/nasa-sp-413-space-settlements-a-design-study.pdf`; set `STUDY_SOURCE_PDF` for rebuilds. Never move it into public assets.
- Private index: `~/.local/share/oneillsim/study-search.sqlite3`, outside the public root; SQLite FTS5/BM25 and stored document vectors.
- `src/study-search*.js`, `src/study-embedding*.js`: search/query services and embedding cache. Server credentials stay in its environment; helpers never read or print keys.
- Extraction/build tools: `assets/scripts/build_study_html.py`, `build_study_segments.py`, `build_study_search.mjs`; reviewed repair: `scripts/repair-study.py`.
- Detailed build/transcription instructions: `docs/reference/study-html-build.md`; broad orientation notes: `docs/reference/stanford-torus-overview.md`.

## Lookup helper

Resolve `scripts/study_reference.py` relative to this skill directory. It uses stdlib Python, the local manifest, and the **existing** read-only search API; no new server route or extra database is needed.

Use `terminal` from the repository root:

```text
python .agents/skills/space-settlements-design-study-reference/scripts/study_reference.py search "smelting aluminum processing" --limit 6 --context 1
python .agents/skills/space-settlements-design-study-reference/scripts/study_reference.py search "aluminum" --mode keyword --limit 4
python .agents/skills/space-settlements-design-study-reference/scripts/study_reference.py segment sp413-s00061 --context 2
python .agents/skills/space-settlements-design-study-reference/scripts/study_reference.py page 55 --printed
python .agents/skills/space-settlements-design-study-reference/scripts/study_reference.py page 72
```

- Default search mode `both` requests BM25 + semantic, merges by reciprocal-rank fusion, deduplicates IDs, and returns up to `--limit` full segments plus adjacent context.
- Output preserves `pdf_page` and `printed_page`, heading context, table Markdown/HTML, source links, and reader anchors. `segment` and `page` work offline against the manifest.
- Default API base is `http://127.0.0.1:3200/oneillsim`; override with global `--base-url https://stanfordtorus.com` (before the subcommand) or `ONEILLSIM_STUDY_URL`. Use global `--manifest PATH` for another checkout.
- Semantic search uses the running server's `OPENROUTER_API_KEY` and may spend small embedding credits. Server caching avoids repeated exact-query requests. Check `semantic_available`; do not label keyword fallback as semantic success. Use `--mode keyword` when exact terminology suffices.

The API is `POST /api/study/search`, JSON `{"query":"...","modes":["bm25","semantic"],"limit":6}`. It returns `bm25`, `semantic`, and `semantic_available`; query max 400 characters, up to 12 results per mode. This POST is a search, not a write to the world or source corpus.

## Research procedure

1. Search precise terms and conceptual synonyms. If empty/narrow, broaden the query and try both modes. Save relevant IDs instead of repeatedly loading the complete PDF.
2. Read each candidate's full segment, surrounding context, and complete table/figure caption. Use `segment` or `page` to recover connected explanation. Do not treat top search rank as proof.
3. For dimensions, equations, allocations, or image-derived details, verify the original page/figure/table when uncertain. PDF sequence and printed pagination differ; never calculate an assumed fixed offset. Inspect private PDF pages or actual extracted figure images with appropriate tools.
4. Answer with printed report page where available, figure/table label, stable segment ID/reader link, and explicit distinction between sourced requirement and interpretation. If only PDF page metadata exists, say PDF page, not printed page. Do not guess missing citations.
5. Before using a value in code, record source value/units/location, current implementation value, and rationale for deviations. Keep uncertain source discrepancies visible.

## Maintenance and pitfalls

- Do not rebuild extraction/index just to answer a question. Full builds can change IDs, incur embedding costs, and require reconciliation of corrections/layout; back up manifest/database and scope the request first.
- `repair-study.py` reapplies reviewed prose/tables and keyword index without regenerating semantic vectors. A full index rebuild is a distinct operation; verify reader/API consistency afterward.
- Tables preserve blanks, dashes, zeroes, exponents, units, and uncertainty notes. They are transcriptions, not ready-made simulation schemas. Equations and prose numbers still require scan verification when consequential.
- Some credited artwork is deliberately omitted; missing extracted art is not permission to reintroduce third-party imagery. Consult source rights notes before publishing.
- Reader-hidden bibliographies/artifacts remain in the manifest; a search hit can be non-design material. Look at heading/type/context before relying on it.

## Verification

Run `python -m unittest discover -s tests -p 'study_reference_helper_test.py'` after helper changes. Exercise one live keyword and one live semantic search, confirm `semantic_available`, retrieve an exact ID and page, and verify source/citation fields survive. A working HTTP response alone does not establish semantic search or historical correctness.
