import { randomBytes } from 'node:crypto';

/**
 * Private tables' codes: what friends read out over the phone and type in.
 *
 * Colyseus' own room ids are nine letters and digits in both cases -
 * "IlCWn95i2" started with a capital I next to a small l, which no font tells
 * apart - so a private table gets its own: five characters, capitals only, and
 * none that can be taken for another (no I, L, O, 0 or 1). 31^5 is about 28
 * million codes, far more than there will ever be tables open at once.
 */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;

/** A fresh code no open table has. `taken` says whether one is in use. */
export function tableCode(taken: (code: string) => boolean, bytes: (n: number) => Uint8Array = randomBytes): string {
  for (;;) {
    let code = '';
    for (const b of bytes(CODE_LENGTH)) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
    if (!taken(code)) return code;
  }
}
