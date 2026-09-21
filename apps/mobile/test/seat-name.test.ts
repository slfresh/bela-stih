import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Lang } from '@belot/i18n';
import { SERVER_FALLBACK, seatName } from '../src/net/seatName';

const here = dirname(fileURLToPath(import.meta.url));

describe("the server's fallback seat name is said in the player's language", () => {
  it('is exactly the name the server gives a seat nobody named', () => {
    const room = readFileSync(join(here, '../../server/src/BelaRoom.ts'), 'utf8');
    // ONE fallback there, in seatInfo, by the seat the occupant sits in now.
    // Baking it into the occupant at join would send the wrong chair's number
    // - untranslated - to everyone after that player moves seats in the lobby.
    expect((room.match(/`Igrač \$\{(seat|i) \+ 1\}`/g) ?? []).length).toBe(1);
    expect(room).toMatch(/name: cleanName\(options\.name\),/);
    expect(SERVER_FALLBACK(2)).toBe('Igrač 3');
  });

  it('reads Cyrillic in Serbian and English in English, and stays Croatian in Croatian', () => {
    const vacant = { seat: 2 as const, name: 'Igrač 3' };
    expect(seatName(new Lang('sr-Cyrl'), vacant)).toBe('Играч 3');
    expect(seatName(new Lang('en'), vacant)).toBe('Player 3');
    expect(seatName(new Lang('hr'), vacant)).toBe('Igrač 3');
  });

  it("leaves a real nickname exactly as it was typed, even one that looks like another seat's", () => {
    const sr = new Lang('sr-Cyrl');
    expect(seatName(sr, { seat: 1, name: 'Aleksandar' })).toBe('Aleksandar');
    expect(seatName(sr, { seat: 1, name: 'Igrač 3' })).toBe('Igrač 3');
  });
});
