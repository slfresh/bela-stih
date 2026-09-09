/** The six emotes that have a drawn face (src/emoteArt.tsx); the phrases have none. */
export const EMOTE_FACES: readonly string[] = ['smile', 'laugh', 'wow', 'cry', 'clap', 'think'];

export function hasEmoteFace(id: string): boolean {
  return EMOTE_FACES.includes(id);
}
