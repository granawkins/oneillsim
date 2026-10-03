"""Fidelity regressions for visually checked numerical data and repair synchronization."""
import copy
import importlib.util
import json
import re
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('repair_study', ROOT / 'scripts/repair-study.py')
repair = importlib.util.module_from_spec(spec)
spec.loader.exec_module(repair)


class StudyTranscriptionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.payload = json.loads((ROOT / 'study/segments.json').read_text())
        cls.tables = json.loads((ROOT / 'study/table-transcriptions.json').read_text())['tables']
        cls.by_id = {s['id']: s for s in cls.payload['segments']}

    def rows(self, id):
        lines = self.by_id[id]['table_markdown'].splitlines()
        return [[v.strip() for v in re.split(r'(?<!\\)\|', line.strip().strip('|'))] for line in lines if line.startswith('|')]

    def test_every_table_has_source_review_and_rectangular_cells(self):
        ids = [t['id'] for t in self.tables]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(set(ids), {s['id'] for s in self.payload['segments'] if s['type'] == 'table'})
        for table in self.tables:
            with self.subTest(id=table['id']):
                segment = self.by_id[table['id']]
                self.assertIn(segment['pdf_page'], table['verified_pdf_pages'])
                for panel in re.split(r'\n\s*\n', table['table_markdown']):
                    rows = [[v.strip() for v in re.split(r'(?<!\\)\|', line.strip().strip('|'))] for line in panel.splitlines() if line.startswith('|')]
                    self.assertGreaterEqual(len(rows), 3)
                    self.assertTrue(all(len(row) == len(rows[0]) for row in rows))
                self.assertEqual(segment['table_notes'], table['notes'])
                self.assertEqual(segment['table_uncertainties'], table['uncertain_cells'])
                self.assertEqual(segment['table_markdown'], table['table_markdown'])

    def test_atmosphere_keeps_partial_pressures_and_inequalities(self):
        rows = self.rows('sp413-s01355')
        self.assertIn('kPa', ' '.join(rows[0]))
        self.assertIn('mmHg', ' '.join(rows[0]))
        self.assertIn(['O₂', '22.7', '170'], rows)
        self.assertIn(['N₂', '26.6', '200'], rows)
        self.assertIn(['CO₂', '<0.4', '<3'], rows)
        self.assertIn(['Total pressure', '50.8', '380'], rows)
        self.assertIn(['Water vapor', '1.0', '7.5'], rows)

    def test_crop_area_is_per_person_and_dry_weight_note_survives(self):
        rows = self.rows('sp413-s02395')
        self.assertIn('m²/person', rows[0][-1])
        self.assertIn(['Soybeans', '470', '20', '23.5'], rows)
        self.assertIn(['Sorghum', '317', '83', '3.8'], rows)
        self.assertIn('dry weights', ' '.join(self.by_id['sp413-s02395']['table_notes']))
        self.assertIn(['Total', '', '', '5.1'], self.rows('sp413-s02393'))

    def test_source_discrepancies_are_preserved_and_annotated(self):
        self.assertIn(['CO₂', '235,082', '1347', '', '3,642', ''], self.rows('sp413-s02858'))
        self.assertIn('do not balance', ' '.join(self.by_id['sp413-s02858']['table_notes']))

    def test_repairs_are_idempotent_and_reject_unmatched_prose(self):
        payload = copy.deepcopy(self.payload)
        corrections = json.loads((ROOT / 'study/ocr-corrections.json').read_text())['patches']
        repair.apply_corrections(payload, corrections, self.tables)
        once = copy.deepcopy(payload)
        repair.apply_corrections(payload, corrections, self.tables)
        self.assertEqual(payload, once)
        self.assertEqual(payload, self.payload)
        with self.assertRaises(ValueError):
            repair.apply_corrections(payload, [{'id': payload['segments'][0]['id'], 'field': 'text', 'before': 'never matched', 'after': 'wrong'}])

    def test_database_update_refreshes_fts_without_changing_vectors(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'study.sqlite3'
            db = sqlite3.connect(path)
            db.executescript('''CREATE TABLE study_segments(id TEXT PRIMARY KEY, heading_context TEXT, type TEXT, text TEXT, caption TEXT, description TEXT, table_markdown TEXT);
                CREATE VIRTUAL TABLE study_fts USING fts5(segment_id UNINDEXED, heading, text, caption, description, table_markdown);
                CREATE TABLE study_vectors(id TEXT PRIMARY KEY, vector BLOB);''')
            segment = self.by_id['sp413-s02395']
            db.execute('INSERT INTO study_segments(id,text) VALUES(?,?)', (segment['id'], 'old incorrect data'))
            db.execute('INSERT INTO study_vectors VALUES(?,?)', (segment['id'], b'unchanged embedding'))
            db.commit()
            repair.sync_database({'segments': [segment]}, path)
            self.assertEqual(db.execute("SELECT segment_id FROM study_fts WHERE study_fts MATCH 'Soybeans'").fetchone()[0], segment['id'])
            self.assertIn('23.5', db.execute('SELECT table_markdown FROM study_segments').fetchone()[0])
            self.assertEqual(db.execute('SELECT vector FROM study_vectors').fetchone()[0], b'unchanged embedding')
            with self.assertRaises(ValueError):
                repair.sync_database({'segments': []}, path)
            self.assertEqual(db.execute('SELECT count(*) FROM study_fts').fetchone()[0], 1)
            db.close()


if __name__ == '__main__':
    unittest.main()
