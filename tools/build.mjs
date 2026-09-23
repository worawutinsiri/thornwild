// Bundles index.html + css + js into one self-contained file (dist/thornwild.html).
// Usage: node tools/build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

const html = read('index.html');
const head = html.match(/<!-- BUILD:HEAD START -->([\s\S]*?)<!-- BUILD:HEAD END -->/)[1];
const body = html.match(/<!-- BUILD:BODY START -->([\s\S]*?)<!-- BUILD:BODY END -->/)[1];

let out = '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n';
out += head.replace(/<link rel="stylesheet" href="css\/style\.css">/, () => '<style>\n' + read('css/style.css') + '\n</style>');
out += body.replace(/<script src="(js\/[^"]+)"><\/script>/g, (_, p) => '<script>\n' + read(p) + '\n</script>');

mkdirSync(new URL('dist/', root), { recursive: true });
writeFileSync(new URL('dist/thornwild.html', root), out);
console.log('dist/thornwild.html', (out.length / 1024).toFixed(0) + ' KB');
