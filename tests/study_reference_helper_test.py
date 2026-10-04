import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / '.agents/skills/space-settlements-design-study-reference/scripts/study_reference.py'
spec = importlib.util.spec_from_file_location('study_reference', HELPER)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


class StudyReferenceHelperTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.manifest = Path(self.temp.name) / 'segments.json'
        self.segments = [
            {'id': 's1', 'index': 1, 'type': 'text', 'text': 'before', 'pdf_page': 73, 'printed_page': 56},
            {'id': 's2', 'index': 2, 'type': 'table', 'text': 'smelting', 'pdf_page': 73, 'printed_page': 56,
                'table_markdown': '| metal | mass |', 'source_url': 'https://example.test/report#page=73'},
            {'id': 's3', 'index': 3, 'type': 'image', 'text': 'diagram', 'pdf_page': 74, 'printed_page': 57,
                'image_path': 'images/test.jpg'},
        ]
        self.manifest.write_text(json.dumps({'metadata': {}, 'segments': self.segments}))

    def args(self, *argv):
        return helper.build_parser().parse_args(['--manifest', str(self.manifest), *argv])

    def test_hybrid_deduplicates_and_merges_rank_provenance(self):
        payload = {'bm25': [{'id': 's2'}, {'id': 's1'}], 'semantic': [{'id': 's3'}, {'id': 's2'}]}
        ranked = helper.ranked_hits(payload, 3)
        self.assertEqual(ranked[0]['id'], 's2')
        self.assertEqual(ranked[0]['mode_ranks'], {'bm25': 1, 'semantic': 2})
        self.assertEqual(len(ranked), 3)
        self.assertEqual(len(helper.ranked_hits(payload, 1)), 1)

    def test_search_returns_complete_tables_context_and_semantic_status(self):
        payload = {'bm25': [{'id': 's2'}], 'semantic': [], 'semantic_available': False}
        with patch.object(helper, 'search_api', return_value=payload):
            result = helper.run(self.args('search', 'smelting', '--context', '1'))
        self.assertFalse(result['semantic_available'])
        self.assertEqual(result['result_count'], 1)
        self.assertEqual(result['results'][0]['segment']['table_markdown'], '| metal | mass |')
        self.assertEqual([s['id'] for s in result['results'][0]['context']], ['s1', 's2', 's3'])

    def test_segment_and_page_are_offline_and_preserve_citations(self):
        with patch.object(helper, 'search_api', side_effect=AssertionError('offline operation called API')):
            result = helper.run(self.args('segment', 's2', '--context', '0'))
            self.assertEqual(result['segment']['printed_page'], 56)
            self.assertEqual(result['segment']['pdf_page'], 73)
            self.assertEqual(len(result['context']), 1)
            page = helper.run(self.args('page', '56', '--printed'))
            self.assertEqual(page['segment_count'], 2)
            image = helper.run(self.args('page', '74'))
            self.assertEqual(image['segments'][0]['image_path'], 'images/test.jpg')

    def test_api_posts_to_search_only_with_no_credentials(self):
        response = unittest.mock.MagicMock()
        response.__enter__.return_value.read.return_value = b'{"bm25":[],"semantic":[],"semantic_available":true}'
        with patch.object(helper.urllib.request, 'urlopen', return_value=response) as mocked:
            payload = helper.search_api('http://localhost/oneillsim/', 'smelting', 'both', 4)
        request = mocked.call_args.args[0]
        self.assertEqual(request.full_url, 'http://localhost/oneillsim/api/study/search')
        self.assertEqual(request.method, 'POST')
        self.assertEqual(json.loads(request.data)['modes'], ['bm25', 'semantic'])
        self.assertFalse(any(k.lower() == 'authorization' for k in request.headers))
        self.assertTrue(payload['semantic_available'])

    def test_unknown_ids_pages_and_manifest_mismatch_fail_loudly(self):
        with self.assertRaises(ValueError): helper.run(self.args('segment', 'missing'))
        with self.assertRaises(ValueError): helper.run(self.args('page', '999'))
        with patch.object(helper, 'search_api', return_value={'bm25': [{'id': 'missing'}]}):
            with self.assertRaises(ValueError): helper.run(self.args('search', 'smelting'))

    def test_skills_have_valid_frontmatter_and_resolving_related_skills(self):
        import yaml
        skills = ROOT / '.agents/skills'
        expected = {'stanford-torus', 'space-settlements-design-study-reference', '3d-assets'}
        self.assertTrue(expected.issubset({p.name for p in skills.iterdir() if p.is_dir()}))
        for name in expected:
            content = (skills / name / 'SKILL.md').read_text()
            self.assertTrue(content.startswith('---\n'))
            frontmatter, body = content[4:].split('\n---\n', 1)
            metadata = yaml.safe_load(frontmatter)
            self.assertEqual(metadata['name'], name)
            self.assertLessEqual(len(metadata['description']), 60)
            self.assertTrue(metadata['description'].endswith('.'))
            self.assertTrue(body.strip())
            for related in metadata['metadata']['hermes']['related_skills']:
                self.assertTrue((skills / related / 'SKILL.md').is_file())


if __name__ == '__main__':
    unittest.main()
