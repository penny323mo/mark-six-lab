import { readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, context } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../dist/', import.meta.url);
const template = new URL('../index.html', import.meta.url);
const serve = process.argv.includes('--serve');
const entry = 'src/app.js';

function assetUrl(path) {
  return './' + relative('dist', path).split(sep).join('/');
}

const htmlPlugin = {
  name: 'html-entry',
  setup(builder) {
    builder.onLoad({ filter: /[\\/]src[\\/]app\.js$/ }, async ({ path }) => ({
      contents: await readFile(path, 'utf8'),
      loader: 'js',
      resolveDir: dirname(path),
      watchFiles: [fileURLToPath(template)],
    }));
    builder.onEnd(async result => {
      if (result.errors.length) return;
      const [script, bundle] = Object.entries(result.metafile.outputs)
        .find(([, file]) => file.entryPoint === entry);
      const source = await readFile(template, 'utf8');
      const html = source
        .replace('</head>', `  <link rel="stylesheet" href="${assetUrl(bundle.cssBundle)}">\n</head>`)
        .replace('src="/src/app.js"', `src="${assetUrl(script)}"`);
      const licenses = await Promise.all([
        readFile(new URL('../node_modules/three/LICENSE', import.meta.url), 'utf8'),
        readFile(new URL('../node_modules/@fontsource-variable/space-grotesk/LICENSE', import.meta.url), 'utf8'),
      ]);
      await Promise.all([
        writeFile(new URL('index.html', output), html),
        writeFile(new URL('licenses.txt', output), 'Three.js\n' + licenses[0] + '\nSpace Grotesk\n' + licenses[1]),
      ]);
    });
  },
};

const options = {
  absWorkingDir: root,
  entryPoints: [entry],
  outdir: 'dist',
  bundle: true,
  format: 'esm',
  target: 'es2022',
  entryNames: 'assets/[name]-[hash]',
  assetNames: 'assets/[name]-[hash]',
  loader: { '.woff2': 'file' },
  metafile: true,
  minify: !serve,
  legalComments: 'eof',
  plugins: [htmlPlugin],
};

await rm(output, { recursive: true, force: true });
if (serve) {
  const watch = await context(options);
  await watch.watch();
  const { port } = await watch.serve({ servedir: 'dist', host: '127.0.0.1', port: 5173 });
  console.log(`Mark Six Lab · http://127.0.0.1:${port}`);
} else {
  await build(options);
}
