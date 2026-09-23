import { useEffect, useRef, useState } from 'react';
import { room } from '../cosmetics';
import {
  ActivityIndicator,
  Linking,
  Platform,
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
import { font, ink, radius, space, surface, theme, type } from '../theme';
import { Panel } from '../ui/Panel';
import { SEAT_MAP_ASPECT, SeatMap } from './SeatMap';
import { seatName } from './seatName';
import { stillReading } from './hold';
import { PressScale } from '../ui/PressScale';
import { TURN_CHOICES_S } from './clock';
import { reportMailto, reportStamp } from '../report';
import { APP_VERSION } from '../screens/common';
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
  // confetti all live inside TableScreen. So does a dropped connection once the
  // match is under way: the table stays, with "getting you back" over it, while
  // the hook reconnects to the seat - it used to swap to the lobby, which is
  // where a phone call left the player.
  const atTable = status === 'playing' || status === 'finished' || net.reconnecting;
  if (net.seat === null || net.view === null || !atTable) {
    return <Waiting net={net} onExit={leaveAndExit} />;
  }

  const settled = net.view.phase === 'DEAL_OVER' || net.view.phase === 'MATCH_OVER';
  const seatMeta: (SeatMeta | null)[] = [null, null, null, null];
  for (const s of net.seats) {
    seatMeta[s.seat] = {
      name: s.seat === net.seat ? net.lang.s.seat[0] : seatName(net.lang, s),
      avatar: s.avatar || null,
      bot: s.bot,
      connected: s.connected,
    };
  }

  // Only people a bot stands in for: a table started with bots names nobody.
  const away = net.standIns;

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
      // A private table can stand still; quick play never does.
      hold={net.hold}
      onPause={net.isPrivate ? net.pause : undefined}
      onResume={net.isPrivate ? net.resume : undefined}
      onPlayOn={net.isPrivate ? net.playOn : undefined}
      reconnecting={net.reconnecting}
      nextDeal={
        net.view.phase === 'DEAL_OVER'
          ? {
              deadline: net.nextDeadline,
              ready: net.nextVotes.includes(net.seat),
              waitingFor: stillReading(net.seats, net.nextVotes, net.seat).map((s) =>
                seatName(net.lang, net.seats.find((x) => x.seat === s)!),
              ),
            }
          : undefined
      }
      // Nothing can be played while the table stands still or this device is
      // off the line: the server would only refuse it.
      options={settled || !net.idle || net.hold !== null || net.reconnecting ? [] : net.view.legalActions}
      myTurn={net.idle && net.view.toAct === net.seat}
      settled={settled}
      matchOver={net.matchOver}
      lastDealResult={net.lastDealResult}
      matchScores={net.view.matchScores}
      winnerTeam={net.winnerTeam}
      profile={net.profile}
      banner={net.banner}
      seatMeta={seatMeta}
      // A refused move outranks the bot line: it is about the tap just made,
      // and the table's next move clears it.
      // While this device gets back into its seat the panel over the table
      // says so; the raw "veza prekinuta (1005)" above the score would only
      // say it again, with a socket code nobody needs.
      status={
        (net.reconnecting ? null : net.error) ??
        (away.length > 0 ? net.lang.s.ui.botPlaysFor(away.map((s) => seatName(net.lang, s)).join(', ')) : null)
      }
      statusIsError={!net.reconnecting && net.error !== null}
      anchors={net.anchors}
      fxBus={net.fxBus}
      turnDeadline={net.turnDeadline}
      turnTotalMs={net.turnTotalMs}
      onAction={net.submit}
      onNext={net.next}
      onFinish={leaveAndExit}
      finishLabel={net.lang.s.ui.leaveTable}
      onEmote={net.sendEmote}
      gifts={net.gifts}
      giftLanded={net.giftLanded}
      giftFrom={net.giftFrom}
      giftReadyAt={net.giftReadyAt}
      giftReach={net.giftReach}
      onGift={net.sendGift}
      hidden={net.hidden}
      onHide={net.hide}
      onReport={(s) => {
        // The player's own mail app: the nickname as the room has it, the
        // table, the time and the version; nothing about the reporter.
        const url = reportMailto(net.lang.s.ui, {
          name: net.realName(s),
          code: net.roomId ?? '',
          at: reportStamp(new Date()),
          version: APP_VERSION,
        });
        void Linking.openURL(url).catch(() => {});
      }}
    />
  );
}

/** Everything that happens before four people are sitting down. */
function Waiting({ net, onExit }: { net: NetGame; onExit: () => void }) {
  // Laid out to the screen's measured box: the table above the invitation on
  // a phone held upright, beside it on a phone on its side, where stacked they
  // pushed both buttons under the fold.
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The clipboard answers asynchronously; the game may have started by then.
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );
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

  // Side by side whenever the screen is wider than tall and short enough that
  // the stacked lobby (about 610 dp with the bots button) would scroll.
  const land = box.w > box.h && box.h > 0 && box.h < LAND_MAX_H;
  // Short portrait phones (320x568 and the like) close the gaps up rather than scroll.
  const tight = !land && box.h > 0 && box.h < 640;
  const pad = land || tight ? space.md : space.xxl;
  const mapW = land
    ? Math.min(MAP_MAX_W, Math.round((box.w - 2 * pad - space.lg) * 0.5), Math.floor((box.h - 2 * pad) / SEAT_MAP_ASPECT))
    : Math.min(MAP_MAX_W, box.w - 2 * pad);
  const columnW = land ? Math.min(MAP_MAX_W, box.w - 2 * pad - space.lg - mapW) : mapW;

  const canStart =
    net.seat !== null && net.seat === net.hostSeat && net.status === 'waiting' && seated >= 1 && seated < 4;

  const invite = () => {
    // The link opens the app straight into this table; for anyone without the
    // app it lands on a page showing the code.
    const text = ui.inviteText(`https://belastih.com/join/${net.roomId}`);
    Share.share({ message: text }).catch((err: unknown) => {
      // A browser with no share sheet (most desktops) refuses at once, and the
      // button used to do nothing at all there: the invitation goes to the
      // clipboard instead, and the panel says so. A share the player
      // cancelled is not a failure, and a phone always has its share sheet.
      if (Platform.OS !== 'web' || (err as { name?: string } | null)?.name === 'AbortError') return;
      const clipboard = (globalThis.navigator as { clipboard?: { writeText?: (t: string) => Promise<void> } } | undefined)
        ?.clipboard;
      clipboard?.writeText?.(text).then(
        () => {
          if (!mounted.current) return;
          setCopied(true);
          if (copiedTimer.current) clearTimeout(copiedTimer.current);
          copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
        },
        () => {},
      );
    });
  };

  const status = (
    <View style={styles.status}>
      {net.status === 'connecting' ? <ActivityIndicator color={theme.accent} size="large" /> : null}
      <Text style={styles.title}>{message}</Text>
      {net.error && net.status !== 'waiting' && <Text style={styles.error}>{net.error}</Text>}
      {net.status === 'error' && <Button label={ui.retry} tone="strong" onPress={net.retry} />}
    </View>
  );

  const map =
    net.seats.length > 0 && mapW > 0 ? (
      <SeatMap
        width={mapW}
        seats={net.seats}
        mySeat={net.seat}
        hostSeat={net.hostSeat}
        canSit={net.status === 'waiting'}
        lang={net.lang}
        room={room()}
        anchors={net.anchors}
        onSit={net.sit}
      />
    ) : null;

  // The code sits with the words that say what to do with it and the button
  // that sends it — not under the pucks in the middle of the felt, where a
  // phone narrower than the table's plate hid it behind two of them.
  const invitation =
    net.roomId && columnW > 0 ? (
      <Panel style={[styles.invite, { width: columnW }]}>
        <View style={styles.codeBlock}>
          <Text style={styles.codeLabel}>{ui.tableCode}</Text>
          <Text selectable style={styles.code} numberOfLines={1} adjustsFontSizeToFit>
            {net.roomId}
          </Text>
          <Text style={styles.hint}>{ui.shareCode}</Text>
        </View>
        <Button label={ui.invite} tone="strong" onPress={invite} />
        {/* An alert, so a screen reader says it the moment it appears. */}
        {copied && (
          <Text style={styles.copied} role="alert">
            {ui.inviteCopied}
          </Text>
        )}
        {canStart && <Button label={ui.startWithBots} onPress={net.startWithBots} />}
      </Panel>
    ) : null;

  // A private table's turn clock: the host picks, everyone sees it. Quick
  // play keeps 30 s for strangers and shows nothing here.
  const isHost = net.seat !== null && net.seat === net.hostSeat;
  const clock =
    net.isPrivate && net.status === 'waiting' && columnW > 0 ? (
      <View style={[styles.clock, { width: columnW }]}>
        <Text style={styles.clockLabel}>{ui.turnClock}</Text>
        <View style={styles.clockRow} accessibilityRole="radiogroup">
          {TURN_CHOICES_S.map((sec) => {
            const on = net.turnSeconds === sec;
            return (
              <PressScale
                key={sec}
                disabled={!isHost}
                onPress={() => net.setClock(sec)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on, disabled: !isHost }}
                style={[styles.clockChip, on && styles.clockChipOn, !isHost && !on && styles.clockChipIdle]}
              >
                <Text style={[styles.clockText, on && styles.clockTextOn]}>{ui.seconds(sec)}</Text>
              </PressScale>
            );
          })}
        </View>
      </View>
    ) : null;

  const back = <Button label={ui.back} tone="plain" onPress={onExit} />;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: room().page }]}>
      <ScrollView
        contentContainerStyle={[styles.centre, { padding: pad, gap: tight ? space.md : space.lg + 2 }, land && styles.row]}
        onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      >
        {land ? (
          <>
            {map}
            <View style={[styles.column, { width: columnW }]}>
              {status}
              {invitation}
              {clock}
              {back}
            </View>
          </>
        ) : (
          <>
            {status}
            {map}
            {invitation}
            {clock}
            {back}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** How long "copied" stays under the invite button. */
const COPIED_MS = 4000;
/** Neither the seat map nor the invitation beside it grows past this. */
const MAP_MAX_W = 420;
/** Taller than this and a screen on its side has room to stack (a big tablet). */
const LAND_MAX_H = 700;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.feltDeep },
  centre: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: space.lg },
  column: { alignItems: 'center', gap: space.md },
  status: { alignItems: 'center', gap: space.sm + 2 },
  title: { color: theme.text, fontSize: 20, fontFamily: font.bold, textAlign: 'center' },
  error: { color: theme.dangerInk, fontSize: 13, textAlign: 'center' },
  invite: { gap: space.sm + 2 },
  codeBlock: { alignItems: 'center', gap: 2 },
  codeLabel: { color: ink.mid, ...type.caption },
  code: { color: theme.accent, ...type.h1, letterSpacing: 2, textAlign: 'center' },
  hint: { color: ink.mid, ...type.sub, textAlign: 'center', marginTop: space.xs },
  copied: { color: theme.okInk, ...type.sub, textAlign: 'center' },
  clock: { alignItems: 'center', gap: space.xs },
  clockLabel: { color: ink.mid, ...type.caption },
  clockRow: { flexDirection: 'row', gap: space.sm, alignSelf: 'stretch' },
  clockChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: surface.chip,
  },
  clockChipOn: { borderColor: theme.accent },
  clockChipIdle: { opacity: 0.55 },
  clockText: { color: ink.mid, fontFamily: font.medium, fontSize: 14 },
  clockTextOn: { color: theme.accent },
});
