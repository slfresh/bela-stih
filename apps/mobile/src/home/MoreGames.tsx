import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { NetHow } from '../games/useNetSession';
import type { Lang } from '@belot/i18n';
import { OsmiceCard } from '../games/osmice/OsmiceCard';
import { Card52View } from '../games/casino/Card52';
import { ChipDisc } from '../games/casino/Chips';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { PressScale } from '../ui/PressScale';
import { font, ink, num, radius, space, stroke, surface, theme, type } from '../theme';

/**
 * The games beyond Bela, on the home screen under Bela's own ways in: one box
 * for a friend's code to any of them, Osmice, then the casino tables in a
 * panel of their own, which says plainly that they play for free chips only.
 * Each row is one game: its card, its name and line, how many sit at the
 * table, and play.
 */

export type OtherGame = 'osmice' | 'baccarat' | 'blackjack' | 'holdem';

interface Row {
  game: OtherGame;
  name: string;
  line: string;
  art: ReactNode;
  seats: number[];
  initial: number;
  /** The size of a quick-play table: the server's own (seatsFor in OsmiceRoom / CasinoRooms). */
  quick: number;
}

/**
 * The count each game was last played with. Home unmounts whenever a game
 * starts, so a row's own state came back at the default every time and a
 * player who always plays two-handed Osmice had to pick 2 again before each
 * game. Kept for as long as the app runs.
 */
const chosen = new Map<OtherGame, number>();

type OnOnline = (game: OtherGame | null, how: NetHow) => void;
type OnRules = (game: OtherGame) => void;

function GameRow({ row, lang, onPlay, onOnline, onRules }: { row: Row; lang: Lang; onPlay: (game: OtherGame, players: number) => void; onOnline: OnOnline; onRules: OnRules }) {
  const g = lang.games;
  const [players, setPlayersState] = useState(() => chosen.get(row.game) ?? row.initial);
  const setPlayers = (n: number) => {
    chosen.set(row.game, n);
    setPlayersState(n);
  };
  return (
    <View style={styles.game}>
      <View style={styles.row}>
        {row.art}
        {/* The game's one line is what tells a newcomer what it is, so it is
            never cut: "How to play" sits under it, not beside it, and the
            line has the column's whole width. */}
        <View style={styles.text}>
          <Text style={styles.name}>{row.name}</Text>
          <Text style={styles.line}>{row.line}</Text>
          <Text style={styles.line}>{g.vsBots(players)}</Text>
          <PressScale
            onPress={() => onRules(row.game)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${lang.s.rules.title}: ${row.name}`}
            style={styles.rulesLink}
          >
            <Text style={styles.rulesText}>{lang.s.rules.title}</Text>
          </PressScale>
        </View>
      </View>
      <View style={styles.pickRow}>
        <Text style={styles.pickLabel}>{g.players}</Text>
        {row.seats.map((n) => (
          <PressScale
            key={n}
            onPress={() => setPlayers(n)}
            accessibilityRole="button"
            accessibilityLabel={`${row.name}, ${g.players}: ${n}`}
            accessibilityState={{ selected: players === n }}
          >
            <View style={[styles.chip, players === n && styles.chipOn]}>
              <Text style={[styles.chipText, num, players === n && styles.chipTextOn]}>{g.playersCount(n)}</Text>
            </View>
          </PressScale>
        ))}
      </View>
      <Button label={g.play} tone="strong" accessibilityLabel={`${g.play}: ${row.name}`} onPress={() => onPlay(row.game, players)} />
      {/* Online: strangers at quick play, at the game's standard table (the
          button says how many: the picker above does not reach it), or a
          private table for as many as picked, to share by code. */}
      <View style={styles.onlineRow}>
        <View style={styles.fill}>
          <Button
            label={g.quickPlaySeats(row.quick)}
            accessibilityLabel={`${g.quickPlaySeats(row.quick)}: ${row.name}`}
            onPress={() => onOnline(row.game, { kind: 'quick' })}
          />
        </View>
        <View style={styles.fill}>
          <Button
            label={lang.s.ui.privateTable}
            accessibilityLabel={`${lang.s.ui.privateTable}: ${row.name}`}
            onPress={() => onOnline(row.game, { kind: 'create', seats: Math.max(2, players) })}
          />
        </View>
      </View>
    </View>
  );
}

/**
 * A friend's code to a table of any game beyond Bela: its own panel above
 * them all, saying which games it is for. It used to sit inside the Osmice
 * panel, where a Hold'em player never looked, with only a placeholder to
 * tell it from Bela's own code box near the top of the screen.
 */
function JoinOther({ lang, names, onOnline }: { lang: Lang; names: readonly string[]; onOnline: OnOnline }) {
  const g = lang.games;
  const [code, setCode] = useState('');
  const join = () => code.trim() && onOnline(null, { kind: 'join', code: code.trim() });
  return (
    <Panel label={g.joinOther}>
      <Text style={styles.joinSub}>{g.joinOtherSub(names, lang.s.ui.joinByCode)}</Text>
      <View style={styles.joinRow}>
        <TextInput
          value={code}
          onChangeText={setCode}
          onSubmitEditing={join}
          placeholder={lang.s.ui.tableCode}
          placeholderTextColor={ink.mid}
          autoCapitalize="characters"
          autoCorrect={false}
          style={styles.input}
          accessibilityLabel={`${lang.s.ui.joinByCode}: ${g.joinOther}`}
        />
        <Button
          label={lang.s.ui.enter}
          tone={code.trim() ? 'strong' : 'plain'}
          accessibilityLabel={`${lang.s.ui.enter}: ${g.joinOther}`}
          style={styles.noShrink}
          onPress={join}
        />
      </View>
    </Panel>
  );
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export function MoreGames({
  lang,
  chips,
  onPlay,
  onOnline,
  onRules,
}: {
  lang: Lang;
  /** The play-chip balance with today's top-up in it (HomeScreen works it out). */
  chips: number;
  onPlay: (game: OtherGame, players: number) => void;
  onOnline: OnOnline;
  onRules: OnRules;
}) {
  const osmice: Row = {
    game: 'osmice',
    name: lang.osmice.name,
    line: lang.osmice.tagline,
    art: <OsmiceCard card={{ id: 'wild-0', colour: null, value: 'wild' }} width={44} />,
    seats: range(2, 6),
    initial: 4,
    quick: 4,
  };
  const ace = (rank: 'A' | 'K' | 'Q', suit: 'spades' | 'hearts' | 'diamonds') => <Card52View card={{ id: `${rank}${suit[0]}`, rank, suit }} width={44} />;
  const casino: Row[] = [
    { game: 'holdem', name: lang.holdem.name, line: lang.holdem.tagline, art: ace('A', 'spades'), seats: range(2, 9), initial: 6, quick: 6 },
    { game: 'blackjack', name: lang.blackjack.name, line: lang.blackjack.tagline, art: ace('K', 'hearts'), seats: range(1, 5), initial: 3, quick: 4 },
    { game: 'baccarat', name: lang.baccarat.name, line: lang.baccarat.tagline, art: ace('Q', 'diamonds'), seats: range(1, 7), initial: 4, quick: 5 },
  ];
  return (
    <>
      <JoinOther lang={lang} names={[osmice, ...casino].map((r) => r.name)} onOnline={onOnline} />
      <Panel label={lang.games.moreGames}>
        <GameRow row={osmice} lang={lang} onPlay={onPlay} onOnline={onOnline} onRules={onRules} />
      </Panel>
      <Panel label={lang.casino.heading}>
        <View style={styles.casinoHead}>
          <ChipDisc value={100} size={22} />
          <Text style={[styles.balance, num]}>{lang.casino.balance(chips)}</Text>
        </View>
        <Text style={styles.note}>{lang.casino.playMoney}</Text>
        {casino.map((row, i) => (
          <View key={row.game} style={i > 0 ? styles.divider : undefined}>
            <GameRow row={row} lang={lang} onPlay={onPlay} onOnline={onOnline} onRules={onRules} />
          </View>
        ))}
      </Panel>
    </>
  );
}

const styles = StyleSheet.create({
  game: { gap: 0 },
  row: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  // minWidth 0: on the web a text column will not shrink below its content without it.
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...type.h3, color: ink.hi },
  line: { ...type.sub, color: ink.mid },
  rulesLink: { alignSelf: 'flex-start', paddingVertical: space.xs },
  rulesText: { ...type.sub, color: theme.accent, fontFamily: font.bold },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2, marginVertical: space.md, flexWrap: 'wrap' },
  pickLabel: { ...type.sub, color: ink.mid, marginRight: space.xs },
  chip: { minWidth: 34, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: surface.chip, borderWidth: 1, borderColor: stroke.hair, alignItems: 'center' },
  chipOn: { backgroundColor: theme.wood, borderColor: theme.accent },
  chipText: { ...type.sub, color: ink.mid },
  chipTextOn: { color: ink.hi },
  casinoHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  balance: { ...type.body, color: ink.hi },
  note: { ...type.caption, color: ink.lo, marginTop: space.xs, marginBottom: space.md },
  divider: { borderTopWidth: 1, borderTopColor: stroke.hair, paddingTop: space.md, marginTop: space.md },
  onlineRow: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  fill: { flex: 1 },
  joinSub: { ...type.sub, color: ink.mid },
  joinRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  // minWidth 0 lets the field give way inside its row: without it the web
  // keeps the input's own width (about 245 px) and pushed Enter past the
  // panel's edge at 360 px, and off the screen at 320.
  input: { flex: 1, minWidth: 0, ...type.body, color: ink.hi, backgroundColor: surface.sunk, borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: space.sm },
  noShrink: { flexShrink: 0 },
});
