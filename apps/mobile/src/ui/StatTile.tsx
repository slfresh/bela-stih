import { StyleSheet, Text, View } from 'react-native';
import { ink, num, radius, space, surface, team, type } from '../theme';

/**
 * One number with its word under it, on a sunk tile: the statistics' unit,
 * laid in rows of three or four. `tone` colours the number by side.
 */
export function StatTile({ label, value, tone }: { label: string; value: string; tone?: 'us' | 'them' }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.value, num, tone === 'us' && { color: team.usInk }, tone === 'them' && { color: team.themInk }]}>
        {value}
      </Text>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: surface.sunk,
  },
  value: { color: ink.hi, ...type.h2 },
  label: { color: ink.mid, ...type.caption },
});
