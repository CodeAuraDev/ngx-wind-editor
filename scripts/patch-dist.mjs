import { readFileSync, writeFileSync } from 'node:fs';

const file = 'dist/package.json';
const pkg = JSON.parse(readFileSync(file, 'utf8'));
delete pkg.main;
delete pkg.types;
delete pkg.dependencies?.yjs;
pkg.exports = {
  ...pkg.exports,
  './styles.css': './ngx-wind-editor.css',
};
writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');

const typesFile = 'dist/types/codeauradev-ngx-wind-editor.d.ts';
let types = readFileSync(typesFile, 'utf8').replace(/^import \* as Y from ["']yjs["'];\r?\n/, '');
const yGeneric = /Y\.(?:UndoManager|Doc|Text|Map|Array)<[^<>]*>/g;
let previous = '';
while (previous !== types) {
  previous = types;
  types = types.replace(yGeneric, 'unknown');
}
types = types.replace(/Y\.(?:UndoManager|Doc|Text|Map|Array)\b/g, 'unknown');
writeFileSync(typesFile, types);

