import path from 'path';

const API_TARGET = 'http://localhost:3847';
const PORT = 5173;
const rootDir = import.meta.dir;
const devDir = path.join(rootDir, '.dev');

// Build the app in watch mode
console.log('Starting build in watch mode...');
const buildProcess = Bun.spawn(
  ['bun', 'build', path.join(rootDir, 'index.html'), '--outdir', devDir, '--watch'],
  {
    cwd: rootDir,
    stdout: 'inherit',
    stderr: 'inherit',
  }
);

// Wait a moment for initial build
await Bun.sleep(1000);

// Serve with proxy
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // Proxy /api requests
    if (url.pathname.startsWith('/api')) {
      const proxyUrl = new URL(url.pathname + url.search, API_TARGET);
      const proxyReq = new Request(proxyUrl, {
        method: req.method,
        headers: req.headers,
        body: req.body,
      });
      return fetch(proxyReq);
    }

    // Serve static files from .dev directory
    let filePath = path.join(devDir, url.pathname === '/' ? '' : url.pathname);

    // Check if file exists
    const file = Bun.file(filePath);
    if (await file.exists() && !(await file.stat()).isDirectory()) {
      return new Response(file);
    }

    // Try index.html in directory
    const indexInDir = path.join(filePath, 'index.html');
    const indexInDirFile = Bun.file(indexInDir);
    if (await indexInDirFile.exists()) {
      return new Response(indexInDirFile, {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    // SPA fallback - find index*.html file
    const files = await Array.fromAsync(new Bun.Glob('index*.html').scan({ cwd: devDir }));
    if (files.length > 0) {
      const indexPath = path.join(devDir, files[0]);
      const indexFile = Bun.file(indexPath);
      return new Response(indexFile, {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
});

console.log(`\nDev server running at http://localhost:${PORT}`);
console.log(`API proxy: /api -> ${API_TARGET}`);

// Handle shutdown
process.on('SIGINT', () => {
  buildProcess.kill();
  server.stop();
  process.exit(0);
});
