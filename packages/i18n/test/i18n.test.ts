import { describe, expect, it } from 'vitest';
import { RANKS, SUITS, type Action, type DeclarationSummary, type Seat } from '@belot/shared-types';
import { LOCALE_IDS, Lang, SUIT_PIP, isRedSuit } from '@belot/i18n';

/**
 * The vocabulary is the product's stated wedge, so it gets tested like code.
 * The sharpest test here is the Cyrillic one: `sr-Cyrl` is built by spreading the
 * Latin locale, so any term somebody forgets to override silently stays in Latin.
 * Scanning for Latin letters catches exactly that.
 */

const ALL_ACTIONS: Action[] = [
  { type: 'BID_PASS', seat: 0 },
  { type: 'BID_CALL', seat: 0, suit: 'spades' },
  { type: 'DOUBLE_KONTRA', seat: 0 },
  { type: 'DOUBLE_REKONTRA', seat: 0 },
  { type: 'DOUBLE_PASS', seat: 0 },
  { type: 'DECLARE_ANNOUNCE', seat: 0 },
  { type: 'DECLARE_SKIP', seat: 0 },
  { type: 'PLAY_CARD', seat: 0, card: { suit: 'hearts', rank: 'K' } },
  { type: 'PLAY_CARD', seat: 0, card: { suit: 'hearts', rank: 'K' }, announceBela: true },
];

const SAMPLE_DECLARATIONS: DeclarationSummary[] = [
  { kind: 'sequence', value: 20, length: 3, topRank: '9', seat: 0 },
  { kind: 'sequence', value: 50, length: 4, topRank: 'K', seat: 1 },
  { kind: 'sequence', value: 100, length: 5, topRank: 'A', seat: 2 },
  { kind: 'carre', value: 200, length: 4, topRank: 'J', seat: 3 },
];

describe('every locale is complete', () => {
  for (const id of LOCALE_IDS) {
    describe(id, () => {
      const lang = new Lang(id);

      it('names every suit with its madarica name', () => {
        for (const suit of SUITS) {
          expect(lang.suitName(suit).length).toBeGreaterThan(0);
          expect(lang.suit(suit)).toContain(SUIT_PIP[suit]);
        }
        // The deck is Hungarian-suited, so the engine's French identifiers must
        // never leak through to a player. "hearts" is exempt: srce really is
        // hearts in both decks, so the English name collides legitimately.
        const shown = SUITS.map((s) => lang.suitName(s));
        expect(new Set(shown).size).toBe(4);
        for (const s of shown) {
          expect(['spades', 'diamonds', 'clubs']).not.toContain(s);
        }
      });

      it('labels every rank both short and spoken', () => {
        for (const rank of RANKS) {
          expect(lang.rankShort(rank).length).toBeGreaterThan(0);
          expect(lang.rankName(rank).length).toBeGreaterThan(0);
        }
        // Card faces must all read differently or the deck is unusable.
        expect(new Set(RANKS.map((r) => lang.rankShort(r))).size).toBe(8);
      });

      it('labels every action', () => {
        for (const a of ALL_ACTIONS) {
          expect(lang.action(a).trim().length).toBeGreaterThan(0);
        }
      });

      it('distinguishes the bela call from the plain play', () => {
        const plain = lang.action(ALL_ACTIONS[7]!);
        const bela = lang.action(ALL_ACTIONS[8]!);
        expect(bela).not.toBe(plain);
        expect(bela.length).toBeGreaterThan(plain.length);
      });

      it('names every declaration and includes its value', () => {
        for (const d of SAMPLE_DECLARATIONS) {
          const text = lang.declaration(d);
          expect(text).toContain(String(d.value));
          expect(text.trim().length).toBeGreaterThan(3);
        }
      });

      it('names all four seats distinctly, relative and absolute', () => {
        const relative = ([0, 1, 2, 3] as Seat[]).map((s) => lang.seat(s, 0));
        expect(new Set(relative).size).toBe(4);
        const absolute = ([0, 1, 2, 3] as Seat[]).map((s) => lang.seat(s, null));
        expect(new Set(absolute).size).toBe(4);
      });

      it('names both teams distinctly', () => {
        expect(lang.team(0, 0)).not.toBe(lang.team(1, 0));
        expect(lang.team(0, null)).not.toBe(lang.team(1, null));
      });

      it('leaves no string blank', () => {
        for (const [key, value] of Object.entries(lang.s)) {
          if (typeof value === 'string') {
            expect(value.trim().length, `${id}.${key} is blank`).toBeGreaterThan(0);
          }
        }
      });
    });
  }
});

/** Seat labels are relative: the same seat reads differently from each chair. */
describe('seats are named from where you sit', () => {
  const lang = new Lang('hr');

  it('calls your own seat "Vi" from every chair', () => {
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      expect(lang.seat(seat, seat)).toBe('Vi');
    }
  });

  it('always puts the partner across the table', () => {
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      const across = ((seat + 2) % 4) as Seat;
      expect(lang.seat(across, seat)).toBe('Partner');
    }
  });

  it('reads left and right correctly', () => {
    expect(lang.seat(1, 0)).toBe('Lijevi');
    expect(lang.seat(3, 0)).toBe('Desni');
  });
});

/** The one that catches a forgotten override. */
describe('the Cyrillic locale is actually Cyrillic', () => {
  const cyr = new Lang('sr-Cyrl');
  const LATIN = /[A-Za-zČĆĐŠŽčćđšž]/;

  function assertNoLatin(label: string, text: string): void {
    // Card ranks (A K Q J 10) stay Latin — they are printed on the cards.
    const withoutRanks = text.replace(/\b(?:10|[AKQJ789])\b/g, '');
    expect(LATIN.test(withoutRanks), `${label} still reads Latin: "${text}"`).toBe(false);
  }

  it('translates every plain string', () => {
    for (const [key, value] of Object.entries(cyr.s)) {
      if (typeof value === 'string') assertNoLatin(key, value);
    }
  });

  it('translates the spoken rank names', () => {
    // Short faces keep Roman numerals (VII, VIII, IX, X) by design; the spoken
    // names are what must actually be in Cyrillic.
    for (const rank of RANKS) assertNoLatin(`rankName.${rank}`, cyr.rankName(rank));
  });

  it('translates suits, seats and teams', () => {
    for (const suit of SUITS) assertNoLatin('suit', cyr.suitName(suit));
    for (const seat of [0, 1, 2, 3] as Seat[]) assertNoLatin('seat', cyr.seat(seat, 0));
    assertNoLatin('team', cyr.team(0, 0));
    assertNoLatin('team', cyr.team(1, 0));
    assertNoLatin('teamAbs', cyr.team(0, null));
    assertNoLatin('teamAbs', cyr.team(1, null));
  });

  it('translates declarations and actions', () => {
    for (const d of SAMPLE_DECLARATIONS) assertNoLatin('declaration', cyr.declaration(d));
    for (const a of ALL_ACTIONS) {
      // Card faces carry Latin rank letters by design; strip the pip and rank.
      if (a.type === 'PLAY_CARD') continue;
      assertNoLatin(a.type, cyr.action(a));
    }
  });
});

describe('app-shell ui strings', () => {
  for (const id of LOCALE_IDS) {
    it(`${id} fills the sampled ui keys`, () => {
      const ui = new Lang(id).s.ui;
      const samples = [
        ui.play,
        ui.shop,
        ui.settings,
        ui.coinsDisclaimer,
        ui.back,
        ui.dailyBonus(100),
        ui.streakDays(3),
        ui.bonusClaimed(1),
        ui.questLabel('winMatch'),
        ui.buy(500),
        ui.needsLevel(8),
        ui.cosmeticName('oak'),
        ui.cosmeticName('kapetan'),
      ];
      for (const text of samples) {
        expect(text.trim().length).toBeGreaterThan(0);
      }
    });
  }

  it('cosmeticName falls back to the raw id for unknown ids', () => {
    for (const id of LOCALE_IDS) {
      expect(new Lang(id).s.ui.cosmeticName('golden-dragon')).toBe('golden-dragon');
    }
  });

  it('hr counts streak days grammatically (dan/dana)', () => {
    const ui = new Lang('hr').s.ui;
    expect(ui.streakDays(1)).toBe('Niz: 1 dan');
    expect(ui.streakDays(3)).toBe('Niz: 3 dana');
    expect(ui.streakDays(11)).toBe('Niz: 11 dana');
    expect(ui.streakDays(21)).toBe('Niz: 21 dan');
  });
});

describe('suit colours', () => {
  it('marks hearts and diamonds red, spades and clubs not', () => {
    expect(isRedSuit('hearts')).toBe(true);
    expect(isRedSuit('diamonds')).toBe(true);
    expect(isRedSuit('spades')).toBe(false);
    expect(isRedSuit('clubs')).toBe(false);
  });
});
