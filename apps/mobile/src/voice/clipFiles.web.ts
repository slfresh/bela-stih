import type { VoiceMime } from './voice';

/**
 * The browser's twin of clipFiles.ts: a take is a Blob URL the recorder made,
 * a clip to play is one made here. Each is revoked once used; nothing is kept.
 */

export async function readTake(uri: string): Promise<Uint8Array> {
  try {
    const r = await fetch(uri);
    return new Uint8Array(await r.arrayBuffer());
  } finally {
    dropTake(uri);
  }
}

export function dropTake(uri: string | null): void {
  if (!uri) return;
  try {
    URL.revokeObjectURL(uri);
  } catch {
    // Not ours, or already revoked.
  }
}

export function clipSource(data: Uint8Array, mime: VoiceMime, _id: number): { uri: string; release: () => void } {
  const uri = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }));
  return { uri, release: () => dropTake(uri) };
}

/** Blob URLs die with the page: nothing is ever left behind to sweep. */
export function sweepVoiceFiles(): void {}
