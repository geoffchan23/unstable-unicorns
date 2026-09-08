// Card art is copied to art/<id>.webp by scripts/build.mjs. Missing art -> placeholder.
declare const __ART_IDS__: string[];
const IDS = new Set<string>(typeof __ART_IDS__ !== 'undefined' ? __ART_IDS__ : []);
export function artFor(id: string): string | undefined {
  return IDS.has(id) ? `art/${id}.webp` : undefined;
}
