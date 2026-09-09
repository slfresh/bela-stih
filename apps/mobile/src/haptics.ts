import * as Haptics from 'expo-haptics';

/**
 * Haptics, as a vocabulary.
 *
 * One table of named patterns instead of impacts sprinkled through the code:
 * a pass is not the same touch as a trick, a deal made is the phone's own
 * "success", a clock at two seconds escalates from the one at five. Every
 * pattern is at most 300 ms and a handful of steps, and every one goes
 * through the single `enabled` gate that Settings sets — the games no longer
 * carry a `haptics` flag of their own.
 *
 * Never throws and never awaits: a missing haptic engine must not break play.
 */

let enabled = true;
// Android has named haptic constants of its own (a confirm, a reject, a
// clock tick) that read better than an impact pattern where one fits. The
// app says which platform it is on; this module stays free of react-native
// so the tests can load it in node.
let android = false;

export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

export function setAndroidHaptics(on: boolean): void {
  android = on;
}

type Step =
  | { at: number; kind: 'impact'; style: Haptics.ImpactFeedbackStyle; android?: string }
  | { at: number; kind: 'notify'; type: Haptics.NotificationFeedbackType; android?: string }
  | { at: number; kind: 'select'; android?: string };

const I = Haptics.ImpactFeedbackStyle;
const N = Haptics.NotificationFeedbackType;
const impact = (at: number, style: Haptics.ImpactFeedbackStyle, android?: string): Step => ({
  at,
  kind: 'impact',
  style,
  android,
});
const notify = (at: number, type: Haptics.NotificationFeedbackType, android?: string): Step => ({
  at,
  kind: 'notify',
  type,
  android,
});
const select = (at: number): Step => ({ at, kind: 'select' });

export const PATTERNS = {
  // the interface
  tap: [select(0)],
  toggle: [impact(0, I.Light, 'toggle_on')],
  press: [select(0)],
  longPress: [impact(0, I.Medium, 'long_press')],
  swap: [impact(0, I.Light)],
  purchase: [notify(0, N.Success, 'confirm')],
  claim: [impact(0, I.Light), impact(120, I.Light)],
  error: [notify(0, N.Error, 'reject')],
  // the cards
  arm: [impact(0, I.Soft)],
  play: [impact(0, I.Light)],
  land: [impact(0, I.Soft)],
  // the cues
  turn: [select(0), impact(90, I.Light)],
  call: [impact(0, I.Medium), impact(90, I.Medium)],
  clock5: [notify(0, N.Warning, 'clock_tick')],
  clock2: [impact(0, I.Heavy), impact(120, I.Heavy)],
  // the bidding
  trumpMine: [impact(0, I.Rigid)],
  kontraUs: [impact(0, I.Heavy)],
  kontraThem: [notify(0, N.Warning)],
  belaMine: [impact(0, I.Light), impact(80, I.Light), impact(160, I.Medium)],
  // the tricks
  trickMine: [impact(0, I.Medium)],
  lastTrickMine: [impact(0, I.Medium), impact(150, I.Light)],
  // the reckoning
  dealMade: [notify(0, N.Success, 'confirm')],
  dealFailed: [notify(0, N.Error, 'reject')],
  stigljaUs: [notify(0, N.Success), impact(150, I.Heavy)],
  stigljaThem: [notify(0, N.Warning)],
  matchWon: [notify(0, N.Success), impact(150, I.Heavy), impact(300, I.Heavy)],
  matchLost: [notify(0, N.Error)],
  levelUp: [impact(0, I.Light), impact(100, I.Medium), impact(200, I.Heavy)],
  coinLand: [impact(0, I.Soft)],
  // the room
  seatJoin: [impact(0, I.Light)],
  disconnect: [notify(0, N.Warning)],
} as const satisfies Record<string, readonly Step[]>;

export type Pattern = keyof typeof PATTERNS;

function fire(step: Step): void {
  const p =
    android && step.android
      ? Haptics.performAndroidHapticsAsync(step.android as Haptics.AndroidHaptics)
      : step.kind === 'impact'
        ? Haptics.impactAsync(step.style)
        : step.kind === 'notify'
          ? Haptics.notificationAsync(step.type)
          : Haptics.selectionAsync();
  void p.catch(() => {});
}

/** Play a named pattern; later steps are scheduled on plain timers. */
export function pattern(name: Pattern): void {
  if (!enabled) return;
  for (const step of PATTERNS[name]) {
    if (step.at === 0) fire(step);
    else setTimeout(() => fire(step), step.at);
  }
}

// --- the old verbs, kept for the few call sites that read better with them ---

export type Buzz = 'light' | 'medium' | 'heavy' | 'select';

const STYLE: Record<Exclude<Buzz, 'select'>, Haptics.ImpactFeedbackStyle> = {
  light: I.Light,
  medium: I.Medium,
  heavy: I.Heavy,
};

export function buzz(kind: Buzz): void {
  if (!enabled) return;
  fire(kind === 'select' ? select(0) : impact(0, STYLE[kind]));
}
