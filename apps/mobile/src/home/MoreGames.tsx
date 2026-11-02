import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Lang } from '@belot/i18n';
import { OsmiceCard } from '../games/osmice/OsmiceCard';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { PressScale } from '../ui/PressScale';
import { ink, num, radius, space, stroke, surface, theme, type } from '../theme';

/**
 * The games beyond Bela, on the home screen under Bela's own ways in. Each
 * row is one game: its card, its name and line, how many sit at the table,
 * and play. Bela stays the app's front door; these are the other tables in
 * the room.
 */

export type OtherGame = 'osmice';

export function MoreGames({ lang, onPlay }: { lang: Lang; onPlay: (game: OtherGame, players: number) => void }) {
  const g = lang.games;
  const [players, setPlayers] = useState(4);
  return (
    <Panel label={g.moreGames}>
      <View style={styles.row}>
        <OsmiceCard card={{ id: 'wild-0', colour: null, value: 'wild' }} width={44} />
        <View style={styles.text}>
          <Text style={styles.name}>{lang.osmice.name}</Text>
          <Text style={styles.line} numberOfLines={2}>
            {lang.osmice.tagline}
          </Text>
          <Text style={styles.line}>{g.vsBots(players)}</Text>
        </View>
      </View>
      <View style={styles.pickRow}>
        <Text style={styles.pickLabel}>{g.players}</Text>
        {[2, 3, 4, 5, 6].map((n) => (
          <PressScale
            key={n}
            onPress={() => setPlayers(n)}
            accessibilityRole="button"
            accessibilityLabel={`${g.players}: ${n}`}
            accessibilityState={{ selected: players === n }}
          >
            <View style={[styles.chip, players === n && styles.chipOn]}>
              <Text style={[styles.chipText, num, players === n && styles.chipTextOn]}>{g.playersCount(n)}</Text>
            </View>
          </PressScale>
        ))}
      </View>
      <Button label={g.play} tone="strong" onPress={() => onPlay('osmice', players)} />
    </Panel>
  );
}

const styles = StyleSheet.create({
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
});
