import { build, context } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';

const watch = process.argv.includes('--watch');
const outdir = 'dist';

const staticFiles = [
  ['src/manifest.json', 'manifest.json'],
  ['../design/tokens.css', 'tokens.css'],
  ['src/fonts.css', 'fonts.css'],
  ['src/warning/warning.html', 'warning/warning.html'],
  ['src/warning/warning.css', 'warning/warning.css'],
  ['src/panel/panel.html', 'panel/panel.html'],
  ['src/panel/panel.css', 'panel/panel.css'],
];

async function copyStatic() {
  for (const [from, to] of staticFiles) {
    const dest = path.join(outdir, to);
    await mkdir(path.dirname(dest), { recursive: true });
    await cp(from, dest);
  }
  await cp('src/assets/fonts', path.join(outdir, 'fonts'), { recursive: true });
}

const options = {
  entryPoints: {
    background: 'src/background.ts',
    content: 'src/content.ts',
    'warning/warning': 'src/warning/warning.ts',
    'panel/panel': 'src/panel/panel.ts',
  },
  bundle: true,
  format: 'iife',
  target: 'chrome116',
  outdir,
  sourcemap: watch ? 'inline' : false,
  logLevel: 'info',
};

await mkdir(outdir, { recursive: true });
await copyStatic();

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('Watching for changes. Reload the extension in chrome://extensions after each rebuild.');
} else {
  await build(options);
}
