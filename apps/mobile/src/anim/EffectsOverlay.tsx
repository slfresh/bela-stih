import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { CardBackFace, CardFace } from '../deck';
import { garb } from '../deck/palette';
import { radius, theme } from '../theme';
import type { FxBus, FxWithId, XY } from './FxBus';

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
 */

const CARD_W = 46;

function lifetimeOf(fx: FxWithId): number {
  switch (fx.kind) {
    case 'flight':
      return fx.duration + 150;
    case 'deal':
      return fx.rounds * fx.to.length * 60 + 500;
    case 'sweep':
      return fx.from.length * 40 + 500;
    case 'bubble':
      return fx.duration + 250;
    case 'coins':
      return fx.count * 50 + 800;
    case 'confetti':
      return 2100;
  }
}

export function EffectsOverlay({ bus }: { bus: FxBus }) {
  const [sprites, setSprites] = useState<FxWithId[]>([]);
  const selfRef = useRef<View>(null);
  const origin = useRef<XY>({ x: 0, y: 0 });

  useEffect(
    () =>
      bus.subscribe((fx) => {
        setSprites((s) => [...s, fx]);
        setTimeout(
          () => setSprites((s) => s.filter((x) => x.id !== fx.id)),
          lifetimeOf(fx) + 200,
        );
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
      return <Deal from={local(fx.from)} to={fx.to.map(local)} rounds={fx.rounds} />;
    case 'sweep':
      return <Sweep from={fx.from.map(local)} to={local(fx.to)} />;
    case 'bubble':
      return (
        <Bubble at={local(fx.at)} text={fx.text} tone={fx.tone} duration={fx.duration} big={fx.big} />
      );
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
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(1, { duration: fx.duration, easing: Easing.out(Easing.cubic) });
  }, [p, fx.duration]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: from.x + (to.x - from.x) * p.value - CARD_W / 2 },
      { translateY: from.y + (to.y - from.y) * p.value - (CARD_W * 1.45) / 2 },
      { scale: 0.92 + 0.08 * p.value },
      { rotateZ: `${(1 - p.value) * -8}deg` },
    ],
  }));

  return (
    <Animated.View style={[styles.sprite, style]}>
      {fx.faceUp ? <CardFace card={fx.card} width={CARD_W} /> : <CardBackFace width={CARD_W} />}
    </Animated.View>
  );
}

// --- dealing backs -----------------------------------------------------------

function Deal({ from, to, rounds }: { from: XY; to: XY[]; rounds: number }) {
  const flights = useMemo(() => {
    const list: { key: number; to: XY; delay: number }[] = [];
    let i = 0;
    for (let r = 0; r < rounds; r++) {
      for (const t of to) list.push({ key: i, to: t, delay: i++ * 60 });
    }
    return list;
  }, [from, to, rounds]);

  return (
    <>
      {flights.map((f) => (
        <DealBack key={f.key} from={from} to={f.to} delay={f.delay} />
      ))}
    </>
  );
}

function DealBack({ from, to, delay }: { from: XY; to: XY; delay: number }) {
  const p = useSharedValue(0);
  const op = useSharedValue(0);
  useEffect(() => {
    op.value = withDelay(delay, withTiming(1, { duration: 40 }));
    p.value = withDelay(
      delay,
      withSequence(
        withTiming(1, { duration: 240, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 60 }),
      ),
    );
    op.value = withDelay(delay + 300, withTiming(0, { duration: 120 }));
  }, [p, op, delay]);

  const style = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [
      { translateX: from.x + (to.x - from.x) * p.value - 15 },
      { translateY: from.y + (to.y - from.y) * p.value - 22 },
      { rotateZ: `${p.value * 180}deg` },
    ],
  }));

  return (
    <Animated.View style={[styles.sprite, style]}>
      <CardBackFace width={30} />
    </Animated.View>
  );
}

// --- trick sweep -------------------------------------------------------------

function Sweep({ from, to }: { from: XY[]; to: XY }) {
  return (
    <>
      {from.map((f, i) => (
        <SweepBack key={i} from={f} to={to} delay={i * 40} />
      ))}
    </>
  );
}

function SweepBack({ from, to, delay }: { from: XY; to: XY; delay: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration: 320, easing: Easing.in(Easing.quad) }));
  }, [p, delay]);

  const style = useAnimatedStyle(() => ({
    opacity: 1 - p.value * 0.9,
    transform: [
      { translateX: from.x + (to.x - from.x) * p.value - 15 },
      { translateY: from.y + (to.y - from.y) * p.value - 22 },
      { scale: 1 - 0.4 * p.value },
    ],
  }));

  return (
    <Animated.View style={[styles.sprite, style]}>
      <CardBackFace width={30} />
    </Animated.View>
  );
}

// --- speech bubble -----------------------------------------------------------

function Bubble({
  at,
  text,
  tone,
  duration,
  big = false,
}: {
  at: XY;
  text: string;
  tone: 'plain' | 'gold';
  duration: number;
  /** Emoji emotes read at reaction size, not caption size. */
  big?: boolean;
}) {
  const s = useSharedValue(0);
  useEffect(() => {
    s.value = withSequence(
      withTiming(1.06, { duration: 160, easing: Easing.out(Easing.back(2)) }),
      withTiming(1, { duration: 90 }),
      withDelay(Math.max(0, duration - 450), withTiming(0, { duration: 180 })),
    );
  }, [s, duration]);

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
        { left: at.x - 70, top: Math.max(8, at.y - 64) },
      ]}
    >
      <Animated.View style={style}>
        <View style={[styles.bubbleInner, tone === 'gold' && styles.bubbleInnerGold]}>
          <Text
            style={[
              styles.bubbleText,
              tone === 'gold' && styles.bubbleTextGold,
              big && styles.bubbleTextBig,
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
        <Coin key={i} from={from} to={to} delay={i * 50} wobble={((i * 37) % 40) - 20} />
      ))}
    </>
  );
}

function Coin({ from, to, delay, wobble }: { from: XY; to: XY; delay: number; wobble: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration: 550, easing: Easing.in(Easing.quad) }));
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
        <ConfettiPiece key={key} {...c} />
      ))}
    </>
  );
}

function ConfettiPiece({
  x,
  delay,
  colour,
  spin,
}: {
  x: number;
  delay: number;
  colour: string;
  spin: number;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration: 1600, easing: Easing.in(Easing.quad) }));
  }, [p, delay]);

  const style = useAnimatedStyle(() => ({
    opacity: p.value === 0 ? 0 : 1 - Math.max(0, p.value - 0.8) * 5,
    transform: [
      { translateX: x * 360 + 10 * Math.sin(p.value * 6) },
      { translateY: -20 + p.value * 700 },
      { rotateZ: `${p.value * spin}deg` },
    ],
  }));

  return <Animated.View style={[styles.sprite, styles.confetto, { backgroundColor: colour }, style]} />;
}

// -----------------------------------------------------------------------------

const styles = StyleSheet.create({
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
