import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

/**
 * The browser's Back button, made to act like Android's.
 *
 * The web app is one page with no router, so Back left it outright: a deal in
 * progress gone, the lobby of a table being filled gone, with no question
 * asked. Away from the home screen the app now keeps ONE step of history of
 * its own; Back spends it, and the popstate is handed to `onBack` - which asks
 * the same back guard Android's button asks. While the app is still away from
 * home after that (the guard opened the leave question, say), the step is laid
 * again. Back at home, the step is taken off the history, so the next Back
 * leaves the page at once rather than on the second press.
 */
export function useWebBack(atRoot: boolean, onBack: () => void): void {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  // `armed`: our step is on the history. `ignore`: the popstate coming is our own.
  const step = useRef({ armed: false, ignore: false });
  // A Back that left the app where it was still needs its step laid again.
  const [pops, setPops] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onPop = () => {
      if (step.current.ignore) {
        step.current.ignore = false;
        return;
      }
      step.current.armed = false;
      onBackRef.current();
      setPops((n) => n + 1);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const s = step.current;
    if (!atRoot && !s.armed) {
      window.history.pushState({ belotBack: true }, '');
      s.armed = true;
    } else if (atRoot && s.armed) {
      s.armed = false;
      // Only if our step is the one on top: never walk the page back past it.
      if ((window.history.state as { belotBack?: boolean } | null)?.belotBack) {
        s.ignore = true;
        window.history.back();
      }
    }
  }, [atRoot, pops]);
}

/**
 * Closing the tab or reloading mid-match asks first, in the browser's own
 * words (a page may not choose them). Only while `active`.
 */
export function useLeaveWarning(active: boolean): void {
  useEffect(() => {
    if (!active || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older Chrome and Safari only ask when this is set.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [active]);
}
