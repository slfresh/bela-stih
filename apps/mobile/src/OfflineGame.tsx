import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
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
  // Not on the web: the Wake Lock API needs a gesture and a secure context,
  // and deactivating a lock that never activated rejects with
  // ERR_KEEP_AWAKE_TAG_INVALID on every exit. The platform never changes at
  // runtime, so the hook order is stable.
  if (Platform.OS !== 'web') useKeepAwake(); // eslint-disable-line react-hooks/rules-of-hooks
  const g = useGame(settings);

  const settled = g.view.phase === 'DEAL_OVER' || g.view.phase === 'MATCH_OVER';
  const matchOver = g.view.phase === 'MATCH_OVER';

  // Reward coins fly to the wallet; a won match rains confetti. Fired from
  // state changes so online can reuse the identical pattern.
  // Every timer here dies with the screen and NOT with the next banner: a
  // match's banner arrives a second after the last deal's, and clearing on
  // that change swallowed the deal's coins and its level-up.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const lastBanner = useRef<typeof g.banner>(null);
  useEffect(() => {
    const banner = g.banner;
    if (!banner || banner === lastBanner.current) return;
    const previous = lastBanner.current;
    lastBanner.current = banner;
    // Coins only when this banner brought new ones (a merged match banner
    // carries the deal's again).
    const newCoins = banner.coins - (previous?.coins ?? 0);
    const hasCoins = newCoins > 0 || (previous === null && banner.coins > 0);
    if (hasCoins) {
      // From the sheet's "Upisano" total once the sheet has slid up and
      // settled; from the felt if there is no sheet.
      timers.current.push(
        setTimeout(() => {
          // Measured again first: the sheet's total was measured as the sheet
          // slid up, a viewport low on the web. No arc under reduce-motion —
          // the wallet still counts, and the coins still ding.
          if (g.motion === 'reduced') return;
          void g.anchors.refresh().then(() => {
            const from = g.anchors.centre(anchorId.sheetTotal) ?? g.anchors.centre(anchorId.deck);
            const to = g.anchors.centre(anchorId.wallet);
            if (from && to) g.fxBus.emit({ kind: 'coins', from, to, count: COIN_CASCADE_COUNT });
          });
        }, COIN_CASCADE_DELAY_MS),
        // One ding per coin as it lands.
        ...coinDingTimers(COIN_CASCADE_COUNT, COIN_CASCADE_DELAY_MS),
      );
    }
    // The level-up: its own moment, after the coins if there are any, and
    // whether or not there are — a level crossed on a lost deal counts too.
    if (banner.levelUp !== null && banner.levelUp !== previous?.levelUp) {
      timers.current.push(
        setTimeout(
          () => {
            playSfx('levelup');
            pattern('levelUp');
          },
          COIN_CASCADE_DELAY_MS + (hasCoins ? coinsLandedMs(COIN_CASCADE_COUNT) : 0),
        ),
      );
    }
  }, [g.banner, g.anchors, g.fxBus, g.motion]);

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
      dealerHop={g.dealerHop}
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
