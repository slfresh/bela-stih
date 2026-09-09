import { useEffect, useRef, useState } from 'react';
import { useKeepAwake } from 'expo-keep-awake';
import { teamOf } from '@belot/engine';
import { anchorId } from './anim/FxBus';
import { COIN_CASCADE_COUNT, COIN_CASCADE_DELAY_MS, coinDingTimers, coinsLandedMs } from './anim/lifetimes';
import { playSfx } from './audio';
import { pattern } from './haptics';
import { TableScreen } from './TableScreen';
import { HUMAN, useGame } from './useGame';
import type { Settings } from './storage';

/**
 * A local game against the bots. A rematch remounts the inner match component,
 * so table, director, anchors and effects always restart together.
 */
export function OfflineGame({
  settings,
  onSettingsChange,
  onExit,
}: {
  settings: Settings;
  onSettingsChange?: (s: Settings) => void;
  onExit: () => void;
}) {
  const [matchId, setMatchId] = useState(0);
  return (
    <OfflineMatch
      key={matchId}
      settings={settings}
      onSettingsChange={onSettingsChange}
      onExit={onExit}
      onRematch={() => setMatchId((n) => n + 1)}
    />
  );
}

function OfflineMatch({
  settings,
  onSettingsChange,
  onExit,
  onRematch,
}: {
  settings: Settings;
  onSettingsChange?: (s: Settings) => void;
  onExit: () => void;
  onRematch: () => void;
}) {
  useKeepAwake();
  const g = useGame(settings);

  const settled = g.view.phase === 'DEAL_OVER' || g.view.phase === 'MATCH_OVER';
  const matchOver = g.view.phase === 'MATCH_OVER';

  // Reward coins fly to the wallet; a won match rains confetti. Fired from
  // state changes so online can reuse the identical pattern.
  const lastBanner = useRef<typeof g.banner>(null);
  useEffect(() => {
    if (!(g.banner && g.banner !== lastBanner.current && g.banner.coins > 0)) {
      lastBanner.current = g.banner;
      return;
    }
    lastBanner.current = g.banner;
    // From the sheet's "Upisano" total once the sheet has slid up and settled;
    // from the felt if there is no sheet (a UI timer, cancelled on unmount).
    const timers = [
      setTimeout(() => {
        const from = g.anchors.centre(anchorId.sheetTotal) ?? g.anchors.centre(anchorId.deck);
        const to = g.anchors.centre(anchorId.wallet);
        if (from && to) g.fxBus.emit({ kind: 'coins', from, to, count: COIN_CASCADE_COUNT });
      }, COIN_CASCADE_DELAY_MS),
      // One ding per coin as it lands, and the level-up run with the badge.
      ...coinDingTimers(COIN_CASCADE_COUNT, COIN_CASCADE_DELAY_MS),
      ...(g.banner.levelUp !== null
        ? [
            setTimeout(() => {
              playSfx('levelup');
              pattern('levelUp');
            }, COIN_CASCADE_DELAY_MS + coinsLandedMs(COIN_CASCADE_COUNT)),
          ]
        : []),
    ];
    return () => timers.forEach(clearTimeout);
  }, [g.banner, g.anchors, g.fxBus]);

  const cheered = useRef(false);
  useEffect(() => {
    if (matchOver && !cheered.current && g.table.winner() === teamOf(HUMAN)) {
      cheered.current = true;
      if (g.motion !== 'reduced') {
        g.fxBus.emit({ kind: 'confetti' });
        const at = g.anchors.centre(anchorId.deck);
        if (at) g.fxBus.emit({ kind: 'burst', at, count: 40 });
      }
    }
  }, [matchOver, g.table, g.fxBus]);

  return (
    <TableScreen
      mySeat={HUMAN}
      lang={g.lang}
      view={g.view}
      spotlightSeat={g.spotlight}
      cue={g.cue}
      reducedMotion={g.motion === 'reduced'}
      hardMode={settings.hardMode}
      handSort={settings.handSort}
      onHandSortChange={(m) => onSettingsChange?.({ ...settings, handSort: m })}
      confirmPlay={settings.confirmPlay}
      options={settled || !g.idle ? [] : g.view.legalActions}
      myTurn={g.myTurn}
      settled={settled}
      matchOver={matchOver}
      lastDealResult={g.table.state.lastDealResult}
      matchScores={g.view.matchScores}
      winnerTeam={g.table.winner()}
      profile={g.profile}
      banner={g.banner}
      anchors={g.anchors}
      fxBus={g.fxBus}
      turnDeadline={null}
      onAction={g.submit}
      onNext={g.nextDeal}
      onFinish={matchOver ? onRematch : onExit}
      finishLabel={matchOver ? g.lang.s.newMatch : g.lang.s.ui.back}
      onEmote={g.emote}
    />
  );
}
