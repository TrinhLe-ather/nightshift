import { unlink } from 'fs/promises';
import path from 'path';

const rootDir = import.meta.dir;
const outdir = path.resolve(rootDir, 'dist');

// Clean output directory
await Bun.$`rm -rf ${outdir}`.quiet();

const result = await Bun.build({
  entrypoints: [path.join(rootDir, 'index.html')],
  outdir,
  minify: true,
  sourcemap: 'linked',
  target: 'browser',
  naming: {
    entry: '[name]-[hash].[ext]',
    chunk: '[name]-[hash].[ext]',
    asset: '[name]-[hash].[ext]',
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
});

if (!result.success) {
  console.error('Build failed:');
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

// Rename the hashed HTML file to index.html
for (const output of result.outputs) {
  if (output.path.endsWith('.html') && output.path !== path.join(outdir, 'index.html')) {
    const content = await output.text();
    await Bun.write(path.join(outdir, 'index.html'), content);
    await unlink(output.path);
  }
}

console.log(`Build succeeded: ${result.outputs.length} files written to ${outdir}`);
for (const output of result.outputs) {
  const filename = path.basename(output.path);
  const displayName = filename.match(/index-[a-z0-9]+\.html/) ? 'index.html' : filename;
  console.log(`  ${displayName}`);
}
