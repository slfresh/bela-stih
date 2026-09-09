import { StyleSheet, Text, View } from 'react-native';
import { garb } from '../deck/palette';
import { ink, type } from '../theme';

/**
 * "Bela Štih": cream and gold. Set in type for now; the brand pass replaces
 * this with the outlined mark so it is the same shape as the icon and the
 * store art. `onLongPress` keeps the deck gallery's back door.
 */
export function Wordmark({ size = 34, onLongPress }: { size?: number; onLongPress?: () => void }) {
  return (
    <View style={styles.row} accessibilityRole="header">
      <Text style={[styles.word, { fontSize: size, lineHeight: size + 6 }]} onLongPress={onLongPress}>
        Bela <Text style={styles.gold}>Štih</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline' },
  word: { color: ink.hi, fontWeight: '900', letterSpacing: 0.5, ...type.display },
  gold: { color: garb.gold },
});
