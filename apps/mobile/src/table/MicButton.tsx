import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Lang } from '@belot/i18n';
import { pattern } from '../haptics';
import { Mic } from '../ui/icons';
import { PressScale } from '../ui/PressScale';
import { useVoiceRecorder, type Take } from '../voice/useVoiceRecorder';
import { takeClock } from '../voice/voice';
import { font, ink, radius, surface, theme } from '../theme';

/** Let go this long after the finger lifts to tell a release on the button from one beside it. */
const RELEASE_SETTLE_MS = 60;

/**
 * Push-to-talk at the table: hold, speak, let go to send; slide off to take it
 * back. While it records the button turns red and says how long the take has
 * run; my own puck rings meanwhile (`onRecording`). Hidden while the table
 * asks a question - the hook stays, so a take that is cut off that way still
 * goes (what was said, was said).
 */
export function MicButton({
  lang,
  size,
  visible,
  onTake,
  onSay,
  onRecording,
}: {
  lang: Lang;
  /** 40 beside the faces' toggle in portrait, 34 in a landscape rail. */
  size: number;
  visible: boolean;
  onTake: (take: Take) => void;
  /** A word over my hand: too short, the microphone refused, a failure. */
  onSay: (text: string) => void;
  onRecording?: (on: boolean) => void;
}) {
  const ui = lang.s.ui;
  const released = useRef(false);
  const [now, setNow] = useState(0);
  const rec = useVoiceRecorder(onTake, (why) => {
    if (why === 'short') onSay(ui.micTooShort);
    else if (why === 'denied') onSay(ui.micDenied);
    else if (why === 'failed') onSay(ui.micFailed);
  });
  const recording = rec.phase === 'recording';

  const onRecordingRef = useRef(onRecording);
  onRecordingRef.current = onRecording;
  useEffect(() => {
    onRecordingRef.current?.(recording);
  }, [recording]);
  useEffect(() => {
    if (!recording) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [recording]);
  const finishRef = useRef(rec.finish);
  finishRef.current = rec.finish;
  useEffect(() => {
    if (!visible) void finishRef.current(true);
  }, [visible]);

  if (!visible) return null;
  return (
    <View>
      {recording && (
        <View style={styles.clockBox} pointerEvents="none">
          <Text style={styles.clock}>{takeClock(Math.max(0, now - rec.startedAt))}</Text>
        </View>
      )}
      <PressScale
        sound={null}
        haptic={null}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={ui.micLabel}
        accessibilityHint={ui.micHint}
        onPressIn={() => {
          released.current = false;
          pattern('press');
          void rec.start();
        }}
        onPress={() => {
          released.current = true;
          void rec.finish(true);
        }}
        onPressOut={() => {
          // onPress follows onPressOut when the finger lifts on the button;
          // without it the finger slid off, and the take is taken back.
          setTimeout(() => {
            if (!released.current) void finishRef.current(false);
          }, RELEASE_SETTLE_MS);
        }}
        style={[styles.button, { width: size, height: size }, recording && styles.live]}
      >
        <Mic size={Math.round(size * 0.5)} colour={recording ? ink.hi : ink.mid} />
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
