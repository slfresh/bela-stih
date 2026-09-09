import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { Card, Suit } from '@belot/engine';
import { cosmetics } from '../cosmetics';
import { CardBackFace, CardFace, SuitPip } from '../deck';
import { garb } from '../deck/palette';
import { counters } from '../dev/counters';
import { radius, signal, theme } from '../theme';
import type { FxBus, FxWithId, XY } from './FxBus';
import {
  BACK_SCALE,
  BUBBLE_IN_MS,
  BUBBLE_MIN_MS,
  BUBBLE_OUT_MS,
  BUBBLE_SETTLE_IN_MS,
  COIN_FLY_MS,
  COIN_STAGGER_MS,
  CONFETTI_MS,
  DEAL_FADE_MS,
  DEAL_FLY_MS,
  DEAL_HOLD_MS,
  FLIGHT_FLIP_AT,
  PULSE_MS,
  STAMP_MS,
  SWEEP_FLIP_AT,
  SWEEP_FLY_MS,
  SWEEP_HOLD_MS,
  SWEEP_STAGGER_MS,
  lifetimeOf,
} from './lifetimes';

/**
 * The transient sprite layer: flying cards, dealt backs, trick sweeps, speech
 * bubbles, coin arcs, confetti.
 *
 * Design rules:
 *  - `pointerEvents="none"`, rendered as the LAST sibling of the screen — it
 *    can never eat a tap and never needs zIndex games under Fabric.
 *  - Sprites are fire-and-forget decoration. The parent removes each one on a
 *    plain JS timeout; game sequencing NEVER waits on an animation callback,
 *    so a dropped frame cannot stall anything.
 *  - Effects carry window coordinates; the overlay subtracts its own window
 *    origin, so it works wherever it sits in the tree.
 *  - Timing constants live in `lifetimes.ts`, shared with the tests that bound
 *    every sprite against the director's beat. Each sprite scales its own
 *    durations by the `speed` it was spawned with.
 */

export function EffectsOverlay({ bus }: { bus: FxBus }) {
  const [sprites, setSprites] = useState<FxWithId[]>([]);
  const selfRef = useRef<View>(null);
  const origin = useRef<XY>({ x: 0, y: 0 });

  useEffect(
    () =>
      bus.subscribe((fx) => {
        counters.spriteMount++;
        setSprites((s) => [...s, fx]);
        // lifetimeOf already carries each sprite's settle; a flat 200 ms on
        // top kept a landed flight drawn under the sweep that took its card.
        setTimeout(() => {
          counters.spriteUnmount++;
          setSprites((s) => s.filter((x) => x.id !== fx.id));
        }, lifetimeOf(fx));
      }),
    [bus],
  );

  return (
    <View
      ref={selfRef}
      pointerEvents="none"
      collapsable={false}
      style={StyleSheet.absoluteFill}
      onLayout={() =>
        selfRef.current?.measureInWindow((x, y) => {
          origin.current = { x, y };
        })
      }
    >
      {sprites.map((fx) => (
        <Sprite key={fx.id} fx={fx} origin={origin.current} />
      ))}
    </View>
  );
}

function Sprite({ fx, origin }: { fx: FxWithId; origin: XY }) {
  const local = (p: XY): XY => ({ x: p.x - origin.x, y: p.y - origin.y });
  switch (fx.kind) {
    case 'flight':
      return <Flight from={local(fx.from)} to={local(fx.to)} fx={fx} />;
    case 'deal':
      return (
        <Deal
          from={local(fx.from)}
          backs={fx.backs.map(local)}
          stagger={fx.stagger}
          speed={fx.speed}
          width={fx.width}
        />
      );
    case 'trickSweep':
      return <TrickSweep fx={fx} local={local} />;
    case 'bubble':
      return (
        <Bubble
          at={local(fx.at)}
          text={fx.text}
          tone={fx.tone}
          duration={fx.duration}
          speed={fx.speed}
          big={fx.big}
          pip={fx.pip}
          weight={fx.weight}
        />
      );
    case 'stamp':
      return <Stamp at={local(fx.at)} pip={fx.pip} text={fx.text} tone={fx.tone} speed={fx.speed} />;
    case 'pulse':
      return <Pulse at={local(fx.at)} speed={fx.speed} />;
    case 'badge':
      return <Badge from={local(fx.from)} to={local(fx.to)} duration={fx.duration} />;
    case 'coins':
      return <Coins from={local(fx.from)} to={local(fx.to)} count={fx.count} />;
    case 'confetti':
      return <Confetti seed={fx.id} />;
  }
}

// --- flying card -------------------------------------------------------------

function Flight({
  from,
  to,
  fx,
}: {
  from: XY;
  to: XY;
  fx: Extract<FxWithId, { kind: 'flight' }>;
}) {
  const w = fx.width;
  // From the fan's size to the slot's, when it set off from the fan.
  const startScale = fx.fromWidth ? fx.fromWidth / w : 0.92;
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(1, { duration: fx.duration, easing: Easing.out(Easing.cubic) });
  }, [p, fx.duration]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: from.x + (to.x - from.x) * p.value - w / 2 },
      { translateY: from.y + (to.y - from.y) * p.value - (w * 1.45) / 2 },
      { scale: startScale + (1 - startScale) * p.value },
      { rotateZ: `${(1 - p.value) * -8}deg` },
    ],
  }));
  // An opponent's card turns over part-way; mine is face up from the tap.
  const face = useAnimatedStyle(() => ({
    opacity: fx.faceUp || p.value >= FLIGHT_FLIP_AT ? 1 : 0,
  }));
  const back = useAnimatedStyle(() => ({
    opacity: fx.faceUp || p.value >= FLIGHT_FLIP_AT ? 0 : 1,
  }));

  return (
    <Animated.View style={[styles.sprite, style]}>
      <Animated.View style={face}>
        <CardFace card={fx.card} width={w} style={cosmetics().deckStyle} />
      </Animated.View>
      {!fx.faceUp && (
        <Animated.View style={[StyleSheet.absoluteFill, back]}>
          <CardBackFace width={w} variant={cosmetics().cardBack} />
        </Animated.View>
      )}
    </Animated.View>
  );
}

// --- dealing backs -----------------------------------------------------------

function Deal({
  from,
  backs,
  stagger,
  speed,
  width,
}: {
  from: XY;
  backs: XY[];
  stagger: number;
  speed: number;
  width: number;
}) {
  const flights = useMemo(
    () => backs.map((to, i) => ({ key: i, to, delay: i * stagger * speed })),
    [backs, stagger, speed],
  );

  return (
    <>
      {flights.map((f) => (
        <DealBack key={f.key} from={from} to={f.to} delay={f.delay} speed={speed} width={width} />
      ))}
    </>
  );
}

function DealBack({
  from,
  to,
  delay,
  speed,
  width,
}: {
  from: XY;
  to: XY;
  delay: number;
  speed: number;
  width: number;
}) {
  const p = useSharedValue(0);
  const op = useSharedValue(0);
  useEffect(() => {
    op.value = withDelay(delay, withTiming(1, { duration: 40 * speed }));
    p.value = withDelay(
      delay,
      withSequence(
        withTiming(1, { duration: DEAL_FLY_MS * speed, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: DEAL_HOLD_MS * speed }),
      ),
    );
    op.value = withDelay(
      delay + (DEAL_FLY_MS + DEAL_HOLD_MS) * speed,
      withTiming(0, { duration: DEAL_FADE_MS * speed }),
    );
  }, [p, op, delay, speed]);

  const style = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [
      { translateX: from.x + (to.x - from.x) * p.value - width / 2 },
      { translateY: from.y + (to.y - from.y) * p.value - (width * 1.45) / 2 },
      { rotateZ: `${p.value * 180}deg` },
    ],
  }));

  return (
    <Animated.View style={[styles.sprite, style]}>
      <CardBackFace width={width} variant={cosmetics().cardBack} />
    </Animated.View>
  );
}

// --- trick sweep -------------------------------------------------------------

/**
 * The four cards of a won trick, as they really are: they hold on the felt
 * for a beat (the winner's lifts, gold-edged), then fly to the winner's puck
 * in play order, turning face down and shrinking as they go. The director
 * clears the slots the moment this starts, so for that moment these ARE the
 * trick — before, card backs flew while the faces sat still in their slots
 * and then snapped away a beat later.
 */
function TrickSweep({
  fx,
  local,
}: {
  fx: Extract<FxWithId, { kind: 'trickSweep' }>;
  local: (p: XY) => XY;
}) {
  const to = local(fx.to);
  return (
    <>
      {fx.cards.map((c, i) => (
        <SweptCard
          key={i}
          card={c.card}
          from={local(c.from)}
          to={to}
          winner={c.seat === fx.winner}
          delay={(SWEEP_HOLD_MS + i * SWEEP_STAGGER_MS) * fx.speed}
          speed={fx.speed}
          width={fx.width}
        />
      ))}
    </>
  );
}

function SweptCard({
  card,
  from,
  to,
  winner,
  delay,
  speed,
  width,
}: {
  card: Card;
  from: XY;
  to: XY;
  winner: boolean;
  delay: number;
  speed: number;
  width: number;
}) {
  const p = useSharedValue(0);
  const lift = useSharedValue(0);
  useEffect(() => {
    if (winner) {
      lift.value = withTiming(1, { duration: 140 * speed, easing: Easing.out(Easing.quad) });
    }
    p.value = withDelay(
      delay,
      withTiming(1, { duration: SWEEP_FLY_MS * speed, easing: Easing.in(Easing.quad) }),
    );
  }, [p, lift, winner, delay, speed]);

  const style = useAnimatedStyle(() => ({
    opacity: 1 - 0.9 * Math.max(0, (p.value - 0.8) / 0.2),
    transform: [
      { translateX: from.x + (to.x - from.x) * p.value - width / 2 },
      { translateY: from.y + (to.y - from.y) * p.value - (width * 1.45) / 2 - lift.value * 6 },
      { scale: 1 - (1 - BACK_SCALE) * p.value },
    ],
  }));
  // Face for the first stretch of the flight, back for the rest.
  const face = useAnimatedStyle(() => ({ opacity: p.value < SWEEP_FLIP_AT ? 1 : 0 }));
  const back = useAnimatedStyle(() => ({ opacity: p.value < SWEEP_FLIP_AT ? 0 : 1 }));

  return (
    <Animated.View style={[styles.sprite, style]}>
      <Animated.View style={face}>
        <CardFace card={card} width={width} style={cosmetics().deckStyle} />
        {winner && <View pointerEvents="none" style={styles.sweptRing} />}
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, back]}>
        <CardBackFace width={width} variant={cosmetics().cardBack} />
      </Animated.View>
    </Animated.View>
  );
}

// --- the turn pulse ------------------------------------------------------------

const PULSE_SIZE = 56;

/** A cream ring that grows from the hand and is gone: "now", said with light. */
function Pulse({ at, speed }: { at: XY; speed: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(1, { duration: PULSE_MS * speed, easing: Easing.out(Easing.cubic) });
  }, [p, speed]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.9 * (1 - p.value),
    transform: [
      { translateX: at.x - PULSE_SIZE / 2 },
      { translateY: at.y - PULSE_SIZE / 2 },
      { scale: 1 + 0.6 * p.value },
    ],
  }));
  return <Animated.View style={[styles.sprite, styles.pulse, style]} />;
}

// --- the dealer's button -------------------------------------------------------

const BADGE = 18;

/** The "D" hopping from the old dealer's puck to the new one. */
function Badge({ from, to, duration }: { from: XY; to: XY; duration: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(1, { duration, easing: Easing.inOut(Easing.cubic) });
  }, [p, duration]);
  const style = useAnimatedStyle(() => {
    const arc = Math.sin(Math.PI * p.value);
    return {
      transform: [
        { translateX: from.x + (to.x - from.x) * p.value - BADGE / 2 },
        { translateY: from.y + (to.y - from.y) * p.value - BADGE / 2 - arc * 18 },
        { scale: 1 + 0.25 * arc },
      ],
    };
  });
  return (
    <Animated.View style={[styles.sprite, styles.badge, style]}>
      <Text style={styles.badgeText}>D</Text>
    </Animated.View>
  );
}

// --- the stamp -----------------------------------------------------------------

/**
 * The trump pip (or the ×2) dropping onto the plaque as the call's beat ends:
 * 1.6 → 1 with a spring and a ring of light, then it is simply the plaque's.
 */
function Stamp({
  at,
  pip,
  text,
  tone,
  speed,
}: {
  at: XY;
  pip?: Suit;
  text?: string;
  tone: 'gold' | 'danger';
  speed: number;
}) {
  const p = useSharedValue(0);
  const drop = useSharedValue(1.6);
  useEffect(() => {
    drop.value = withSpring(1, { damping: 12, stiffness: 240, mass: 0.5 });
    p.value = withTiming(1, { duration: STAMP_MS * speed, easing: Easing.out(Easing.cubic) });
  }, [p, drop, speed]);
  const body = useAnimatedStyle(() => ({
    opacity: 1 - Math.max(0, (p.value - 0.7) / 0.3),
    transform: [
      { translateX: at.x - STAMP_SIZE / 2 },
      { translateY: at.y - STAMP_SIZE / 2 },
      { scale: drop.value },
    ],
  }));
  const ring = useAnimatedStyle(() => ({
    opacity: 0.9 * (1 - p.value),
    transform: [
      { translateX: at.x - STAMP_SIZE / 2 },
      { translateY: at.y - STAMP_SIZE / 2 },
      { scale: 1 + 1.2 * p.value },
    ],
  }));
  return (
    <>
      <Animated.View style={[styles.sprite, styles.stampRing, tone === 'danger' && styles.stampRingDanger, ring]} />
      <Animated.View style={[styles.sprite, styles.stamp, body]}>
        {pip !== undefined ? (
          <SuitPip suit={pip} size={STAMP_SIZE - 8} />
        ) : (
          <Text style={[styles.stampText, tone === 'danger' && styles.stampTextDanger]}>{text}</Text>
        )}
      </Animated.View>
    </>
  );
}

const STAMP_SIZE = 36;

// --- speech bubble -----------------------------------------------------------

function Bubble({
  at,
  text,
  tone,
  duration,
  speed,
  big = false,
  pip,
  weight = 1,
}: {
  at: XY;
  text: string;
  tone: 'plain' | 'gold';
  duration: number;
  speed: number;
  /** Emoji emotes read at reaction size, not caption size. */
  big?: boolean;
  pip?: Suit;
  weight?: 1 | 2 | 3 | 4;
}) {
  const { width: screenW } = useWindowDimensions();
  const s = useSharedValue(0);
  useEffect(() => {
    // Pop in, settle, hold whatever the duration leaves, fade — each leg
    // scaled by the director's pace, as `motionOf` promises.
    s.value = withSequence(
      withTiming(1.06, { duration: BUBBLE_IN_MS * speed, easing: Easing.out(Easing.back(2)) }),
      withTiming(1, { duration: BUBBLE_SETTLE_IN_MS * speed }),
      withDelay(
        Math.max(0, duration - BUBBLE_MIN_MS * speed),
        withTiming(0, { duration: BUBBLE_OUT_MS * speed }),
      ),
    );
  }, [s, duration, speed]);

  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, s.value * 2),
    transform: [{ scale: s.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.sprite,
        styles.bubble,
        tone === 'gold' && styles.bubbleGold,
        // Clamped so a top-seat bubble can never sit over the HUD.
        {
          // Clamped: a puck near the edge would otherwise push the bubble off
          // the screen, which is exactly where the landscape rails put them.
          left: Math.max(8, Math.min(at.x - 70, screenW - 148)),
          top: Math.max(8, at.y - 64),
        },
      ]}
    >
      <Animated.View style={style}>
        <View
          style={[
            styles.bubbleInner,
            tone === 'gold' && styles.bubbleInnerGold,
            weight >= 3 && styles.bubbleInnerHeavy,
            pip !== undefined && styles.bubbleInnerRow,
          ]}
        >
          {pip !== undefined && <SuitPip suit={pip} size={18} />}
          <Text
            style={[
              styles.bubbleText,
              tone === 'gold' && styles.bubbleTextGold,
              big && styles.bubbleTextBig,
              // A bigger zvanje says so: 14 / 15 / 17 / 19.
              weight === 2 && { fontSize: 15 },
              weight === 3 && { fontSize: 17 },
              weight === 4 && { fontSize: 19 },
            ]}
          >
            {text}
          </Text>
        </View>
        <View style={[styles.bubbleTail, tone === 'gold' && styles.bubbleTailGold]} />
      </Animated.View>
    </Animated.View>
  );
}

// --- coin arc ----------------------------------------------------------------

function Coins({ from, to, count }: { from: XY; to: XY; count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <Coin
          key={i}
          from={from}
          to={to}
          delay={i * COIN_STAGGER_MS}
          wobble={((i * 37) % 40) - 20}
        />
      ))}
    </>
  );
}

function Coin({ from, to, delay, wobble }: { from: XY; to: XY; delay: number; wobble: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(
      delay,
      withTiming(1, { duration: COIN_FLY_MS, easing: Easing.in(Easing.quad) }),
    );
  }, [p, delay]);

  const style = useAnimatedStyle(() => {
    const t = p.value;
    return {
      opacity: t === 0 ? 0 : 1 - Math.max(0, t - 0.9) * 10,
      transform: [
        { translateX: from.x + (to.x - from.x) * t + wobble * Math.sin(t * Math.PI) - 7 },
        { translateY: from.y + (to.y - from.y) * t - 90 * 4 * t * (1 - t) * 0.35 - 7 },
      ],
    };
  });

  return <Animated.View style={[styles.sprite, styles.coin, style]} />;
}

// --- confetti ----------------------------------------------------------------

const CONFETTI_COLOURS = [garb.red, garb.gold, garb.green, garb.blue, garb.cream];

function Confetti({ seed }: { seed: number }) {
  // Was hard-coded to a 360x700 phone, so in landscape the confetti fell down
  // the left third of the screen and stopped halfway.
  const { width, height } = useWindowDimensions();
  const pieces = useMemo(
    () =>
      Array.from({ length: 26 }).map((_, i) => ({
        key: i,
        x: ((seed * 131 + i * 197) % 100) / 100,
        delay: (i * 53) % 500,
        colour: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length]!,
        spin: ((i * 89) % 2 ? 1 : -1) * (360 + ((i * 71) % 360)),
      })),
    [seed],
  );
  return (
    <>
      {pieces.map(({ key, ...c }) => (
        <ConfettiPiece key={key} {...c} width={width} height={height} />
      ))}
    </>
  );
}

function ConfettiPiece({
  x,
  width,
  height,
  delay,
  colour,
  spin,
}: {
  x: number;
  width: number;
  height: number;
  delay: number;
  colour: string;
  spin: number;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(
      delay,
      withTiming(1, { duration: CONFETTI_MS - 500, easing: Easing.in(Easing.quad) }),
    );
  }, [p, delay]);

  const style = useAnimatedStyle(() => ({
    opacity: p.value === 0 ? 0 : 1 - Math.max(0, p.value - 0.8) * 5,
    transform: [
      { translateX: x * width + 10 * Math.sin(p.value * 6) },
      { translateY: -20 + p.value * (height + 60) },
      { rotateZ: `${p.value * spin}deg` },
    ],
  }));

  return <Animated.View style={[styles.sprite, styles.confetto, { backgroundColor: colour }, style]} />;
}

// -----------------------------------------------------------------------------

const styles = StyleSheet.create({
  // Mirrors SeatPuck's dealer badge, so the hop lands on its own likeness.
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    backgroundColor: theme.cardFace,
    borderWidth: 1,
    borderColor: garb.goldDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: garb.ink, fontSize: 11, fontWeight: '800' },
  pulse: {
    width: PULSE_SIZE,
    height: PULSE_SIZE,
    borderRadius: PULSE_SIZE / 2,
    borderWidth: 3,
    borderColor: signal.turn,
  },
  // The card that took the trick, marked while the four hold on the felt.
  sweptRing: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderWidth: 2,
    borderColor: garb.gold,
    borderRadius: radius.card + 2,
  },
  sprite: { position: 'absolute', left: 0, top: 0 },
  bubble: { width: 140, alignItems: 'center' },
  bubbleGold: {},
  bubbleInner: {
    backgroundColor: theme.cardFace,
    borderRadius: radius.panel,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    maxWidth: 150,
  },
  bubbleInnerGold: { backgroundColor: theme.accent, borderColor: garb.goldDark },
  bubbleInnerHeavy: { borderWidth: 2.5, borderColor: garb.gold, paddingVertical: 9 },
  bubbleInnerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stamp: {
    width: STAMP_SIZE,
    height: STAMP_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stampText: { color: garb.gold, fontSize: 20, fontWeight: '800' },
  stampTextDanger: { color: theme.danger },
  stampRing: {
    width: STAMP_SIZE,
    height: STAMP_SIZE,
    borderRadius: STAMP_SIZE / 2,
    borderWidth: 2,
    borderColor: garb.gold,
  },
  stampRingDanger: { borderColor: theme.danger },
  bubbleText: { color: garb.ink, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  bubbleTextGold: { color: garb.ink },
  bubbleTextBig: { fontSize: 28, lineHeight: 34 },
  bubbleTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: theme.cardFace,
    marginTop: -1,
  },
  bubbleTailGold: { borderTopColor: theme.accent },
  coin: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: theme.accent,
    borderWidth: 1.5,
    borderColor: garb.goldDark,
  },
  confetto: { width: 8, height: 14, borderRadius: 2 },
});
