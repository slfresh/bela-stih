import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lang } from '@belot/i18n';
import { buyIn, cashOut, chipBalance, isoDay, refillChips } from '@belot/progression';
import { Button } from '../../ui/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { Panel } from '../../ui/Panel';
import { clearBackGuard, setBackGuard } from '../../ui/backGuard';
import { room } from '../../cosmetics';
import { loadProfile, saveProfile, type Settings } from '../../storage';
import { ink, num, space, type } from '../../theme';

/**
 * The frame every casino table sits in: the buy-in, the cash-out, the
 * play-money note, and leaving.
 *
 * Sitting down takes the table's stack (or what the balance holds, if less)
 * from the player's play chips; standing up — the match over, or leaving it —
 * puts back whatever is in front of them. If the app is closed mid-table the
 * cash-out still runs as the screen unmounts. A balance that cannot cover the
 * table's minimum gets an honest panel: they top up tomorrow.
 *
 * A fresh table after a match is a remount (`playAgain`), so it buys in anew.
 */

export interface TableProps {
  /** What the person sat down with. */
  stack: number;
  /** Report the chips in front of the person now, as the table changes: what a cash-out would return. */
  report: (chips: number) => void;
  /** The match is over: stand up with what the person has. */
  finish: (chips: number) => void;
  lang: Lang;
  settings: Settings;
  /** The table's header calls this to leave (asking first while a hand is live). */
  leave: () => void;
  /** Ground colour for sheets and dialogs. */
  ground: string;
}

export function CasinoScreen({
  settings,
  tableStack,
  minimum,
  title,
  onExit,
  children,
}: {
  settings: Settings;
  /** What a seat at this table starts with. */
  tableStack: number;
  /** The least a seat needs to play a single round. */
  minimum: number;
  title: string;
  onExit: () => void;
  children: (p: TableProps) => ReactNode;
}) {
  const lang = useMemo(() => new Lang(settings.locale), [settings.locale]);
  const c = lang.casino;
  const ground = room();
  const [table, setTable] = useState(0);

  // What this table seats the person with: the daily top-up first (idempotent
  // within a day), then the table's stack or what the balance holds.
  const seat = useMemo(() => {
    const p = refillChips(loadProfile(), isoDay(new Date())).profile;
    saveProfile(p);
    const amount = Math.min(tableStack, chipBalance(p));
    return amount < minimum ? null : { stack: amount };
    // A new `table` is a new seat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, tableStack, minimum]);

  // The buy-in is an effect and the cash-out is its cleanup, so they always
  // pair up — a remount, a fast refresh, or a closed app never takes chips twice.
  const chipsNow = useRef(seat?.stack ?? 0);
  const settled = useRef(false);
  const [finished, setFinished] = useState<number | null>(null);
  const standUp = useCallback((chips: number) => {
    if (settled.current) return;
    settled.current = true;
    saveProfile(cashOut(loadProfile(), chips));
  }, []);
  useEffect(() => {
    if (!seat) return;
    const bought = buyIn(loadProfile(), seat.stack);
    if (bought) saveProfile(bought);
    settled.current = false;
    chipsNow.current = seat.stack;
    setFinished(null);
    return () => standUp(chipsNow.current);
  }, [seat, standUp]);

  const [confirmLeave, setConfirmLeave] = useState(false);
  const exit = useCallback(() => {
    if (seat) standUp(chipsNow.current);
    onExit();
  }, [seat, standUp, onExit]);
  const leave = useCallback(() => {
    if (finished !== null || !seat) exit();
    else setConfirmLeave(true);
  }, [finished, seat, exit]);
  useEffect(() => {
    const guard = () => {
      if (confirmLeave) setConfirmLeave(false);
      else leave();
      return true;
    };
    setBackGuard(guard);
    return () => clearBackGuard(guard);
  }, [leave, confirmLeave]);

  if (!seat) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: ground.page }]}>
        <View style={styles.centre}>
          <Panel label={title}>
            <Text style={styles.body}>{c.broke}</Text>
            <Text style={[styles.note, num]}>{c.balance(chipBalance(loadProfile()))}</Text>
            <Button label={lang.games.back} onPress={onExit} />
          </Panel>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: ground.page }]}>
      {children({
        stack: seat.stack,
        report: (chips) => {
          chipsNow.current = chips;
        },
        finish: (chips) => {
          chipsNow.current = chips;
          standUp(chips);
          setFinished(chips);
        },
        lang,
        settings,
        leave,
        ground: ground.page,
      })}
      {finished !== null ? (
        <View style={styles.scrim}>
          <Panel label={title} style={[styles.sheet, { backgroundColor: ground.page }]}>
            <Text style={[styles.title, num]}>{c.cashOut(finished)}</Text>
            <Text style={[styles.body, num]}>
              {finished >= seat.stack ? c.won(finished - seat.stack) : c.lost(seat.stack - finished)}
            </Text>
            <Text style={[styles.note, num]}>{c.balance(chipBalance(loadProfile()))}</Text>
            <View style={styles.buttons}>
              <Button label={lang.games.back} onPress={onExit} />
              <Button label={c.playAgain} tone="strong" onPress={() => setTable((t) => t + 1)} />
            </View>
          </Panel>
        </View>
      ) : null}
      {confirmLeave ? (
        <ConfirmDialog
          title={lang.s.ui.leaveConfirm}
          body={c.cashOut(chipsNow.current)}
          confirmLabel={lang.s.ui.leaveConfirmYes}
          cancelLabel={lang.s.ui.leaveConfirmNo}
          onConfirm={exit}
          onCancel={() => setConfirmLeave(false)}
          ground={ground.page}
        />
      ) : null}
    </SafeAreaView>
  );
}

/** The strip along the top of every casino table: leave, the game, the round, and the play-money note. */
export function CasinoHeader({ lang, title, round, onLeave }: { lang: Lang; title: string; round: string; onLeave: () => void }) {
  return (
    <View>
      <View style={styles.header}>
        <Button label={lang.s.ui.leaveTable} compact onPress={onLeave} />
        <Text style={styles.title}>{title}</Text>
        <Text style={[styles.round, num]}>{round}</Text>
      </View>
      <Text style={styles.playMoney} numberOfLines={2}>
        {lang.casino.playMoney}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centre: { flex: 1, justifyContent: 'center', padding: space.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm },
  title: { ...type.h3, color: ink.hi, textAlign: 'center' },
  round: { ...type.sub, color: ink.mid },
  playMoney: { ...type.caption, color: ink.lo, textAlign: 'center', paddingHorizontal: space.lg, marginTop: 2 },
  body: { ...type.body, color: ink.hi, textAlign: 'center', marginVertical: space.sm },
  note: { ...type.sub, color: ink.mid, textAlign: 'center', marginBottom: space.md },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', padding: space.lg },
  sheet: { gap: space.sm },
  buttons: { flexDirection: 'row', justifyContent: 'center', gap: space.md },
});
