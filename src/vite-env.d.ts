/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "cdf" in the Flows build (vite --mode flows): sprites come from CDF Files. */
  readonly VITE_ASSET_SOURCE?: string;
}
