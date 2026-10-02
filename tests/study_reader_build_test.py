import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "assets/scripts"))

from build_study_segments import build_reading_edition, finalize_existing_page_html, rebuild_reader_shell  # noqa: E402


class StudyReaderBuildTests(unittest.TestCase):
    def test_builds_one_continuous_reader_with_cited_segments_from_page_html(self):
        source = '''
        <article class="report-page" id="pdf-018" data-pdf-page="18">
          <div class="page-content">
            <h2>Chapter 1 — The Colonization of Space</h2>
            <p>The habitat is a wheel. It rotates to create pseudogravity.</p>
            <p><img src="images/sp413-p0019-00.jpg" alt=""></p>
            <p>Figure 1-1.— A ring-shaped habitat.</p>
            <p>Table 1-1.— Habitable surface.</p>
            <table><thead><tr><th>Use</th><th>Area</th></tr></thead>
              <tbody><tr><td>Housing</td><td>43 ha</td></tr></tbody></table>
          </div>
        </article>'''
        with tempfile.TemporaryDirectory() as temporary:
            output_dir = Path(temporary)
            result = build_reading_edition(
                source,
                output_dir,
                image_descriptions={
                    "sp413-p0019-00.jpg": "Perspective drawing of a ring habitat and central hub.",
                },
                source_pdf_pages=204,
            )
            data = json.loads((output_dir / "segments.json").read_text(encoding="utf-8"))
            page = (output_dir / "index.html").read_text(encoding="utf-8")

        self.assertEqual(result["segment_count"], len(data["segments"]))
        self.assertEqual(result["pdf_pages"], 204)
        self.assertEqual(result["image_count"], 1)
        self.assertEqual(result["table_count"], 1)
        self.assertEqual(len([s for s in data["segments"] if s["type"] == "table"]), 1)
        self.assertIn("id=\"study-article\"", page)
        self.assertIn("id=\"chapter-menu-toggle\"", page)
        self.assertIn("id=\"search-results\"", page)
        self.assertNotIn("class=\"report-page\"", page)
        self.assertEqual(data["segments"][0]["pdf_page"], 18)
        self.assertTrue(data["segments"][0]["source_url"].endswith("#page=18"))
        first_paragraph = next(segment for segment in data["segments"] if segment["type"] == "text")
        self.assertIn("Chapter 1 — The Colonization of Space", first_paragraph["heading_context"])
        self.assertIn("Chapter 1 — The Colonization of Space", first_paragraph["search_text"])


    def test_finalize_existing_page_html_transforms_the_converter_output(self):
        source = '''
        <article class="report-page" id="pdf-018" data-pdf-page="18">
          <div class="page-content"><h2>Chapter 1 — The Colonization of Space</h2>
          <p>The habitat rotates to provide gravity.</p></div>
        </article>'''
        with tempfile.TemporaryDirectory() as temporary:
            output_dir = Path(temporary)
            (output_dir / "index.html").write_text(source, encoding="utf-8")
            result = finalize_existing_page_html(output_dir, image_descriptions={}, source_pdf_pages=204)
            data = json.loads((output_dir / "segments.json").read_text(encoding="utf-8"))
            page = (output_dir / "index.html").read_text(encoding="utf-8")
        self.assertEqual(result["pdf_pages"], 204)
        self.assertEqual(len(data["segments"]), result["segment_count"])
        self.assertIn("id=\"study-article\"", page)
        self.assertTrue(data["segments"][0]["source_url"].endswith("#page=18"))


    def test_navigation_only_rebuilds_shell_from_segment_metadata(self):
        source = '''
        <article class="report-page" id="pdf-018" data-pdf-page="18">
          <div class="page-content"><h2>Chapter 1</h2><p>Habitat planning.</p></div>
        </article>'''
        with tempfile.TemporaryDirectory() as temporary:
            output_dir = Path(temporary)
            build_reading_edition(source, output_dir, image_descriptions={}, source_pdf_pages=204)
            index_path = output_dir / "index.html"
            index_path.write_text("stale shell", encoding="utf-8")
            result = rebuild_reader_shell(output_dir)
            page = index_path.read_text(encoding="utf-8")
        self.assertEqual(result, index_path)
        self.assertIn("id=\"chapter-navigation\"", page)
        self.assertIn("204 PDF pages", page)
        self.assertIn("href=\"#pdf-104\"", page)


    def test_blank_scan_placeholder_is_not_indexed_as_report_text(self):
        source = '''
        <article class="report-page" id="pdf-002" data-pdf-page="2">
          <div class="page-content">
            <p class="empty-page">No selectable text was extracted from this page.</p>
          </div>
        </article>'''
        with tempfile.TemporaryDirectory() as temporary:
            output_dir = Path(temporary)
            result = build_reading_edition(source, output_dir, image_descriptions={})
            data = json.loads((output_dir / "segments.json").read_text(encoding="utf-8"))
        self.assertEqual(result["segment_count"], 0)
        self.assertEqual(data["segments"], [])


    def test_build_removes_excluded_scan_artifacts_and_keeps_rasterized_heading_as_text(self):
        source = '''
        <article class="report-page" id="pdf-026" data-pdf-page="26">
          <div class="page-content">
            <p><img src="images/sp413-p0026-13.jpg"></p>
            <p><img src="images/sp413-p0027-09.jpg"></p>
            <p><img src="images/sp413-p0038-09.jpg"></p>
          </div>
        </article>'''
        omitted = ["sp413-p0026-13.jpg", "sp413-p0027-09.jpg", "sp413-p0038-09.jpg"]
        with tempfile.TemporaryDirectory() as temporary:
            output_dir = Path(temporary)
            image_dir = output_dir / "images"
            image_dir.mkdir()
            for filename in omitted:
                (image_dir / filename).write_bytes(b"generated fixture image")
            result = build_reading_edition(source, output_dir, image_descriptions={})
            data = json.loads((output_dir / "segments.json").read_text(encoding="utf-8"))
            remaining = [filename for filename in omitted if (image_dir / filename).exists()]
        self.assertEqual(result["image_count"], 0)
        self.assertEqual(remaining, [])
        self.assertTrue(any("Solar radiation: an abundant, essential source of energy" in segment["text"] for segment in data["segments"]))


if __name__ == "__main__":
    unittest.main()
