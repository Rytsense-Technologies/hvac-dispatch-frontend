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

export default defineConfig({
  plugins: [react()],
  appType: 'mpa',
  server: {
    port: 5500,
    proxy: {
      '/v1': forward,
      '/tech': forward,
      '/healthz': forward,
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
