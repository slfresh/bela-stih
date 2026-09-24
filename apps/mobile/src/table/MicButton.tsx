import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent, type Insets } from 'react-native';
import type { Lang } from '@belot/i18n';
import { pattern } from '../haptics';
import { Mic } from '../ui/icons';
import { PressScale } from '../ui/PressScale';
import type { MicPhase } from '../voice/useVoiceRecorder';
import { releasedOn, takeClock } from '../voice/voice';
import { font, ink, radius, surface, theme } from '../theme';

/**
 * Push-to-talk at the table: hold, speak, let go to send; slide off to take it
 * back. While it records the button turns red and says how long the take has
 * run. Only the look lives here: the recorder is the online screen's
 * (useVoiceRecorder), so a take outlives this button when the table's rows
 * change under it - a question, the deal's end, the phone turned sideways.
 *
 * A button that leaves the screen under a finger (the phone turned: the mic
 * moves to the other layout) may never hear the finger lift, so it ends the
 * take itself as it goes and sends what was said - or the take would run on
 * to the limit after the finger had long let go. (A browser cancels the touch
 * as the page turns, first: that take is dropped, as any cancelled touch.)
 *
 * Whether a take goes is decided where the finger lifts, not by a "press":
 * a phone browser never clicks after a long touch, and a press that became a
 * long press never presses either. A long press is claimed (and does
 * nothing) so a phone browser neither opens its menu nor ends the touch.
 */
export function MicButton({
  lang,
  size,
  phase,
  startedAt,
  hitSlop,
  onStart,
  onFinish,
}: {
  lang: Lang;
  /** 40 beside the faces' toggle in portrait, 34 in a landscape rail. */
  size: number;
  phase: MicPhase;
  startedAt: number;
  /** Out to the gap's middle on the toggle's side, so the two never share a touch. */
  hitSlop: Insets;
  onStart: () => void;
  onFinish: (send: boolean) => void;
}) {
  const ui = lang.s.ui;
  const boxRef = useRef<View>(null);
  const box = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const [now, setNow] = useState(0);
  const recording = phase === 'recording';
  const pressing = useRef(false);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  useEffect(
    () => () => {
      if (pressing.current) onFinishRef.current(true);
    },
    [],
  );

  useEffect(() => {
    if (!recording) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [recording]);

  return (
    <View ref={boxRef} collapsable={false}>
      {recording && (
        <View style={styles.clockBox} pointerEvents="none">
          <Text style={styles.clock}>{takeClock(Math.max(0, now - startedAt))}</Text>
        </View>
      )}
      <PressScale
        sound={null}
        haptic={null}
        hitSlop={hitSlop}
        accessibilityRole="button"
        accessibilityLabel={ui.micLabel}
        accessibilityHint={ui.micHint}
        onPressIn={() => {
          pressing.current = true;
          box.current = null;
          boxRef.current?.measure((_x, _y, w, h, pageX, pageY) => {
            box.current = { x: pageX, y: pageY, w, h };
          });
          pattern('press');
          onStart();
        }}
        onLongPress={() => {}}
        onPressOut={(e: GestureResponderEvent) => {
          pressing.current = false;
          const n = e.nativeEvent as { pageX: number; pageY: number; type?: string };
          onFinish(releasedOn(box.current, n));
        }}
        style={[styles.button, { width: size, height: size }, recording && styles.live]}
      >
        <View pointerEvents="none">
          <Mic size={Math.round(size * 0.5)} colour={recording ? ink.hi : ink.mid} />
        </View>
      </PressScale>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: surface.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  live: { backgroundColor: theme.danger, borderColor: theme.dangerInk },
  // Above the button, never taking room in the row.
  clockBox: {
    position: 'absolute',
    bottom: '100%',
    left: -30,
    right: -30,
    alignItems: 'center',
    paddingBottom: 4,
  },
  clock: {
    color: ink.hi,
    fontFamily: font.bold,
    fontSize: 12,
    backgroundColor: surface.scrim,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
});
