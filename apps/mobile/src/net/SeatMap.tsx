import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Seat } from '@belot/engine';
import type { Lang } from '@belot/i18n';
import { AnchorHost, AnchorMap } from '../anim/AnchorRegistry';
import type { RoomStyle } from '../cosmetics';
import { FeltArt } from '../table/FeltArt';
import { seatPosition, type Position } from '../table/geometry';
import { SeatPuck } from '../table/SeatPuck';
import { seatName } from './seatName';
import { isPartner, seatTone } from '../table/teamColour';
import { ink, space, stroke, surface, type } from '../theme';
import { Chair, Crown } from '../ui/icons';
import { PressScale } from '../ui/PressScale';
import type { SeatInfo } from './useNetGame';

/** Height over width of the felt; the lobby sizes its columns by it. */
export const SEAT_MAP_ASPECT = 0.62;

/**
 * The lobby as the table it is about to be: four pucks round a real felt,
 * seen from the viewer's chair. A free seat is a ghost puck with a chair — tap
 * it to sit there (and choose your partner); the host wears a crown; a bot
 * shows the robot beside its name, as it will at the table.
 *
 * The room's code is NOT on this felt. It sat on a plate in the middle, which
 * is wider than the gap the side seats leave on any phone under about 380 dp:
 * two pucks, a name and the crown were drawn over it. It lives in the lobby's
 * invitation panel now, with the button that sends it.
 */
export const SeatMap = memo(function SeatMap({
  width,
  seats,
  mySeat,
  hostSeat,
  canSit,
  lang,
  room,
  anchors,
  onSit,
}: {
  width: number;
  seats: SeatInfo[];
  mySeat: Seat | null;
  hostSeat: Seat | null;
  /** Before the game starts a free seat can be taken. */
  canSit: boolean;
  lang: Lang;
  room: RoomStyle;
  anchors: AnchorMap;
  onSit: (seat: Seat) => void;
}) {
  const height = Math.round(width * SEAT_MAP_ASPECT);
  const puck = Math.round(Math.min(58, width * 0.15));
  const me = mySeat ?? 0;
  const at = (pos: Position) => {
    switch (pos) {
      case 'top':
        return { top: space.sm, left: width / 2 - puck / 2 };
      case 'bottom':
        return { bottom: space.sm, left: width / 2 - puck / 2 };
      case 'left':
        return { top: height / 2 - puck / 2 - 6, left: space.md };
      default:
        return { top: height / 2 - puck / 2 - 6, right: space.md };
    }
  };
  return (
    <AnchorHost map={anchors}>
      <View style={{ width, height }}>
        <FeltArt width={width} height={height} room={room} grain={false} />
        {([0, 1, 2, 3] as Seat[]).map((seat) => {
          const info = seats[seat];
          const pos = seatPosition(seat, me);
          const free = !info || !info.connected;
          const sittable = free && canSit && mySeat !== null && mySeat !== seat;
          // Which side each chair plays on, in words and in the team's colour:
          // the partner's diamond alone was easy to miss while friends picked seats.
          const tone = seatTone(seat, me);
          const side = mySeat === null || seat === mySeat ? null : isPartner(seat, mySeat) ? lang.s.ui.withYou : lang.s.ui.againstYou;
          return (
            <View key={seat} style={[styles.seat, at(pos), { width: puck + 30 }]}>
              {free ? (
                <PressScale
                  disabled={!sittable}
                  onPress={() => onSit(seat)}
                  style={[
                    styles.ghost,
                    { width: puck, height: puck, borderRadius: puck / 2 },
                    sittable && styles.ghostFree,
                    side !== null && { borderColor: tone.edge },
                  ]}
                  accessibilityLabel={lang.s.ui.sitHere}
                >
                  <Chair size={Math.round(puck * 0.45)} colour={sittable ? ink.hi : ink.lo} />
                </PressScale>
              ) : (
                <View>
                  <SeatPuck
                    seat={seat}
                    name={seat === mySeat ? lang.s.seat[0] : seatName(lang, info)}
                    avatar={info.avatar || null}
                    cards={0}
                    isDealer={false}
                    isBot={info.bot}
                    connected={info.connected}
                    active={false}
                    tone={seatTone(seat, me)}
                    partner={mySeat !== null && isPartner(seat, mySeat)}
                    size={puck}
                    deadline={null}
                    anchored={false}
                    nameInk={ink.hi}
                  />
                  {hostSeat === seat && (
                    <View style={styles.crown}>
                      <Crown size={16} />
                    </View>
                  )}
                </View>
              )}
              {free && sittable && (
                <Text style={styles.sitHere} numberOfLines={1}>
                  {lang.s.ui.sitHere}
                </Text>
              )}
              {side !== null && (
                <Text style={[styles.side, { color: tone.ink }]} numberOfLines={1}>
                  {side}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </AnchorHost>
  );
});

const styles = StyleSheet.create({
  seat: { position: 'absolute', alignItems: 'center', gap: 2 },
  ghost: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: surface.well,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: stroke.edge,
  },
  ghostFree: { borderColor: ink.hi },
  crown: { position: 'absolute', top: -6, right: -2 },
  sitHere: { color: ink.hi, ...type.caption },
  side: { ...type.caption, fontSize: 11, lineHeight: 13 },
});
