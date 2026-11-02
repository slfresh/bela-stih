import { useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lang } from '@belot/i18n';
import type { AnyGame, ViewOf } from '@belot/game-core';
import { OSMICE } from '@belot/games-osmice';
import { BACCARAT } from '@belot/games-baccarat';
import { BLACKJACK } from '@belot/games-blackjack';
import { HOLDEM } from '@belot/games-holdem';
import { chipBalance } from '@belot/progression';
import { useNetSession, type NetHow, type NetSession } from './useNetSession';
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
import { loadProfile, type Settings } from '../storage';
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

const ROOMS: Record<OtherGame, string> = { osmice: 'osmice', baccarat: 'baccarat', blackjack: 'blackjack', holdem: 'holdem' };
const CASINO_STACK: Record<Exclude<OtherGame, 'osmice'>, number> = {
  baccarat: BACCARAT.defaultConfig.startingStack,
  blackjack: BLACKJACK.defaultConfig.startingStack,
  holdem: HOLDEM.defaultConfig.startingStack,
};

export function OnlineTable({ game, how, settings, onExit }: { game: OtherGame | null; how: NetHow; settings: Settings; onExit: () => void }) {
  const lang = useMemo(() => new Lang(settings.locale), [settings.locale]);
  if (game !== null && game !== 'osmice' && chipBalance(loadProfile()) < CASINO_STACK[game]) {
    return (
      <Frame>
        <Panel label={lang.games.online}>
          <Text style={styles.body}>{lang.casino.broke}</Text>
          <Button label={lang.games.back} onPress={onExit} />
        </Panel>
      </Frame>
    );
  }
  return <Connected game={game} how={how} settings={settings} lang={lang} onExit={onExit} />;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: roomStyle().page }]}>
      <View style={styles.centre}>{children}</View>
    </SafeAreaView>
  );
}

function Connected({ game: asked, how, settings, lang, onExit }: { game: OtherGame | null; how: NetHow; settings: Settings; lang: Lang; onExit: () => void }) {
  const g = lang.games;
  const ui = lang.s.ui;
  const profile = useMemo(() => loadProfile(), []);
  // Only a real nickname goes to the room: "You" would be the other players' word for a stranger.
  const me = { name: settings.nickname.trim(), avatar: profile.selectedAvatar };
  // Events reach whichever table is drawn, through one sink the table fills in.
  const sink = useRef<((e: unknown, v: unknown) => void) | null>(null);
  // Joined by code, the room name does not matter (a code reaches its table under any name).
  const net = useNetSession<AnyGame>(ROOMS[asked ?? 'osmice'], how, me, (e, v) => sink.current?.(e, v));
  const game = (asked ?? (net.game as OtherGame | null)) as OtherGame | null;
  const leave = () => {
    net.leave();
    onExit();
  };

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
    return (
      <Frame>
        <Panel label={g.online}>
          <Text style={styles.body}>{how.kind === 'join' ? ui.troubleNoSuchTable : ui.troubleOffline}</Text>
          <Button label={g.back} onPress={onExit} />
        </Panel>
      </Frame>
    );
  }

  // Joined by code to a casino table the balance cannot cover: say so before taking a seat in play.
  if (game !== null && game !== 'osmice' && net.status !== 'connecting' && chipBalance(loadProfile()) < CASINO_STACK[game]) {
    return (
      <Frame>
        <Panel label={g.online}>
          <Text style={styles.body}>{lang.casino.broke}</Text>
          <Button label={g.back} onPress={leave} />
        </Panel>
      </Frame>
    );
  }

  if (net.status === 'connecting' || net.status === 'waiting' || net.view === null || net.mySeat === null || game === null) {
    const taken = net.players.filter((p) => p.connected && !p.bot).length;
    return (
      <Frame>
        <Panel label={g.online}>
          {net.status === 'connecting' ? (
            <Text style={styles.body}>{ui.connecting}</Text>
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
    return <OsmiceTable settings={settings} players={seats} me={mySeat} people={people} source={sourceFor<typeof OSMICE>()} onExit={leave} />;
  }
  const title = game === 'holdem' ? lang.holdem.name : game === 'blackjack' ? lang.blackjack.name : lang.baccarat.name;
  return (
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
  );
}

/** A connected room seen as a session: only drawn once its first view is in. */
function asLocal<D extends AnyGame>(net: NetSession<D>): LocalSession<D> {
  return { ...net, view: net.view as ViewOf<D> };
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centre: { flex: 1, justifyContent: 'center', padding: space.lg },
  body: { ...type.body, color: ink.hi, textAlign: 'center', marginVertical: space.sm },
  label: { ...type.sub, color: ink.mid, textAlign: 'center' },
  code: { ...type.display, color: ink.hi, textAlign: 'center', letterSpacing: 4 },
  hint: { ...type.caption, color: ink.lo, textAlign: 'center', marginBottom: space.sm },
  chairs: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center', marginBottom: space.md },
  chair: { width: 64, alignItems: 'center', padding: space.xs, borderRadius: radius.md, backgroundColor: surface.well, borderWidth: 1, borderColor: stroke.hair, gap: 2 },
  chairTaken: { backgroundColor: surface.panel, borderColor: stroke.edge },
  chairName: { ...type.caption, color: ink.hi },
});
