import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  cardId,
  detectDeclarations,
  parseCard,
  resolveDeclarations,
  teamOf,
  type Declaration,
  type Seat,
} from '@belot/engine';

const c = parseCard;
const hand = (...ids: string[]) => ids.map(c);

function declare(ids: string[], seat: Seat): Declaration[] {
  expect(ids).toHaveLength(8);
  return detectDeclarations(hand(...ids), seat);
}

/** Guard the fixtures themselves: no two hands in a deal may share a card. */
function assertDisjoint(...hands: string[][]): void {
  const all = hands.flat();
  expect(new Set(all).size).toBe(all.length);
}

describe('detecting sequences', () => {
  it('scores a three-card run as a terca worth 20', () => {
    const d = declare(['7H', '8H', '9H', 'AS', 'KC', 'QD', 'JD', '10S'], 0);
    const seq = d.filter((x) => x.kind === 'sequence');
    expect(seq).toHaveLength(1);
    expect(seq[0]!.value).toBe(20);
    expect(seq[0]!.length).toBe(3);
    expect(seq[0]!.topRank).toBe('9');
  });

  it('scores a four-card run as a kvarta worth 50', () => {
    const d = declare(['7H', '8H', '9H', '10H', 'AS', 'KC', 'QD', 'JD'], 0);
    const seq = d.filter((x) => x.kind === 'sequence');
    expect(seq).toHaveLength(1);
    expect(seq[0]!.value).toBe(50);
    expect(seq[0]!.length).toBe(4);
  });

  it('scores five or more as a kvinta worth 100', () => {
    const d = declare(['7H', '8H', '9H', '10H', 'JH', 'AS', 'KC', 'QD'], 0);
    const seq = d.filter((x) => x.kind === 'sequence');
    expect(seq).toHaveLength(1);
    expect(seq[0]!.value).toBe(100);
    expect(seq[0]!.length).toBe(5);
    expect(seq[0]!.topRank).toBe('J');
  });

  it('reports the exact cards backing a declaration', () => {
    const d = declare(['9H', '10H', 'JH', 'AS', 'KC', 'QD', '7D', '8S'], 0);
    const seq = d.find((x) => x.kind === 'sequence')!;
    expect(seq.cards.map(cardId)).toEqual(['9H', '10H', 'JH']);
  });

  it('never runs a sequence across suit boundaries', () => {
    // 9H, 10H then JS: the J is a different suit, so this is only a two-card run.
    const d = declare(['9H', '10H', 'JS', 'QS', 'AD', 'KD', '7C', '8C'], 0);
    expect(d.filter((x) => x.kind === 'sequence')).toHaveLength(0);
  });

  it('finds two separate runs in one hand', () => {
    const d = declare(['7H', '8H', '9H', '10D', 'JD', 'QD', 'AS', 'KC'], 0);
    expect(d.filter((x) => x.kind === 'sequence')).toHaveLength(2);
  });
});

describe('detecting carres', () => {
  it('values four Jacks at 200 and four Nines at 150', () => {
    const jacks = declare(['JS', 'JH', 'JD', 'JC', 'AC', 'KD', 'QS', '10H'], 0);
    expect(jacks.find((x) => x.kind === 'carre')!.value).toBe(200);

    const nines = declare(['9S', '9H', '9D', '9C', '7S', '8H', 'JD', 'QC'], 0);
    expect(nines.find((x) => x.kind === 'carre')!.value).toBe(150);
  });

  it('values any other carre at 100', () => {
    for (const rank of ['A', '10', 'K', 'Q']) {
      const d = declare([`${rank}S`, `${rank}H`, `${rank}D`, `${rank}C`, '7S', '7H', '7D', '7C'], 0);
      expect(d.find((x) => x.kind === 'carre' && x.topRank === rank)!.value).toBe(100);
    }
  });

  it('refuses to score four Eights or four Sevens', () => {
    const d = declare(['8S', '8H', '8D', '8C', '7S', '7H', '7D', '7C'], 0);
    expect(d.filter((x) => x.kind === 'carre')).toHaveLength(0);
  });
});

describe('resolving the declaration contest', () => {
  const resolve = (perSeat: Declaration[][], tieCancels = true) =>
    resolveDeclarations(perSeat, teamOf, { declarationTieCancels: tieCancels });

  it('gives a team with declarations everything when the other team has none', () => {
    const r = resolve([declare(['7H', '8H', '9H', 'AS', 'KC', 'QD', 'JD', '10S'], 0), [], [], []]);
    expect(r.winningTeam).toBe(0);
    expect(r.perTeamValue).toEqual([20, 0]);
  });

  it('cancels everything when the two best declarations are exactly equal', () => {
    // Both a terca topped by the nine: identical kind, length and top card.
    const h0 = ['7H', '8H', '9H', 'AS', 'KC', 'QC', 'JD', '10S'];
    const h1 = ['7D', '8D', '9D', 'KS', 'AC', '10C', 'JH', '9S'];
    assertDisjoint(h0, h1);

    const t0 = declare(h0, 0);
    const t1 = declare(h1, 1);
    expect(t0).toHaveLength(1);
    expect(t1).toHaveLength(1);

    const r = resolve([t0, t1, [], []]);
    expect(r.winningTeam).toBeNull();
    expect(r.perTeamValue).toEqual([0, 0]);
  });

  it('breaks an equal-length tie on the higher top card', () => {
    const h0 = ['7H', '8H', '9H', 'AS', 'KC', 'QC', 'JD', '10S']; // terca, top 9
    const h1 = ['8D', '9D', '10D', 'KS', 'AC', '10C', 'JH', '9S']; // terca, top 10
    assertDisjoint(h0, h1);

    const r = resolve([declare(h0, 0), declare(h1, 1), [], []]);
    expect(r.winningTeam).toBe(1);
    expect(r.perTeamValue).toEqual([0, 20]);
  });

  it('ranks a longer sequence above a shorter one', () => {
    const h0 = ['7H', '8H', '9H', '10H', 'AS', 'KC', 'QC', '7C']; // kvarta 50
    const h1 = ['9D', '10D', 'JD', 'KS', 'AC', '10C', 'JH', '9S']; // terca 20, top J
    assertDisjoint(h0, h1);

    const r = resolve([declare(h0, 0), declare(h1, 1), [], []]);
    expect(r.winningTeam).toBe(0);
    expect(r.perTeamValue).toEqual([50, 0]);
  });

  /** A carre outranks ANY sequence, even one of identical point value. */
  it('ranks a carre above a kvinta of the same value', () => {
    const h0 = ['QS', 'QH', 'QD', 'QC', '7S', '8S', '7D', '8D']; // carre 100
    const h1 = ['7H', '8H', '9H', '10H', 'JH', '7C', '8C', '9S']; // kvinta 100
    assertDisjoint(h0, h1);

    const carre = declare(h0, 0);
    const kvinta = declare(h1, 1);
    expect(carre.find((x) => x.kind === 'carre')!.value).toBe(100);
    expect(kvinta.find((x) => x.kind === 'sequence')!.value).toBe(100);

    const r = resolve([carre, kvinta, [], []]);
    expect(r.winningTeam).toBe(0);
    expect(r.perTeamValue).toEqual([100, 0]);
  });

  it('awards the winning team ALL of its declarations, partner included', () => {
    const h0 = ['JS', 'JH', 'JD', 'JC', 'AC', 'KD', 'QS', '10H']; // carre of jacks, 200
    const h1 = ['7D', '8D', '9D', '10D', 'KS', 'AH', '10C', '9S']; // kvarta 50
    const h2 = ['7H', '8H', '9H', 'AS', 'KC', 'QC', '10S', '9C']; // terca 20
    assertDisjoint(h0, h1, h2);

    const r = resolve([declare(h0, 0), declare(h1, 1), declare(h2, 2), []]);
    expect(r.winningTeam).toBe(0);
    // 200 from seat 0 plus its partner's 20; the losing team's kvarta scores nothing.
    expect(r.perTeamValue).toEqual([220, 0]);
    expect(r.winningDeclarations).toHaveLength(2);
  });

  it('scores nothing at all when nobody declares', () => {
    const r = resolve([[], [], [], []]);
    expect(r.winningTeam).toBeNull();
    expect(r.perTeamValue).toEqual([0, 0]);
  });

  it('awards a tie to the earliest seat when cancelling is switched off', () => {
    const h0 = ['7H', '8H', '9H', 'AS', 'KC', 'QC', 'JD', '10S'];
    const h1 = ['7D', '8D', '9D', 'KS', 'AC', '10C', 'JH', '9S'];
    assertDisjoint(h0, h1);

    const r = resolve([declare(h0, 0), declare(h1, 1), [], []], false);
    expect(r.winningTeam).toBe(0);
    expect(r.perTeamValue).toEqual([20, 0]);
  });

  it('ships with ties resolving to the first player, not cancelling (UHDDR rule 7)', () => {
    expect(DEFAULT_CONFIG.declarationTieCancels).toBe(false);
  });
});
