import { defineConfig, type UserConfig } from 'vite';

// `--mode flows` builds the Cognite Flows app: Fusion dev-server plugins, and
// sprites read from CDF (.env.flows) instead of bundled from public/.
export default defineConfig(async ({ mode }): Promise<UserConfig> => {
  if (mode !== 'flows') {
    return { base: './', server: { host: true } };
  }
  const { fusionOpenPlugin, manifestCspPlugin, mkcertPlugin } = await import('@cognite/app-sdk/vite');
  return {
    base: './',
    // manifestCspPlugin() must stay first: it sets the CSP header before any HTML response. It is
    // dev-only: in a build it would inline a CSP-reporter script that Fusion's CSP then blocks.
    plugins: [{ ...manifestCspPlugin(), apply: 'serve' }, mkcertPlugin(), fusionOpenPlugin()],
    server: { port: 3001 },
    worker: { format: 'es' },
    // public/ only holds the ~630 MB of extracted sprites, which the Flows app reads from CDF.
    build: { copyPublicDir: false },
  };
});
