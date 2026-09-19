import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { Seat } from '@belot/engine';
import type { Lang } from '@belot/i18n';
import { GIFTS, giftBlock, giftCost, type GiftId, type PlayerProfile } from '@belot/progression';
import { GiftArt } from '../giftArt';
import { font, ink, num, radius, stroke, surface, theme, type } from '../theme';
import { Button } from '../ui/Button';
import { Close, Coin, Lock } from '../ui/icons';
import { PressScale } from '../ui/PressScale';
import { GIFT_PICKER, giftPickerLayout } from './metrics';

/**
 * The gift picker: opened from a puck, it offers the whole catalogue with
 * prices, for that player or — one chip over — everyone else at the table;
 * opened from my own puck it is a treat for the table. Choosing is two steps
 * (pick, then "Pošalji · N"), because every gift is coins spent.
 *
 * An overlay over the table, like the leave question: no row of the table
 * moves when it opens. Drawn to the box by `giftPickerLayout`.
 */
export function GiftPicker({
  lang,
  target,
  nameOf,
  giftOf,
  profile,
  readyAt,
  land,
  reduced,
  ground,
  onSend,
  onClose,
}: {
  lang: Lang;
  /** A seat, or 'table' when opened from my own puck. */
  target: Seat | 'table';
  nameOf: (s: Seat) => string;
  giftOf: (s: Seat) => GiftId | null;
  profile: PlayerProfile;
  /** My cooldown: no gift before this instant. */
  readyAt: number;
  land: boolean;
  reduced: boolean;
  /** The room's page colour, so it reads as part of the table. */
  ground: string;
  onSend: (id: GiftId, to: Seat | 'table') => void;
  onClose: () => void;
}) {
  const ui = lang.s.ui;
  const { width, height } = useWindowDimensions();
  const L = giftPickerLayout(width, height, land, GIFTS.length);
  const [everyone, setEveryone] = useState(target === 'table');
  const [chosen, setChosen] = useState<GiftId | null>(null);
  const to: Seat | 'table' = everyone || target === 'table' ? 'table' : target;
  const recipients = to === 'table' ? 3 : 1;

  // The cooldown ends by itself: one re-render at its end.
  const [now, setNow] = useState(() => Date.now());
  const cooling = now < readyAt;
  useEffect(() => {
    if (!cooling) return;
    const t = setTimeout(() => setNow(Date.now()), readyAt - now + 20);
    return () => clearTimeout(t);
  }, [cooling, readyAt, now]);

  const chosenBlock = chosen ? giftBlock(profile, chosen, recipients) : null;
  const chosenGift = chosen ? GIFTS.find((g) => g.id === chosen) : undefined;
  const total = chosenGift ? giftCost(chosenGift, recipients) : 0;
  const canSend = !!chosen && chosenBlock === null && !cooling;
  const note = cooling ? ui.giftWait : chosen && chosenBlock === 'coins' ? ui.giftNoCoins : ui.giftForFun;

  const title = target === 'table' ? ui.giftTreatTable : nameOf(target);
  const current = target === 'table' ? null : giftOf(target);

  const chips =
    target === 'table' ? null : (
      <View style={styles.chips}>
        {[false, true].map((all) => {
          const on = everyone === all;
          return (
            <PressScale
              key={String(all)}
              onPress={() => setEveryone(all)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
                {all ? ui.giftToEveryone(3) : nameOf(target)}
              </Text>
            </PressScale>
          );
        })}
      </View>
    );

  const grid = (
    <View style={[styles.grid, { width: L.cols * L.cell + (L.cols - 1) * GIFT_PICKER.GAP }]}>
      {GIFTS.map((g) => {
        const block = giftBlock(profile, g.id, recipients);
        const locked = block === 'level';
        const disabled = locked || cooling;
        const selected = chosen === g.id;
        const name = ui.giftName(g.id);
        const price = giftCost(g, recipients);
        const label = locked
          ? `${name}, ${ui.needsLevel(g.requiredLevel)}`
          : block === 'coins'
            ? `${ui.giftCellLabel(name, price)}, ${ui.giftNoCoins}`
            : ui.giftCellLabel(name, price);
        return (
          <PressScale
            key={g.id}
            disabled={disabled}
            onPress={() => setChosen(g.id)}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled, selected }}
            scaleTo={0.94}
            style={[styles.cell, { width: L.cell, height: L.cell + GIFT_PICKER.CAPTION }, selected && styles.cellOn]}
          >
            <View style={(locked || block === 'coins') && styles.dim}>
              <GiftArt id={g.id} size={L.cell - 12} disc />
            </View>
            <View style={styles.caption}>
              {locked ? (
                <>
                  <Lock size={10} colour={ink.mid} />
                  <Text style={styles.captionText}>{ui.needsLevel(g.requiredLevel)}</Text>
                </>
              ) : (
                <>
                  <Coin size={10} />
                  <Text style={[styles.captionText, num, block === 'coins' && styles.captionShort]}>{price}</Text>
                </>
              )}
            </View>
          </PressScale>
        );
      })}
    </View>
  );

  const send = (
    <Button
      label={chosen ? ui.giftSendFor(total) : ui.giftSend}
      tone="strong"
      disabled={!canSend}
      onPress={() => {
        if (chosen && canSend) onSend(chosen, to);
      }}
      style={land ? styles.sendLand : styles.send}
    />
  );

  return (
    <Animated.View entering={reduced ? undefined : FadeIn.duration(140)} style={styles.backdrop} accessibilityViewIsModal>
      {/* A tap beside the panel closes it; nothing has been spent yet. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={ui.close} />
      <View style={[styles.panel, { width: L.panelW, backgroundColor: ground }]}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {current && <GiftArt id={current} size={22} disc />}
          {land && chips}
          <View style={styles.wallet}>
            <Coin size={12} />
            <Text style={[styles.walletText, num]}>{profile.coins}</Text>
          </View>
          <PressScale onPress={onClose} accessibilityRole="button" accessibilityLabel={ui.close} style={styles.close}>
            <Close size={16} />
          </PressScale>
        </View>
        {!land && chips}
        {L.scroll ? <ScrollView style={{ maxHeight: L.gridH }}>{grid}</ScrollView> : grid}
        {land ? (
          <View style={styles.footRow}>
            <Text style={[styles.note, styles.noteLand]} numberOfLines={2}>
              {note}
            </Text>
            {send}
          </View>
        ) : (
          <>
            <Text style={styles.note} numberOfLines={2}>
              {note}
            </Text>
            {send}
          </>
        )}
      </View>
    </Animated.View>
  );
}

const P = GIFT_PICKER;

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: surface.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: stroke.edge,
    padding: P.PAD,
    gap: P.GAP,
    alignItems: 'center',
  },
  header: { alignSelf: 'stretch', height: P.HEADER, flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flexShrink: 1, color: ink.hi, ...type.h3 },
  wallet: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4 },
  walletText: { color: theme.accent, ...type.sub, fontFamily: font.bold },
  close: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', gap: P.GAP, height: P.CHIPS, alignItems: 'center' },
  chip: {
    paddingHorizontal: 12,
    height: 30,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: stroke.hair,
    backgroundColor: surface.chip,
    justifyContent: 'center',
    maxWidth: 170,
  },
  chipOn: { borderColor: theme.accent },
  chipText: { color: ink.mid, ...type.sub },
  chipTextOn: { color: ink.hi, fontFamily: font.medium },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: P.GAP },
  cell: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: stroke.hair,
    backgroundColor: surface.raised,
  },
  cellOn: { borderColor: theme.accent, backgroundColor: surface.chip },
  dim: { opacity: 0.45 },
  caption: { height: P.CAPTION, flexDirection: 'row', alignItems: 'center', gap: 2 },
  captionText: { color: ink.hi, ...type.caption },
  captionShort: { color: ink.mid },
  note: { alignSelf: 'stretch', minHeight: P.NOTE, color: ink.mid, ...type.caption, textAlign: 'center', textAlignVertical: 'center' },
  noteLand: { flex: 1, textAlign: 'left', minHeight: 0 },
  send: { alignSelf: 'stretch', height: P.SEND },
  sendLand: { height: P.SEND, minWidth: 160 },
  footRow: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 10, height: P.SEND },
});
