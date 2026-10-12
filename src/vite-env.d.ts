/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "cdf" in the Flows build (vite --mode flows): sprites come from CDF Files. */
  readonly VITE_ASSET_SOURCE?: string;
  /** Data modeling space with the sprite files (default factorio-defence); empty reads classic files. */
  readonly VITE_CDF_SPRITE_SPACE?: string;
}
