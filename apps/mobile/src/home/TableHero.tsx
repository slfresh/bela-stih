import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Avatar, AVATAR_IDS } from '../avatars';
import type { RoomStyle } from '../cosmetics';
import { garb } from '../deck/palette';
import { FeltArt } from '../table/FeltArt';
import { font, radius, space, stroke, type } from '../theme';
import { PressScale } from '../ui/PressScale';
import { guestsFor } from './guests';

/**
 * The home screen's table: a real felt, two of the house's characters
 * already sitting at the far side (a different pair each day), your own
 * avatar in your chair, and the one word that starts a game on the baize.
 * Memoised: it redraws only when the room, the avatar or the width change.
 */
export const TableHero = memo(function TableHero({
  width,
  avatar,
  day,
  label,
  room,
  onPress,
}: {
  width: number;
  /** The player's own avatar id. */
  avatar: string;
  /** Today's ISO day: picks which two characters sit across. */
  day: string;
  label: string;
  room: RoomStyle;
  onPress: () => void;
}) {
  const height = Math.round(width * 0.5);
  const seat = Math.round(Math.min(56, width * 0.14));
  const guests = guestsFor(day, avatar, AVATAR_IDS);
  return (
    <PressScale onPress={onPress} scaleTo={0.985} style={{ width, height }}>
      <FeltArt width={width} height={height} room={room} grain={false} />
      {/* the two across the table */}
      <View style={[styles.guest, { top: Math.round(height * 0.1), left: Math.round(width * 0.2) }]}>
        <Avatar id={guests[0]!} size={seat} />
      </View>
      <View style={[styles.guest, { top: Math.round(height * 0.1), right: Math.round(width * 0.2) }]}>
        <Avatar id={guests[1]!} size={seat} />
      </View>
      {/* you, in your chair */}
      <View style={[styles.you, { bottom: Math.round(height * 0.07) }]}>
        <Avatar id={avatar} size={Math.round(seat * 1.12)} />
      </View>
      {/* the word on the baize */}
      <View style={styles.centre} pointerEvents="none">
        <View style={styles.pill}>
          <Text style={styles.label}>{label}</Text>
        </View>
      </View>
    </PressScale>
  );
});

const styles = StyleSheet.create({
  guest: { position: 'absolute' },
  you: { position: 'absolute', alignSelf: 'center' },
  centre: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    backgroundColor: garb.gold,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: stroke.lit,
    paddingHorizontal: space.xxxl,
    paddingVertical: space.md,
  },
  label: { color: garb.ink, ...type.h1, fontFamily: font.black, letterSpacing: 3 },
});
