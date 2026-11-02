import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { garb } from '../../deck/palette';
import { PressScale } from '../../ui/PressScale';
import { font, ink, num, radius, space, stroke, theme, type } from '../../theme';

/**
 * Chips: one disc per denomination, edge-spotted like the real thing, and a
 * row of them to bet with. The colours are the deck's own garb, so a chip
 * reads as part of the same table.
 */

const CHIP_COLOUR: Record<number, string> = {
  10: garb.blue,
  25: garb.green,
  100: garb.ink,
  500: garb.grape,
};

export function ChipDisc({ value, size = 28 }: { value: number; size?: number }) {
  const fill = CHIP_COLOUR[value] ?? garb.redDark;
  const spots: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    const x = 50 + 40 * Math.cos(a);
    const y = 50 + 40 * Math.sin(a);
    spots.push(`M${x - 5} ${y - 5} h10 v10 h-10 Z`);
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx={50} cy={50} r={48} fill={fill} stroke={garb.cream} strokeWidth={2} />
      <G opacity={0.9}>
        <Path d={spots.join(' ')} fill={garb.cream} />
      </G>
      <Circle cx={50} cy={50} r={28} fill="none" stroke={garb.cream} strokeWidth={3} strokeDasharray="6 5" />
    </Svg>
  );
}

/** A stack of chips with its amount under it. Nothing when the amount is 0. */
export function ChipPile({ amount, size = 22 }: { amount: number; size?: number }) {
  if (amount <= 0) return null;
  const top = [500, 100, 25, 10].find((v) => amount >= v) ?? 10;
  return (
    <View style={styles.pile} accessibilityLabel={String(amount)}>
      <ChipDisc value={top} size={size} />
      <Text style={[styles.pileText, num]}>{amount}</Text>
    </View>
  );
}

/** The chips to bet with: tap one to add it to the bet. Chips the stack cannot cover are dimmed and inert. */
export function ChipRow({ chips, canAdd, onAdd }: { chips: readonly number[]; canAdd: (value: number) => boolean; onAdd: (value: number) => void }) {
  return (
    <View style={styles.row}>
      {chips.map((v) => {
        const ok = canAdd(v);
        return (
          <PressScale key={v} onPress={() => ok && onAdd(v)} disabled={!ok} accessibilityRole="button" accessibilityLabel={`+${v}`} sound="arm">
            <View style={[styles.chip, !ok && styles.dim]}>
              <ChipDisc value={v} size={40} />
              <Text style={[styles.chipText, num]}>{v}</Text>
            </View>
          </PressScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pile: { alignItems: 'center', gap: 2 },
  pileText: { ...type.caption, color: ink.hi, fontFamily: font.bold },
  row: { flexDirection: 'row', gap: space.sm, justifyContent: 'center' },
  chip: { alignItems: 'center', gap: 2, padding: 2, borderRadius: radius.pill, borderWidth: 1, borderColor: stroke.hair },
  chipText: { ...type.caption, color: theme.text },
  dim: { opacity: 0.35 },
});
