/**
 * A table code as the player typed it, made into the code the server gave.
 *
 * Private tables' codes are five capitals from an alphabet with nothing that
 * reads as something else (apps/server/src/codes.ts). Typed in lower case, or
 * with a space or a dash in the middle ("k7m 2q", "K7M-2Q"), they still find
 * the table. Anything else - an older server's nine-character id - is passed
 * on exactly as typed, because those are case-sensitive.
 */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function normalizeCode(typed: string): string {
  const bare = typed.trim().replace(/[\s-]/g, '');
  const upper = bare.toUpperCase();
  if (upper.length === 5 && [...upper].every((c) => CODE_ALPHABET.includes(c))) return upper;
  return typed.trim();
}
