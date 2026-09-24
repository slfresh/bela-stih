import { File, Paths } from 'expo-file-system';
import type { VoiceMime } from './voice';

/**
 * Where a voice clip lives on the phone while it is handled (the browser's
 * twin is clipFiles.web.ts). A take is read and deleted at once; a clip that
 * arrived sits in the cache only while it plays. Nothing is ever kept.
 */

/** The recorder's file, as bytes, and gone from the phone. */
export async function readTake(uri: string): Promise<Uint8Array> {
  const file = new File(uri);
  try {
    return await file.bytes();
  } finally {
    dropTake(uri);
  }
}

/** A take that is not sent: deleted unread. */
export function dropTake(uri: string | null): void {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Already gone, or never written: nothing to keep either way.
  }
}

/** A clip to play: written to the cache, and a way to delete it once heard. */
export function clipSource(data: Uint8Array, mime: VoiceMime, id: number): { uri: string; release: () => void } {
  const file = new File(Paths.cache, `voice-${id}-${Date.now()}.${mime === 'audio/mp4' ? 'm4a' : 'webm'}`);
  file.create({ overwrite: true });
  file.write(data);
  return {
    uri: file.uri,
    release: () => {
      try {
        if (file.exists) file.delete();
      } catch {
        // The cache is the system's to clear in the end anyway.
      }
    },
  };
}
