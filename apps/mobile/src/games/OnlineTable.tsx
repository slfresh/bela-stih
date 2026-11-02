import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import type { SessionSource } from './source';
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
  const retry = useCallback(() => {
    setAffordable(game === null || canSit(game));
    setAttempt((a) => a + 1);
  }, [game]);
  if (!affordable) return <Broke lang={lang} onExit={onExit} />;
  return <Connected key={attempt} game={game} how={how} settings={settings} lang={lang} onExit={onExit} onRetry={retry} />;
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
function troubleText(lang: Lang, t: NetTrouble | null): string {
  const ui = lang.s.ui;
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
    case 'dropped':
      return ui.troubleDropped;
    default:
      return ui.troubleOffline;
  }
}

function Connected({
  game: asked,
  how,
  settings,
  lang,
  onExit,
  onRetry,
}: {
  game: OtherGame | null;
  how: NetHow;
  settings: Settings;
  lang: Lang;
  onExit: () => void;
  onRetry: () => void;
}) {
  const g = lang.games;
  const ui = lang.s.ui;
  const reduced = useMotionPolicy(settings.motion) === 'reduced';
  const profile = useMemo(() => loadProfile(), []);
  // Only a real nickname goes to the room: "You" would be the other players' word for a stranger.
  const me = { name: settings.nickname.trim(), avatar: profile.selectedAvatar };
  // Events reach whichever table is drawn, through one sink the table fills in
  // as it renders. Events that come before it has (the bots' opening moves
  // arrive with the very message that takes the lobby down) wait here, and
  // are handed over once the table has drawn.
  const sink = useRef<((e: unknown, v: unknown) => void) | null>(null);
  const pending = useRef<[unknown, unknown][]>([]);
  const deliver = (e: unknown, v: unknown) => {
    if (sink.current) sink.current(e, v);
    else pending.current.push([e, v]);
  };
  useEffect(() => {
    const s = sink.current;
    if (!s || pending.current.length === 0) return;
    const queued = pending.current;
    pending.current = [];
    for (const [e, v] of queued) s(e, v);
  });
  // Joined by code, the room name does not matter (a code reaches its table
  // under any name), but the games do: a code for a table of any other game
  // (a friend's Bela table) is turned away rather than seated.
  const net = useNetSession<AnyGame>(ROOMS[asked ?? 'osmice'], how, me, asked === null ? ONLINE_GAMES : [asked], deliver);
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
    const canRetry = net.trouble === 'dropped' || retryHelps(net.trouble);
    return (
      <Frame>
        <Panel label={g.online}>
          <Text style={styles.body} accessibilityRole="alert">
            {troubleText(lang, net.trouble)}
          </Text>
          {canRetry ? <Button label={ui.retry} tone="strong" onPress={onRetry} /> : null}
          <Button label={g.back} onPress={onExit} />
        </Panel>
      </Frame>
    );
  }

  if (cannotSit) return <Broke lang={lang} onExit={leave} />;

  if (net.status === 'connecting' || net.status === 'waiting' || net.view === null || net.mySeat === null || game === null) {
    const taken = net.players.filter((p) => p.connected && !p.bot).length;
    return (
      <Frame>
        <Panel label={g.online}>
          {net.status === 'connecting' ? (
            <View style={styles.connecting}>
              <ActivityIndicator color={ink.mid} />
              <Text style={styles.body}>{ui.connecting}</Text>
            </View>
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
                        {here ? p.name : ''}
                      </Text>
                    </View>
                  );
                })}
              </View>
              {net.isHost ? <Button label={ui.startWithBots} tone="strong" onPress={net.start} /> : null}
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

  /** The table's source: the room, with the table's event handler plugged into the sink. */
  function sourceFor<D extends AnyGame>(): SessionSource<D> {
    return (onEvent) => {
      sink.current = onEvent as (e: unknown, v: unknown) => void;
      return asLocal(net as unknown as NetSession<D>);
    };
  }

  const seats = net.seatCount;
  const mySeat = net.mySeat;
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
