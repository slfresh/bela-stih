import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { ink, radius, space, stroke, surface, type } from '../theme';
import { Button } from './Button';

/**
 * A question that has to be answered before something irreversible happens —
 * leaving a match in progress. Drawn inside the screen rather than as a
 * native alert, so it wears the room's colours on every platform.
 *
 * The safe answer is the prominent one: a thumb that lands on the stronger
 * button by reflex keeps the player at the table.
 */
export function ConfirmDialog({
  title,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  ground,
  reduced = false,
}: {
  title: string;
  /** The irreversible answer. */
  confirmLabel: string;
  /** The safe one, drawn as the call to action. */
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** The panel's ground: the room's page colour, so it reads as part of the table. */
  ground: string;
  reduced?: boolean;
}) {
  return (
    <Animated.View entering={reduced ? undefined : FadeIn.duration(140)} style={styles.backdrop} accessibilityViewIsModal>
      {/* A tap beside the panel is the safe answer too. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel={cancelLabel} />
      <Animated.View
        entering={reduced ? undefined : ZoomIn.duration(160)}
        style={[styles.panel, { backgroundColor: ground }]}
        accessibilityRole="alert"
      >
        <Text style={styles.title}>{title}</Text>
        <View style={styles.buttons}>
          <Button label={cancelLabel} tone="strong" onPress={onCancel} style={styles.button} />
          <Button label={confirmLabel} tone="plain" onPress={onConfirm} style={styles.button} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: surface.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  panel: {
    width: '100%',
    maxWidth: 340,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: stroke.edge,
    padding: space.xl,
    gap: space.xl,
  },
  title: { color: ink.hi, ...type.h3, textAlign: 'center' },
  buttons: { flexDirection: 'row', gap: space.md },
  button: { flex: 1 },
});
