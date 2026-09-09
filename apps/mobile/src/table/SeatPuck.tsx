import { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import type { Seat } from '@belot/engine';
import { Anchor } from '../anim/AnchorRegistry';
import { anchorId } from '../anim/FxBus';
import { TurnRing } from '../anim/TurnRing';
import type { TeamTone } from './teamColour';
import { Avatar, hasAvatar } from '../avatars';
import { garb } from '../deck/palette';
import { radius, theme } from '../theme';
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

  const think = useSharedValue(1);
  useEffect(() => {
    if (thinking && !reduced) {
      think.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: 500, easing: Easing.inOut(Easing.sin) }),
          withTiming(1, { duration: 500, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(think);
      think.value = withTiming(1, { duration: 150 });
    }
    return () => cancelAnimation(think);
  }, [think, thinking, reduced]);
  const thinkPulse = useAnimatedStyle(() => ({ transform: [{ scale: think.value }] }));
  // The name sits under the disc and needs room for a couple of words; a
  // smaller puck must give that room back, or a shrunk seat still costs 86px
  // of the table's width. 54 + 32 is exactly the old fixed width.
  const width = size + 32;
  const colour = AVATAR_COLOURS[seat % AVATAR_COLOURS.length]!;
  const ringSize = size + 10;
  const portrait = avatar && hasAvatar(avatar) ? avatar : null;

  return (
    <View style={[styles.root, { width }]}>
      <View style={{ width: ringSize, height: ringSize }}>
        <Anchor id={anchorId.seat(seat)} style={[StyleSheet.absoluteFill, styles.centre]}>
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
          <Animated.View
            style={[
              styles.teamRing,
              { width: ringSize, height: ringSize, borderRadius: ringSize / 2, borderColor: tone.edge },
              thinkPulse,
            ]}
            pointerEvents="none"
          />
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
      </View>

      <Text style={styles.name} numberOfLines={1}>
        {name}
        {isBot ? ' 🤖' : ''}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: 2 },
  centre: { alignItems: 'center', justifyContent: 'center' },
  name: { color: theme.textDim, fontSize: 12, maxWidth: 84 },
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
  dealerText: { color: garb.ink, fontSize: 11, fontWeight: '800' },
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
  countText: { color: theme.text, fontSize: 11, fontWeight: '700' },
});
