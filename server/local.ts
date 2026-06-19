import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, '.env.local'), override: true });

const { app } = await import('./expressApp.js');

const preferredPort = Number(process.env.PORT || 3001) || 3001;
const vitePort = String(process.env.VITE_DEV_API_PORT || '').trim();
if (vitePort && vitePort !== String(preferredPort)) {
  // eslint-disable-next-line no-console
  console.warn(
    `[aiag] Uyarı: VITE_DEV_API_PORT=${vitePort} ama PORT=${preferredPort}. Vite /api isteğini yanlış porta yollar; .env.local içinde ikisini aynı yap.`,
  );
}
// eslint-disable-next-line no-console
console.log('[aiag] iyzipay anahtarları yüklü mü:', {
  hasApiKey: Boolean(process.env.IYZIPAY_API_KEY?.trim()),
  hasSecretKey: Boolean(process.env.IYZIPAY_SECRET_KEY?.trim()),
  hasUri: Boolean((process.env.IYZIPAY_URI || '').trim()),
});

const portStrict = process.env.PORT_STRICT === '1';
const maxPortAttempts = portStrict ? 1 : 24;

function startHttpServer(port: number): void {
  const srv = http.createServer(app);
  srv.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[aiag] api listening on http://localhost:${port}`);
    if (port !== preferredPort) {
      // eslint-disable-next-line no-console
      console.warn(`[aiag] Port ${preferredPort} meşguldu; ${port} kullanılıyor.`);
    }
  });
  srv.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      srv.close(() => {
        const next = port + 1;
        if (!portStrict && next <= preferredPort + maxPortAttempts) return startHttpServer(next);
        // eslint-disable-next-line no-console
        console.error(`[aiag] Port unavailable (${preferredPort}..${port}).`);
        process.exit(1);
      });
      return;
    }
    throw err;
  });
}

startHttpServer(preferredPort);
