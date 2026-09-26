import { performance } from 'node:perf_hooks';
import { decideAction, type BotLevel } from '@belot/bots';
import {
  applyAction,
  createMatch,
  currentActor,
  makeRng,
  publicView,
  startDeal,
  teamOf,
  type GameState,
} from '@belot/engine';
import { HARD_CONFIG_OVERRIDES, type EngineConfig } from '@belot/shared-types';

/**
 * The arena: two bot levels against each other over duplicate deals, with
 * confidence intervals, so "the new bot is stronger" is a number and not an
 * impression.
 *
 *   npm run arena -- --a medium --b easy --matches 200
 *   npm run arena -- --a medium --b medium --matches 300 --mode hard --target 1001
 *
 * Every seed is played twice: A on seats 0/2 with B on 1/3, then swapped, so
 * both sides get the same cards and the luck of the deal cancels out
 * (duplicate play). The win rate carries a 95% Wilson interval; the points
 * margin per match is a paired difference with its own interval. Also
 * reported, per deal: how often the dealer was forced to call (muss), the
 * caller failed (pad) and a side took every trick (štiglja/valat), and how
 * long a decision took at the 95th percentile. Medium against medium is the
 * baseline every stronger bot is measured from.
 */

interface Args {
  a: BotLevel;
  b: BotLevel;
  matches: number;
  seed: number;
  mode: 'learn' | 'easy' | 'hard';
  target: number;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1]! : null;
  };
  const level = (v: string | null, d: BotLevel): BotLevel => (v === 'easy' || v === 'medium' ? v : d);
  const mode = get('--mode');
  return {
    a: level(get('--a'), 'medium'),
    b: level(get('--b'), 'medium'),
    matches: Number(get('--matches') ?? 200),
    seed: Number(get('--seed') ?? 1),
    mode: mode === 'learn' || mode === 'hard' ? mode : 'easy',
    target: Number(get('--target') ?? 1001),
  };
}

const MODE_CONFIG: Record<Args['mode'], Partial<EngineConfig>> = {
  learn: {},
  easy: { declarationMode: 'blind' },
  hard: HARD_CONFIG_OVERRIDES,
};

interface Outcome {
  /** Points team 0 minus team 1 at the end. */
  margin: number;
  winner: 0 | 1;
  deals: number;
  muss: number;
  pad: number;
  valat: number;
}

/** One match, every seat a bot of the level its team was given. */
function playMatch(seed: number, config: Partial<EngineConfig>, levels: [BotLevel, BotLevel], times: number[]): Outcome {
  let s: GameState = startDeal(createMatch({ seed, dealer: 0, config }));
  const rng = makeRng(seed ^ 0x51ed270b);
  const out: Outcome = { margin: 0, winner: 0, deals: 0, muss: 0, pad: 0, valat: 0 };
  let passes = 0;
  let guard = 0;
  for (;;) {
    if (guard++ > 100_000) throw new Error(`match ${seed} failed to finish`);
    if (s.phase === 'MATCH_OVER') break;
    if (s.phase === 'DEAL_OVER') {
      s = startDeal(s);
      passes = 0;
      continue;
    }
    const actor = currentActor(s);
    if (actor === null) throw new Error(`no actor in phase ${s.phase}`);
    const level = levels[teamOf(actor)];
    const t0 = performance.now();
    const action = decideAction(publicView(s, actor), rng, level);
    times.push(performance.now() - t0);
    if (action.type === 'BID_PASS') passes++;
    if (action.type === 'BID_CALL' && passes === 3) out.muss++;
    // The engine is the judge of legality: an action it refuses names the bot in the error.
    try {
      s = applyAction(s, action);
    } catch (e) {
      throw new Error(`${level} bot at seat ${actor} (seed ${seed}, phase ${s.phase}): ${(e as Error).message}`);
    }
    if ((s.phase === 'DEAL_OVER' || s.phase === 'MATCH_OVER') && s.lastDealResult) {
      out.deals++;
      if (!s.lastDealResult.callerMade && s.lastDealResult.renonsSeat == null) out.pad++;
      if (s.lastDealResult.valatTeam !== null) out.valat++;
      passes = 0;
    }
  }
  out.margin = s.matchScores[0] - s.matchScores[1];
  out.winner = s.matchScores[0] > s.matchScores[1] ? 0 : 1;
  return out;
}

/** Wilson score interval for a proportion, 95%. */
function wilson(k: number, n: number): [number, number] {
  if (n === 0) return [0, 1];
  const z = 1.96;
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [centre - half, centre + half];
}

function meanCi(xs: number[]): [number, number, number] {
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, n - 1));
  const half = (1.96 * sd) / Math.sqrt(n);
  return [mean, mean - half, mean + half];
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const config = { ...MODE_CONFIG[args.mode], matchTarget: args.target };
  const times: number[] = [];
  let aWins = 0;
  const margins: number[] = [];
  let deals = 0;
  let muss = 0;
  let pad = 0;
  let valat = 0;
  const started = performance.now();
  for (let i = 0; i < args.matches; i++) {
    const seed = args.seed + i;
    // Duplicate: the same seed with the levels swapped; A's margin is +m then -m'.
    const first = playMatch(seed, config, [args.a, args.b], times);
    const second = playMatch(seed, config, [args.b, args.a], times);
    if (first.winner === 0) aWins++;
    if (second.winner === 1) aWins++;
    margins.push((first.margin - second.margin) / 2);
    for (const o of [first, second]) {
      deals += o.deals;
      muss += o.muss;
      pad += o.pad;
      valat += o.valat;
    }
  }
  const played = args.matches * 2;
  const [lo, hi] = wilson(aWins, played);
  const [m, mlo, mhi] = meanCi(margins);
  times.sort((x, y) => x - y);
  // Nearest-rank percentiles: the k-th smallest with k = ceil(p n), so 0.95 n whole does not step one too far.
  const rank = (p: number) => times[Math.max(0, Math.ceil(times.length * p) - 1)] ?? 0;
  const p95 = rank(0.95);
  const p50 = rank(0.5);
  console.log(`arena: ${args.a} (A) vs ${args.b} (B), ${args.matches} seeds x 2 orientations, ${args.mode} to ${args.target}, seed ${args.seed}`);
  console.log(`  A wins ${pct(aWins / played)} of ${played} matches (95% CI ${pct(lo)}-${pct(hi)})`);
  console.log(`  A's paired points margin per match ${m.toFixed(1)} (95% CI ${mlo.toFixed(1)} to ${mhi.toFixed(1)})`);
  console.log(`  per deal (${deals}): muss ${pct(muss / deals)}, pad ${pct(pad / deals)}, valat ${pct(valat / deals)}`);
  console.log(`  decisions: ${times.length}, p50 ${p50.toFixed(3)} ms, p95 ${p95.toFixed(3)} ms; ${((performance.now() - started) / 1000).toFixed(1)} s in all`);
  // A machine-readable line for a CI gate or a notebook.
  console.log(JSON.stringify({ a: args.a, b: args.b, matches: played, aWinRate: aWins / played, ci: [lo, hi], margin: m, marginCi: [mlo, mhi], deals, muss: muss / deals, pad: pad / deals, valat: valat / deals, p50, p95 }));
}

main();
