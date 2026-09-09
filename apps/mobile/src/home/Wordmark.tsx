import { Pressable, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import MARK from '../../brand/wordmark.json';
import { garb } from '../deck/palette';
import { ink } from '../theme';

/**
 * "Bela Štih", outlined from Rubik Black (brand/wordmark.json, built by
 * scripts/make-fonts.py's sibling recipe): cream and gold, the same shape on
 * the launcher, in the store and here, whatever font the phone has loaded.
 * `onLongPress` keeps the deck gallery's back door.
 */
export function Wordmark({ height = 40, onLongPress }: { height?: number; onLongPress?: () => void }) {
  const h = MARK.ascent - MARK.descent;
  const width = (MARK.width / h) * height;
  return (
    <Pressable onLongPress={onLongPress} delayLongPress={600} accessibilityRole="header" accessibilityLabel="Bela Štih">
      <Svg width={width} height={height} viewBox={`0 ${-MARK.ascent} ${MARK.width} ${h}`} style={styles.mark}>
        <Path d={MARK.bela} fill={ink.hi} />
        <Path d={MARK.stih} fill={garb.gold} />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  mark: { overflow: 'visible' },
});
