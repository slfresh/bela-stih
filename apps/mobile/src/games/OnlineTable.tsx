import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lang } from '@belot/i18n';
import type { AnyGame, ViewOf } from '@belot/game-core';
import { OSMICE } from '@belot/games-osmice';
import { BACCARAT } from '@belot/games-baccarat';
import { BLACKJACK } from '@belot/games-blackjack';
import { HOLDEM } from '@belot/games-holdem';
import { chipBalance, isoDay, refillChips } from '@belot/progression';
import { useNetSession, type NetHow, type NetSession, type NetTrouble } from './useNetSession';
import { OnlineBanner, OnlineOverlay } from './OnlineOverlay';
import { TableBannerProvider } from './TableBanner';
import { retryHelps } from '../net/trouble';
import { useMotionPolicy } from '../anim/useMotionPolicy';
import type { LocalSession } from './useLocalSession';
import { eventGate, type SessionSource } from './source';
import { OsmiceTable } from './osmice/OsmiceGame';
import { CasinoScreen } from './casino/CasinoScreen';
import { BaccaratTable } from './casino/BaccaratGame';
import { BlackjackTable } from './casino/BlackjackGame';
import { HoldemTable } from './casino/HoldemGame';
import type { Person } from './casino/people';
import type { OtherGame } from '../home/MoreGames';
import { AVATAR_IDS } from '../avatarIds';
import { seatName } from '../net/seatName';
import type { Seat } from '@belot/engine';
import { Avatar } from '../avatars';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { Robot } from '../ui/icons';
import { room as roomStyle } from '../cosmetics';
import { loadProfile, saveProfile, type Settings } from '../storage';
import { ink, num, radius, space, stroke, surface, type } from '../theme';

/**
 * A game beyond Bela at a table online: connect (quick play, a new private
 * table, or a friend's code), wait in the lobby with the code to share and
 * the host's "start with bots", then the very same table component the
 * offline game uses — fed by the room instead of the device.
 *
 * The casino games sit down with the room's own stack, bought in from the
 * play-chip balance like any table; a balance that cannot cover it does not
 * connect at all.
 */

const ROOMS: Record<OtherGame, string> = {
  osmice: 'osmice',
  baccarat: 'baccarat',
  blackjack: 'blackjack',
  holdem: 'holdem',
};
const CASINO_STACK: Record<Exclude<OtherGame, 'osmice'>, number> = {
  baccarat: BACCARAT.defaultConfig.startingStack,
  blackjack: BLACKJACK.defaultConfig.startingStack,
  holdem: HOLDEM.defaultConfig.startingStack,
};

/** Every game this screen can seat a player at: what a join by code says it can play. */
const ONLINE_GAMES = Object.keys(ROOMS) as OtherGame[];

/**
 * Can the balance cover a seat at this game's table? Asked once, before the
 * seat is taken: the table's own buy-in lowers the balance a moment later,
 * and asking again then would stand the player up mid-hand. Today's top-up
 * comes first, as at an offline table, so a player who went broke yesterday
 * is not turned away online while offline would seat them.
 */
function canSit(game: OtherGame): boolean {
  if (game === 'osmice') return true;
  const p = refillChips(loadProfile(), isoDay(new Date())).profile;
  saveProfile(p);
  return chipBalance(p) >= CASINO_STACK[game];
}

export function OnlineTable({ game, how, settings, onExit }: { game: OtherGame | null; how: NetHow; settings: Settings; onExit: () => void }) {
  const lang = useMemo(() => new Lang(settings.locale), [settings.locale]);
  // A table joined by code learns its game from the room, and asks in Connected.
  const [affordable, setAffordable] = useState(() => game === null || canSit(game));
  // Trying again is a fresh connection: a fresh mount, and a fresh look at the balance.
  const [attempt, setAttempt] = useState(0);
  // The code of the table this device dropped out of, once Retry goes back to
  // it. A host's Retry used to open a brand-new private table, with a new
  // code, and left the friends waiting at the old one with a bot in the
  // host's chair; it now walks back in by the code, as a friend would.
  const [rejoin, setRejoin] = useState<string | null>(null);
  const retry = useCallback(
    (code: string | null) => {
      setAffordable(game === null || canSit(game));
      if (code !== null) setRejoin(code);
      setAttempt((a) => a + 1);
    },
    [game],
  );
  if (!affordable) return <Broke lang={lang} onExit={onExit} />;
  const way: NetHow = rejoin !== null ? { kind: 'join', code: rejoin } : how;
  return <Connected key={attempt} game={game} how={way} rejoining={rejoin !== null} settings={settings} lang={lang} onExit={onExit} onRetry={retry} />;
}

function Broke({ lang, onExit }: { lang: Lang; onExit: () => void }) {
  return (
    <Frame>
      <Panel label={lang.games.online}>
        <Text style={styles.body}>{lang.casino.broke}</Text>
        <Text style={[styles.label, num]}>{lang.casino.balance(chipBalance(loadProfile()))}</Text>
        <Button label={lang.games.back} onPress={onExit} />
      </Panel>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: roomStyle().page }]}>
      <View style={styles.centre}>{children}</View>
    </SafeAreaView>
  );
}

/** Why there is no table, in the player's words (the same as Bela's lobby says them). */
function troubleText(lang: Lang, t: NetTrouble | null, rejoining: boolean): string {
  const ui = lang.s.ui;
  // Going back to my own table, "no such table" and "already playing" both
  // mean the same thing: my seat is not there to go back to.
  if (rejoining && (t === 'noSuchTable' || t === 'tableClosed')) return lang.online.seatGone;
  switch (t) {
    case 'noSuchTable':
      return ui.troubleNoSuchTable;
    case 'tableClosed':
      return ui.troubleTableClosed;
    case 'sameNetwork':
      return ui.troubleSameNetwork;
    case 'appTooOld':
      return ui.troubleAppTooOld;
    case 'server':
      return ui.troubleServer;
    // Quick play, where Try again opens a fresh table (a table of friends
    // says its own words: see Connected).
    case 'dropped':
    case 'gone':
      return ui.troubleDropped;
    default:
      return ui.troubleOffline;
  }
}

function Connected({
  game: asked,
  how,
  rejoining,
  settings,
  lang,
  onExit,
  onRetry,
}: {
  game: OtherGame | null;
  how: NetHow;
  /** This is Retry walking back into the table the device dropped out of, by its code. */
  rejoining: boolean;
  settings: Settings;
  lang: Lang;
  onExit: () => void;
  /** Try again: with a code, back into that table; without, the way this screen first came in. */
  onRetry: (code: string | null) => void;
}) {
  const g = lang.games;
  const ui = lang.s.ui;
  const reduced = useMotionPolicy(settings.motion) === 'reduced';
  const profile = useMemo(() => loadProfile(), []);
  // Only a real nickname goes to the room: "You" would be the other players' word for a stranger.
  const me = { name: settings.nickname.trim(), avatar: profile.selectedAvatar };
  // Events reach whichever table is drawn, in the order the room sent them,
  // through a gate the table plugs its handler into as it renders (see
  // eventGate): the first round's deal and the bots' opening moves come
  // before there is a table, and wait for it.
  const gate = useMemo(() => eventGate<unknown, unknown>(), []);
  // Joined by code, the room name does not matter (a code reaches its table
  // under any name), but the games do: a code for a table of any other game
  // (a friend's Bela table) is turned away rather than seated.
  const net = useNetSession<AnyGame>(ROOMS[asked ?? 'osmice'], how, me, asked === null ? ONLINE_GAMES : [asked], gate.deliver);
  const game = (asked ?? (net.game as OtherGame | null)) as OtherGame | null;
  const leave = () => {
    net.leave();
    onExit();
  };

  // Joined by code, the balance is asked once the room says which game it
  // plays — once, like OnlineTable's: never again after the buy-in.
  const sitOk = useRef<boolean | null>(asked === null ? null : true);
  if (sitOk.current === null && game !== null) sitOk.current = canSit(game);
  const cannotSit = sitOk.current === false;
  useEffect(() => {
    // Not a seat to keep: a person nobody is behind costs the others the full clock.
    if (cannotSit) net.leave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cannotSit]);

  // Which screen this render draws: the table only once the room has dealt it.
  const atTable = net.status !== 'failed' && !cannotSit && !inLobby(net, game);
  // After every commit: with the table on screen, what waited goes to it
  // first and new events then go straight in; without one, they wait. A
  // layout effect, so the first round's deal reaches the table before the
  // table's own effects run: its shuffle then sounds before its "your turn",
  // as it does offline and in every later round, not after.
  useLayoutEffect(() => {
    if (atTable) gate.open();
    else gate.close();
  });

  // The people at the table, as the room names them; empty and bot seats wear a house character.
  const people: Person[] = useMemo(() => {
    const house = AVATAR_IDS.filter((a) => a !== profile.selectedAvatar);
    return Array.from({ length: net.seatCount }, (_, seat) => {
      const p = net.players[seat];
      const avatar = p?.avatar || house[seat % house.length]!;
      // Me as I call myself; a bot as a house character; anyone else as the room names them, in my language.
      const name =
        seat === net.mySeat
          ? settings.nickname.trim() || g.you
          : !p || p.bot
            ? ui.cosmeticName(house[seat % house.length]!)
            : seatName(lang, { seat: seat as Seat, name: p.name });
      return { name, avatar };
    });
  }, [net.players, net.seatCount, net.mySeat, profile.selectedAvatar, ui, settings.nickname, g.you, lang]);

  if (net.status === 'failed') {
    // Trying again helps when the fault was the line or the server, or when
    // the seat was lost to a drop; a wrong code or a full table stays so.
    const t = net.trouble;
    const canRetry = t === 'dropped' || t === 'gone' || retryHelps(t);
    // Dropped from a table of friends (one I opened, or joined by its code),
    // Retry goes back to that table by its code: a new one would strand the
    // friends at the old code. Quick play has nobody waiting on me, so a
    // fresh public table is as good.
    const friends = how.kind !== 'quick';
    // No going back when the server has said the table is gone (a restart, a
    // deploy, a lobby whose hold ran out), nor to a table that had been dealt:
    // it has locked, and its code seats nobody now. The panel says that at
    // once, rather than offer a Retry that could only fail (or open a new
    // table nobody is at).
    const seatGone = friends && (t === 'gone' || (t === 'dropped' && net.started));
    // Out of time in the lobby, the table may well still be waiting.
    const backTo = t === 'dropped' && friends && !net.started ? net.code : null;
    // A rejoin that found no seat says so too (troubleText), with Back only.
    const retryLabel = backTo !== null || rejoining ? lang.online.backToTable : ui.retry;
    // The line above the buttons names the buttons under it.
    const body = seatGone ? lang.online.seatGone : backTo !== null ? lang.online.dropBeforeStart : troubleText(lang, t, rejoining);
    return (
      <Frame>
        <Panel label={g.online}>
          <Text style={styles.body} accessibilityRole="alert">
            {body}
          </Text>
          {canRetry && !seatGone ? <Button label={retryLabel} tone="strong" onPress={() => onRetry(backTo)} /> : null}
          <Button label={g.back} onPress={onExit} />
        </Panel>
      </Frame>
    );
  }

  if (cannotSit) return <Broke lang={lang} onExit={leave} />;

  if (!atTable) {
    const taken = net.players.filter((p) => p.connected && !p.bot).length;
    // A drop in the lobby walks back in (useNetSession) for up to a minute.
    // Say so, and take Start with bots away meanwhile: it would go to a room
    // this device is not in, and do nothing.
    const reconnectingLine = (
      <View style={styles.connecting} accessibilityLiveRegion="polite">
        <ActivityIndicator color={ink.mid} />
        <Text style={styles.body}>{ui.reconnectingLine}</Text>
      </View>
    );
    return (
      <Frame>
        <Panel label={g.online}>
          {net.status === 'connecting' ? (
            net.reconnecting ? (
              reconnectingLine
            ) : (
              <View style={styles.connecting}>
                <ActivityIndicator color={ink.mid} />
                <Text style={styles.body}>{ui.connecting}</Text>
              </View>
            )
          ) : (
            <>
              <Text style={styles.label}>{g.codeIs}</Text>
              <Text style={[styles.code, num]} accessibilityLabel={`${g.codeIs}: ${net.code ?? ''}`}>
                {net.code}
              </Text>
              <Text style={styles.hint}>{ui.shareCode}</Text>
              <Text style={[styles.body, num]}>{g.seated(taken, net.seatCount)}</Text>
              <View style={styles.chairs}>
                {Array.from({ length: net.seatCount }, (_, seat) => {
                  const p = net.players[seat];
                  const here = p && p.connected && !p.bot;
                  return (
                    <View key={seat} style={[styles.chair, here && styles.chairTaken]}>
                      {here ? <Avatar id={p.avatar || AVATAR_IDS[0]!} size={30} /> : <Robot size={18} colour={ink.lo} />}
                      <Text style={styles.chairName} numberOfLines={1}>
                        {/* The server's own `Igrač N` said in my language, as on the table. */}
                        {here ? seatName(lang, { seat: seat as Seat, name: p.name }) : ''}
                      </Text>
                    </View>
                  );
                })}
              </View>
              {net.reconnecting ? reconnectingLine : net.isHost ? <Button label={ui.startWithBots} tone="strong" onPress={net.start} /> : null}
            </>
          )}
          <Button label={g.back} onPress={leave} />
        </Panel>
      </Frame>
    );
  }

  // Over whichever table is drawn: a table standing still, reconnecting.
  const nameOf = (seat: number) => people[seat]?.name ?? '';
  const overlay = <OnlineOverlay net={net} lang={lang} nameOf={nameOf} onLeave={leave} ground={roomStyle().page} reduced={reduced} />;
  // In the strip under the table's header: my clock, the next round, the rematch votes.
  const banner = <OnlineBanner net={net} lang={lang} nameOf={nameOf} />;

  /** The table's source: the room, with the table's event handler plugged into the gate. */
  function sourceFor<D extends AnyGame>(): SessionSource<D> {
    return (onEvent) => {
      gate.offer(onEvent as (e: unknown, v: unknown) => void);
      return asLocal(net as unknown as NetSession<D>);
    };
  }

  const seats = net.seatCount;
  const mySeat = net.mySeat;
  // Never so here (inLobby has asked), but the compiler cannot see it there.
  if (mySeat === null || game === null) return null;
  if (game === 'osmice') {
    return (
      <View style={styles.fill}>
        <TableBannerProvider value={banner}>
          <OsmiceTable settings={settings} players={seats} me={mySeat} people={people} source={sourceFor<typeof OSMICE>()} onExit={leave} />
        </TableBannerProvider>
        {overlay}
      </View>
    );
  }
  const title = game === 'holdem' ? lang.holdem.name : game === 'blackjack' ? lang.blackjack.name : lang.baccarat.name;
  return (
    <View style={styles.fill}>
      <TableBannerProvider value={banner}>
        <CasinoScreen settings={settings} tableStack={CASINO_STACK[game]} minimum={CASINO_STACK[game]} title={title} onExit={leave} online>
          {(p) =>
            game === 'holdem' ? (
              <HoldemTable {...p} players={seats} me={mySeat} people={people} source={sourceFor<typeof HOLDEM>()} />
            ) : game === 'blackjack' ? (
              <BlackjackTable {...p} players={seats} me={mySeat} people={people} source={sourceFor<typeof BLACKJACK>()} />
            ) : (
              <BaccaratTable {...p} players={seats} me={mySeat} people={people} source={sourceFor<typeof BACCARAT>()} />
            )
          }
        </CasinoScreen>
      </TableBannerProvider>
      {overlay}
    </View>
  );
}

/** Still in the lobby (or on the way to it): no table until the room has dealt one, with my seat in it. */
function inLobby(net: NetSession<AnyGame>, game: OtherGame | null): boolean {
  return net.status === 'connecting' || net.status === 'waiting' || net.view === null || net.mySeat === null || game === null;
}

/** A connected room seen as a session: only drawn once its first view is in. */
function asLocal<D extends AnyGame>(net: NetSession<D>): LocalSession<D> {
  return { ...net, view: net.view as ViewOf<D> };
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  fill: { flex: 1 },
  centre: { flex: 1, justifyContent: 'center', padding: space.lg },
  connecting: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  body: {
    ...type.body,
    color: ink.hi,
    textAlign: 'center',
    marginVertical: space.sm,
  },
  label: { ...type.sub, color: ink.mid, textAlign: 'center' },
  code: {
    ...type.display,
    color: ink.hi,
    textAlign: 'center',
    letterSpacing: 4,
  },
  hint: {
    ...type.caption,
    color: ink.lo,
    textAlign: 'center',
    marginBottom: space.sm,
  },
  chairs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    justifyContent: 'center',
    marginBottom: space.md,
  },
  chair: {
    width: 64,
    alignItems: 'center',
    padding: space.xs,
    borderRadius: radius.md,
    backgroundColor: surface.well,
    borderWidth: 1,
    borderColor: stroke.hair,
    gap: 2,
  },
  chairTaken: { backgroundColor: surface.panel, borderColor: stroke.edge },
  chairName: { ...type.caption, color: ink.hi },
});
