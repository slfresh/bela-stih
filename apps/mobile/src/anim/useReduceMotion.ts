import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * The system's "reduce motion" preference, live.
 *
 * Ambient loops — a breathing turn beacon, a pulsing ring — are exactly what
 * that setting exists to switch off. The Director's beats are NOT affected:
 * pacing is information (what happened, in what order); a loop is decoration.
 */
// The last answer the system gave, so a table mounted later starts right
// instead of waiting a tick for the query again.
let known: boolean | null = null;

export function useReduceMotion(): boolean {
  const [reduced, setReduced] = useState(known ?? false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => {
        known = on;
        if (live) setReduced(on);
      })
      .catch(() => {});
    // react-native-web hands back nothing at all where matchMedia is missing.
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced) as
      | { remove(): void }
      | undefined;
    return () => {
      live = false;
      sub?.remove();
    };
  }, []);
  return reduced;
}
