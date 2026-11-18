import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
await rm(dist, { recursive: true, force: true });
await mkdir(dist);
await writeFile(new URL('index.html', dist), await readFile(new URL('index.html', root)));
await writeFile(new URL('_routes.json', dist), JSON.stringify({
  version: 1,
  include: ['/*'],
  exclude: [],
}));
