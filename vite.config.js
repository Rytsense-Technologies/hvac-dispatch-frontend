import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// In development the API is reached through the project's ngrok address; the dev server forwards the same paths nginx does,
// so the browser still talks to ONE address and the sign-in cookie stays first-party.
// To use a local API instead, start with VITE_API_TARGET=http://localhost:8010 (or whichever port it runs on).
const target = process.env.VITE_API_TARGET || 'https://schedule-undrafted-twirl.ngrok-free.dev';
const forward = {
  target,
  changeOrigin: true,
  secure: true,
  headers: { 'ngrok-skip-browser-warning': 'true' },
};

// The console routes client-side with the History API (/calls, /settings, ...). appType 'mpa' means
// Vite otherwise 404s on a direct open or refresh of one of those paths, since no such file exists on
// disk; this plugin rewrites that one request to index.html, same as nginx.conf does in production.
// It must not touch the other pages (call.html, customer.html, portal/*), real files/assets, or
// anything proxied to the API (see RESERVED_PREFIXES, which mirrors src/app/router.js).
const RESERVED_PREFIXES = ['/v1', '/set-password', '/signup', '/billing', '/twilio', '/healthz', '/rtc', '/twirp', '/api'];
const OTHER_PAGES = ['/portal'];
function consoleHistoryFallback() {
  return {
    name: 'console-history-fallback',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url || '').split('?')[0];
        const accepts = req.headers.accept || '';
        const isNavigation = req.method === 'GET' && accepts.includes('text/html');
        const isOwnPage = [...RESERVED_PREFIXES, ...OTHER_PAGES].some((p) => pathname === p || pathname.startsWith(`${p}/`));
        const hasExtension = /\.[a-z0-9]+$/i.test(pathname);
        if (isNavigation && !isOwnPage && !hasExtension) req.url = '/index.html';
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), consoleHistoryFallback()],
  appType: 'mpa',
  server: {
    port: 5500,
    proxy: {
      '/v1': forward,
      '/healthz': forward,
      // The emailed one-time link opens this address; the backend serves the ready-made page itself.
      '/set-password': forward,
      // The page the sign-up confirmation email opens (and its script and style); the backend serves it itself.
      '/signup': forward,
      '/signup-confirm.js': forward,
      '/signup-confirm.css': forward,
      // A customer opening their quote/invoice link in a browser gets the page; the page then asks the API (Accept: application/json).
      '/billing': {
        ...forward,
        bypass: (req) => (/text\/html/i.test(req.headers.accept || '') && /^\/billing\/(quotes|invoices)\/[^/]+$/.test(req.url.split('?')[0]) ? '/customer.html' : undefined),
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        call: resolve(__dirname, 'call.html'),
        customer: resolve(__dirname, 'customer.html'),
        portal: resolve(__dirname, 'portal/index.html'),
      },
    },
  },
});
