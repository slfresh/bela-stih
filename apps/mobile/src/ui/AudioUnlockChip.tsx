import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { onAudioBlocked, unlockAudio } from '../audio';
import { font, radius, theme } from '../theme';
import { PressScale } from './PressScale';

/**
 * Web only. A browser plays no audio before the page has been touched, and a
 * sound asked for before that simply never starts. When that happens this
 * chip appears over the app; the tap that dismisses it is the gesture that
 * unlocks every pooled player.
 */
export function AudioUnlockChip({ label }: { label: string }) {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => onAudioBlocked(setBlocked), []);
  if (!blocked) return null;
  return (
    <PressScale onPress={unlockAudio} style={styles.chip} sound={null} haptic={null}>
      <Text style={styles.text}>{label}</Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  chip: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    backgroundColor: theme.wood,
    borderColor: theme.accent,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  text: { color: theme.text, fontSize: 13, fontFamily: font.bold },
});
