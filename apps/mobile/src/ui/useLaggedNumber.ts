import { useEffect, useRef, useState } from 'react';

/**
 * A number that follows `value` late: it keeps the old figure for `lagMs`,
 * then counts to the new one over `countMs`.
 *
 * For the wallet, which used to jump the moment a deal was scored while the
 * coins were still in the air on their way to it — the total had changed
 * before anything had arrived.
 *
 * `downLagMs` is the wait when the number FALLS: a gift paid for should
 * leave the wallet at once, while an award still waits for its coins.
 */
export function useLaggedNumber(value: number, lagMs: number, countMs = 300, downLagMs = lagMs): number {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);
  shownRef.current = shown;

  useEffect(() => {
    if (shownRef.current === value) return;
    let ticker: ReturnType<typeof setInterval> | null = null;
    const wait = setTimeout(() => {
      const from = shownRef.current;
      const start = Date.now();
      ticker = setInterval(() => {
        const k = Math.min(1, (Date.now() - start) / countMs);
        const eased = 1 - (1 - k) * (1 - k);
        setShown(Math.round(from + (value - from) * eased));
        if (k >= 1 && ticker) {
          clearInterval(ticker);
          ticker = null;
        }
      }, 33);
    }, value < shownRef.current ? downLagMs : lagMs);
    return () => {
      clearTimeout(wait);
      if (ticker) clearInterval(ticker);
    };
  }, [value, lagMs, countMs, downLagMs]);

  return shown;
}
