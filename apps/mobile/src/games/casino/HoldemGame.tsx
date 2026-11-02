import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Lang, type HoldemStrings } from '@belot/i18n';
import { HOLDEM, type HoldemAction, type HoldemEvent, type HoldemView } from '@belot/games-holdem';
import type { BotLevel } from '@belot/game-core';
import { applyGameMatchOutcome, applyRoundOutcome } from '@belot/progression';
import { useLocalSession } from '../useLocalSession';
import { CasinoHeader, CasinoScreen, type TableProps } from './CasinoScreen';
import { Card52View } from './Card52';
import { ChipDisc, ChipPile } from './Chips';
import { tablePeople } from './people';
import { othersAfter } from '../source';
import type { TableSeats } from './CasinoScreen';
import { Avatar } from '../../avatars';
import { Button } from '../../ui/Button';
import { playSfx } from '../../audio';
import { loadProfile, saveProfile, type Settings } from '../../storage';
import { useMotionPolicy } from '../../anim/useMotionPolicy';
import { garb } from '../../deck/palette';
import { font, ink, num, radius, signal, space, stroke, surface, theme, type } from '../../theme';

/**
 * Texas Hold'em, a sit-and-go against bots: everyone starts with the table's
 * stack, the blinds go up, and the last player with chips wins. My two cards
 * along the bottom, the board in the middle, the others above; on my turn the
 * moves the rules allow, with the raises a player reaches for most — the
 * minimum, half the pot, the pot, all in.
 *
 * The moves sit in a bar pinned under the table, never in the scroll: a
 * player who has to scroll to find Fold waits for a turn that never seems to
 * come. The cards are sized from the screen, so a phone fits the table above
 * the bar and a tablet fills its room instead of leaving half of it empty; a
 * phone on its side puts the others, the board and my hand side by side.
 */

const STACK = 1500;

export function HoldemGame({ settings, players, level, onExit }: { settings: Settings; players: number; level: BotLevel; onExit: () => void }) {
  const lang = useMemo(() => new Lang(settings.locale), [settings.locale]);
  const reduced = useMotionPolicy(settings.motion) === 'reduced';
  const people = useMemo(() => tablePeople(players, lang, settings.nickname, loadProfile().selectedAvatar), [players, lang, settings.nickname]);
  return (
    <CasinoScreen settings={settings} tableStack={STACK} minimum={HOLDEM.defaultConfig.bigBlind * 10} title={lang.holdem.name} onExit={onExit}>
      {(p) => (
        <HoldemTable
          {...p}
          players={players}
          me={0}
          people={people}
          source={(onEvent) =>
            useLocalSession(HOLDEM, {
              seats: players,
              botLevel: level,
              // Everyone sits with the same stack; the person's is their buy-in (less only if the balance was short).
              stacks: [p.stack, ...Array<number>(players - 1).fill(STACK)],
              thinkMs: () => (reduced ? 200 : 500 + Math.floor(Math.random() * 600)),
              onEvent,
            })
          }
        />
      )}
    </CasinoScreen>
  );
}

type Result = NonNullable<HoldemView['lastResult']>;

/**
 * What a finished hand comes to, a line each: every pot and who took it (all
 * of them, when it was split), the bet nobody called going back, and whoever
 * went out. Said to the person in the second person. Built from the hand's
 * result rather than event by event, so a side pot never hides the main one
 * and an elimination is added to the news instead of replacing it.
 *
 * Kept as short as the news allows, because it sits on the board: pots that
 * all went to the same players are one line with their sum (the labels only
 * matter when the pots went different ways), and a bet handed back to the
 * player who took the hand uncontested is left out — everyone else folded,
 * so "Grandma wins 80" already says it all. Handed back to someone who lost
 * a contested pot, or at a showdown, it still gets its line.
 */
export function handLines(r: Result, players: HoldemView['players'], me: number, name: (seat: number) => string, t: HoldemStrings): string[] {
  const handOf = (seat: number) => {
    const shown = r.shown.find((x) => x.seat === seat);
    return shown ? t.category[shown.category] : null;
  };
  const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x) => b.includes(x));
  const first = r.pots[0];
  const pots = first && r.pots.every((p) => same(p.winners, first.winners)) ? [{ ...first, amount: r.pots.reduce((a, p) => a + p.amount, 0) }] : r.pots;
  const lines = pots.map((pot, i) => {
    const hand = handOf(pot.winners[0]!);
    const line =
      pot.winners.length === 1
        ? pot.winners[0] === me
          ? t.youWin(pot.amount, hand)
          : t.wins(name(pot.winners[0]!), pot.amount, hand)
        : pot.winners.includes(me)
          ? t.youSplit(
              pot.winners.filter((w) => w !== me).map(name),
              pot.amount,
              hand,
            )
          : t.split(pot.winners.map(name), pot.amount, hand);
    if (pots.length === 1) return line;
    // Side pots are numbered only when there is more than one of them.
    return i === 0 ? t.mainPot(line) : t.sidePot(pots.length > 2 ? i : null, line);
  });
  const uncontested = r.shown.length === 0 && pots.length === 1 && pots[0]!.winners.length === 1;
  for (const x of r.returned) {
    if (uncontested && pots[0]!.winners[0] === x.seat) continue;
    lines.push(x.seat === me ? t.youReturned(x.amount) : t.returned(name(x.seat), x.amount));
  }
  // Out this hand: no chips left, and chips lost in it (a seat out from
  // before put nothing in, so its net is 0). The others in one line, however
  // many went at once; the person's own news on a line of its own.
  const outNow = players.map((p, seat) => (p.status === 'out' && (r.net[seat] ?? 0) < 0 ? seat : -1)).filter((seat) => seat >= 0);
  const othersOut = outNow.filter((seat) => seat !== me);
  if (outNow.includes(me)) lines.push(t.youOut);
  if (othersOut.length > 0) lines.push(t.eliminated(othersOut.map(name)));
  return lines;
}

/**
 * The raise buttons: the minimum, half the pot, the pot, all in. Whatever
 * puts the whole stack in is called All in, whichever preset it started as,
 * and two presets that come to the same amount are shown once — the All in
 * one kept, so a short stack is never asked to shove with a button called Min.
 */
export function raisePresets(v: Pick<HoldemView, 'raiseTo' | 'currentBet' | 'pot' | 'toCall'>, t: Pick<HoldemStrings, 'min' | 'halfPot' | 'fullPot' | 'allIn'>): { label: string; to: number }[] {
  const range = v.raiseTo;
  if (!range) return [];
  const clamp = (to: number) => Math.max(range.min, Math.min(range.max, Math.round(to)));
  const all = [
    { label: t.min, to: clamp(range.min) },
    { label: t.halfPot, to: clamp(v.currentBet + (v.pot + v.toCall) / 2) },
    { label: t.fullPot, to: clamp(v.currentBet + v.pot + v.toCall) },
    { label: t.allIn, to: range.max },
  ].map((p) => (p.to === range.max ? { ...p, label: t.allIn } : p));
  // The last of each amount wins, so the All in survives a tie.
  return all.filter((p, i) => !all.some((q, j) => j > i && q.to === p.to));
}

const clamp = (lo: number, x: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(x)));

export function HoldemTable({ report, finish, lang, settings, leave, players, me, people, source }: TableProps & TableSeats<typeof HOLDEM>) {
  const t = lang.holdem;
  const c = lang.casino;
  const reduced = useMotionPolicy(settings.motion) === 'reduced';

  // The hand the person was dealt into, until its result is recorded; and
  // whether they played any hand at all (a match with none is not a match played).
  const dealtIn = useRef<number | null>(null);
  const played = useRef(false);

  const game = source((e: HoldemEvent, after) => {
    if (e.kind === 'handStarted') playSfx('shuffle');
    if (e.kind === 'holeDealt' && e.seats.includes(me)) dealtIn.current = after.handNumber;
    if (e.kind === 'street') playSfx('deal');
    if (e.kind === 'acted' && e.amount > 0) playSfx('stack');
    if (e.kind === 'acted' && e.action === 'check') playSfx('knock');
    if (e.kind === 'potWon') {
      playSfx(e.winners.includes(me) ? 'win' : 'coin');
      // A hand of Hold'em for the stats and the XP, once per hand however many
      // pots it had: won when it paid more than it took.
      if (dealtIn.current === after.handNumber && after.lastResult) {
        dealtIn.current = null;
        played.current = true;
        saveProfile(applyRoundOutcome(loadProfile(), 'holdem', (after.lastResult.net[me] ?? 0) > 0).profile);
      }
    }
    if (e.kind === 'eliminated' && e.seat === me) playSfx('lose');
  });
  const v = game.view;
  const mine = v.players[me]!;

  useEffect(() => report(mine.stack), [mine.stack, report]);

  // The match is over for the person when the table's is, or as soon as they
  // are out of chips: nothing would be left but tapping through the bots'
  // hands. A beat after the hand ends, so the sheet never hides how it ended.
  const out = mine.status === 'out';
  const over = game.matchOver || out;
  const done = useRef(false);
  const stacks = v.players.map((p) => p.stack);
  const top = Math.max(...stacks);
  useEffect(() => {
    if (!over || done.current) return;
    const h = setTimeout(
      () => {
        if (done.current) return;
        done.current = true;
        // Won: the last one with chips (or the biggest stack, at a table with a hand cap).
        const won = game.matchOver && mine.stack > 0 && mine.stack === top;
        if (played.current) saveProfile(applyGameMatchOutcome(loadProfile(), 'holdem', won).profile);
        finish(mine.stack);
      },
      reduced ? 300 : 1500,
    );
    return () => clearTimeout(h);
  }, [over, game.matchOver, mine.stack, top, finish, reduced]);

  // Sized from the room the table really has: on the web the app sits in a
  // frame narrower than the window, so the window alone would overshoot.
  const screen = useWindowDimensions();
  const [laid, setLaid] = useState<{ width: number; height: number } | null>(null);
  const win = laid ?? screen;
  const landscape = win.width > win.height;
  const tablet = Math.min(win.width, win.height) >= 600;
  const others = othersAfter(me, players);
  const contentW = win.width - 2 * space.md;
  // The room the table has between the header and the action bar, roughly.
  const roomH = win.height - 160;
  // A phone held upright shows every other seat, never a strip that hides
  // some off the edge: one row up to four, past that two rows (3+2 up to
  // 4+4). On a short phone those are compact tiles, with the board and my
  // cards a little smaller to leave them the room; a tall one has the room
  // for full tiles, a little wider.
  const upright = !landscape && !tablet;
  const perRow = upright ? (others.length <= 4 ? Math.max(1, others.length) : Math.ceil(others.length / 2)) : 0;
  // A phone on its side has the others' pane, five twelfths of the row, and
  // the height between the header and the bar: two rows of tiles, no more.
  // Three to a row put a ninth player's tile in a third row under the bar,
  // with the hand it won hidden there, so past six others they go four to a
  // row, compact.
  const sideCrowd = landscape && !tablet && others.length > 6;
  const paneW = ((contentW - 2 * space.md) * 5) / 12;
  const compact = (upright && others.length > 4 && win.height < 860) || sideCrowd;
  const boardW = landscape
    ? clamp(30, Math.min(((contentW * 4) / 12 - 2 * space.md - 4 * space.xs) / 5, roomH * 0.28), 88)
    : clamp(36, Math.min((contentW - 2 * space.md - 4 * space.xs) / 5, win.height * (compact ? 0.064 : 0.07)), 88);
  const myW = landscape
    ? clamp(36, Math.min(((contentW * 3) / 12 - 2 * space.md - space.sm) / 2, roomH * 0.32), 110)
    : clamp(48, win.height * (compact ? 0.07 : 0.085), 120);
  const tileW = tablet
    ? clamp(92, win.width * (landscape ? 0.1 : 0.15), 140)
    : upright
      ? Math.min(roomH > 900 ? 112 : 92, Math.floor((contentW - (perRow - 1) * space.sm) / perRow))
      : sideCrowd
        ? Math.min(76, Math.floor((paneW - 3 * space.sm) / 4))
        : 76;
  const seatCardW = Math.round(tileW * 0.28);

  const myTurn = game.myTurn;
  const has = (type: HoldemAction['type']) => v.legalActions.some((a) => a.type === type);
  const betWord = v.currentBet === 0 ? t.bet : t.raiseTo;
  const presets = raisePresets(v, t);
  // The hand is over at a hand's end and at the match's (the last hand's board stays to read).
  const handOver = game.roundOver || game.matchOver;
  const r = handOver ? v.lastResult : null;
  const lines = r ? handLines(r, v.players, me, (seat) => people[seat]!.name, t) : [];
  const netOf = (seat: number) => (r ? (r.net[seat] ?? 0) : 0);
  const shownOf = (seat: number) => r?.shown.find((x) => x.seat === seat);
  // At hand over the pot is paid out and the view's reads 0: show what was won.
  const pot = r ? r.pots.reduce((a, p) => a + p.amount, 0) : v.pot;

  /** One line under a seat: what the hand did to it, else all in, else folded. */
  const status = (seat: number) => {
    const p = v.players[seat]!;
    const n = netOf(seat);
    if (n > 0) return <Text style={[styles.tag, styles.plus, num]}>{c.won(n)}</Text>;
    if (n < 0) return <Text style={[styles.tag, styles.minus, num]}>{c.lost(-n)}</Text>;
    // 'All in' is about the hand in play: gone once it is over.
    if (!handOver && p.status === 'allIn') return <Text style={[styles.tag, styles.allIn]}>{t.allIn}</Text>;
    if (p.status === 'folded') return <Text style={[styles.tag, styles.folded]}>{t.folded}</Text>;
    if (p.status === 'out' && compact && seat !== me) return <Text style={[styles.tag, styles.folded]}>{c.out}</Text>;
    return null;
  };

  const stackOf = (seat: number) => {
    const p = v.players[seat]!;
    // A compact tile has no room for the word beside the face: it goes under the cards instead.
    if (p.status === 'out' && compact) return null;
    return p.status === 'out' ? (
      <Text style={styles.seatStack}>{c.out}</Text>
    ) : (
      <View style={styles.stackRow} accessible accessibilityLabel={c.balance(p.stack)}>
        {/* A narrow compact tile has the face and the number beside it, and no room for the chip as well. */}
        {compact && tileW < 68 ? null : <ChipDisc value={100} size={11} />}
        <Text style={[styles.seatStack, num]}>{p.stack}</Text>
      </View>
    );
  };

  const seatTiles = others.map((seat) => {
    const p = v.players[seat]!;
    const shown = shownOf(seat);
    // Cards shown down stay on show even when they lost the seat its last chip.
    const cards = shown ? shown.hole : p.status === 'out' || p.status === 'folded' ? [] : p.hole.length > 0 ? p.hole : [null, null];
    return (
      <View
        key={seat}
        style={[
          styles.seat,
          { width: tileW },
          v.toAct === seat && styles.onTurn,
          netOf(seat) > 0 && styles.won,
          (p.status === 'folded' || (p.status === 'out' && !shown)) && styles.dim,
        ]}
      >
        {compact ? (
          // Two rows of these have to fit above the board on a small phone,
          // or above the bar on one on its side: the stack goes up beside the
          // face, a line saved on every tile.
          <>
            <View style={styles.seatHead}>
              <Avatar id={people[seat]!.avatar} size={18} />
              {stackOf(seat)}
            </View>
            <View style={[styles.seatHead, styles.narrow]}>
              {v.button === seat ? <Text style={styles.button}>{t.button}</Text> : null}
              <Text style={[styles.seatName, styles.shrink]} numberOfLines={1}>
                {people[seat]!.name}
              </Text>
            </View>
          </>
        ) : (
          <>
            <View style={styles.seatHead}>
              <Avatar id={people[seat]!.avatar} size={22} />
              {v.button === seat ? <Text style={styles.button}>{t.button}</Text> : null}
            </View>
            <Text style={styles.seatName} numberOfLines={1}>
              {people[seat]!.name}
            </Text>
            {stackOf(seat)}
          </>
        )}
        <View style={styles.seatCards}>
          <View style={styles.cards}>
            {cards.map((card, i) => (
              <Card52View key={card ? card.id : i} card={card} width={seatCardW} />
            ))}
          </View>
          <ChipPile amount={p.bet} size={12} />
        </View>
        {shown ? <Text style={styles.cat}>{t.category[shown.category]}</Text> : null}
        {status(seat)}
      </View>
    );
  });

  // Upright, the rows are held to their count of tiles, so five others sit
  // three and two rather than four and a lone one.
  const othersPane = (
    <View style={[styles.seats, upright && { maxWidth: perRow * tileW + (perRow - 1) * space.sm, alignSelf: 'center' }]}>{seatTiles}</View>
  );

  const boardPane = (
    <View style={[styles.board, landscape && styles.paneFill]}>
      <View style={styles.cards}>
        {Array.from({ length: 5 }, (_, i) => v.board[i] ?? null).map((card, i) =>
          card ? <Card52View key={card.id} card={card} width={boardW} /> : <View key={i} style={[styles.slot, { width: boardW, height: Math.round(boardW * 1.5) }]} />,
        )}
      </View>
      <Text style={[styles.pot, num]}>{t.pot(pot)}</Text>
      <Text style={[styles.blinds, num]}>{t.blinds(v.smallBlind, v.bigBlind)}</Text>
      <View accessibilityLiveRegion="polite" style={styles.lines}>
        {lines.map((l, i) => (
          <Text key={i} style={styles.line}>
            {l}
          </Text>
        ))}
      </View>
    </View>
  );

  const folded = mine.status === 'folded';
  const myShown = shownOf(me);
  const myBox = (
    <View style={[styles.box, landscape && styles.paneFill, myTurn && styles.onTurn, netOf(me) > 0 && styles.won]}>
      {/* The name on the left, the stack on the right: never read as one phrase. */}
      <View style={styles.boxHead}>
        <View style={styles.who}>
          <Avatar id={people[me]!.avatar} size={26} />
          {v.button === me ? <Text style={styles.button}>{t.button}</Text> : null}
          <Text style={styles.meName} numberOfLines={1}>
            {people[me]!.name}
          </Text>
        </View>
        {out ? (
          <Text style={styles.meStack}>{c.out}</Text>
        ) : (
          <View style={styles.stackRow} accessible accessibilityLabel={c.balance(mine.stack)}>
            <ChipDisc value={100} size={16} />
            <Text style={[styles.meStack, num]}>{mine.stack}</Text>
          </View>
        )}
      </View>
      <View style={styles.mineRow}>
        <View style={[styles.cards, styles.mine, folded && styles.dim]}>
          {mine.hole.map((card) => (
            <Card52View key={card.id} card={card} width={myW} />
          ))}
        </View>
        <ChipPile amount={mine.bet} size={20} />
      </View>
      <View style={styles.captions}>
        {myShown ? <Text style={styles.cat}>{t.category[myShown.category]}</Text> : null}
        {status(me)}
      </View>
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
      {/* The blinds sit on the board, so the header stays one line on a phone. */}
      <CasinoHeader lang={lang} title={t.name} round={t.handOf(v.handNumber)} onLeave={leave} />
      {landscape ? (
        <View style={styles.wide}>
          {/* A View holds the share of the row: a ScrollView alone sizes to what it scrolls. */}
          <View style={styles.othersWide}>
            <ScrollView style={styles.fill} contentContainerStyle={styles.paneScroll}>
              {othersPane}
            </ScrollView>
          </View>
          {/* Scrolls rather than grows: a busy all-in hand's lines never push the board over the header or under the bar. */}
          <View style={styles.boardWide}>
            <ScrollView style={styles.fill} contentContainerStyle={styles.paneScroll}>
              {boardPane}
            </ScrollView>
          </View>
          <View style={styles.meWide}>{myBox}</View>
        </View>
      ) : (
        <ScrollView style={styles.fill} contentContainerStyle={styles.tall}>
          {othersPane}
          {boardPane}
          {myBox}
        </ScrollView>
      )}

      <View style={[styles.bar, landscape && styles.barWide]}>
        {myTurn ? (
          <>
            <View style={styles.buttons}>
              {has('FOLD') ? <Button label={t.fold} onPress={() => game.submit({ type: 'FOLD', seat: me })} /> : null}
              {has('CHECK') ? <Button label={t.check} tone="strong" onPress={() => game.submit({ type: 'CHECK', seat: me })} /> : null}
              {has('CALL') ? <Button label={t.call(v.toCall)} tone="strong" onPress={() => game.submit({ type: 'CALL', seat: me })} /> : null}
            </View>
            {presets.length > 0 ? (
              <View style={styles.buttons}>
                {presets.map((p) => (
                  <Button
                    key={p.to}
                    label={`${p.label} · ${p.to}`}
                    accessibilityLabel={betWord(p.to)}
                    compact
                    onPress={() => game.submit({ type: 'RAISE', seat: me, to: p.to })}
                  />
                ))}
              </View>
            ) : null}
          </>
        ) : game.roundOver && !over ? (
          <View style={styles.buttons}>
            <Button label={lang.osmice.nextRound} tone="strong" onPress={game.nextRound} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Upright: the others, the board and my hand spread down the room there is.
  tall: { flexGrow: 1, justifyContent: 'space-evenly', padding: space.md, gap: space.md },
  // On its side: three panes in a row, each filling the height.
  wide: { flex: 1, flexDirection: 'row', padding: space.md, gap: space.md },
  othersWide: { flex: 5, flexBasis: 0 },
  paneScroll: { flexGrow: 1, justifyContent: 'center' },
  boardWide: { flex: 4, flexBasis: 0 },
  meWide: { flex: 3, flexBasis: 0, justifyContent: 'center' },
  paneFill: { alignSelf: 'stretch' },
  seats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center', alignItems: 'flex-start' },
  seat: { alignItems: 'center', padding: space.xs, borderRadius: radius.md, backgroundColor: surface.panel, borderWidth: 1, borderColor: stroke.hair, gap: 2 },
  onTurn: { borderColor: signal.turn },
  won: { borderColor: theme.okInk },
  dim: { opacity: 0.45 },
  seatHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  narrow: { maxWidth: '100%' },
  shrink: { flexShrink: 1 },
  seatName: { ...type.caption, color: ink.hi, maxWidth: '100%' },
  stackRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  seatStack: { ...type.caption, color: ink.mid },
  seatCards: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  button: { ...type.caption, fontFamily: font.bold, color: garb.ink, backgroundColor: garb.cream, borderRadius: radius.pill, paddingHorizontal: 5, overflow: 'hidden' },
  cards: { flexDirection: 'row', gap: 3 },
  mine: { gap: space.sm },
  cat: { ...type.caption, color: ink.hi },
  tag: { ...type.caption, fontFamily: font.bold },
  allIn: { color: theme.accent },
  folded: { color: ink.lo },
  plus: { color: theme.okInk },
  minus: { color: theme.dangerInk },
  board: { alignItems: 'center', gap: space.xs, padding: space.md, borderRadius: radius.lg, backgroundColor: theme.felt, borderWidth: 2, borderColor: theme.wood },
  slot: { borderRadius: radius.card, borderWidth: 1, borderColor: stroke.hair, backgroundColor: surface.well },
  pot: { ...type.h3, color: ink.hi },
  blinds: { ...type.caption, color: ink.mid },
  lines: { alignItems: 'center', gap: 2 },
  line: { ...type.sub, color: ink.hi, textAlign: 'center' },
  box: { padding: space.md, borderRadius: radius.md, backgroundColor: surface.panel, borderWidth: 1, borderColor: stroke.hair, gap: space.sm, alignItems: 'center' },
  boxHead: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  who: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1 },
  meName: { ...type.sub, color: ink.hi, flexShrink: 1 },
  meStack: { ...type.sub, color: ink.hi, fontFamily: font.bold },
  mineRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  captions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 14 },
  // Pinned under the table, above the safe area the frame keeps.
  bar: { paddingHorizontal: space.md, paddingVertical: space.sm, gap: space.sm, minHeight: 60, justifyContent: 'center', borderTopWidth: 1, borderTopColor: stroke.hair, backgroundColor: surface.sunk },
  barWide: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' },
  buttons: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
});
