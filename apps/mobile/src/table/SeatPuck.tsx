import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import type { Seat } from '@belot/engine';
import { Anchor } from '../anim/AnchorRegistry';
import { anchorId } from '../anim/FxBus';
import { TurnRing } from '../anim/TurnRing';
import { Avatar, hasAvatar } from '../avatars';
import { garb } from '../deck/palette';
import { radius, theme } from '../theme';

/**
 * One seat at the table, the social-poker way: a person, not a text label.
 * Avatar disc with the player's initial, name, card-count chip, dealer marker,
 * and the countdown ring when it is this seat's turn.
 *
 * The avatar disc is the anchor sprites fly to and bubbles hang over.
 */

const AVATAR_COLOURS = [garb.blue, garb.red, garb.green, garb.brown];

export function SeatPuck({
  seat,
  name,
  avatar,
  cards,
  isDealer,
  isBot,
  connected = true,
  active,
  deadline,
  totalMs,
  size = 54,
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
  /** Absolute epoch deadline for the ring; null = soft ring without countdown. */
  deadline: number | null;
  totalMs?: number;
  size?: number;
}) {
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  const colour = AVATAR_COLOURS[seat % AVATAR_COLOURS.length]!;
  const ringSize = size + 10;
  const portrait = avatar && hasAvatar(avatar) ? avatar : null;

  return (
    <View style={styles.root}>
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

        {active && <TurnRing size={ringSize} deadline={deadline} totalMs={totalMs} />}

        {isDealer && (
          <View style={styles.dealer}>
            <Text style={styles.dealerText}>D</Text>
          </View>
        )}
        {cards > 0 && (
          <View style={styles.count}>
            <Text style={styles.countText}>{cards}</Text>
          </View>
        )}
      </View>

      <Text style={styles.name} numberOfLines={1}>
        {name}
        {isBot ? ' 🤖' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: 2, width: 86 },
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
