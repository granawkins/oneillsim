#!/usr/bin/env python3
"""Apply reviewed OCR patches, preserve IDs, and refresh the lexical SQLite index.

Usage: python3 scripts/repair-study.py [--database PATH]
Corrections are exact-match, auditable and safe to apply more than once.
Semantic vectors are preserved: these are transcription repairs, not new content.
"""
import argparse,json,sqlite3
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def apply_corrections(payload, corrections, tables=()):
    by_id={s['id']:s for s in payload['segments']}
    applied=0
    table_ids={table['id'] for table in tables}
    for fix in corrections:
        if fix['id'] in table_ids and fix['field'] in {'text','caption','description','table_markdown'}:continue
        segment=by_id[fix['id']];field=fix['field'];value=segment.get(field,'')
        if fix['before'] == value:
            segment[field]=fix['after'];applied+=1
        elif fix['after'] != value:
            raise ValueError(f"Correction no longer matches {fix['id']}: {fix['before']!r}")
    for table in tables:
        segment=by_id[table['id']]
        if segment['type']!='table' and table.get('original_type')!='text':
            raise ValueError(f"Not a reviewed table: {table['id']}")
        segment['type']='table'
        segment.setdefault('table_id', f"reviewed-{table['id']}")
        segment['table_markdown']=table['table_markdown']
        segment['caption']=table['caption']
        segment['table_notes']=table['notes']
        if table.get('table_introduction'):segment['table_introduction']=table['table_introduction']
        segment['table_uncertainties']=table['uncertain_cells']
        segment['verified_pdf_pages']=table['verified_pdf_pages']
        segment['text']=' '.join(filter(None,[table.get('table_introduction'),table['caption']]))
        segment['description']=' '.join([table['caption'],*table['notes'],*[str(v) for v in table['uncertain_cells']]])
    payload['metadata']['table_count']=sum(s['type']=='table' for s in payload['segments'])
    # Consistent search context follows the reviewed outline, not OCR font-size guesses.
    layout=json.loads((ROOT/'study/reader-layout.json').read_text())
    chapter='';heading=''
    ordered=[]
    seen_pages=set()
    for segment in payload['segments']:
        page=str(segment['pdf_page'])
        if page in layout['order']:
            if page not in seen_pages:ordered.extend(by_id[id] for id in layout['order'][page])
            seen_pages.add(page)
        else:ordered.append(segment)
    for s in ordered:
        spec=layout['headings'].get(s['id'])
        if spec:
            if spec['level']==2:chapter=spec['title'];heading=''
            else:heading=spec['title']
        s['heading_context']=' / '.join(filter(None,[chapter,heading]))
        s['search_text']=' '.join(filter(None,[s['heading_context'],s.get('text'),s.get('caption'),s.get('description'),s.get('table_markdown')]))
    return applied

def sync_database(payload, database_path):
    db=sqlite3.connect(database_path)
    try:
        ids={r[0] for r in db.execute('SELECT id FROM study_segments')}
        if ids != {s['id'] for s in payload['segments']}:raise ValueError('Database IDs do not match source segments')
        with db:
            db.execute('DELETE FROM study_fts')
            for s in payload['segments']:
                fields=[s.get(k,'') for k in ['heading_context','type','text','caption','description','table_markdown']]
                db.execute('UPDATE study_segments SET heading_context=?, type=?, text=?, caption=?, description=?, table_markdown=? WHERE id=?',[*fields,s['id']])
                db.execute('INSERT INTO study_fts(segment_id,heading,text,caption,description,table_markdown) VALUES(?,?,?,?,?,?)',[s['id'],fields[0],*fields[2:]])
        if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise ValueError('Database integrity check failed')
    finally:db.close()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database',type=Path,default=Path.home()/'.local/share/oneillsim/study-search.sqlite3')
    args=parser.parse_args()
    path=ROOT/'study/segments.json';payload=json.loads(path.read_text())
    corrections=json.loads((ROOT/'study/ocr-corrections.json').read_text())['patches']
    tables=json.loads((ROOT/'study/table-transcriptions.json').read_text())['tables']
    if len({t['id'] for t in tables})!=len(tables) or not {s['id'] for s in payload['segments'] if s['type']=='table'} <= {t['id'] for t in tables}:
        raise ValueError('Visual table review must cover every table exactly once')
    applied=apply_corrections(payload,corrections,tables)
    # Write only after all patches validate. IDs/counts and vector records stay unchanged.
    sync_database(payload,args.database)
    temporary=path.with_suffix('.json.tmp');temporary.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n');temporary.replace(path)
    print(f'Applied {applied} OCR repairs; synchronized {len(payload["segments"])} search records, including {len(tables)} visually reviewed tables.')
if __name__=='__main__':main()
