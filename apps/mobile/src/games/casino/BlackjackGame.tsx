import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Lang, type BlackjackStrings } from '@belot/i18n';
import { BLACKJACK, handValue, isBlackjack, type BlackjackEvent, type Hand } from '@belot/games-blackjack';
import type { BotLevel } from '@belot/game-core';
import type { Card52 } from '@belot/cards';
import { applyGameMatchOutcome, applyRoundOutcome } from '@belot/progression';
import { useLocalSession } from '../useLocalSession';
import { CasinoHeader, CasinoScreen, type TableProps } from './CasinoScreen';
import { Card52View } from './Card52';
import { ChipDisc, ChipPile, ChipRow } from './Chips';
import { tablePeople } from './people';
import { othersAfter } from '../source';
import type { TableSeats } from './CasinoScreen';
import { Avatar } from '../../avatars';
import { Button } from '../../ui/Button';
import { playSfx } from '../../audio';
import { buzz } from '../../haptics';
import { loadProfile, saveProfile, type Settings } from '../../storage';
import { useMotionPolicy } from '../../anim/useMotionPolicy';
import { font, ink, num, radius, signal, space, stroke, surface, theme, type } from '../../theme';

/**
 * Blackjack against the dealer, with bots in the other boxes. Chips into the
 * box, deal, then hit, stand, double or split; the dealer plays by the house
 * rules and the round is paid.
 *
 * The dealer along the top and my box along the bottom stay put, with the
 * chips and the moves in a bar pinned under them; only the other boxes
 * scroll. The dealer's up-card is what every decision hangs on, so it never
 * scrolls away to reach a button. Cards are sized from the screen, so a
 * tablet fills its room; a phone on its side puts my box beside the dealer.
 */

const STACK = 1000;

export function BlackjackGame({ settings, players, level, onExit }: { settings: Settings; players: number; level: BotLevel; onExit: () => void }) {
  const lang = useMemo(() => new Lang(settings.locale), [settings.locale]);
  const reduced = useMotionPolicy(settings.motion) === 'reduced';
  const people = useMemo(() => tablePeople(players, lang, settings.nickname, loadProfile().selectedAvatar), [players, lang, settings.nickname]);
  return (
    <CasinoScreen settings={settings} tableStack={STACK} minimum={BLACKJACK.defaultConfig.minBet} title={lang.blackjack.name} onExit={onExit}>
      {(p) => (
        <BlackjackTable
          {...p}
          players={players}
          me={0}
          people={people}
          source={(onEvent) =>
            useLocalSession(BLACKJACK, {
              seats: players,
              botLevel: level,
              stacks: [p.stack, ...Array<number>(players - 1).fill(STACK)],
              thinkMs: () => (reduced ? 150 : 400 + Math.floor(Math.random() * 400)),
              onEvent,
            })
          }
        />
      )}
    </CasinoScreen>
  );
}

function Cards({ cards, width }: { cards: (Card52 | null)[]; width: number }) {
  return (
    <View style={styles.cards}>
      {cards.map((c, i) => (
        <View key={c ? c.id : `down-${i}`} style={i > 0 ? { marginLeft: -width * 0.45 } : undefined}>
          <Card52View card={c} width={width} />
        </View>
      ))}
    </View>
  );
}

/** What a settled hand made or lost, as the engine pays it: an odd half chip on a blackjack goes to the player. */
function handNet(h: Hand, pays: readonly [number, number]): number {
  if (h.result === 'win') return h.bet;
  if (h.result === 'blackjack') return Math.ceil((h.bet * pays[0]) / pays[1]);
  if (h.result === 'lose') return -h.bet;
  return 0;
}

/**
 * A hand's total. "8 / 18" only while the hand can still take a card and the
 * ace's choice matters; a finished hand, and any 21, is one number.
 */
export function totalLabel(h: Hand, t: Pick<BlackjackStrings, 'total'>): string {
  const { total, soft } = handValue(h.cards);
  return t.total(total, soft && total < 21 && !h.done && h.result === null);
}

type Outcome = 'good' | 'bad' | 'even';

/** The word under a hand, and how it reads: the result once paid, before that a bust or a blackjack. */
function handCall(h: Hand, t: BlackjackStrings): { text: string; outcome: Outcome } | null {
  if (h.result === 'win' || h.result === 'blackjack') return { text: t.result[h.result], outcome: 'good' };
  if (h.result === 'lose') return { text: t.result.lose, outcome: 'bad' };
  if (h.result === 'push') return { text: t.result.push, outcome: 'even' };
  if (handValue(h.cards).total > 21) return { text: t.bust, outcome: 'bad' };
  if (isBlackjack(h)) return { text: t.blackjack, outcome: 'good' };
  return null;
}

const clamp = (lo: number, x: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(x)));

export function BlackjackTable({ stack, report, finish, lang, settings, leave, players, me, people, source }: TableProps & TableSeats<typeof BLACKJACK>) {
  const t = lang.blackjack;
  const c = lang.casino;
  const reduced = useMotionPolicy(settings.motion) === 'reduced';

  // The round last recorded in progression, and whether the person played any.
  const recorded = useRef(0);
  const played = useRef(false);

  const game = source((e: BlackjackEvent, after) => {
    if (e.kind === 'dealt') playSfx('deal');
    if (e.kind === 'betPlaced' && e.seat === me) playSfx('arm');
    if (e.kind === 'busted' && e.seat === me) buzz('light');
    if (e.kind === 'blackjack' && e.seat === me) playSfx('win');
    if (e.kind === 'settled' && e.seat === me) {
      if (e.result === 'win' || e.result === 'blackjack') playSfx('win');
      else if (e.result === 'lose') playSfx('lose');
      // A round of blackjack for the stats and the XP, once however many
      // hands it was split into: won when it paid more than it took. Every
      // hand is settled in the same move, so `after` has them all.
      if (recorded.current !== after.roundNumber) {
        recorded.current = after.roundNumber;
        played.current = true;
        const net = after.hands[me]!.reduce((a, h) => a + handNet(h, after.blackjackPays), 0);
        saveProfile(applyRoundOutcome(loadProfile(), 'blackjack', net > 0).profile);
      }
    }
  });
  const v = game.view;
  const myHands = v.hands[me]!;
  const myStack = v.stacks[me]!;

  // What standing up now would really return: the stack, and a bet still in
  // the betting window. Once the cards are out, a hand in play is forfeit on
  // leaving — busted or not — or walking away would be a free surrender.
  const chipsNow = myStack + v.bets[me]!;
  useEffect(() => report(chipsNow), [chipsNow, report]);

  // The match is over for the person at its last round, or as soon as they
  // cannot cover the minimum bet with nothing left in play: nothing would be
  // left but tapping through the bots' rounds. A beat after the round is
  // paid, so the sheet never hides how it ended.
  const out = v.out[me]!;
  const over = game.matchOver || out;
  const done = useRef(false);
  useEffect(() => {
    if (!over || done.current) return;
    const h = setTimeout(
      () => {
        if (done.current) return;
        done.current = true;
        if (played.current) saveProfile(applyGameMatchOutcome(loadProfile(), 'blackjack', chipsNow > stack).profile);
        finish(chipsNow);
      },
      reduced ? 300 : 1500,
    );
    return () => clearTimeout(h);
  }, [over, chipsNow, stack, finish, reduced]);

  // Sized from the room the table really has: on the web the app sits in a
  // frame narrower than the window, so the window alone would overshoot.
  const screen = useWindowDimensions();
  const [laid, setLaid] = useState<{ width: number; height: number } | null>(null);
  const win = laid ?? screen;
  const landscape = win.width > win.height;
  const tablet = Math.min(win.width, win.height) >= 600;
  // The room between the header and the bar, roughly.
  const roomH = win.height - 160;
  const myW = landscape ? clamp(36, roomH * 0.25, 100) : clamp(48, win.height * 0.08, 110);
  const dealerW = landscape ? clamp(32, roomH * 0.2, 90) : Math.round(myW * 0.9);
  const tileW = tablet ? 132 : 96;
  const botW = Math.round(tileW * 0.3);

  const betting = v.phase === 'BETTING' && !v.ready[me];
  const playing = v.phase === 'PLAYING' && v.turn?.seat === me;
  const has = (type: string) => v.legalActions.some((a) => a.type === type);
  const others = othersAfter(me, players);
  const net = myHands.reduce((a, h) => a + handNet(h, v.blackjackPays), 0);
  const dealerBust = v.dealerTotal !== null && v.dealerTotal > 21;

  const dealer = (
    <View style={styles.dealer}>
      <Text style={[styles.dealerTitle, num, dealerBust && styles.bad]}>
        {t.dealer}
        {v.dealerTotal !== null ? `  ${v.dealerTotal}` : ''}
        {dealerBust ? `  ${t.bust}` : ''}
      </Text>
      <Cards cards={v.dealer} width={dealerW} />
    </View>
  );

  const boxes = (
    <View style={styles.seats}>
      {others.map((seat) => (
        <View key={seat} style={[styles.seat, { minWidth: tileW }, v.turn?.seat === seat && styles.onTurn]}>
          <View style={styles.seatHead}>
            <Avatar id={people[seat]!.avatar} size={22} />
            <Text style={styles.seatName} numberOfLines={1}>
              {people[seat]!.name}
            </Text>
          </View>
          <Text style={[styles.seatStack, num]}>{v.out[seat] ? c.out : v.stacks[seat]}</Text>
          {v.hands[seat]!.map((h, i) => {
            const call = handCall(h, t);
            return (
              <View key={i} style={styles.miniHand}>
                <Cards cards={h.cards} width={botW} />
                <Text style={[styles.mini, num, handValue(h.cards).total > 21 && styles.bad]}>{totalLabel(h, t)}</Text>
                {call ? <Text style={[styles.miniCall, outcomeStyle(call.outcome)]}>{call.text}</Text> : null}
              </View>
            );
          })}
          {/* Chips still riding: a paid hand's stake is already back in (or gone from) the stack. */}
          <ChipPile amount={v.bets[seat]! + v.hands[seat]!.reduce((a, h) => a + (h.result === null ? h.bet : 0), 0)} size={14} />
        </View>
      ))}
    </View>
  );

  const myBox = (
    <View style={[styles.box, (playing || betting) && styles.onTurn]}>
      {/* The name on the left, the stack on the right: never read as one phrase. */}
      <View style={styles.boxHead}>
        <View style={styles.who}>
          <Avatar id={people[me]!.avatar} size={26} />
          <Text style={styles.meName} numberOfLines={1}>
            {people[me]!.name}
          </Text>
        </View>
        <View style={styles.stackRow} accessible accessibilityLabel={c.balance(myStack)}>
          <ChipDisc value={100} size={16} />
          <Text style={[styles.meStack, num]}>{myStack}</Text>
        </View>
      </View>
      {myHands.length === 0 ? <ChipPile amount={v.bets[me]!} size={30} /> : null}
      {out ? <Text style={[styles.call, styles.bad]}>{c.out}</Text> : null}
      <View style={styles.hands}>
        {myHands.map((h, i) => {
          const call = handCall(h, t);
          return (
            <View key={i} style={[styles.hand, v.turn?.seat === me && v.turn.hand === i && styles.handLive]}>
              <View style={styles.handRow}>
                <Cards cards={h.cards} width={myW} />
                {/* Once paid, the stake is in the stack (or gone): only the net says how it went. */}
                <ChipPile amount={h.result === null ? h.bet : 0} size={20} />
              </View>
              <Text style={[styles.total, num, handValue(h.cards).total > 21 && styles.bad]}>{totalLabel(h, t)}</Text>
              <Text style={[styles.call, call ? outcomeStyle(call.outcome) : null]} accessibilityLiveRegion="polite">
                {call?.text ?? ''}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );

  const bar = (
    <View style={[styles.bar, landscape && styles.barWide]}>
      {betting ? (
        <>
          <ChipRow chips={v.chips} canAdd={(x) => v.legalActions.some((a) => a.type === 'BET' && a.amount === x)} onAdd={(x) => game.submit({ type: 'BET', seat: me, amount: x })} />
          <View style={styles.buttons}>
            <Button label={c.clear} onPress={() => game.submit({ type: 'CLEAR', seat: me })} disabled={!has('CLEAR')} />
            {/* No bet, no deal: a Deal that silently sat the round out was a trap. */}
            <Button label={c.deal} tone="strong" onPress={() => game.submit({ type: 'READY', seat: me })} disabled={!has('READY') || v.bets[me] === 0} />
          </View>
        </>
      ) : null}
      {v.phase === 'BETTING' && !betting && !out ? <Text style={styles.wait}>{c.waitingForBets}</Text> : null}
      {playing ? (
        <View style={styles.buttons}>
          <Button label={t.hit} tone="strong" onPress={() => game.submit({ type: 'HIT', seat: me })} />
          <Button label={t.stand} onPress={() => game.submit({ type: 'STAND', seat: me })} />
          {has('DOUBLE') ? <Button label={t.double} onPress={() => game.submit({ type: 'DOUBLE', seat: me })} /> : null}
          {has('SPLIT') ? <Button label={t.split} onPress={() => game.submit({ type: 'SPLIT', seat: me })} /> : null}
        </View>
      ) : null}
      {game.roundOver || game.matchOver ? (
        <View style={styles.buttons}>
          {myHands.length > 0 ? (
            <Text style={[styles.net, num, net > 0 ? styles.good : net < 0 ? styles.bad : null]}>{net > 0 ? c.won(net) : net < 0 ? c.lost(-net) : c.push}</Text>
          ) : null}
          {/* Out of chips or the last round: the cash-out sheet comes instead. */}
          {!over ? <Button label={lang.osmice.nextRound} tone="strong" onPress={game.nextRound} /> : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <View
      style={styles.fill}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (!laid || laid.width !== width || laid.height !== height) setLaid({ width, height });
      }}
    >
      <CasinoHeader lang={lang} title={t.name} round={c.roundOf(v.roundNumber, v.rounds)} onLeave={leave} />
      {landscape ? (
        <View style={styles.wide}>
          <View style={styles.left}>
            {dealer}
            <ScrollView style={styles.fill} contentContainerStyle={styles.othersScroll}>
              {boxes}
            </ScrollView>
          </View>
          <View style={styles.meWide}>{myBox}</View>
        </View>
      ) : (
        <View style={styles.tall}>
          {dealer}
          <ScrollView style={styles.fill} contentContainerStyle={styles.othersScroll}>
            {boxes}
          </ScrollView>
          {myBox}
        </View>
      )}
      {bar}
    </View>
  );
}

const outcomeStyle = (o: Outcome) => (o === 'good' ? styles.good : o === 'bad' ? styles.bad : styles.even);

const styles = StyleSheet.create({
  fill: { flex: 1 },
  tall: { flex: 1, padding: space.md, gap: space.md },
  wide: { flex: 1, flexDirection: 'row', padding: space.md, gap: space.md },
  left: { flex: 1, flexBasis: 0 },
  meWide: { flex: 1, flexBasis: 0, justifyContent: 'center' },
  othersScroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: space.xs },
  cards: { flexDirection: 'row' },
  dealer: { alignItems: 'center', gap: space.xs, padding: space.md, borderRadius: radius.md, backgroundColor: theme.felt, borderWidth: 1, borderColor: stroke.hair },
  dealerTitle: { ...type.h3, color: ink.hi },
  seats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' },
  seat: { alignItems: 'center', padding: space.xs, borderRadius: radius.md, backgroundColor: surface.panel, borderWidth: 1, borderColor: stroke.hair, gap: 2 },
  onTurn: { borderColor: signal.turn },
  seatHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  seatName: { ...type.caption, color: ink.hi, maxWidth: 70 },
  seatStack: { ...type.caption, color: ink.mid },
  miniHand: { alignItems: 'center' },
  mini: { ...type.caption, color: ink.hi },
  miniCall: { ...type.caption, fontFamily: font.bold },
  box: { padding: space.md, borderRadius: radius.md, backgroundColor: surface.panel, borderWidth: 1, borderColor: stroke.hair, gap: space.sm, alignItems: 'center' },
  boxHead: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  who: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1 },
  meName: { ...type.sub, color: ink.hi, flexShrink: 1 },
  stackRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  meStack: { ...type.sub, color: ink.hi, fontFamily: font.bold },
  hands: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg, justifyContent: 'center' },
  hand: { alignItems: 'center', gap: 4, padding: space.xs, borderRadius: radius.sm, borderWidth: 1, borderColor: 'transparent' },
  handLive: { borderColor: signal.turn },
  handRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  total: { ...type.h3, color: ink.hi },
  // The outcome is the news of the round: as loud as the total, in its colour.
  call: { ...type.h3, color: ink.mid, minHeight: 22 },
  good: { color: theme.okInk },
  bad: { color: theme.dangerInk },
  even: { color: ink.mid },
  // Pinned under the table, above the safe area the frame keeps.
  bar: { paddingHorizontal: space.md, paddingVertical: space.sm, gap: space.sm, minHeight: 60, justifyContent: 'center', borderTopWidth: 1, borderTopColor: stroke.hair, backgroundColor: surface.sunk },
  barWide: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: space.lg },
  wait: { ...type.body, color: ink.mid, textAlign: 'center' },
  buttons: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  net: { ...type.h3, color: ink.hi },
});
