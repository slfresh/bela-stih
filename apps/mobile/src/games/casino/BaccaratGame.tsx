import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Lang } from '@belot/i18n';
import { BACCARAT, betTotal, total, type BaccaratEvent, type BaccaratView, type Bets, type Spot } from '@belot/games-baccarat';
import type { BotLevel } from '@belot/game-core';
import { applyGameMatchOutcome, applyRoundOutcome } from '@belot/progression';
import { useLocalSession } from '../useLocalSession';
import { CasinoHeader, CasinoScreen, type TableProps } from './CasinoScreen';
import { Card52View } from './Card52';
import { ChipPile, ChipRow } from './Chips';
import { tablePeople } from './people';
import { othersAfter } from '../source';
import type { TableSeats } from './CasinoScreen';
import { Avatar } from '../../avatars';
import { Button } from '../../ui/Button';
import { PressScale } from '../../ui/PressScale';
import { playSfx } from '../../audio';
import { loadProfile, saveProfile, type Settings } from '../../storage';
import { useMotionPolicy } from '../../anim/useMotionPolicy';
import { garb } from '../../deck/palette';
import { font, ink, num, radius, signal, space, stroke, surface, theme, type } from '../../theme';

/**
 * Baccarat against the house, with bots at the other seats. Pick a chip, tap
 * a spot to put it there, deal; the coup plays itself out by the tableau and
 * is paid. The bead road along the bottom is every table's memory of the shoe.
 *
 * The chips, Deal and Next round live in a footer that never scrolls and
 * keeps one height, so the main action is always under the thumb and the
 * table does not jump between betting and the result; in landscape the
 * spots and the footer take the right-hand column.
 */

const STACK = 1000;
/** A bead and the gap under it. */
const BEAD_STEP = 18;

export function BaccaratGame({ settings, players, level, onExit }: { settings: Settings; players: number; level: BotLevel; onExit: () => void }) {
  const lang = useMemo(() => new Lang(settings.locale), [settings.locale]);
  const reduced = useMotionPolicy(settings.motion) === 'reduced';
  const people = useMemo(() => tablePeople(players, lang, settings.nickname, loadProfile().selectedAvatar), [players, lang, settings.nickname]);
  return (
    <CasinoScreen settings={settings} tableStack={STACK} minimum={BACCARAT.defaultConfig.minBet} title={lang.baccarat.name} onExit={onExit}>
      {(p) => (
        <BaccaratTable
          {...p}
          players={players}
          me={0}
          people={people}
          source={(onEvent) =>
            useLocalSession(BACCARAT, {
              seats: players,
              botLevel: level,
              stacks: [p.stack, ...Array<number>(players - 1).fill(STACK)],
              thinkMs: () => (reduced ? 150 : 350 + Math.floor(Math.random() * 400)),
              onEvent,
            })
          }
        />
      )}
    </CasinoScreen>
  );
}

export function BaccaratTable({ stack, report, finish, lang, settings, leave, players, me, people, source }: TableProps & TableSeats<typeof BACCARAT>) {
  const t = lang.baccarat;
  const c = lang.casino;
  const reduced = useMotionPolicy(settings.motion) === 'reduced';
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  // A tablet has the height for the full six-row road and the table's usual
  // spacing; a phone, upright or on its side, is kept tight enough that the
  // road shows whole above the footer.
  const roomy = height >= 900;
  const [chip, setChip] = useState(25);

  // What the person has on the table this coup, from their own events: the
  // engine clears the bets as it pays them, so this is how the result can
  // still say what was staked, which spot paid, and that a push was a push.
  const staking = useRef<Bets>({ player: 0, banker: 0, tie: 0 });
  const [staked, setStaked] = useState<Bets | null>(null);
  // Cards of the last coup shown so far, in the order they were dealt.
  const [shown, setShown] = useState(Number.POSITIVE_INFINITY);
  // The person bet in at least one coup: only then is the match theirs to count.
  const played = useRef(false);
  // The table as it stood at "no more bets": every stack and every bet, and
  // who was out. The engine pays a coup the moment it is dealt, so while the
  // cards turn one by one the live stacks would already tell how it ended;
  // the deal shows this instead, and the live figures once the last card lands.
  const lastBetting = useRef<Pick<BaccaratView, 'coupNumber' | 'stacks' | 'bets' | 'out'> | null>(null);
  const [held, setHeld] = useState<Pick<BaccaratView, 'coupNumber' | 'stacks' | 'bets' | 'out'> | null>(null);

  const game = source((e: BaccaratEvent, view: BaccaratView) => {
    // Every event of the betting comes with the table after it, so the last
    // one before the deal holds the final bets; the deal's own events come
    // with the table already paid.
    if (view.phase === 'BETTING') lastBetting.current = { coupNumber: view.coupNumber, stacks: view.stacks, bets: view.bets, out: view.out };
    else if ((e.kind === 'betPlaced' || e.kind === 'betsCleared') && lastBetting.current?.coupNumber === view.coupNumber) {
      // The bets of the move that closed the betting come in one batch with
      // the deal, every event with the table already paid: a bot that answers
      // after the person taps Deal sends its chips, its READY and the deal
      // together. Its bets are played onto the betting table by hand, so the
      // deal shows its chips down and its stack less them, like everyone else's.
      const was = lastBetting.current;
      const stacks = was.stacks.slice();
      const bets = was.bets.slice();
      const seat = e.seat;
      const had = bets[seat]!;
      if (e.kind === 'betPlaced') {
        stacks[seat] = stacks[seat]! - e.amount;
        bets[seat] = { ...had, [e.spot]: had[e.spot] + e.amount };
      } else {
        stacks[seat] = stacks[seat]! + betTotal(had);
        bets[seat] = { player: 0, banker: 0, tie: 0 };
      }
      lastBetting.current = { ...was, stacks, bets };
    }
    if (e.kind === 'coupStarted') {
      staking.current = { player: 0, banker: 0, tie: 0 };
      setStaked(null);
    }
    if (e.kind === 'betPlaced' && e.seat === me) {
      playSfx('arm');
      staking.current = { ...staking.current, [e.spot]: staking.current[e.spot] + e.amount };
    }
    if (e.kind === 'betsCleared' && e.seat === me) staking.current = { player: 0, banker: 0, tie: 0 };
    if (e.kind === 'dealt') {
      // Only this coup's betting will do: a coup nobody could bet on is dealt
      // at once, and the last betting seen is then an earlier coup's.
      const before = lastBetting.current;
      setHeld(before && before.coupNumber === view.coupNumber ? before : null);
      // A card at a time, as a croupier deals them; all at once when motion is reduced.
      if (reduced) {
        playSfx('deal');
        setShown(Number.POSITIVE_INFINITY);
      } else setShown(0);
    }
    if (e.kind === 'coupResolved') {
      const bets = staking.current;
      setStaked(bets);
      if (betTotal(bets) > 0) {
        played.current = true;
        const net = view.lastNet?.[me] ?? 0;
        // A round of baccarat for the stats and the XP, like a deal of Bela: won when it paid more than it took.
        saveProfile(applyRoundOutcome(loadProfile(), 'baccarat', net > 0).profile);
      }
    }
  });
  const v = game.view;
  const mine = v.bets[me]!;
  const myStack = v.stacks[me]!;
  const coup = v.lastCoup;
  const dealCount = coup?.order.length ?? 0;
  const dealing = coup !== null && shown < dealCount;
  // What the table shows: as it stood at "no more bets" while the deal plays,
  // live otherwise (and at once when motion is reduced: there is no deal to wait for).
  const table = dealing && held && held.coupNumber === v.coupNumber ? held : v;

  // The deal, one beat per card.
  useEffect(() => {
    if (!dealing) return;
    const h = setTimeout(() => {
      playSfx('deal');
      setShown((n) => n + 1);
    }, 380);
    return () => clearTimeout(h);
  }, [dealing, shown]);

  // What standing up now would return: the stack plus anything still on the table.
  const chipsNow = myStack + betTotal(mine);
  useEffect(() => report(chipsNow), [chipsNow, report]);

  // The match is over for the person at its last coup, or as soon as they
  // cannot cover the smallest bet: nothing would be left but tapping through
  // the bots' coups. Either way after the last card is shown and a beat to
  // read it, so the cash-out sheet never hides how it ended.
  const out = v.out[me]!;
  const over = game.matchOver || out;
  const done = useRef(false);
  useEffect(() => {
    if (!over || dealing || done.current) return;
    const h = setTimeout(
      () => {
        if (done.current) return;
        done.current = true;
        if (played.current) saveProfile(applyGameMatchOutcome(loadProfile(), 'baccarat', chipsNow > stack).profile);
        finish(chipsNow);
      },
      reduced ? 300 : 1200,
    );
    return () => clearTimeout(h);
  }, [over, dealing, chipsNow, stack, finish, reduced]);

  // The chosen chip follows the stack down: a chip the stack cannot cover
  // would leave every spot dead with nothing to say why.
  useEffect(() => {
    if (chip <= myStack) return;
    const fits = [...v.chips].reverse().find((x) => x <= myStack);
    if (fits !== undefined) setChip(fits);
  }, [chip, myStack, v.chips]);

  const betting = v.phase === 'BETTING' && !v.ready[me] && !out;
  const resolved = coup !== null && !dealing;
  const canBet = (spot: Spot, amount: number) => v.legalActions.some((a) => a.type === 'BET' && a.spot === spot && a.amount === amount);
  const spots: Spot[] = ['player', 'tie', 'banker'];
  const label: Record<Spot, string> = { player: t.player, banker: t.banker, tie: t.tie };
  const others = othersAfter(me, players);
  const compact = others.length > 3;
  const placed = betTotal(mine);
  const allDown = betting && myStack < Math.min(...v.chips);

  // Cards scale with the room they have: a phone keeps 44, a tablet grows to
  // 72. Room is the coup row as laid out (the app may sit in a frame narrower
  // than the window): three cards to a side, inside its padding.
  const [coupW, setCoupW] = useState(0);
  const fit = (coupW - space.md) / 2 - 2 * space.sm - 2 * 4;
  const cardW = Math.round(Math.max(44, Math.min(72, fit / 3, landscape ? height / 8 : 72)));

  // The cards of one side dealt so far: the order says which side each card went to.
  const dealtTo = (side: 'player' | 'banker'): number => (coup ? coup.order.slice(0, Math.min(shown, dealCount)).filter((x) => x === side).length : 0);

  const net = v.lastNet?.[me] ?? 0;
  const stake = staked ? betTotal(staked) : 0;
  // "Bets returned" only when they were: a tie hands back the player and
  // banker bets. Any other coup that comes to nothing (500 on the player and
  // 500 on the tie, one lost and one paid) returned nothing; it came out even.
  const pushed = resolved && coup.outcome === 'tie' && staked !== null && staked.tie === 0;
  const netText = net > 0 ? c.won(net) : net < 0 ? c.lost(-net) : pushed ? c.pushed : c.even;
  const netStyle = [styles.net, num, net > 0 ? styles.netWin : net < 0 ? styles.netLose : null];

  // The coup's win or loss sounds as its last card lands, not as the deal starts.
  const sounded = useRef(0);
  useEffect(() => {
    if (!resolved || stake === 0 || sounded.current === v.coupNumber) return;
    sounded.current = v.coupNumber;
    if (net !== 0) playSfx(net > 0 ? 'win' : 'lose');
  }, [resolved, stake, net, v.coupNumber]);

  const resultLine = resolved
    ? t.outcome(coup.outcome, coup.playerTotal, coup.bankerTotal) + (coup.natural ? ` · ${t.natural}` : '')
    : v.phase === 'BETTING'
      ? betting
        ? c.bet
        : c.waitingForBets
      : '';

  const seatsStrip = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip} contentContainerStyle={styles.seats}>
      {others.map((seat) => (
        <View key={seat} style={[styles.seat, compact && styles.seatCompact, v.ready[seat] && styles.seatReady]}>
          <Avatar id={people[seat]!.avatar} size={compact ? 22 : 28} />
          <Text style={styles.seatName} numberOfLines={1}>
            {people[seat]!.name}
          </Text>
          <Text style={[styles.seatStack, num]}>{table.out[seat] ? c.out : table.stacks[seat]}</Text>
          {/* The pile's room is kept when it is empty, so the table does not jump as bets come and go. */}
          <View style={styles.seatPile}>
            <ChipPile amount={betTotal(table.bets[seat]!)} size={16} />
          </View>
        </View>
      ))}
    </ScrollView>
  );

  const coupPanels = (
    <View style={styles.coup} onLayout={(e) => setCoupW(e.nativeEvent.layout.width)}>
      {(['player', 'banker'] as const).map((side) => {
        const cards = coup ? coup[side].slice(0, dealtTo(side)) : [];
        const backs = Math.max(0, 2 - cards.length);
        const sideTotal = cards.length > 0 ? total(cards) : null;
        // A tie lights both sides.
        const won = resolved && (coup.outcome === side || coup.outcome === 'tie');
        return (
          <View key={side} style={[styles.side, won && styles.sideWon]}>
            <View style={styles.sideHead}>
              <View style={[styles.sideMark, side === 'player' ? styles.beadP : styles.beadB]} />
              <Text style={styles.sideTitle}>
                {label[side]}
                {sideTotal !== null ? `  ${sideTotal}` : ''}
              </Text>
            </View>
            <View style={[styles.cards, { minHeight: cardW * 1.5 }]}>
              {cards.map((card) => (
                <Card52View key={card.id} card={card} width={cardW} />
              ))}
              {Array.from({ length: backs }, (_, i) => (
                <Card52View key={`back${i}`} card={null} width={cardW} />
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );

  // The coup being dealt is already on the road: it joins it as its last card lands, not before.
  const roadSoFar = dealing ? v.road.slice(0, -1) : v.road;
  const counts = { player: 0, banker: 0, tie: 0 };
  for (const o of roadSoFar) counts[o] += 1;
  // Six rows where the screen has the height for them. A phone, upright or
  // on its side, gets three, with the caption and the key beside them rather
  // than over them, so the whole road shows above the footer without
  // scrolling the table; it keeps as many columns as its width holds. Old
  // columns drop off whole, so a column never reshuffles as a coup joins it.
  const rows = roomy ? 6 : 3;
  const [roadW, setRoadW] = useState(0);
  const maxColumns = roomy ? 6 : Math.max(1, Math.floor((roadW + 2) / BEAD_STEP));
  const allColumns = Math.ceil(roadSoFar.length / rows);
  const recent = roadSoFar.slice(Math.max(0, allColumns - maxColumns) * rows);
  const columns = Array.from({ length: Math.ceil(recent.length / rows) }, (_, x) => recent.slice(x * rows, x * rows + rows));
  const bead = (o: Spot) => [styles.bead, o === 'player' ? styles.beadP : o === 'banker' ? styles.beadB : styles.beadT];
  const legendItems = (['player', 'banker', 'tie'] as const).map((o) => (
    <View key={o} style={styles.legendItem}>
      <View style={bead(o)}>
        <Text style={styles.beadText}>{t.bead[o]}</Text>
      </View>
      <Text style={styles.legendText} numberOfLines={1}>
        {label[o]}
      </Text>
    </View>
  ));
  // Columns, oldest first, read down and then across, as a bead road is.
  const beads = (
    <View style={[styles.road, { minHeight: rows * BEAD_STEP }, !roomy && styles.roadFit]} onLayout={roomy ? undefined : (e) => setRoadW(e.nativeEvent.layout.width)}>
      {columns.map((col, x) => (
        <View key={x} style={styles.roadCol}>
          {col.map((o, y) => (
            <View key={y} style={bead(o)}>
              <Text style={styles.beadText}>{t.bead[o]}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
  const road = roomy ? (
    <View style={styles.roadBox} accessible accessibilityLabel={t.roadSummary(counts.player, counts.banker, counts.tie)}>
      <View style={styles.legend}>
        <Text style={styles.legendTitle}>{t.road}</Text>
        {legendItems}
      </View>
      {beads}
    </View>
  ) : (
    <View style={styles.roadLine} accessible accessibilityLabel={t.roadSummary(counts.player, counts.banker, counts.tie)}>
      <Text style={[styles.legendTitle, styles.roadTitle]}>{t.road}</Text>
      <View style={styles.legendColumn}>{legendItems}</View>
      {beads}
    </View>
  );

  const spotRow = (
    <View style={styles.spots}>
      {spots.map((spot) => {
        const ok = betting && canBet(spot, chip);
        // The bet on the spot: live while betting, what was staked once the coup is dealt.
        const onSpot = coup !== null && staked ? staked[spot] : mine[spot];
        const all = v.bets.reduce((a, b) => a + b[spot], 0);
        const paid = resolved && coup.outcome === spot;
        // A tie returns the player and banker bets: not lost, so not dimmed.
        const lost = resolved && !paid && onSpot > 0 && !(coup.outcome === 'tie' && spot !== 'tie');
        const atLimit = betting && !ok && !allDown && mine[spot] + chip > v.maxBet;
        const pays = t.pays(spot, v.commissionPct, v.tiePays);
        return (
          // Dimmed from outside: the press animation owns the spot's own opacity.
          <View key={spot} style={[styles.spotWrap, betting && !ok && styles.spotDead, lost && styles.spotLost]}>
            <PressScale
              onPress={() => ok && game.submit({ type: 'BET', seat: me, spot, amount: chip })}
              disabled={!ok}
              accessibilityRole="button"
              accessibilityLabel={`${label[spot]}, ${pays}${onSpot > 0 ? `, ${c.bet} ${onSpot}` : ''}${atLimit ? `, ${c.limit(v.maxBet)}` : ''}`}
              accessibilityState={{ disabled: !ok }}
              style={[styles.spot, landscape && styles.spotLand, spot === 'player' ? styles.spotP : spot === 'banker' ? styles.spotB : styles.spotTie, paid && styles.spotPaid]}
            >
              <Text style={styles.spotName}>{label[spot]}</Text>
              <Text style={styles.spotPays}>{atLimit ? c.limit(v.maxBet) : pays}</Text>
              <View style={styles.spotPile}>
                <ChipPile amount={onSpot} size={26} />
              </View>
              {betting && all > mine[spot] ? <Text style={[styles.spotAll, num]}>{all}</Text> : null}
            </PressScale>
          </View>
        );
      })}
    </View>
  );

  const footer = (
    <View style={styles.footer}>
      <View style={styles.me}>
        <Avatar id={people[me]!.avatar} size={28} />
        <Text style={styles.meName} numberOfLines={1}>
          {people[me]!.name}
        </Text>
        <Text style={[styles.meStack, num]}>{table.out[me] ? c.out : c.balance(table.stacks[me]!)}</Text>
      </View>
      {/* One height for betting and the result alike. */}
      <View style={styles.controls}>
        {betting ? (
          <>
            <ChipRow chips={v.chips} canAdd={(x) => x <= myStack} onAdd={setChip} selected={chip} label={c.chip} />
            <Text style={[styles.chipNote, num]}>{allDown ? c.allDown : c.chipAndBet(chip, placed)}</Text>
            <View style={styles.buttons}>
              <Button label={c.clear} onPress={() => game.submit({ type: 'CLEAR', seat: me })} disabled={placed === 0} />
              {/* Nothing down is a coup sat out: the same "no more bets", said plainly. */}
              <Button label={placed === 0 ? c.noBet : c.deal} tone="strong" onPress={() => game.submit({ type: 'READY', seat: me })} />
            </View>
          </>
        ) : game.roundOver && !game.matchOver && !out && resolved ? (
          <View style={styles.buttons}>
            {stake > 0 ? <Text style={netStyle}>{netText}</Text> : null}
            <Button label={lang.osmice.nextRound} tone="strong" onPress={game.nextRound} />
          </View>
        ) : resolved && stake > 0 ? (
          <Text style={netStyle}>{netText}</Text>
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={styles.fill}>
      <CasinoHeader lang={lang} title={t.name} round={c.roundOf(v.coupNumber, v.coups)} onLeave={leave} />
      {landscape ? (
        <View style={styles.land}>
          <ScrollView style={styles.fill} contentContainerStyle={[styles.scroll, !roomy && styles.scrollTight]}>
            {seatsStrip}
            {coupPanels}
            <Text style={styles.line}>{resultLine}</Text>
            {road}
          </ScrollView>
          <View style={styles.landRight}>
            {spotRow}
            {footer}
          </View>
        </View>
      ) : (
        <>
          <ScrollView style={styles.fill} contentContainerStyle={[styles.scroll, !roomy && styles.scrollTight]}>
            {seatsStrip}
            {coupPanels}
            <Text style={styles.line}>{resultLine}</Text>
            {spotRow}
            {road}
          </ScrollView>
          {footer}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Grows to the screen and centres, so a tablet's table sits in the middle rather than the top.
  scroll: { padding: space.lg, gap: space.md, flexGrow: 1, justifyContent: 'center' },
  // A phone's height is the table's scarcest room: every row of it closer together.
  scrollTight: { paddingVertical: space.sm, gap: space.sm },
  land: { flex: 1, flexDirection: 'row' },
  landRight: { width: '44%', justifyContent: 'flex-end', paddingTop: space.sm, gap: space.sm },
  // A horizontal scroller grows by default: on a tall screen it took the whole column.
  strip: { flexGrow: 0 },
  seats: { flexGrow: 1, flexDirection: 'row', gap: space.sm, justifyContent: 'center' },
  seat: { width: 86, alignItems: 'center', padding: space.xs, borderRadius: radius.md, backgroundColor: surface.panel, borderWidth: 1, borderColor: stroke.hair, gap: 2 },
  seatCompact: { width: 70 },
  seatReady: { borderColor: stroke.edge },
  seatName: { ...type.caption, color: ink.hi },
  seatStack: { ...type.caption, color: ink.mid },
  seatPile: { height: 34, justifyContent: 'center' },
  coup: { flexDirection: 'row', gap: space.md },
  side: { flex: 1, alignItems: 'center', padding: space.sm, borderRadius: radius.md, backgroundColor: surface.panel, borderWidth: 1, borderColor: stroke.hair, gap: space.xs },
  sideWon: { borderColor: signal.turn },
  sideHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  sideMark: { width: 10, height: 10, borderRadius: radius.pill },
  sideTitle: { ...type.h3, color: ink.hi },
  cards: { flexDirection: 'row', gap: 4 },
  line: { ...type.body, color: ink.hi, textAlign: 'center', minHeight: 20 },
  spots: { flexDirection: 'row', gap: space.sm },
  spotWrap: { flex: 1 },
  spot: { flex: 1, alignItems: 'center', paddingVertical: space.md, borderRadius: radius.md, backgroundColor: theme.felt, borderWidth: 2, borderColor: garb.gold, gap: 4, minHeight: 120 },
  spotLand: { minHeight: 96, paddingVertical: space.sm },
  // The same blue and red as the bead road and the card panels' marks, so the three read as one.
  spotP: { borderColor: garb.blue },
  spotB: { borderColor: garb.red },
  spotTie: { borderColor: garb.green },
  spotDead: { opacity: 0.45 },
  spotPaid: { borderColor: signal.turn, borderWidth: 3 },
  spotLost: { opacity: 0.55 },
  spotName: { ...type.h3, color: ink.hi },
  spotPays: { ...type.caption, color: ink.mid, textAlign: 'center' },
  spotPile: { height: 46, justifyContent: 'center' },
  spotAll: { ...type.caption, color: ink.lo },
  footer: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md, gap: space.sm, borderTopWidth: 1, borderTopColor: stroke.hair, backgroundColor: surface.sunk },
  me: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  meName: { ...type.sub, color: ink.hi, flex: 1 },
  meStack: { ...type.sub, color: ink.hi },
  controls: { minHeight: 140, justifyContent: 'center', gap: space.sm },
  chipNote: { ...type.caption, color: ink.mid, textAlign: 'center' },
  buttons: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space.md },
  net: { ...type.h3, color: ink.hi, textAlign: 'center' },
  netWin: { color: theme.okInk },
  netLose: { color: theme.dangerInk },
  roadBox: { gap: space.xs, alignItems: 'center' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap', justifyContent: 'center' },
  legendTitle: { ...type.caption, color: ink.mid },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendText: { ...type.caption, color: ink.mid },
  road: { flexDirection: 'row', gap: 2 },
  // On a phone: the caption, the key down the side, and the beads in what is left.
  roadLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  roadTitle: { maxWidth: 72 },
  legendColumn: { gap: 2 },
  roadFit: { flex: 1 },
  roadCol: { gap: 2 },
  bead: { width: 16, height: 16, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  beadText: { ...type.caption, lineHeight: 16, color: ink.hi, fontFamily: font.bold },
  beadP: { backgroundColor: garb.blue },
  beadB: { backgroundColor: garb.red },
  beadT: { backgroundColor: garb.green },
});
