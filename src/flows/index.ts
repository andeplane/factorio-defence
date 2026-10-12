import { connectToHostApp } from '@cognite/app-sdk';
import { setAssetSource } from '../engine/Assets';
import { cdfAssetSource } from './cdfAssets';

/**
 * Flows build only: connects to the Fusion host and points the engine at the
 * sprites in the CDF project the app runs in, using the host's login. Outside
 * Fusion the handshake times out and the game keeps the bundled assets (or
 * placeholders).
 */
export async function connectFlows(): Promise<void> {
  try {
    const { api } = await Promise.race([
      connectToHostApp({ applicationName: 'Factorio Defence' }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Fusion handshake timed out')), 10_000)),
    ]);
    const [baseUrl, project] = await Promise.all([api.getBaseUrl(), api.getProject()]);
    setAssetSource(cdfAssetSource({ baseUrl, project, getToken: () => api.getAccessToken() }));
    console.info(`[flows] loading sprites from CDF project ${project}`);
  } catch (err) {
    console.warn('[flows] not running inside Fusion, using bundled assets', err);
  }
}
