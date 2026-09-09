import { useEffect, useRef, useState } from 'react';

/**
 * A number that counts to its new value instead of jumping: the score pills,
 * the running count, the totals on the result sheet. At most a dozen steps,
 * so a phone's JS thread never sees more than one render every ~33 ms, and
 * `onStep` can tick a sound per step without becoming a rattle.
 *
 * Under reduce-motion it snaps.
 */
export function useCountUp(
  target: number,
  durationMs = 400,
  opts: {
    reduced?: boolean;
    onStep?: (value: number) => void;
    /** Where to count from on mount; by default the number is simply shown. */
    from?: number;
  } = {},
): number {
  const [shown, setShown] = useState(opts.from ?? target);
  const shownRef = useRef(opts.from ?? target);
  shownRef.current = shown;
  const onStepRef = useRef(opts.onStep);
  onStepRef.current = opts.onStep;

  useEffect(() => {
    const from = shownRef.current;
    if (from === target) return;
    if (opts.reduced || durationMs <= 0) {
      setShown(target);
      return;
    }
    const steps = Math.min(12, Math.max(1, Math.round(durationMs / 33)));
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      const k = i / steps;
      const eased = 1 - (1 - k) * (1 - k);
      const v = i >= steps ? target : Math.round(from + (target - from) * eased);
      setShown(v);
      onStepRef.current?.(v);
      if (i >= steps) clearInterval(id);
    }, durationMs / steps);
    return () => clearInterval(id);
  }, [target, durationMs, opts.reduced]);

  return shown;
}
