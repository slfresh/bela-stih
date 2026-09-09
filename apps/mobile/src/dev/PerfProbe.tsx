import { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { counters, lastTickCost } from './counters';

/**
 * Dev-only overlay: how many frames missed budget in the last second, and
 * what the last director tick cost in card-face renders, anchor measurements
 * and sprite mounts. Long-press the profile bar on the table to show it.
 *
 * Frame deltas accumulate on the UI thread (the browser's main thread on
 * web — exactly the thread worth watching there); nothing crosses to JS more
 * than once a second, so the probe cannot cost the frames it is counting.
 *
 * On web the same numbers are exposed as `window.__belaPerf` so a browser
 * harness can read them without a screenshot.
 */
export function PerfProbe() {
  const [line, setLine] = useState('…');
  const frames = useSharedValue(0);
  const over16 = useSharedValue(0);
  const over33 = useSharedValue(0);

  // One identity: reanimated re-registers the frame callback whenever this
  // changes, and the probe re-renders once a second.
  const onFrame = useCallback(
    (info: { timeSincePreviousFrame: number | null }) => {
      'worklet';
      const dt = info.timeSincePreviousFrame ?? 0;
      frames.value += 1;
      if (dt > 16.7) over16.value += 1;
      if (dt > 33) over33.value += 1;
    },
    [frames, over16, over33],
  );
  useFrameCallback(onFrame);

  useEffect(() => {
    const id = setInterval(() => {
      const f = frames.value;
      const s = over16.value;
      const d = over33.value;
      frames.value = 0;
      over16.value = 0;
      over33.value = 0;
      const t = lastTickCost();
      const live = counters.spriteMount - counters.spriteUnmount;
      setLine(
        `${f}fps  >16ms ${s}  >33ms ${d}   tick: faces ${t.cardFace} · measure ${t.measure} · sprites ${t.sprites}   live ${live}`,
      );
      if (Platform.OS === 'web') {
        (globalThis as { __belaPerf?: unknown }).__belaPerf = {
          frames: f,
          over16: s,
          over33: d,
          tick: t,
          counters: { ...counters },
        };
      }
    }, 1000);
    return () => clearInterval(id);
  }, [frames, over16, over33]);

  return (
    <View pointerEvents="none" style={styles.box}>
      <Text style={styles.text}>{line}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  text: { color: '#ffe082', fontSize: 11, fontVariant: ['tabular-nums'] },
});
