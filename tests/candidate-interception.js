import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Only candidate src responses are replaced. Everything else is still the real
// existing loopback service; there is no QA server and no production write.
export const candidateSourceFiles = [
    'src/main.js', 'src/scene.js', 'src/terraces.js', 'src/editor/placement.js',
    'src/controls/index.js', 'src/controls/state.js', 'src/controls/input.js', 'src/controls/constants.js',
    'src/controls/modes/human.js', 'src/physics/collider-world.js',
    'src/physics/character-controller.js'
];
export async function interceptCandidate(page, { enabled = true } = {}) {
    const writes = [];
    if (!enabled) return { writes };
    const root = fileURLToPath(new URL('../', import.meta.url));
    const bodies = new Map(await Promise.all(candidateSourceFiles.map(async name => [name, await fs.readFile(path.join(root, name), 'utf8')])));
    await page.route('**/*', async route => {
        const request = route.request();
        if (!['GET', 'HEAD'].includes(request.method())) {
            writes.push(`${request.method()} ${request.url()}`);
            await route.abort('blockedbyclient'); return;
        }
        const pathname = new URL(request.url()).pathname;
        const name = pathname.replace(/^\/oneillsim\//, '');
        if (bodies.has(name)) await route.fulfill({ status: 200, contentType: 'application/javascript', body: bodies.get(name) });
        else await route.fallback();
    });
    return { writes };
}
