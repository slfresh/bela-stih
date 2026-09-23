import { describe, expect, it } from 'vitest';
import { RANKS, SUITS, type Action, type DeclarationSummary, type Seat } from '@belot/shared-types';
import { LOCALE_IDS, Lang, SUIT_PIP, isRedSuit } from '@belot/i18n';
import { GIFT_IDS } from '@belot/progression';

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

      it('announces every declaration by its spoken value, distinctly', () => {
        // "dvadeset do kralja", never "terca (20)" — the value is a WORD.
        const texts = SAMPLE_DECLARATIONS.map((d) => lang.declaration(d));
        for (const text of texts) expect(text.trim().length).toBeGreaterThan(3);
        // Different declarations must not collapse to the same announcement.
        expect(new Set(texts).size).toBe(SAMPLE_DECLARATIONS.length);
        // A sequence announcement names the top card, not the sequence kind.
        const seq = SAMPLE_DECLARATIONS.find((d) => d.kind === 'sequence')!;
        expect(lang.declaration(seq)).toContain(lang.rankName(seq.topRank));
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

  it('calls your own seat "Ti" from every chair', () => {
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      expect(lang.seat(seat, seat)).toBe('Ti');
    }
  });

  it('always puts the partner across the table', () => {
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      const across = ((seat + 2) % 4) as Seat;
      expect(lang.seat(across, seat)).toBe('Partner');
    }
  });

  it('puts the next seat to act on your right (bela runs counter-clockwise)', () => {
    expect(lang.seat(1, 0)).toBe('Desni');
    expect(lang.seat(3, 0)).toBe('Lijevi');
  });

  // The engine plays seat+1, so seat+1 must be captioned "Desni" from EVERY
  // chair. Together with the engine's own rotation tests this pins the word to
  // the rule: the table can never end up captioned back-to-front.
  it('calls seat+1 the right-hand neighbour from every chair', () => {
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      expect(lang.seat(((seat + 1) % 4) as Seat, seat)).toBe('Desni');
      expect(lang.seat(((seat + 3) % 4) as Seat, seat)).toBe('Lijevi');
    }
  });
});

/** The one that catches a forgotten override. */
describe('the Cyrillic locale is actually Cyrillic', () => {
  const cyr = new Lang('sr-Cyrl');
  const LATIN = /[A-Za-zČĆĐŠŽčćđšž]/;

  function assertNoLatin(label: string, text: string): void {
    // Card ranks (A K Q J 10) stay Latin — they are printed on the cards —
    // and so does "QR", the code's own name in Serbian as everywhere.
    const withoutRanks = text.replace(/\b(?:10|[AKQJ789]|QR)\b/g, '');
    expect(LATIN.test(withoutRanks), `${label} still reads Latin: "${text}"`).toBe(false);
  }

  it('translates every plain string', () => {
    for (const [key, value] of Object.entries(cyr.s)) {
      if (typeof value === 'string') assertNoLatin(key, value);
    }
  });

  it('translates every plain ui string', () => {
    // The walk above sees only the top level: a Latin ui string slipped by.
    // `rulesAnchor` is not prose: it is the fragment of the rules page's URL,
    // and that page writes its Croatian half's anchor in Latin.
    const NOT_PROSE = new Set(['rulesAnchor']);
    let n = 0;
    for (const [key, value] of Object.entries(cyr.s.ui)) {
      if (typeof value !== 'string' || NOT_PROSE.has(key)) continue;
      n++;
      assertNoLatin(`ui.${key}`, value);
    }
    expect(n).toBeGreaterThan(50);
    // And the anchor is one the page actually has.
    for (const l of LOCALE_IDS) expect(['pravila', 'conduct']).toContain(new Lang(l).s.ui.rulesAnchor);
  });

  it('translates the spoken rank names', () => {
    // Short faces keep Roman numerals (VII, VIII, IX, X) by design; the spoken
    // names are what must actually be in Cyrillic.
    for (const rank of RANKS) assertNoLatin(`rankName.${rank}`, cyr.rankName(rank));
  });

  it('translates the court letters on the cards and the seasons on the aces', () => {
    // These are printed on the cards' corner index and the ace's banner.
    for (const rank of ['J', 'Q', 'K'] as const) assertNoLatin(`rankShort.${rank}`, cyr.rankShort(rank));
    for (const suit of SUITS) assertNoLatin(`season.${suit}`, cyr.seasonName(suit));
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
        ui.bonusClaimed,
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

/**
 * Register: the app speaks to one player, informally — "tvoje karte", not
 * "vaše"; "označi", not "označite". Formal plural crept in string by string
 * and read as a bank's letter next to the drawn cards. Every string in every
 * locale uses the typographic ellipsis, never three full stops.
 *
 * JS's \b is ASCII-only, so the Cyrillic set (and the Croatian one, for Č Ć
 * Š Ž Đ) uses Unicode lookarounds instead.
 */
describe('register and typography', () => {
  const word = (core: string) => new RegExp(`(?<!\\p{L})(?:${core})(?!\\p{L})`, 'u');
  const FORMAL_HR = [
    word('[Vv]aš[aeu]?'),
    word('[Vv]am'),
    word('[Vv]as'),
    word('Vi'),
    word('ste'),
    word('zovete'),
    word('[Ii]mate|[Nn]emate'),
    // Plural imperatives: pritisnite, označite, tražite, dodirnite, pošaljite…
    /\p{L}{3,}(?:ite|ete|ajte|ijte|ujte)(?!\p{L})/u,
    word('[Ss]ami'),
  ];
  const FORMAL_SR = [
    word('[Вв]аш[аеу]?'),
    word('[Вв]ам'),
    word('[Вв]ас'),
    word('Ви'),
    word('сте'),
    word('зовете'),
    word('[Ии]мате|[Нн]емате'),
    /\p{L}{3,}(?:ите|ете|ајте|ијте|ујте)(?!\p{L})/u,
    word('[Сс]ами'),
  ];
  const QUESTS = ['playDeals', 'winDeals', 'winMatch', 'callZvanja', 'callBela'];
  const IDS = ['djed', 'classic', 'green', 'smile', 'bravo', 'hvala', ...GIFT_IDS];

  function strings(l: Lang): string[] {
    const out: string[] = [];
    const push = (v: unknown) => {
      if (typeof v === 'string') out.push(v);
    };
    const walk = (v: unknown, key = '') => {
      if (typeof v === 'string') out.push(v);
      else if (typeof v === 'function') {
        const f = v as (...a: unknown[]) => unknown;
        try {
          // Each function gets the arguments its key implies; the rest a
          // string and some numbers, so no branch is left unrendered.
          if (key === 'questLabel') QUESTS.forEach((q) => push(f(q)));
          else if (key === 'cosmeticName' || key === 'emotePhrase' || key === 'emoteName' || key === 'giftName') IDS.forEach((id) => push(f(id)));
          else {
            push(f('Ana', 'Ana', 'Ana'));
            push(f(1, 1, 1));
            push(f(2, 2, 2));
            push(f(5, 5, 5));
          }
        } catch {
          /* a function that needs richer arguments: skip */
        }
      } else if (v && typeof v === 'object') {
        for (const [k, x] of Object.entries(v as object)) walk(x, k);
      }
    };
    walk(l.s);
    return out;
  }

  it('hr addresses the player informally', () => {
    for (const str of strings(new Lang('hr'))) {
      for (const re of FORMAL_HR) expect(str, str).not.toMatch(re);
    }
  });

  it('sr addresses the player informally', () => {
    for (const str of strings(new Lang('sr-Cyrl'))) {
      for (const re of FORMAL_SR) expect(str, str).not.toMatch(re);
    }
  });

  it('the guard itself can fail', () => {
    // A copy of the old strings must trip it, or the tests above are vacuous.
    expect(FORMAL_HR.some((re) => re.test('Sigurno? Pritisnite opet'))).toBe(true);
    expect(FORMAL_HR.some((re) => re.test('Vaše karte'))).toBe(true);
    expect(FORMAL_HR.some((re) => re.test('Tražili ste novu partiju'))).toBe(true);
    expect(FORMAL_HR.some((re) => re.test('zvao Vi'))).toBe(true);
    expect(FORMAL_HR.some((re) => re.test('Odigraj dijeljenja'))).toBe(false);
    expect(FORMAL_HR.some((re) => re.test('Tvoje karte'))).toBe(false);
    expect(FORMAL_SR.some((re) => re.test('Сигурно? Притисните поново'))).toBe(true);
    expect(FORMAL_SR.some((re) => re.test('Твоје карте'))).toBe(false);
  });

  it('never types three full stops', () => {
    for (const id of LOCALE_IDS) {
      for (const str of strings(new Lang(id))) expect(str, `${id}: ${str}`).not.toContain('...');
    }
  });

  it('writes Serbian digraphs as single Cyrillic letters', () => {
    // л+ј is a transliteration slip: Cyrillic has љ (and њ, џ) for it.
    for (const str of strings(new Lang('sr-Cyrl'))) expect(str, str).not.toMatch(/лј|нј|дж/i);
  });
});

describe('the words the player asked for', () => {
  const LATIN = /[A-Za-zČĆŠŽĐčćšžđ]/;
  it('titles a claimed bonus without repeating the streak shown under it', () => {
    // "Dnevni bonus pokupljen · niz 1 dan" was cut to "… pokupljen • …" on a 360 dp phone.
    for (const id of LOCALE_IDS) expect(new Lang(id).s.ui.bonusClaimed, id).not.toMatch(/\d/);
    expect(new Lang('hr').s.ui.bonusClaimed).toBe('Dnevni bonus pokupljen');
  });

  it('says "Prošli" when the caller made it', () => {
    expect(new Lang('hr').s.madeShort).toBe('Prošli');
    expect(new Lang('sr-Cyrl').s.madeShort).toBe('Прошли');
    expect(new Lang('en').s.madeShort).toBe('Made');
  });

  it('asks before leaving, in every locale, and never in Latin letters in Cyrillic', () => {
    expect(new Lang('hr').s.ui.leaveConfirm).toBe('Želiš li stvarno napustiti stol?');
    for (const id of LOCALE_IDS) {
      const ui = new Lang(id).s.ui;
      for (const v of [ui.leaveConfirm, ui.leaveConfirmYes, ui.leaveConfirmNo]) {
        expect(v.trim().length, `${id}`).toBeGreaterThan(0);
        if (id === 'sr-Cyrl') expect(v, `${id}: ${v}`).not.toMatch(LATIN);
      }
      // The safe answer and the irreversible one are different words.
      expect(ui.leaveConfirmYes).not.toBe(ui.leaveConfirmNo);
    }
  });
});

describe('table gifts', () => {
  it('every gift has a name of its own in every locale', () => {
    for (const locale of LOCALE_IDS) {
      const ui = new Lang(locale).s.ui;
      const names = GIFT_IDS.map((id) => ui.giftName(id));
      GIFT_IDS.forEach((id, i) => expect(names[i], `${locale} ${id}`).not.toBe(id));
      expect(new Set(names).size, locale).toBe(GIFT_IDS.length);
    }
  });

  it("never inflects a player's name, so any nickname reads right", () => {
    for (const locale of LOCALE_IDS) {
      const ui = new Lang(locale).s.ui;
      const bare = { name: 'Ana', dealer: false, cards: 8, tricks: 0, gift: null };
      expect(ui.giftPuckLabel(bare).startsWith('Ana, ')).toBe(true);
      expect(ui.giftPuckLabel({ ...bare, gift: 'X' })).toContain(': X');
      expect(ui.giftReceived('X', 'Ana')).toContain('(Ana)');
    }
  });

  it('a puck still tells a screen reader who deals, the cards and the tricks', () => {
    for (const locale of LOCALE_IDS) {
      const ui = new Lang(locale).s.ui;
      const bare = { name: 'Ana', dealer: false, cards: 7, tricks: 0, gift: null };
      const full = ui.giftPuckLabel({ ...bare, dealer: true, tricks: 3, gift: 'X' });
      // Every fact the puck draws is in the words, each once.
      for (const bit of [': 7', ': 3', ': X']) expect(full, `${locale}: ${full}`).toContain(bit);
      expect(full.split(', ').length, locale).toBe(5);
      expect(ui.giftPuckLabel(bare).split(', ').length, locale).toBe(2);
      if (locale === 'sr-Cyrl') expect(full.replace(/Ana|X/g, ''), full).not.toMatch(/[A-Za-z]/);
    }
  });

  it('says why a gift cannot go to a player on an older app', () => {
    for (const locale of LOCALE_IDS) {
      const ui = new Lang(locale).s.ui;
      for (const v of [ui.giftNotSeen, ui.giftNobodySees]) {
        expect(v.trim().length, locale).toBeGreaterThan(0);
        if (locale === 'sr-Cyrl') expect(v, v).not.toMatch(/[A-Za-z]/);
      }
      expect(ui.giftNotSeen).not.toBe(ui.giftNobodySees);
    }
  });
});

describe('screen reader labels', () => {
  const FACES = ['smile', 'laugh', 'wow', 'cry', 'clap', 'think'];
  for (const locale of LOCALE_IDS) {
    it(`names every emote face in ${locale}, each differently`, () => {
      const ui = new Lang(locale).s.ui;
      const names = FACES.map((id) => ui.emoteName(id));
      FACES.forEach((id, i) => expect(names[i], `${locale} ${id}`).not.toBe(id));
      expect(new Set(names).size).toBe(FACES.length);
      // A phrase is named by its own words.
      expect(ui.emoteName('hvala')).toBe(ui.emotePhrase('hvala'));
      expect(ui.emoteToggle.trim().length).toBeGreaterThan(0);
      expect(ui.walletLabel(250)).toContain('250');
      if (locale === 'sr-Cyrl') {
        for (const v of [...names, ui.emoteToggle, ui.walletLabel(250).replace(/\d/g, '')]) expect(v, v).not.toMatch(/[A-Za-z]/);
      }
    });
  }
});
