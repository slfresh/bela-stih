import { createContext, useContext } from 'react';
import type { MotionPolicy } from './director';

/**
 * The app's motion policy where a component stands.
 *
 * The table threads the policy through props, because it needs it per sprite
 * and per emit. The small shared pieces have no such path: `PressScale` sits
 * under every tappable thing in the app and takes no policy of its own. Since
 * 1.3.1 the app tells reanimated to ignore the phone's own switch (see the
 * root in App.tsx) so that this policy is the only one — which also means
 * nothing is suppressed for free any more, and a piece that should hold still
 * has to be told.
 *
 * 'full' by default, so a component rendered outside the provider (a test, a
 * gallery preview) behaves as it always did.
 */
const MotionContext = createContext<MotionPolicy>('full');

export const MotionProvider = MotionContext.Provider;

export function useMotionHere(): MotionPolicy {
  return useContext(MotionContext);
}
