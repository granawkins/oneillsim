import sys
import unittest
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "assets/scripts"))

from study_segments import (  # noqa: E402
    OMITTED_IMAGE_FILENAMES,
    RASTER_TEXT_REPLACEMENTS,
    parse_page_html,
)


class StudySegmentsTests(unittest.TestCase):
    def test_converts_reading_order_into_cited_heading_sentence_image_and_table_segments(self):
        page_html = '''
        <article class="report-page" data-pdf-page="18">
          <div class="page-content">
            <h2>Chapter 1: Habitat</h2>
            <p>A short sentence. Another sentence about the habitat.</p>
            <p>For example, e.g. Mars is distant. A new sentence follows.</p>
            <p><img src="images/sp413-p0018-01.jpg" alt=""></p>
            <p>Figure 1-1.— A wheel-shaped settlement around a central hub.</p>
            <p>DIAGRAM LABEL<br>01<br>02<br>03<br>04<br>05</p>
            <table>
              <thead><tr><th>Region</th><th>Area</th></tr></thead>
              <tbody><tr><td>Habitat</td><td>23 m2</td></tr></tbody>
            </table>
          </div>
        </article>'''
        segments, next_index = parse_page_html(
            page_html,
            pdf_page=18,
            index_start=1,
            image_descriptions={
                "sp413-p0018-01.jpg": "A wheel-shaped habitat connects to a central hub.",
            },
            table_descriptions={
                "p0018-t01": "The table gives the area assigned to the habitat region.",
            },
        )

        self.assertEqual([s["type"] for s in segments], [
            "heading", "text", "text", "text", "text", "image", "table",
        ])
        self.assertEqual([s["index"] for s in segments], [1, 2, 3, 4, 5, 6, 7])
        self.assertEqual(segments[0]["text"], "Chapter 1: Habitat")
        self.assertEqual(segments[1]["text"], "A short sentence.")
        self.assertEqual(segments[2]["text"], "Another sentence about the habitat.")
        self.assertEqual(segments[3]["text"], "For example, e.g. Mars is distant.")
        self.assertEqual(segments[1]["paragraph_id"], segments[2]["paragraph_id"])
        self.assertNotEqual(segments[2]["paragraph_id"], segments[3]["paragraph_id"])
        self.assertEqual(segments[5]["pdf_page"], 18)
        self.assertEqual(segments[5]["printed_page"], 1)
        self.assertEqual(segments[5]["image_path"], "images/sp413-p0018-01.jpg")
        self.assertEqual(segments[5]["description"], "A wheel-shaped habitat connects to a central hub.")
        self.assertIn("wheel-shaped settlement", segments[5]["caption"])
        self.assertEqual(segments[5]["anchor"], "figure-1-1")
        self.assertEqual(segments[6]["table_id"], "p0018-t01")
        self.assertIn("| Region | Area |", segments[6]["table_markdown"])
        self.assertEqual(segments[6]["description"], "The table gives the area assigned to the habitat region.")
        self.assertNotIn("DIAGRAM LABEL", " ".join(s["text"] for s in segments))
        self.assertEqual(next_index, 8)

    def test_omits_blank_scan_fragments_and_recovers_a_rasterized_subheading(self):
        page_html = '''
        <div class="page-content">
          <p><img src="images/sp413-p0026-13.jpg"></p>
          <p><img src="images/sp413-p0027-09.jpg"></p>
        </div>'''
        segments, next_index = parse_page_html(page_html, pdf_page=27, index_start=1)
        self.assertEqual([segment["type"] for segment in segments], ["heading"])
        self.assertIn("Solar radiation", segments[0]["text"])
        self.assertEqual(next_index, 2)

    def test_image_description_manifest_covers_all_kept_images_referenced_by_segments(self):
        description_file = ROOT / "assets/scripts/study-image-descriptions.json"
        segment_file = ROOT / "study/segments.json"
        descriptions = json.loads(description_file.read_text(encoding="utf-8"))
        segment_data = json.loads(segment_file.read_text(encoding="utf-8"))
        excluded = set(OMITTED_IMAGE_FILENAMES) | set(RASTER_TEXT_REPLACEMENTS)
        expected = {
            Path(segment["image_path"]).name
            for segment in segment_data["segments"]
            if segment.get("type") == "image"
        } - excluded
        self.assertEqual(set(descriptions), expected)
        self.assertTrue(all(isinstance(value, str) and len(value.strip()) >= 24 for value in descriptions.values()))

    def test_table_is_one_segment_with_a_summary_and_markdown_rows(self):
        page_html = '''
        <div class="page-content">
          <p>Table 2-1.—Surface areas by use.</p>
          <table><thead><tr><th>Use</th><th>Area</th></tr></thead>
            <tbody><tr><td>Housing</td><td>43 ha</td></tr><tr><td>Agriculture</td><td>20 ha</td></tr></tbody>
          </table>
        </div>'''
        segments, next_index = parse_page_html(page_html, pdf_page=30, index_start=1)
        tables = [segment for segment in segments if segment["type"] == "table"]
        self.assertEqual(len(tables), 1)
        self.assertIn("Surface areas by use", tables[0]["description"])
        self.assertIn("Use", tables[0]["description"])
        self.assertIn("2 data rows", tables[0]["description"])
        self.assertIn("| Housing | 43 ha |", tables[0]["table_markdown"])
        self.assertEqual(len(segments), 1)
        self.assertEqual(next_index, 2)

    def test_source_figure_and_appendix_anchors_are_preserved(self):
        page_html = '''
        <div class="page-content">
          <h6>APPENDIX B — STRUCTURAL SYSTEM FOR HOUSING</h6>
          <p>Figure 4-8.— Modular construction inside the habitat.</p>
        </div>'''
        segments, _ = parse_page_html(page_html, pdf_page=67, index_start=1)
        self.assertEqual(segments[0]["anchor"], "appendix-b")
        self.assertEqual(segments[1]["anchor"], "figure-4-8")

    def test_cover_ocr_and_duplicate_report_number_are_not_report_prose(self):
        cover_html = '''<div class="page-content"><p>ol,"IM. ~'ITAl.s '01.0~ (NASA-SP-413) SPACE SETTLEMENTS: STUDY (NAS A) 191 p</p></div>'''
        cover_segments, _ = parse_page_html(cover_html, pdf_page=1, index_start=1)
        title_html = '''<div class="page-content"><p>NASA SP-413</p><h2>Space Settlements: A Design Study</h2></div>'''
        title_segments, _ = parse_page_html(title_html, pdf_page=4, index_start=1)
        self.assertEqual(cover_segments, [])
        self.assertEqual([segment["text"] for segment in title_segments], ["Space Settlements: A Design Study"])

    def test_image_without_a_reviewed_description_is_rejected(self):
        page_html = '<div class="page-content"><p><img src="images/unknown.jpg"></p></div>'
        with self.assertRaisesRegex(ValueError, "description"):
            parse_page_html(page_html, pdf_page=1, index_start=1)


if __name__ == "__main__":
    unittest.main()
