import { StyleSheet, Text, View } from 'react-native';
import type { Lang } from '@belot/i18n';
import type { AnyGame } from '@belot/game-core';
import type { Seat } from '@belot/engine';
import type { NetSession } from './useNetSession';
import { HoldPanel, useNow } from '../table/HoldPanel';
import { localHold, type WireHold } from '../net/hold';
import { Button } from '../ui/Button';
import { ink, num, radius, signal, space, surface, type } from '../theme';

/**
 * What only an online table has, drawn with whichever table the room feeds
 * (Osmice, or a casino game through SessionSource), so the tables themselves
 * stay the ones the offline game draws.
 *
 * Two kinds of thing. The table standing still — this device getting back
 * into its seat, or the friends waiting for one whose line dropped — takes
 * the whole table under Bela's hold panel (OnlineOverlay): nothing can be
 * played anyway, and the way on (play on with a bot, or leave) is the
 * panel's one button. The rest is a line in the strip under the table's
 * header (OnlineBanner, through TableBanner) that leaves the table playable:
 * the room's clock when it waits on me (it plays my default move when it
 * runs out), and between rounds the countdown to the next one, with who is
 * still to say they are ready once I have. It used to lie over the table
 * just under the header, where it covered the names on the others' tiles.
 */

export function OnlineOverlay({
  net,
  lang,
  nameOf,
  onLeave,
  ground,
  reduced,
}: {
  net: NetSession<AnyGame>;
  lang: Lang;
  nameOf: (seat: number) => string;
  onLeave: () => void;
  /** The room's page colour: an opaque ground for the panel. */
  ground: string;
  reduced: boolean;
}) {
  if (net.reconnecting || net.hold) {
    // Bela's panel takes the hold on this device's clock, its seats as Bela's.
    const hold = localHold((net.hold ?? undefined) as WireHold | undefined, net.receivedAt);
    return (
      <HoldPanel
        lang={lang}
        hold={hold}
        reconnecting={net.reconnecting}
        nameOf={(s: Seat) => nameOf(s)}
        onResume={net.resume}
        onPlayOn={net.playOn}
        onLeave={onLeave}
        leaveLabel={lang.s.ui.leaveTable}
        ground={ground}
        reduced={reduced}
      />
    );
  }

  return null;
}

/** The online line for the strip under the table's header: my clock, the next round, a rematch. */
export function OnlineBanner({ net, lang, nameOf }: { net: NetSession<AnyGame>; lang: Lang; nameOf: (seat: number) => string }) {
  const ui = lang.s.ui;
  const o = lang.online;
  // Four ticks a second: the clock's bar moves smoothly enough, and its seconds never skip.
  const now = useNow(250);
  const since = Math.max(0, now - net.receivedAt);
  const left = (ms: number) => Math.max(0, ms - since);
  const secs = (ms: number) => Math.ceil(left(ms) / 1000);
  const me = net.mySeat;
  // Under the hold panel the strip has nothing to say.
  if (net.reconnecting || net.hold) return null;

  // The others on the line who have not voted yet: bots never keep a table waiting.
  const stillOut = (votes: readonly number[]) => net.players.filter((p) => p.connected && !p.bot && p.seat !== me && !votes.includes(p.seat)).map((p) => p.seat);

  const w = net.window;
  if (net.status === 'playing' && w && me !== null && w.seats.includes(me) && net.myTurn) {
    const s = secs(w.msLeft);
    const share = w.totalMs > 0 ? left(w.msLeft) / w.totalMs : 0;
    const colour = share > 0.5 ? signal.clockFull : share > 0.2 ? signal.clockMid : signal.clockLow;
    return (
      <View style={styles.clock} accessibilityRole="timer" accessibilityLabel={o.yourMoveLabel(s)} accessibilityLiveRegion={s <= 5 ? 'polite' : 'none'}>
        <Text style={[styles.text, num]} numberOfLines={1}>
          {o.yourMove(s)}
        </Text>
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              {
                width: `${Math.round(Math.min(1, share) * 100)}%`,
                backgroundColor: colour,
              },
            ]}
          />
        </View>
      </View>
    );
  }
  if (net.roundOver && !net.matchOver && net.nextMsLeft !== null) {
    const voted = me !== null && net.nextVotes.includes(me);
    const out = stillOut(net.nextVotes);
    return (
      <View style={styles.line} accessibilityRole="timer">
        {voted ? (
          <Text style={styles.text} numberOfLines={1}>
            {out.length > 0 ? ui.nextWaitingFor(out.map(nameOf).join(', ')) : ui.nextReady}
          </Text>
        ) : null}
        <Text style={[voted ? styles.sub : styles.text, num]} numberOfLines={1}>
          {o.nextIn(secs(net.nextMsLeft))}
        </Text>
      </View>
    );
  }
  if (net.matchOver && me !== null && net.rematchVotes.includes(me)) {
    // Asked for another match: say who it waits on, and let the host begin without them.
    const out = stillOut(net.rematchVotes);
    return (
      <View style={styles.line}>
        <Text style={styles.text} numberOfLines={1}>
          {out.length > 0 ? ui.waitingForRematch(out.length) : ui.rematchAsked}
        </Text>
        {net.isHost && out.length > 0 ? <Button label={ui.startAnyway} compact onPress={net.rematchStart} /> : null}
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  clock: { width: '100%', maxWidth: 340, alignItems: 'center', gap: 3 },
  line: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: space.sm,
  },
  text: { ...type.sub, color: ink.hi, textAlign: 'center' },
  sub: { ...type.caption, color: ink.mid, textAlign: 'center' },
  track: {
    alignSelf: 'stretch',
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: surface.sunk,
    overflow: 'hidden',
  },
  fill: { height: 4, borderRadius: radius.pill },
});
