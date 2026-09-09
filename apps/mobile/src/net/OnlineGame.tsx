import { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import type { Seat } from '@belot/engine';
import { teamOf } from '@belot/engine';
import { anchorId } from '../anim/FxBus';
import { COIN_CASCADE_COUNT, COIN_CASCADE_DELAY_MS, coinDingTimers, coinsLandedMs, MATCH_CASCADE_HOLD_MS } from '../anim/lifetimes';
import { isMatchAward } from '../feedback';
import { playSfx } from '../audio';
import { pattern } from '../haptics';
import { TableScreen, type SeatMeta } from '../TableScreen';
import { Button } from '../ui/Button';
import { radius, theme } from '../theme';
import type { Settings } from '../storage';
import { SERVER_URL, useNetGame, type NetGame } from './useNetGame';

/**
 * An online game. Everything about the rules comes from the server; this only
 * decides what to show while the table fills, and hands `TableScreen` the same
 * props the offline mode does — the screen cannot tell the difference.
 */
export function OnlineGame({
  settings,
  onSettingsChange,
  mode,
  joinCode,
  onExit,
}: {
  settings: Settings;
  onSettingsChange?: (s: Settings) => void;
  mode: 'quick' | 'create' | 'join';
  joinCode?: string;
  onExit: () => void;
}) {
  // Not on the web: the Wake Lock API needs a gesture and a secure context,
  // and deactivating a lock that never activated rejects with
  // ERR_KEEP_AWAKE_TAG_INVALID on every exit. The platform never changes at
  // runtime, so the hook order is stable.
  if (Platform.OS !== 'web') useKeepAwake(); // eslint-disable-line react-hooks/rules-of-hooks
  const net = useNetGame(settings);
  const { status, quickPlay, createPrivate, joinById } = net;

  // Connect once, on the way in.
  useEffect(() => {
    if (mode === 'quick') void quickPlay();
    else if (mode === 'create') void createPrivate();
    else if (joinCode) void joinById(joinCode);
    // Intentionally runs once: reconnecting is an explicit user action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Same celebration wiring as offline: coins to the wallet, confetti on a win.
  // One cascade per banner. A match's award is MERGED onto the last deal's
  // banner a second later, so that banner's pending timers are replaced by
  // the merged banner's own — nothing is lost, nothing plays twice, and a
  // match's coins wait for the fanfare. The timers die with the screen.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const lastBanner = useRef<typeof net.banner>(null);
  useEffect(() => {
    const banner = net.banner;
    if (!banner || banner === lastBanner.current) return;
    lastBanner.current = banner;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const hold = isMatchAward(banner) ? MATCH_CASCADE_HOLD_MS : 0;
    const delay = COIN_CASCADE_DELAY_MS + hold;
    if (banner.coins > 0) {
      // From the sheet's "Upisano" total once the sheet has slid up and
      // settled; from the felt if there is no sheet.
      timers.current.push(
        setTimeout(() => {
          // Measured again first: the sheet's total was measured as the sheet
          // slid up, a viewport low on the web. No arc under reduce-motion —
          // the wallet still counts, and the coins still ding.
          if (net.motion === 'reduced') return;
          void net.anchors.refresh().then(() => {
            const from = net.anchors.centre(anchorId.sheetTotal) ?? net.anchors.centre(anchorId.deck);
            const to = net.anchors.centre(anchorId.wallet);
            if (from && to) net.fxBus.emit({ kind: 'coins', from, to, count: COIN_CASCADE_COUNT });
          });
        }, delay),
        // One ding per coin as it lands.
        ...coinDingTimers(COIN_CASCADE_COUNT, delay),
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
          },
          delay + coinsLandedMs(COIN_CASCADE_COUNT),
        ),
      );
    }
  }, [net.banner, net.anchors, net.fxBus, net.motion]);

  // Everyone still connected has to accept; bots and empty seats never count.
  const seatedHumans = net.seats.filter((s) => s.connected && !s.bot).length;
  const waitingForRematch = Math.max(0, seatedHumans - net.rematchVotes.length);

  // Every match of a series deserves its own confetti, so the latch is keyed
  // on the match rather than on the mount.
  const cheeredMatch = useRef(-1);
  useEffect(() => {
    if (
      net.matchOver &&
      cheeredMatch.current !== net.matchNumber &&
      net.seat !== null &&
      net.winnerTeam === teamOf(net.seat)
    ) {
      cheeredMatch.current = net.matchNumber;
      if (net.motion !== 'reduced') {
        net.fxBus.emit({ kind: 'confetti' });
        const at = net.anchors.centre(anchorId.deck);
        if (at) net.fxBus.emit({ kind: 'burst', at, count: 40 });
      }
    }
  }, [net.matchOver, net.matchNumber, net.winnerTeam, net.seat, net.fxBus]);

  const leaveAndExit = () => {
    net.leave();
    onExit();
  };

  // 'finished' keeps the table mounted: the result sheet, winner banner and
  // confetti all live inside TableScreen.
  if (net.seat === null || net.view === null || (status !== 'playing' && status !== 'finished')) {
    return <Waiting net={net} onExit={leaveAndExit} />;
  }

  const settled = net.view.phase === 'DEAL_OVER' || net.view.phase === 'MATCH_OVER';
  const seatMeta: (SeatMeta | null)[] = [null, null, null, null];
  for (const s of net.seats) {
    seatMeta[s.seat] = {
      name: s.seat === net.seat ? net.lang.s.seat[0] : s.name,
      avatar: s.avatar || null,
      bot: s.bot,
      connected: s.connected,
    };
  }

  const away = net.seats.filter((s) => s.bot && s.seat !== net.seat);

  return (
    <TableScreen
      mySeat={net.seat}
      lang={net.lang}
      view={net.view}
      spotlightSeat={net.spotlight}
      cue={net.cue}
      dealerHop={net.dealerHop}
      reducedMotion={net.motion === 'reduced'}
      hardMode={net.hard}
      handSort={settings.handSort}
      onHandSortChange={(m) => onSettingsChange?.({ ...settings, handSort: m })}
      confirmPlay={settings.confirmPlay}
      series={net.series}
      askedRematch={net.rematchVotes.includes(net.seat)}
      waitingFor={waitingForRematch}
      onRematch={net.rematch}
      onForceRematch={net.seat === net.hostSeat ? net.rematchStart : undefined}
      options={settled || !net.idle ? [] : net.view.legalActions}
      myTurn={net.idle && net.view.toAct === net.seat}
      settled={settled}
      matchOver={net.matchOver}
      lastDealResult={net.lastDealResult}
      matchScores={net.view.matchScores}
      winnerTeam={net.winnerTeam}
      profile={net.profile}
      banner={net.banner}
      seatMeta={seatMeta}
      status={
        away.length > 0
          ? net.lang.s.ui.botPlaysFor(away.map((s) => s.name).join(', '))
          : net.error
      }
      anchors={net.anchors}
      fxBus={net.fxBus}
      turnDeadline={net.turnDeadline}
      turnTotalMs={net.turnTotalMs}
      onAction={net.submit}
      onNext={net.next}
      onFinish={leaveAndExit}
      finishLabel={net.lang.s.ui.leaveTable}
      onEmote={net.sendEmote}
    />
  );
}

/** Everything that happens before four people are sitting down. */
function Waiting({ net, onExit }: { net: NetGame; onExit: () => void }) {
  const seated = net.seats.filter((s) => s.connected).length;
  const ui = net.lang.s.ui;

  const message =
    net.status === 'connecting'
      ? ui.connecting
      : net.status === 'error'
        ? ui.cannotConnect(SERVER_URL)
        : net.status === 'disconnected'
          ? ui.connectionLost
          : ui.waitingForPlayers(seated);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.centre}>
        {net.status === 'connecting' || net.status === 'waiting' ? (
          <ActivityIndicator color={theme.accent} size="large" />
        ) : null}
        <Text style={styles.title}>{message}</Text>
        {net.error && net.status !== 'waiting' && <Text style={styles.error}>{net.error}</Text>}

        {net.roomId && (
          <View style={styles.panel}>
            <Text style={styles.label}>{ui.tableCode}</Text>
            <Text selectable style={styles.code}>
              {net.roomId}
            </Text>
            <Text style={styles.hint}>{ui.shareCode}</Text>
            {net.seat !== null &&
              net.seat === net.hostSeat &&
              net.status === 'waiting' &&
              seated >= 1 &&
              seated < 4 && (
                <Button label={ui.startWithBots} tone="strong" onPress={net.startWithBots} />
              )}
            <Button
              label={ui.invite}
              tone="strong"
              onPress={() => {
                // The link opens the app straight into this table; for anyone
                // without the app it lands on a page showing the code.
                void Share.share({
                  message: ui.inviteText(`https://belastih.com/join/${net.roomId}`),
                }).catch(() => {});
              }}
            />
          </View>
        )}

        {net.seats.length > 0 && (
          <View style={styles.panel}>
            {/* Two team rows: 0&2 vs 1&3. Before the start, an empty seat is a
                button — tap it to move there and pick your partner. */}
            {([[0, 2], [1, 3]] as const).map((team, ti) => (
              <View key={ti} style={styles.teamRow}>
                <Text style={styles.teamTag}>
                  {ti === 0 ? net.lang.s.teamA : net.lang.s.teamB}
                </Text>
                {team.map((idx) => {
                  const s = net.seats[idx]!;
                  const free = !s.connected && net.status === 'waiting';
                  const canSit = free && net.seat !== null && net.seat !== idx;
                  return (
                    <Pressable
                      key={idx}
                      disabled={!canSit}
                      onPress={() => net.sit(idx as Seat)}
                      style={[styles.seatCell, canSit && styles.seatCellFree]}
                    >
                      <Text style={styles.seatLine}>
                        {s.connected ? '●' : '○'}{' '}
                        {s.connected ? s.name : canSit ? ui.sitHere : s.name}
                        {idx === net.seat ? `  (${net.lang.s.seat[0]})` : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        )}

        <Button label={ui.back} tone="plain" onPress={onExit} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.feltDeep },
  centre: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 18, padding: 24 },
  title: { color: theme.text, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  error: { color: theme.danger, fontSize: 13, textAlign: 'center' },
  panel: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: theme.line,
    padding: 14,
    gap: 6,
    alignItems: 'center',
  },
  label: { color: theme.textDim, fontSize: 13 },
  code: { color: theme.accent, fontSize: 26, fontWeight: '800', letterSpacing: 2 },
  hint: { color: theme.textDim, fontSize: 12, textAlign: 'center' },
  seatLine: { color: theme.text, fontSize: 15 },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 4 },
  teamTag: { color: theme.textDim, fontSize: 12, width: 34 },
  seatCell: { flex: 1, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 10 },
  seatCellFree: { borderWidth: 1, borderColor: theme.line, borderStyle: 'dashed' },
});
