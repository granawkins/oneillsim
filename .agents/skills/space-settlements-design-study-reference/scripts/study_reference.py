#!/usr/bin/env python3
"""Read-only study lookup using the existing search API and local manifest."""
import argparse
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[4]
DEFAULT_BASE = 'http://127.0.0.1:3200/oneillsim'


def load_manifest(path):
    document = json.loads(Path(path).read_text())
    segments = document['segments']
    if not isinstance(segments, list) or any(not isinstance(s, dict) or 'id' not in s for s in segments):
        raise ValueError('Invalid study segment manifest')
    return document, segments


def search_api(base_url, query, mode, limit):
    modes = {'keyword': ['bm25'], 'semantic': ['semantic'], 'both': ['bm25', 'semantic']}[mode]
    request = urllib.request.Request(base_url.rstrip('/') + '/api/study/search',
        data=json.dumps({'query': query, 'modes': modes, 'limit': limit}).encode(),
        headers={'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def ranked_hits(payload, limit):
    hits = {}
    for mode in ['bm25', 'semantic']:
        for rank, segment in enumerate(payload.get(mode, []), 1):
            entry = hits.setdefault(segment['id'], {'id': segment['id'], 'mode_ranks': {}, 'rrf_score': 0})
            if mode not in entry['mode_ranks']:
                entry['mode_ranks'][mode] = rank
                entry['rrf_score'] += 1 / (60 + rank)
    return sorted(hits.values(), key=lambda hit: (-hit['rrf_score'], hit['id']))[:limit]


def present(segment, base_url):
    fields = ['id', 'index', 'type', 'pdf_page', 'printed_page', 'heading_context', 'text', 'caption',
        'description', 'table_markdown', 'table_html', 'source_url', 'image_path', 'image_url', 'src']
    result = {key: segment[key] for key in fields if key in segment}
    reader_base = 'https://stanfordtorus.com' if urllib.parse.urlparse(base_url).hostname in {'localhost', '127.0.0.1'} else base_url.rstrip('/')
    result['reader_url'] = reader_base + '/study/#' + segment['id']
    if segment.get('image_path'):
        result['image_url'] = reader_base + '/study/' + segment['image_path'].lstrip('/')
        result['image_file'] = str(ROOT / 'study' / segment['image_path'])
    return result


def expand(segments, position, context, base_url):
    return [present(s, base_url) for s in segments[max(0, position-context):position+context+1]]


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default=os.environ.get('ONEILLSIM_STUDY_URL', DEFAULT_BASE))
    parser.add_argument('--manifest', type=Path, default=ROOT / 'study' / 'segments.json')
    commands = parser.add_subparsers(dest='command', required=True)
    search = commands.add_parser('search', help='Hybrid ranked search; returns full source segments')
    search.add_argument('query')
    search.add_argument('--mode', choices=['keyword', 'semantic', 'both'], default='both')
    search.add_argument('--limit', type=int, choices=range(1,13), default=6)
    search.add_argument('--context', type=int, choices=range(0,6), default=1)
    segment = commands.add_parser('segment', help='Read an exact source ID plus adjacent context')
    segment.add_argument('id')
    segment.add_argument('--context', type=int, choices=range(0,11), default=2)
    page = commands.add_parser('page', help='Read all segments for a PDF or printed report page')
    page.add_argument('number')
    page.add_argument('--printed', action='store_true')
    return parser


def run(args):
    document, segments = load_manifest(args.manifest)
    positions = {segment['id']: i for i, segment in enumerate(segments)}
    if args.command == 'search':
        payload = search_api(args.base_url, args.query, args.mode, args.limit)
        hits = ranked_hits(payload, args.limit)
        missing = [hit['id'] for hit in hits if hit['id'] not in positions]
        if missing:
            raise ValueError('Search API and local manifest disagree: ' + ', '.join(missing))
        return {'query': args.query, 'mode': args.mode, 'semantic_available': payload.get('semantic_available', False),
            'result_count': len(hits), 'results': [{**hit,
                'segment': present(segments[positions[hit['id']]], args.base_url),
                'context': expand(segments, positions[hit['id']], args.context, args.base_url)} for hit in hits]}
    if args.command == 'segment':
        if args.id not in positions:
            raise ValueError('Unknown segment ID: ' + args.id)
        return {'segment': present(segments[positions[args.id]], args.base_url),
            'context': expand(segments, positions[args.id], args.context, args.base_url)}
    field = 'printed_page' if args.printed else 'pdf_page'
    matches = [present(s, args.base_url) for s in segments if str(s.get(field)) == args.number]
    if not matches:
        raise ValueError(f'No source segments for {field}={args.number}')
    return {'page_kind': field, 'page': args.number, 'segment_count': len(matches), 'segments': matches}


def main(argv=None):
    args = build_parser().parse_args(argv)
    try:
        print(json.dumps(run(args), ensure_ascii=False, indent=2))
    except (OSError, ValueError, KeyError, urllib.error.URLError) as error:
        print(f'Study lookup failed: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
