import { runScenario, SCENARIOS } from './run';

/**
 * Finds, for every scenario, the first free seed at or after its current one
 * under which the match announces zvanja and reveals them, a renons scenario
 * credits announced zvanja at least once, the searched tie-cancel scenario
 * still cancels, and the longest learn match is forced on the dealer (muss)
 * at least once - so the committed corpus keeps reaching every rare path when
 * the play policy changes. Seeds are distinct across scenarios. A dev tool:
 *
 *   npx tsx packages/engine/test/golden/search-seeds.ts
 */
const taken = new Set<number>();
const chosen: Record<string, number> = {};
for (const sc of SCENARIOS) {
  const fixed = sc.name === 'knobs-tiecancel-cancelled-501';
  let found: number | null = null;
  for (let seed = sc.seed; seed < sc.seed + 600; seed++) {
    if (taken.has(seed)) continue;
    const r = runScenario({ ...sc, seed });
    const auto = sc.config.declarationMode === 'auto';
    const ok =
      (auto ? r.coverage.zvanjaPaid > 0 : r.coverage.announced > 0) &&
      (auto || (fixed ? r.coverage.cancelled > 0 : (r.events['declarationsRevealed'] ?? 0) > 0)) &&
      (sc.policy !== 'renons' || r.coverage.renonsZvanja > 0) &&
      (sc.name !== 'learn-1001' || r.coverage.muss > 0);
    if (ok) {
      found = seed;
      taken.add(seed);
      chosen[sc.name] = seed;
      console.log(
        `${sc.name}: seed ${seed}${seed === sc.seed ? ' (unchanged)' : ` (was ${sc.seed})`} - deals ${r.deals}, announced ${r.coverage.announced}, revealed ${r.events['declarationsRevealed'] ?? 0}, muss ${r.coverage.muss}, renons ${r.coverage.renons}/${r.coverage.renonsZvanja}, cancelled ${r.coverage.cancelled}, kontra ${r.coverage.kontra}, valat ${r.coverage.valat}`,
      );
      break;
    }
    if (fixed) break;
  }
  if (found === null) console.log(`${sc.name}: NO seed in range`);
}
console.log(JSON.stringify(chosen));
