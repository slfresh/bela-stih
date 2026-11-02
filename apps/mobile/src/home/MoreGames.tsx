import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { NetHow } from '../games/useNetSession';
import type { Lang } from '@belot/i18n';
import { chipBalance } from '@belot/progression';
import { OsmiceCard } from '../games/osmice/OsmiceCard';
import { Card52View } from '../games/casino/Card52';
import { ChipDisc } from '../games/casino/Chips';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { PressScale } from '../ui/PressScale';
import { loadProfile } from '../storage';
import { ink, num, radius, space, stroke, surface, theme, type } from '../theme';

/**
 * The games beyond Bela, on the home screen under Bela's own ways in: Osmice,
 * then the casino tables in a panel of their own, which says plainly that
 * they play for free chips only. Each row is one game: its card, its name and
 * line, how many sit at the table, and play.
 */

export type OtherGame = 'osmice' | 'baccarat' | 'blackjack' | 'holdem';

interface Row {
  game: OtherGame;
  name: string;
  line: string;
  art: ReactNode;
  seats: number[];
  initial: number;
}

type OnOnline = (game: OtherGame | null, how: NetHow) => void;
type OnRules = (game: OtherGame) => void;

function GameRow({ row, lang, onPlay, onOnline, onRules }: { row: Row; lang: Lang; onPlay: (game: OtherGame, players: number) => void; onOnline: OnOnline; onRules: OnRules }) {
  const g = lang.games;
  const [players, setPlayers] = useState(row.initial);
  return (
    <View style={styles.game}>
      <View style={styles.row}>
        {row.art}
        <View style={styles.text}>
          <Text style={styles.name}>{row.name}</Text>
          <Text style={styles.line} numberOfLines={2}>
            {row.line}
          </Text>
          <Text style={styles.line}>{g.vsBots(players)}</Text>
        </View>
        <Button label={lang.s.rules.title} compact accessibilityLabel={`${lang.s.rules.title}: ${row.name}`} onPress={() => onRules(row.game)} />
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
      {/* Online: strangers at quick play, or a private table for this many, to share by code. */}
      <View style={styles.onlineRow}>
        <View style={styles.fill}>
          <Button label={g.quickPlay} accessibilityLabel={`${g.quickPlay}: ${row.name}`} onPress={() => onOnline(row.game, { kind: 'quick' })} />
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

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export function MoreGames({ lang, onPlay, onOnline, onRules }: { lang: Lang; onPlay: (game: OtherGame, players: number) => void; onOnline: OnOnline; onRules: OnRules }) {
  const [code, setCode] = useState('');
  const osmice: Row = {
    game: 'osmice',
    name: lang.osmice.name,
    line: lang.osmice.tagline,
    art: <OsmiceCard card={{ id: 'wild-0', colour: null, value: 'wild' }} width={44} />,
    seats: range(2, 6),
    initial: 4,
  };
  const ace = (rank: 'A' | 'K' | 'Q', suit: 'spades' | 'hearts' | 'diamonds') => <Card52View card={{ id: `${rank}${suit[0]}`, rank, suit }} width={44} />;
  const casino: Row[] = [
    { game: 'holdem', name: lang.holdem.name, line: lang.holdem.tagline, art: ace('A', 'spades'), seats: range(2, 9), initial: 6 },
    { game: 'blackjack', name: lang.blackjack.name, line: lang.blackjack.tagline, art: ace('K', 'hearts'), seats: range(1, 5), initial: 3 },
    { game: 'baccarat', name: lang.baccarat.name, line: lang.baccarat.tagline, art: ace('Q', 'diamonds'), seats: range(1, 7), initial: 4 },
  ];
  return (
    <>
      <Panel label={lang.games.moreGames}>
        <GameRow row={osmice} lang={lang} onPlay={onPlay} onOnline={onOnline} onRules={onRules} />
        {/* A friend's table of any of these games: the code says which. */}
        <View style={[styles.divider, styles.joinRow]}>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder={lang.s.ui.tableCode}
            placeholderTextColor={ink.mid}
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.input}
            accessibilityLabel={`${lang.s.ui.joinByCode}: ${lang.games.moreGames}`}
          />
          <Button
            label={lang.s.ui.enter}
            tone={code.trim() ? 'strong' : 'plain'}
            accessibilityLabel={`${lang.s.ui.enter}: ${lang.games.moreGames}`}
            onPress={() => code.trim() && onOnline(null, { kind: 'join', code: code.trim() })}
          />
        </View>
      </Panel>
      <Panel label={lang.casino.heading}>
        <View style={styles.casinoHead}>
          <ChipDisc value={100} size={22} />
          <Text style={[styles.balance, num]}>{lang.casino.balance(chipBalance(loadProfile()))}</Text>
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
  row: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  text: { flex: 1, gap: 2 },
  name: { ...type.h3, color: ink.hi },
  line: { ...type.sub, color: ink.mid },
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
  joinRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  input: { flex: 1, ...type.body, color: ink.hi, backgroundColor: surface.sunk, borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: space.sm },
});
