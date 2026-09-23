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
    /** Hold the starting number this long before counting (a sheet's rows count one after another). */
    delayMs?: number;
  } = {},
): number {
  // Under reduce-motion there is nothing to count from: the first paint is the number.
  const initial = opts.reduced ? target : (opts.from ?? target);
  const [shown, setShown] = useState(initial);
  const shownRef = useRef(initial);
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
    let id: ReturnType<typeof setInterval> | null = null;
    const count = () => {
      id = setInterval(() => {
        i += 1;
        const k = i / steps;
        const eased = 1 - (1 - k) * (1 - k);
        const v = i >= steps ? target : Math.round(from + (target - from) * eased);
        setShown(v);
        onStepRef.current?.(v);
        if (i >= steps && id !== null) clearInterval(id);
      }, durationMs / steps);
    };
    const wait = opts.delayMs && opts.delayMs > 0 ? setTimeout(count, opts.delayMs) : null;
    if (wait === null) count();
    return () => {
      if (wait !== null) clearTimeout(wait);
      if (id !== null) clearInterval(id);
    };
  }, [target, durationMs, opts.reduced, opts.delayMs]);

  return shown;
}
