/**
 * Typed re-export of the close-size helper. The implementation lives in
 * `closeSize.mjs` so the zero-dep `node --test` runner can import it
 * without a TS toolchain. Same shim pattern as `tpsl.ts` / `preview.ts` /
 * `sizeUnit.ts`.
 */

export { computeCloseSize } from './closeSize.mjs';

export type CloseSizeSelection =
  | { kind: 'pct'; pct: number }
  | { kind: 'custom'; size: number };
