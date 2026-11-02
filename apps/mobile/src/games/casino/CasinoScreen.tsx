import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lang } from '@belot/i18n';
import type { AnyGame } from '@belot/game-core';
import type { SessionSource } from '../source';
import type { Person } from './people';
import { buyIn, cashOut, chipBalance, holdAtTable, isoDay, refillChips } from '@belot/progression';
import { Button } from '../../ui/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { Panel } from '../../ui/Panel';
import { clearBackGuard, setBackGuard } from '../../ui/backGuard';
import { room } from '../../cosmetics';
import { loadProfile, saveProfile, type Settings } from '../../storage';
import { ink, num, space, surface, theme, type } from '../../theme';
import { TableBanner } from '../TableBanner';

/**
 * The frame every casino table sits in: the buy-in, the cash-out, the
 * play-money note, and leaving.
 *
 * Sitting down takes the table's stack (or what the balance holds, if less)
 * from the player's play chips; standing up — the match over, or leaving it —
 * puts back whatever is in front of them. While they sit, what is in front of
 * them is saved on the profile as the table reports it (`holdAtTable`): a
 * closed or crashed app runs no cash-out, and the next table's top-up
 * (`refillChips`) puts those chips back. A balance that cannot cover the
 * table's minimum gets an honest panel: they top up tomorrow.
 *
 * A fresh table after a match is a fresh seat AND a fresh table: the child is
 * keyed on the seat, so its session, its stack and its "finished" flag all
 * start over instead of showing the last match's end with a new buy-in under it.
 */

/** Who sits where at a casino table, and where its game comes from (on the device, or online). */
export interface TableSeats<D extends AnyGame> {
  players: number;
  /** Where the person sits: 0 on the device, wherever the room put them online. */
  me: number;
  people: Person[];
  source: SessionSource<D>;
}

export interface TableProps {
  /** What the person sat down with. */
  stack: number;
  /** Report the chips in front of the person now, as the table changes: what a cash-out would return. */
  report: (chips: number) => void;
  /** The match is over for the person (the last round, or out of chips): stand up with what they have. */
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
  online = false,
  children,
}: {
  settings: Settings;
  /** What a seat at this table starts with. */
  tableStack: number;
  /** The least a seat needs to play a single round. */
  minimum: number;
  title: string;
  onExit: () => void;
  /** At an online table a fresh match is a fresh room: no "play again" here. */
  online?: boolean;
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

  // Where this seat stands, one record per seat: what is in front of the
  // person now, whether the buy-in went through, and whether they have stood
  // up. Per seat so a fresh table never inherits the last one's "stood up",
  // and so a report can arrive before the buy-in without being lost: a
  // child's effects run before its parent's, so a table that starts with a
  // blind already posted reports 1490 before this frame's buy-in runs, and
  // only reports again when its chips change.
  const hold = useMemo(() => (seat ? { chips: seat.stack, seated: false, settled: false } : null), [seat]);
  const [finished, setFinished] = useState<number | null>(null);
  const standUp = useCallback(() => {
    if (!hold || hold.settled) return;
    hold.settled = true;
    hold.seated = false;
    saveProfile(cashOut(loadProfile(), hold.chips));
  }, [hold]);
  // The buy-in is an effect and the cash-out is its cleanup, so they always
  // pair up — a remount or a fast refresh never takes chips twice.
  useEffect(() => {
    if (!seat || !hold) return;
    const bought = buyIn(loadProfile(), seat.stack);
    // A report that came first is what is in front of the person, not the
    // stack they sat down with: it is what a closed app must give back.
    if (bought) saveProfile(hold.chips === seat.stack ? bought : holdAtTable(bought, hold.chips));
    // A buy-in that did not go through has nothing to stand up with: settled
    // from the start, so leaving can never pay out chips that were not taken.
    hold.settled = bought === null;
    hold.seated = bought !== null;
    setFinished(null);
    return standUp;
  }, [seat, hold, standUp]);

  // Stable per seat, so a table's effect on them runs when its chips change,
  // not on every render. Before the buy-in a report is only kept; after the
  // stand-up (a finished table may still report) it is ignored.
  const report = useCallback(
    (chips: number) => {
      if (!hold || hold.settled || hold.chips === chips) return;
      hold.chips = chips;
      if (hold.seated) saveProfile(holdAtTable(loadProfile(), chips));
    },
    [hold],
  );
  const finish = useCallback(
    (chips: number) => {
      if (!hold || hold.settled) return;
      hold.chips = chips;
      standUp();
      setFinished(chips);
    },
    [hold, standUp],
  );

  const [confirmLeave, setConfirmLeave] = useState(false);
  const exit = useCallback(() => {
    standUp();
    onExit();
  }, [standUp, onExit]);
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

  const net = finished === null ? 0 : finished - seat.stack;
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: ground.page }]}>
      <Fragment key={table}>
        {children({
          stack: seat.stack,
          report,
          finish,
          lang,
          settings,
          leave,
          ground: ground.page,
        })}
      </Fragment>
      {finished !== null ? (
        // Dimmed like every other sheet, and held to the bottom so the table's
        // last round (the final board, the last coup) still shows above it.
        <View style={styles.scrim} accessibilityViewIsModal>
          <Panel label={title} style={[styles.sheet, { backgroundColor: ground.page }]}>
            <Text style={[styles.title, num]}>{c.cashOut(finished)}</Text>
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>{c.result}</Text>
              <Text style={[styles.result, num, net > 0 ? styles.win : net < 0 ? styles.lose : null]}>{net > 0 ? c.won(net) : net < 0 ? c.lost(-net) : c.even}</Text>
            </View>
            <Text style={[styles.note, num]}>{c.balance(chipBalance(loadProfile()))}</Text>
            <View style={styles.buttons}>
              <Button label={lang.games.back} onPress={onExit} />
              {online ? null : <Button label={c.playAgain} tone="strong" onPress={() => setTable((t) => t + 1)} />}
            </View>
          </Panel>
        </View>
      ) : null}
      {confirmLeave ? (
        <ConfirmDialog
          title={lang.s.ui.leaveConfirm}
          body={c.cashOut(hold?.chips ?? 0)}
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
      <TableBanner />
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
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', padding: space.lg, backgroundColor: surface.scrim },
  sheet: { gap: space.sm, width: '100%', maxWidth: 480, alignSelf: 'center' },
  resultRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'baseline', gap: space.sm, marginVertical: space.xs },
  resultLabel: { ...type.body, color: ink.mid },
  result: { ...type.h2, color: ink.hi },
  win: { color: theme.okInk },
  lose: { color: theme.dangerInk },
  buttons: { flexDirection: 'row', justifyContent: 'center', gap: space.md },
});
