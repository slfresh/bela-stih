import { useEffect, useRef } from 'react';
import { ActivityIndicator, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import type { Seat } from '@belot/engine';
import { teamOf } from '@belot/engine';
import { anchorId } from '../anim/FxBus';
import { Button, TableScreen, type SeatMeta } from '../TableScreen';
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
  mode,
  joinCode,
  onExit,
}: {
  settings: Settings;
  mode: 'quick' | 'create' | 'join';
  joinCode?: string;
  onExit: () => void;
}) {
  useKeepAwake();
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
  const lastBanner = useRef<typeof net.banner>(null);
  useEffect(() => {
    if (net.banner && net.banner !== lastBanner.current && net.banner.coins > 0) {
      const from = net.anchors.centre(anchorId.deck);
      const to = net.anchors.centre(anchorId.wallet);
      if (from && to) net.fxBus.emit({ kind: 'coins', from, to, count: 6 });
    }
    lastBanner.current = net.banner;
  }, [net.banner, net.anchors, net.fxBus]);

  const cheered = useRef(false);
  useEffect(() => {
    if (
      net.matchOver &&
      !cheered.current &&
      net.seat !== null &&
      net.winnerTeam === teamOf(net.seat)
    ) {
      cheered.current = true;
      net.fxBus.emit({ kind: 'confetti' });
    }
  }, [net.matchOver, net.winnerTeam, net.seat, net.fxBus]);

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
            {net.seats.map((s) => (
              <Text key={s.seat} style={styles.seatLine}>
                {s.connected ? '●' : '○'} {s.name}
                {s.seat === net.seat ? `  (${net.lang.s.seat[0]})` : ''}
              </Text>
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
});
