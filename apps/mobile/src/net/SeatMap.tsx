import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Seat } from '@belot/engine';
import type { Lang } from '@belot/i18n';
import { AnchorHost, AnchorMap } from '../anim/AnchorRegistry';
import type { RoomStyle } from '../cosmetics';
import { FeltArt } from '../table/FeltArt';
import { seatPosition, type Position } from '../table/geometry';
import { SeatPuck } from '../table/SeatPuck';
import { isPartner, seatTone } from '../table/teamColour';
import { font, ink, radius, space, stroke, surface, theme, type } from '../theme';
import { Chair, Crown } from '../ui/icons';
import { PressScale } from '../ui/PressScale';
import type { SeatInfo } from './useNetGame';

/**
 * The lobby as the table it is about to be: four pucks round a real felt,
 * seen from the viewer's chair, the room's code on a plate in the middle. A
 * free seat is a ghost puck with a chair — tap it to sit there (and choose
 * your partner); the host wears a crown; a bot shows the robot beside its
 * name, as it will at the table.
 */
export const SeatMap = memo(function SeatMap({
  width,
  seats,
  mySeat,
  hostSeat,
  canSit,
  roomId,
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
  roomId: string | null;
  lang: Lang;
  room: RoomStyle;
  anchors: AnchorMap;
  onSit: (seat: Seat) => void;
}) {
  const height = Math.round(width * 0.62);
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
        {/* the code, on a plate in the rim's wood */}
        <View style={styles.centre} pointerEvents="none">
          <View style={[styles.plate, { backgroundColor: room.rim, borderTopColor: room.rimLight, borderBottomColor: room.rimDark }]}>
            <Text style={styles.plateLabel}>{lang.s.ui.tableCode}</Text>
            <Text selectable style={styles.plateCode}>
              {roomId ?? '····'}
            </Text>
          </View>
        </View>
        {([0, 1, 2, 3] as Seat[]).map((seat) => {
          const info = seats[seat];
          const pos = seatPosition(seat, me);
          const free = !info || !info.connected;
          const sittable = free && canSit && mySeat !== null && mySeat !== seat;
          return (
            <View key={seat} style={[styles.seat, at(pos), { width: puck + 30 }]}>
              {free ? (
                <PressScale
                  disabled={!sittable}
                  onPress={() => onSit(seat)}
                  style={[styles.ghost, { width: puck, height: puck, borderRadius: puck / 2 }, sittable && styles.ghostFree]}
                  accessibilityLabel={lang.s.ui.sitHere}
                >
                  <Chair size={Math.round(puck * 0.45)} colour={sittable ? ink.hi : ink.lo} />
                </PressScale>
              ) : (
                <View>
                  <SeatPuck
                    seat={seat}
                    name={seat === mySeat ? lang.s.seat[0] : info.name}
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
            </View>
          );
        })}
      </View>
    </AnchorHost>
  );
});

const styles = StyleSheet.create({
  centre: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plate: {
    alignItems: 'center',
    borderRadius: radius.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    gap: 2,
  },
  plateLabel: { color: ink.mid, ...type.caption },
  plateCode: { color: theme.accent, ...type.h1, fontFamily: font.bold, letterSpacing: 2 },
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
});
