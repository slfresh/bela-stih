import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { teamOf } from '@belot/engine';
import { anchorId } from './anim/FxBus';
import { COIN_CASCADE_DELAY_MS, coinCascadeCount, coinDingTimers, coinsLandedMs, MATCH_CASCADE_HOLD_MS } from './anim/lifetimes';
import { isMatchAward } from './feedback';
import { playSfx } from './audio';
import { pattern } from './haptics';
import { TableScreen } from './TableScreen';
import { HUMAN, useGame } from './useGame';
import type { Settings } from './storage';
import { NO_GIFTS, type GiftSeats } from './table/useGifts';
import { BOT_GIFTS_START, type BotGiftState } from './botGifts';

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
  // The table's gifts belong to the table, not to one match: a rematch keeps
  // everybody's badge on, and only leaving the table takes them off.
  const giftStore = useRef<GiftSeats>(NO_GIFTS);
  // So do the bots' manners: a coffee in the last deal and another in the
  // rematch's first would be two deals running.
  const botGiftStore = useRef<BotGiftState>(BOT_GIFTS_START);
  return (
    <OfflineMatch
      key={matchId}
      settings={settings}
      onSettingsChange={onSettingsChange}
      onExit={onExit}
      onRematch={() => setMatchId((n) => n + 1)}
      giftStore={giftStore}
      botGiftStore={botGiftStore}
    />
  );
}

function OfflineMatch({
  settings,
  onSettingsChange,
  onExit,
  onRematch,
  giftStore,
  botGiftStore,
}: {
  settings: Settings;
  onSettingsChange?: (s: Settings) => void;
  onExit: () => void;
  onRematch: () => void;
  giftStore: { current: GiftSeats };
  botGiftStore: { current: BotGiftState };
}) {
  // Not on the web: the Wake Lock API needs a gesture and a secure context,
  // and deactivating a lock that never activated rejects with
  // ERR_KEEP_AWAKE_TAG_INVALID on every exit. The platform never changes at
  // runtime, so the hook order is stable.
  if (Platform.OS !== 'web') useKeepAwake(); // eslint-disable-line react-hooks/rules-of-hooks
  const g = useGame(settings, 'medium', giftStore, botGiftStore);

  const settled = g.view.phase === 'DEAL_OVER' || g.view.phase === 'MATCH_OVER';
  const matchOver = g.view.phase === 'MATCH_OVER';

  // Reward coins fly to the wallet; a won match rains confetti. Fired from
  // state changes so online can reuse the identical pattern.
  // One cascade per banner. A match's award is MERGED onto the last deal's
  // banner a second later, so that banner's pending timers are replaced by
  // the merged banner's own — nothing is lost, nothing plays twice, and a
  // match's coins wait for the fanfare. The timers die with the screen.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const lastBanner = useRef<typeof g.banner>(null);
  useEffect(() => {
    const banner = g.banner;
    if (!banner || banner === lastBanner.current) return;
    lastBanner.current = banner;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const hold = isMatchAward(banner) ? MATCH_CASCADE_HOLD_MS : 0;
    const delay = COIN_CASCADE_DELAY_MS + hold;
    // More coins fly for more: the wallet's lag counts the same number.
    const count = coinCascadeCount(banner.coins);
    if (banner.coins > 0) {
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
            if (from && to) g.fxBus.emit({ kind: 'coins', from, to, count });
          });
        }, delay),
        // One ding per coin as it lands.
        ...coinDingTimers(count, delay),
      );
    }
    // The level-up: its own moment, when the badge swells — the profile bar
    // lags the level by the coins' full flight whether or not coins flew, so
    // a level crossed on a lost deal counts too, and lands with its sound.
    if (banner.levelUp !== null) {
      timers.current.push(
        setTimeout(
          () => {
            playSfx('levelup');
            pattern('levelUp');
            // Seen as well as heard: a burst where the level badge swells.
            if (g.motion !== 'reduced') {
              const at = g.anchors.centre(anchorId.wallet);
              if (at) g.fxBus.emit({ kind: 'burst', at, count: 24 });
            }
          },
          delay + coinsLandedMs(count),
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
      matchLog={g.matchLog}
      cue={g.cue}
      dealerHop={g.dealerHop}
      reducedMotion={g.motion === 'reduced'}
      playMode={settings.difficulty}
      handSort={settings.handSort}
      arrangeTip={settings.arrangeTips < 2}
      onArrangeTip={(learned) =>
        onSettingsChange?.({ ...settings, arrangeTips: learned ? 2 : settings.arrangeTips + 1 })
      }
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
      // A finished match offers a new one AND a way home: web and iOS have no
      // back button, and "Natrag" must never mean "play again".
      onRematch={onRematch}
      rematchLabel={g.lang.s.newMatch}
      onFinish={onExit}
      finishLabel={g.lang.s.ui.back}
      onEmote={g.emote}
      gifts={g.gifts}
      giftLanded={g.giftLanded}
      giftFrom={g.giftFrom}
      giftReadyAt={g.giftReadyAt}
      onGift={g.gift}
    />
  );
}
