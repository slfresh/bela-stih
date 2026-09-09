import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * The system's "reduce motion" preference, live.
 *
 * Ambient loops — a breathing turn beacon, a pulsing ring — are exactly what
 * that setting exists to switch off. The Director's beats are NOT affected:
 * pacing is information (what happened, in what order); a loop is decoration.
 */
export function useReduceMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => {
        if (live) setReduced(on);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduced;
}
