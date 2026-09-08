// Card art is inlined at build time (scripts/build.mjs) as data URIs under the __ART__ global.
declare const __ART__: Record<string, string> | undefined;

export const ART: Record<string, string> = typeof __ART__ !== 'undefined' ? __ART__ : {};

export function artFor(id: string): string | undefined {
  return ART[id];
}
