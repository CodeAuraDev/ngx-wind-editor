import { rolldown } from 'rolldown';

const file = 'dist/fesm2022/codeauradev-ngx-wind-editor.mjs';

const bundle = await rolldown({
  input: file,
  platform: 'browser',
  treeshake: false,
  external: [/^@angular\//, 'tslib', 'rxjs', 'rxjs/operators'],
});

await bundle.write({
  file,
  format: 'es',
  codeSplitting: false,
});

await bundle.close();
