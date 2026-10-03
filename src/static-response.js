import { createHash } from 'node:crypto';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';

const gzipAsync = promisify(gzip);
const TEXT_EXTENSIONS = new Set(['.html', '.css', '.js', '.json', '.obj', '.mtl', '.svg']);

export function acceptsGzip(header = '') {
  const preferences = new Map(String(header).toLowerCase().split(',').map((part) => {
    const [name, ...parameters] = part.trim().split(';');
    const quality = parameters.find((parameter) => parameter.trim().startsWith('q='));
    return [name, quality ? Number(quality.trim().slice(2)) : 1];
  }));
  return (preferences.get('gzip') ?? preferences.get('*') ?? 0) > 0;
}

export function cachePolicy(path) {
  if (path === 'world.json') return 'no-store';
  if (/^assets\/skybox\/skybox_[a-z]+\.1024\.[a-f0-9]{12}\.webp$/.test(path)) {
    return 'public, max-age=31536000, immutable';
  }
  // Unversioned URLs must revalidate, so future edits appear immediately.
  return 'public, max-age=0, must-revalidate';
}

export async function prepareStaticResponse({ path, extension, contents, contentType, requestHeaders = {} }) {
  const compress = TEXT_EXTENSIONS.has(extension) && contents.length >= 1024 && acceptsGzip(requestHeaders['accept-encoding']);
  const body = compress ? await gzipAsync(contents, { level: 6 }) : contents;
  const etag = `"${createHash('sha256').update(body).digest('hex')}"`;
  const headers = {
    'Cache-Control': cachePolicy(path),
    'Content-Type': contentType,
    'Content-Length': body.length,
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Accept-Encoding',
    'ETag': etag,
  };
  if (compress) headers['Content-Encoding'] = 'gzip';
  const matches = String(requestHeaders['if-none-match'] || '').split(',').some((value) => {
    const candidate = value.trim().replace(/^W\//, '');
    return candidate === '*' || candidate === etag;
  });
  if (path !== 'world.json' && matches) {
    delete headers['Content-Length'];
    return { status: 304, headers, body: undefined };
  }
  return { status: 200, headers, body };
}
