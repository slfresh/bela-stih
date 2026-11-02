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
 * The dealer along the top stays put, with the chips and the moves in a bar
 * pinned under the table; only the other boxes scroll. The dealer's up-card
 * is what every decision hangs on, so it never scrolls away to reach a
 * button. Every box keeps the height a hand will need from before the first
 * chip, so a bet, the deal and the payout never shift the table. Cards are
 * sized from the screen, so a tablet fills its room; a phone on its side
 * puts my box beside the dealer.
 */

const STACK = 1000;
/** The width a chip pile beside my hand takes, its amount under it included. */
const PILE_W = 36;
/** Upright, the header (with its play-money line) and the bar with the chips in it, together. */
const TALL_CHROME = 200;

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

/**
 * A hand of cards, each after the first showing 55% of itself. Given the
 * `room` across, a long hand closes up instead of running out of its box:
 * the cards overlap more, down to showing a little over a fifth of each, where
 * the rank in the corner still reads; only a hand too long even for that
 * takes smaller cards. The usual two to four cards keep their full size.
 */
function Cards({ cards, width, room }: { cards: (Card52 | null)[]; width: number; room?: number }) {
  const { w, step } = closeUp(cards.length, width, room);
  return (
    <View style={styles.cards}>
      {cards.map((c, i) => (
        <View key={c ? c.id : `down-${i}`} style={i > 0 ? { marginLeft: step - w } : undefined}>
          <Card52View card={c} width={w} />
        </View>
      ))}
    </View>
  );
}

/** How wide each card is and how far along the next one starts, for `n` cards in `room`. */
function closeUp(n: number, width: number, room?: number): { w: number; step: number } {
  const open = width * 0.55;
  if (n < 2 || room === undefined || width + open * (n - 1) <= room) return { w: width, step: open };
  const least = 0.22;
  if (width * (1 + least * (n - 1)) <= room) return { w: width, step: (room - width) / (n - 1) };
  const w = Math.floor(room / (1 + least * (n - 1)));
  return { w, step: w * least };
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
  const contentW = win.width - 2 * space.md;
  const others = othersAfter(me, players);
  // The other boxes take the row's width, all four to a row at most (five
  // players), and their cards grow with the tile and, upright, with the
  // height there is.
  const perRow = Math.min(Math.max(others.length, 1), 4);
  const tileW = landscape ? (tablet ? 132 : 96) : clamp(tablet ? 132 : 72, (contentW - (perRow - 1) * space.sm) / perRow, tablet ? 180 : 150);
  const botW = landscape ? Math.round(tileW * 0.3) : clamp(29, Math.min((tileW - 2 * space.xs - 2) / 2.65, roomH * 0.05), 60);

  // Every panel is as tall from the first chip as it will be in play: the
  // dealer's with room for its cards, my box and each bot's with room for a
  // hand, its total and its call (a bot's chips too). So a chip, the deal and
  // the payout fill places already there, and nothing on the table moves.
  const botHandH = Math.round(botW * 1.5) + 3 * type.caption.lineHeight + 14 + 2 + 2 * 2;
  // A bot's tile: its padding and border, the face, the stack and the hand.
  const botTileH = 2 * space.xs + 2 + 22 + 2 + type.caption.lineHeight + 2 + botHandH;

  // Upright, the cards are as big as the room allows while the bar is at its
  // tallest, with the chips in it: a tall phone alone with the dealer gets
  // big cards, not a band of empty felt, and a full table shares the height
  // with the other boxes. The dealer's panel is its cards (90% of mine) and
  // its title; my box is a hand with its total and call, under my name.
  // Never wider than a split pair of hands can sit side by side.
  // A hand of mine past its cards: its padding and border, and the total and
  // the call under the cards with their gaps.
  const handExtra = 2 * space.xs + 2 + 2 * 4 + 2 * type.h3.lineHeight;
  const dealerExtra = type.h3.lineHeight + space.xs + 2 * space.md + 2;
  const boxExtra = 26 + space.sm + 2 * space.md + 2 + handExtra;
  const boxRows = others.length === 0 ? 0 : Math.ceil(others.length / perRow);
  const rowsH = boxRows > 0 ? boxRows * botTileH + (boxRows - 1) * space.sm + space.md : 0;
  // What is left for the cards themselves: my hand at 1.5 card widths tall, the dealer's at 0.9 of that.
  const spare = win.height - TALL_CHROME - 3 * space.md - rowsH - dealerExtra - boxExtra;
  const myW = landscape ? clamp(36, roomH * 0.25, 100) : clamp(48, Math.min(spare / 2.85, contentW * 0.28), 140);
  const dealerW = landscape ? clamp(32, roomH * 0.2, 90) : Math.round(myW * 0.9);

  // A split pair sits side by side: each hand's cards a size down, so the two
  // fit across the box instead of wrapping past the bar.
  const handW = !landscape && myHands.length > 1 ? Math.min(myW, clamp(36, myW * 0.7, 80)) : myW;

  const dealerCardsH = Math.round(dealerW * 1.5);
  const myHandH = Math.round(myW * 1.5) + handExtra;

  // The width each hand has, so a long one closes up rather than running out
  // of its box (see Cards). The dealer's panel and my box are a column's
  // width less their padding and border; a hand of mine also gives up its own
  // padding and the chip pile beside it, and split hands share the row two at
  // a time. A bot's hand has its tile.
  const columnW = landscape ? (win.width - 3 * space.md) / 2 : contentW;
  const panelIn = columnW - 2 * space.md - 2;
  const dealerRoom = panelIn;
  const pairs = Math.min(Math.max(myHands.length, 1), 2);
  const handRoom = (panelIn - space.lg * (pairs - 1)) / pairs - 2 * space.xs - 2 - space.sm - PILE_W;
  const botRoom = tileW - 2 * space.xs - 2;

  // The room under the dealer upright, at its smallest: while the bar holds
  // the chips. The boxes are spread over that much and no more, so the bar
  // folding down to the moves at the deal leaves felt under my box rather
  // than moving it. Measured again when the window changes. A full table on
  // a small phone does not fit that room even with the smallest cards: there
  // the boxes take the room the deal frees, so the other hands show.
  const sizeKey = `${Math.round(win.width)}x${Math.round(win.height)}`;
  const [under, setUnder] = useState<{ key: string; h: number } | null>(null);
  const holdRoom = !landscape && spare >= 2.85 * 48;
  const underH = holdRoom && under && under.key === sizeKey ? under.h : null;

  const betting = v.phase === 'BETTING' && !v.ready[me];
  const playing = v.phase === 'PLAYING' && v.turn?.seat === me;
  const has = (type: string) => v.legalActions.some((a) => a.type === type);
  const net = myHands.reduce((a, h) => a + handNet(h, v.blackjackPays), 0);
  const dealerBust = v.dealerTotal !== null && v.dealerTotal > 21;

  const dealer = (
    <View style={styles.dealer}>
      <Text style={[styles.dealerTitle, num, dealerBust && styles.bad]}>
        {t.dealer}
        {v.dealerTotal !== null ? `  ${v.dealerTotal}` : ''}
        {dealerBust ? `  ${t.bust}` : ''}
      </Text>
      <View style={[styles.slot, { minHeight: dealerCardsH }]}>
        <Cards cards={v.dealer} width={dealerW} room={dealerRoom} />
      </View>
    </View>
  );

  const boxes = (
    <View style={styles.seats}>
      {others.map((seat) => (
        <View key={seat} style={[styles.seat, { width: tileW }, v.turn?.seat === seat && styles.onTurn]}>
          <View style={styles.seatHead}>
            <Avatar id={people[seat]!.avatar} size={22} />
            <Text style={[styles.seatName, { maxWidth: tileW - 2 * space.xs - 2 - 22 - space.xs }]} numberOfLines={1}>
              {people[seat]!.name}
            </Text>
          </View>
          <Text style={[styles.seatStack, num]}>{v.out[seat] ? c.out : v.stacks[seat]}</Text>
          {/* On its side the boxes scroll under the dealer by themselves, so a box that grows moves nothing: no room held there. */}
          <View style={[styles.slot, styles.miniSlot, !landscape && { minHeight: botHandH }]}>
            {v.hands[seat]!.map((h, i) => {
              const call = handCall(h, t);
              return (
                <View key={i} style={styles.miniHand}>
                  <Cards cards={h.cards} width={botW} room={botRoom} />
                  <Text style={[styles.mini, num, handValue(h.cards).total > 21 && styles.bad]}>{totalLabel(h, t)}</Text>
                  {call ? <Text style={[styles.miniCall, outcomeStyle(call.outcome)]}>{call.text}</Text> : null}
                </View>
              );
            })}
            {/* Chips still riding: a paid hand's stake is already back in (or gone from) the stack. */}
            <ChipPile amount={v.bets[seat]! + v.hands[seat]!.reduce((a, h) => a + (h.result === null ? h.bet : 0), 0)} size={14} />
          </View>
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
      <View style={[styles.slot, styles.mySlot, { minHeight: myHandH }]}>
        {myHands.length === 0 ? <ChipPile amount={v.bets[me]!} size={30} /> : null}
        {out ? <Text style={[styles.call, styles.bad]}>{c.out}</Text> : null}
        {myHands.length > 0 ? (
          <View style={styles.hands}>
            {myHands.map((h, i) => {
              const call = handCall(h, t);
              return (
                <View key={i} style={[styles.hand, v.turn?.seat === me && v.turn.hand === i && styles.handLive]}>
                  <View style={styles.handRow}>
                    <Cards cards={h.cards} width={handW} room={handRoom} />
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
        ) : null}
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
        // The dealer pinned along the top, where its up-card never moves; the
        // other boxes and mine spread evenly down the room under it. Only the
        // other boxes scroll, and only when a full table outgrows it.
        <View style={styles.tall}>
          {dealer}
          <View
            style={styles.fill}
            onLayout={(e) => {
              const h = Math.round(e.nativeEvent.layout.height);
              if (!under || under.key !== sizeKey || h < under.h) setUnder({ key: sizeKey, h });
            }}
          >
            <View style={[styles.below, underH !== null ? { height: underH } : styles.fill]}>
              {others.length > 0 ? (
                // No scroll bar: on the web one would take its width from the row and drop the fourth box to a row of its own.
                <ScrollView style={styles.othersTall} contentContainerStyle={styles.othersScroll} showsVerticalScrollIndicator={false}>
                  {boxes}
                </ScrollView>
              ) : null}
              {myBox}
            </View>
          </View>
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
  below: { gap: space.md, justifyContent: 'space-evenly' },
  othersTall: { flexGrow: 0, flexShrink: 1 },
  wide: { flex: 1, flexDirection: 'row', padding: space.md, gap: space.md },
  left: { flex: 1, flexBasis: 0 },
  meWide: { flex: 1, flexBasis: 0, justifyContent: 'center' },
  othersScroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: space.xs },
  cards: { flexDirection: 'row' },
  // The room a hand will take, held open before the cards come.
  slot: { justifyContent: 'center', alignItems: 'center' },
  mySlot: { alignSelf: 'stretch', gap: space.sm },
  miniSlot: { gap: 2 },
  dealer: { alignItems: 'center', gap: space.xs, padding: space.md, borderRadius: radius.md, backgroundColor: theme.felt, borderWidth: 1, borderColor: stroke.hair },
  dealerTitle: { ...type.h3, color: ink.hi },
  seats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' },
  seat: { alignItems: 'center', padding: space.xs, borderRadius: radius.md, backgroundColor: surface.panel, borderWidth: 1, borderColor: stroke.hair, gap: 2 },
  onTurn: { borderColor: signal.turn },
  seatHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  seatName: { ...type.caption, color: ink.hi },
  seatStack: { ...type.caption, color: ink.mid },
  miniHand: { alignItems: 'center' },
  mini: { ...type.caption, color: ink.hi },
  // A tile is as wide as its row allows and no wider: a long call ("Blackjack 3:2") wraps under the hand instead of widening it.
  miniCall: { ...type.caption, fontFamily: font.bold, textAlign: 'center', maxWidth: '100%' },
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
