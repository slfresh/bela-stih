import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Lang } from '@belot/i18n';
import { BACCARAT, betTotal, type BaccaratEvent, type Spot } from '@belot/games-baccarat';
import type { BotLevel } from '@belot/game-core';
import { useLocalSession } from '../useLocalSession';
import { CasinoHeader, CasinoScreen, type TableProps } from './CasinoScreen';
import { Card52View } from './Card52';
import { ChipPile, ChipRow } from './Chips';
import { tablePeople } from './people';
import { Avatar } from '../../avatars';
import { Button } from '../../ui/Button';
import { PressScale } from '../../ui/PressScale';
import { playSfx } from '../../audio';
import { loadProfile, type Settings } from '../../storage';
import { useMotionPolicy } from '../../anim/useMotionPolicy';
import { garb } from '../../deck/palette';
import { ink, num, radius, signal, space, stroke, surface, theme, type } from '../../theme';

/**
 * Baccarat against the house, with bots at the other seats. Pick a chip, tap
 * a spot to put it there, deal; the coup plays itself out by the tableau and
 * is paid. The bead road along the bottom is every table's memory of the shoe.
 */

const STACK = 1000;

export function BaccaratGame({ settings, players, level, onExit }: { settings: Settings; players: number; level: BotLevel; onExit: () => void }) {
  const lang = useMemo(() => new Lang(settings.locale), [settings.locale]);
  return (
    <CasinoScreen settings={settings} tableStack={STACK} minimum={BACCARAT.defaultConfig.minBet} title={lang.baccarat.name} onExit={onExit}>
      {(p) => <BaccaratTable {...p} players={players} level={level} />}
    </CasinoScreen>
  );
}

function BaccaratTable({ stack, report, finish, lang, settings, leave, players, level }: TableProps & { players: number; level: BotLevel }) {
  const t = lang.baccarat;
  const c = lang.casino;
  const reduced = useMotionPolicy(settings.motion) === 'reduced';
  const people = useMemo(() => tablePeople(players, lang, settings.nickname, loadProfile().selectedAvatar), [players, lang, settings.nickname]);
  const [chip, setChip] = useState(25);
  const [line, setLine] = useState('');

  const game = useLocalSession(BACCARAT, {
    seats: players,
    botLevel: level,
    stacks: [stack, ...Array<number>(players - 1).fill(STACK)],
    thinkMs: () => (reduced ? 150 : 350 + Math.floor(Math.random() * 400)),
    onEvent: (e: BaccaratEvent) => {
      if (e.kind === 'betPlaced' && e.seat === 0) playSfx('arm');
      if (e.kind === 'dealt') playSfx('deal');
      if (e.kind === 'coupResolved') setLine(t.outcome(e.outcome, e.playerTotal, e.bankerTotal) + (e.natural ? ` · ${t.natural}` : ''));
      if (e.kind === 'paid' && e.seat === 0) playSfx(e.net > 0 ? 'win' : 'lose');
      if (e.kind === 'coupStarted') setLine('');
    },
  });
  const v = game.view;
  const mine = v.bets[0]!;

  // What standing up now would return: the stack plus anything still on the table.
  useEffect(() => report(v.stacks[0]! + betTotal(mine)), [v.stacks, mine, report]);
  const done = useRef(false);
  useEffect(() => {
    if (game.matchOver && !done.current) {
      done.current = true;
      finish(v.stacks[0]!);
    }
  }, [game.matchOver, v.stacks, finish]);

  const betting = v.phase === 'BETTING' && !v.ready[0];
  const canBet = (spot: Spot, amount: number) => v.legalActions.some((a) => a.type === 'BET' && a.spot === spot && a.amount === amount);
  const spots: Spot[] = ['player', 'tie', 'banker'];
  const label: Record<Spot, string> = { player: t.player, banker: t.banker, tie: t.tie };
  const others = Array.from({ length: players - 1 }, (_, i) => i + 1);

  return (
    <View style={styles.fill}>
      <CasinoHeader lang={lang} title={t.name} round={c.roundOf(v.coupNumber, v.coups)} onLeave={leave} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* the other seats */}
        <View style={styles.seats}>
          {others.map((seat) => (
            <View key={seat} style={[styles.seat, v.ready[seat] && styles.seatReady]}>
              <Avatar id={people[seat]!.avatar} size={28} />
              <Text style={styles.seatName} numberOfLines={1}>
                {people[seat]!.name}
              </Text>
              <Text style={[styles.seatStack, num]}>{v.out[seat] ? c.out : v.stacks[seat]}</Text>
              <ChipPile amount={betTotal(v.bets[seat]!)} size={16} />
            </View>
          ))}
        </View>

        {/* the coup */}
        <View style={styles.coup}>
          {(['player', 'banker'] as const).map((side) => {
            const cards = v.lastCoup ? v.lastCoup[side] : [];
            const total = v.lastCoup ? (side === 'player' ? v.lastCoup.playerTotal : v.lastCoup.bankerTotal) : null;
            const won = v.lastCoup?.outcome === side;
            return (
              <View key={side} style={[styles.side, won && styles.sideWon]}>
                <Text style={styles.sideTitle}>
                  {label[side]}
                  {total !== null ? `  ${total}` : ''}
                </Text>
                <View style={styles.cards}>
                  {cards.length === 0
                    ? [0, 1].map((i) => <Card52View key={i} card={null} width={44} />)
                    : cards.map((card) => <Card52View key={card.id} card={card} width={44} />)}
                </View>
              </View>
            );
          })}
        </View>
        <Text style={styles.line}>{line || (v.phase === 'BETTING' ? (betting ? c.bet : c.waitingForBets) : '')}</Text>

        {/* the spots */}
        <View style={styles.spots}>
          {spots.map((spot) => {
            const ok = betting && canBet(spot, chip);
            const all = v.bets.reduce((a, b) => a + b[spot], 0);
            return (
              <PressScale
                key={spot}
                onPress={() => ok && game.submit({ type: 'BET', seat: 0, spot, amount: chip })}
                disabled={!ok}
                accessibilityRole="button"
                accessibilityLabel={`${label[spot]}, ${t.pays(spot, v.commissionPct, v.tiePays)}`}
                style={[styles.spot, spot === 'tie' && styles.spotTie]}
              >
                <Text style={styles.spotName}>{label[spot]}</Text>
                <Text style={styles.spotPays}>{t.pays(spot, v.commissionPct, v.tiePays)}</Text>
                <ChipPile amount={mine[spot]} size={26} />
                {all > mine[spot] ? <Text style={[styles.spotAll, num]}>{all}</Text> : null}
              </PressScale>
            );
          })}
        </View>

        {/* me */}
        <View style={styles.me}>
          <Avatar id={people[0]!.avatar} size={28} />
          <Text style={styles.meName}>{people[0]!.name}</Text>
          <Text style={[styles.meStack, num]}>{c.balance(v.stacks[0]!)}</Text>
        </View>
        {betting ? (
          <>
            <ChipRow chips={v.chips} canAdd={(x) => x <= v.stacks[0]!} onAdd={setChip} />
            <Text style={[styles.chipNote, num]}>{`${c.bet}: ${chip}`}</Text>
            <View style={styles.buttons}>
              <Button label={c.clear} onPress={() => game.submit({ type: 'CLEAR', seat: 0 })} disabled={betTotal(mine) === 0} />
              <Button label={c.deal} tone="strong" onPress={() => game.submit({ type: 'READY', seat: 0 })} disabled={betTotal(mine) === 0} />
            </View>
          </>
        ) : null}
        {game.roundOver && !game.matchOver ? (
          <View style={styles.buttons}>
            {v.lastNet ? (
              <Text style={[styles.net, num, v.lastNet[0]! > 0 ? styles.netWin : v.lastNet[0]! < 0 ? styles.netLose : null]}>
                {v.lastNet[0]! > 0 ? c.won(v.lastNet[0]!) : v.lastNet[0]! < 0 ? c.lost(-v.lastNet[0]!) : ''}
              </Text>
            ) : null}
            <Button label={lang.osmice.nextRound} tone="strong" onPress={game.nextRound} />
          </View>
        ) : null}

        {/* the bead road */}
        <View style={styles.road} accessibilityElementsHidden>
          {v.road.slice(-30).map((o, i) => (
            <View key={i} style={[styles.bead, o === 'player' ? styles.beadP : o === 'banker' ? styles.beadB : styles.beadT]} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { padding: space.lg, gap: space.md },
  seats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' },
  seat: { width: 86, alignItems: 'center', padding: space.xs, borderRadius: radius.md, backgroundColor: surface.panel, borderWidth: 1, borderColor: stroke.hair, gap: 2 },
  seatReady: { borderColor: stroke.edge },
  seatName: { ...type.caption, color: ink.hi },
  seatStack: { ...type.caption, color: ink.mid },
  coup: { flexDirection: 'row', gap: space.md },
  side: { flex: 1, alignItems: 'center', padding: space.sm, borderRadius: radius.md, backgroundColor: surface.panel, borderWidth: 1, borderColor: stroke.hair, gap: space.xs },
  sideWon: { borderColor: signal.turn },
  sideTitle: { ...type.h3, color: ink.hi },
  cards: { flexDirection: 'row', gap: 4, minHeight: 66 },
  line: { ...type.body, color: ink.hi, textAlign: 'center', minHeight: 20 },
  spots: { flexDirection: 'row', gap: space.sm },
  spot: { flex: 1, alignItems: 'center', paddingVertical: space.md, borderRadius: radius.md, backgroundColor: theme.felt, borderWidth: 2, borderColor: garb.gold, gap: 4, minHeight: 120 },
  spotTie: { borderColor: stroke.edge },
  spotName: { ...type.h3, color: ink.hi },
  spotPays: { ...type.caption, color: ink.mid },
  spotAll: { ...type.caption, color: ink.lo },
  me: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  meName: { ...type.sub, color: ink.hi, flex: 1 },
  meStack: { ...type.sub, color: ink.hi },
  chipNote: { ...type.caption, color: ink.mid, textAlign: 'center' },
  buttons: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space.md },
  net: { ...type.h3, color: ink.hi },
  netWin: { color: theme.okInk },
  netLose: { color: theme.dangerInk },
  road: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, justifyContent: 'center' },
  bead: { width: 10, height: 10, borderRadius: 5 },
  beadP: { backgroundColor: garb.blue },
  beadB: { backgroundColor: garb.red },
  beadT: { backgroundColor: garb.green },
});
