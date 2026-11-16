// Sandline Protocol — the entry program (Node 22, standard library only). It hands
// the game in: copies this repository's game/ and screenshots/ beside it to the
// output directory and writes dossier.json with the kit's vendored library, the
// summary the judge reads. The run is deterministic: the same files in, the same
// bytes out, twice in a row.
//
// Local check:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play locally: node serve.ts, then open http://localhost:8080

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The gate's caps, from the kit's reference/gate.json: the dossier text cap shapes
// the bytes; the rest refuse an entry the scorer would refuse.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);
