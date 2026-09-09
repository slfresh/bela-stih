import { memo, useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  type CSSAnimationProperties,
} from 'react-native-reanimated';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import type { Seat } from '@belot/engine';
import { Anchor } from '../anim/AnchorRegistry';
import { anchorId } from '../anim/FxBus';
import { TurnRing } from '../anim/TurnRing';
import type { TeamTone } from './teamColour';
import { Avatar, hasAvatar } from '../avatars';
import { garb } from '../deck/palette';
import { font, radius, stroke, theme } from '../theme';
import { Robot } from '../ui/icons';
import { useCountUp } from '../anim/useCountUp';

/**
 * One seat at the table, the social-poker way: a person, not a text label.
 * Avatar disc with the player's initial, name, card-count chip, dealer marker,
 * and the countdown ring when it is this seat's turn.
 *
 * The avatar disc is the anchor sprites fly to and bubbles hang over.
 */

// Deliberately team-NEUTRAL: red and green here would fight the team ring,
// which is the thing that actually tells you whose side a seat is on.
const AVATAR_COLOURS = [garb.blue, garb.brown, garb.steel, garb.grape];

/**
 * Memoised: a director tick re-renders the table, and a puck whose seat,
 * count, ring and badges have not changed has nothing to redraw. `tone` is a
 * module constant per side, so the default shallow compare is exact.
 */
export const SeatPuck = memo(function SeatPuck({
  seat,
  name,
  avatar,
  cards,
  isDealer,
  isBot,
  connected = true,
  active,
  tone,
  partner = false,
  deadline,
  totalMs,
  size = 54,
  thinking = false,
  reduced = false,
  gesture = null,
  tricks = 0,
  anchored = true,
}: {
  seat: Seat;
  name: string;
  /** Preset avatar id; unknown or missing falls back to the initial letter. */
  avatar?: string | null;
  cards: number;
  isDealer: boolean;
  isBot: boolean;
  connected?: boolean;
  /** Is it this seat's turn (renders the ring)? */
  active: boolean;
  /** Which side of the table this seat is on, from the viewer's chair. */
  tone?: TeamTone;
  /** Draws the partner marker — a shape, so colour is never the only carrier. */
  partner?: boolean;
  /** Absolute epoch deadline for the ring; null = soft ring without countdown. */
  deadline: number | null;
  totalMs?: number;
  size?: number;
  /**
   * This seat's move is being animated right now — presentation only, from
   * the director's event stream, never from `toAct`. Pulses the team ring.
   */
  thinking?: boolean;
  /** Reduce-motion: no pulse, no breath. */
  reduced?: boolean;
  /** A one-off: a nod (a pass) or a pulse of the team ring (a big zvanje, a bela). */
  gesture?: { kind: 'nod' | 'pulse'; n: number } | null;
  /** Tricks this seat's side has taken this deal: a little pile by the puck. */
  tricks?: number;
  /**
   * Registers as the seat's sprite anchor (where cards fly from and to).
   * False for the viewer's own puck: their hand is that anchor.
   */
  anchored?: boolean;
}) {
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  // The chip ticks up as the deal lands (0 → 6 → 8) rather than jumping.
  const shownCards = useCountUp(cards, 300, { reduced });

  // The turn ring stays mounted and fades, instead of unmounting on every
  // intermediate view of a drain — which blinked it off and on per event.
  const ringOn = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    ringOn.value = withTiming(active ? 1 : 0, { duration: 150 });
  }, [ringOn, active]);
  const ringFade = useAnimatedStyle(() => ({ opacity: ringOn.value }));


  // One-off gestures: a pass nods the whole puck; a big call or a bela flares
  // the team ring. `n` is what makes a repeat new.
  const nod = useSharedValue(0);
  const flare = useSharedValue(1);
  // Only a gesture that arrived AFTER this puck mounted plays: the pucks are
  // rebuilt on a rotation, and the last cue is still current then.
  const seenGesture = useRef(gesture?.n ?? 0);
  useEffect(() => {
    if (!gesture || reduced || gesture.n === seenGesture.current) return;
    seenGesture.current = gesture.n;
    if (gesture.kind === 'nod') {
      nod.value = withSequence(withTiming(4, { duration: 90 }), withTiming(0, { duration: 110 }));
    } else {
      flare.value = withSequence(
        withTiming(1.14, { duration: 120, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 220, easing: Easing.inOut(Easing.quad) }),
      );
    }
  }, [gesture, nod, flare, reduced]);
  const nodStyle = useAnimatedStyle(() => ({ transform: [{ translateY: nod.value }] }));
  const flareStyle = useAnimatedStyle(() => ({ transform: [{ scale: flare.value }] }));
  // The name sits under the disc and needs room for a couple of words; a
  // smaller puck must give that room back, or a shrunk seat still costs 86px
  // of the table's width. 54 + 32 is exactly the old fixed width.
  const width = size + 32;
  const colour = AVATAR_COLOURS[seat % AVATAR_COLOURS.length]!;
  const ringSize = size + 10;
  const portrait = avatar && hasAvatar(avatar) ? avatar : null;

  return (
    <Animated.View style={[styles.root, { width }, nodStyle]}>
      <View style={{ width: ringSize, height: ringSize }}>
        <Anchor id={anchored ? anchorId.seat(seat) : anchorId.puck(seat)} style={[StyleSheet.absoluteFill, styles.centre]}>
          {portrait ? (
            <View style={{ opacity: connected ? 1 : 0.45 }}>
              <Avatar id={portrait} size={size} />
            </View>
          ) : (
            <Svg width={size} height={size} viewBox="0 0 100 100">
              <Circle cx="50" cy="50" r="48" fill={colour} opacity={connected ? 1 : 0.45} />
              <Circle cx="50" cy="50" r="48" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="3" />
              <SvgText
                x="50"
                y="66"
                fontSize="46"
                fontWeight="bold"
                fill={theme.cardFace}
                textAnchor="middle"
                opacity={connected ? 1 : 0.5}
              >
                {initial}
              </SvgText>
            </Svg>
          )}
        </Anchor>

        {/* Team ring: static, and deliberately NOT the countdown ring — that
            one means TIME (amber to red) and the two must never be confused. */}
        {tone && (
          // The "thinking" pulse is a CSS animation on the outer view (the
          // compositor's); the one-off flare stays a spring on the inner one.
          <Animated.View
            style={[StyleSheet.absoluteFill, thinking && !reduced ? thinkPulse : undefined]}
            pointerEvents="none"
          >
            <Animated.View
              style={[
                styles.teamRing,
                { width: ringSize, height: ringSize, borderRadius: ringSize / 2, borderColor: tone.edge },
                flareStyle,
              ]}
              pointerEvents="none"
            />
          </Animated.View>
        )}

        <Animated.View style={[StyleSheet.absoluteFill, ringFade]} pointerEvents="none">
          <TurnRing
            size={ringSize}
            deadline={active ? deadline : null}
            totalMs={totalMs}
            breathe={active && !reduced}
          />
        </Animated.View>

        {/* A shape, not just a colour: the partner is readable in greyscale. */}
        {partner && (
          <View style={styles.partnerMark}>
            <Text style={styles.partnerMarkText}>◆</Text>
          </View>
        )}

        {isDealer && (
          <View style={styles.dealer}>
            <Text style={styles.dealerText}>D</Text>
          </View>
        )}
        {shownCards > 0 && (
          <View style={styles.count}>
            <Text style={styles.countText}>{shownCards}</Text>
          </View>
        )}
        {tricks > 0 && (
          <View style={styles.pile} pointerEvents="none">
            <View style={[styles.pileCard, styles.pileCardBack]} />
            <View style={styles.pileCard} />
            <Text style={styles.pileText}>{tricks}</Text>
          </View>
        )}
      </View>

      <View style={styles.nameRow}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {isBot && <Robot size={12} />}
      </View>
    </Animated.View>
  );
});

const thinkPulse: CSSAnimationProperties = {
  animationName: { from: { transform: [{ scale: 1 }] }, to: { transform: [{ scale: 1.06 }] } },
  animationDuration: 500,
  animationIterationCount: 'infinite',
  animationDirection: 'alternate',
  animationTimingFunction: 'ease-in-out',
};

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: 2 },
  centre: { alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: 84 },
  name: { color: theme.textDim, fontSize: 12, flexShrink: 1 },
  dealer: {
    position: 'absolute',
    top: -2,
    left: -2,
    backgroundColor: theme.cardFace,
    borderRadius: radius.pill,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: garb.goldDark,
  },
  dealerText: { color: garb.ink, fontSize: 11, fontFamily: font.bold },
  teamRing: { position: 'absolute', borderWidth: 2 },
  partnerMark: { position: 'absolute', bottom: -2, left: -2 },
  partnerMarkText: { color: theme.textDim, fontSize: 11 },
  count: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: radius.pill,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { color: theme.text, fontSize: 11, fontFamily: font.bold },
  // Two tiny backs, stacked, with the count: the side's pile of tricks.
  pile: { position: 'absolute', top: -4, right: -6, width: 22, height: 18 },
  pileCard: {
    position: 'absolute',
    left: 0,
    top: 2,
    width: 12,
    height: 9,
    borderRadius: 2,
    backgroundColor: garb.redDark,
    borderWidth: 1,
    borderColor: stroke.lit,
  },
  pileCardBack: { left: 2, top: 0 },
  pileText: { position: 'absolute', right: 0, top: 3, color: theme.text, fontSize: 11, fontFamily: font.bold },

});
