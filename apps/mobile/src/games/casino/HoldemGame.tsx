import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Lang } from '@belot/i18n';
import { HOLDEM, type HoldemAction, type HoldemEvent } from '@belot/games-holdem';
import type { BotLevel } from '@belot/game-core';
import { useLocalSession } from '../useLocalSession';
import { CasinoHeader, CasinoScreen, type TableProps } from './CasinoScreen';
import { Card52View } from './Card52';
import { ChipPile } from './Chips';
import { tablePeople } from './people';
import { othersAfter } from '../source';
import type { TableSeats } from './CasinoScreen';
import { Avatar } from '../../avatars';
import { Button } from '../../ui/Button';
import { playSfx } from '../../audio';
import { loadProfile, type Settings } from '../../storage';
import { useMotionPolicy } from '../../anim/useMotionPolicy';
import { garb } from '../../deck/palette';
import { font, ink, num, radius, signal, space, stroke, surface, theme, type } from '../../theme';

/**
 * Texas Hold'em, a sit-and-go against bots: everyone starts with the table's
 * stack, the blinds go up, and the last player with chips wins. My two cards
 * along the bottom, the board in the middle, the others above; on my turn the
 * moves the rules allow, with the raises a player reaches for most — the
 * minimum, half the pot, the pot, all in.
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

export function HoldemTable({ report, finish, lang, settings, leave, players, me, people, source }: TableProps & TableSeats<typeof HOLDEM>) {
  const t = lang.holdem;
  const c = lang.casino;
  const [line, setLine] = useState('');

  const game = source((e: HoldemEvent, after) => {
      if (e.kind === 'handStarted') {
        setLine('');
        playSfx('shuffle');
      }
      if (e.kind === 'street') playSfx('deal');
      if (e.kind === 'acted' && e.amount > 0) playSfx('stack');
      if (e.kind === 'acted' && e.action === 'check') playSfx('knock');
      if (e.kind === 'potWon') {
        playSfx(e.winners.includes(me) ? 'win' : 'coin');
        // The view after this transition, not the last render's.
        const shown = after.lastResult?.shown;
        const hand = shown?.find((x) => x.seat === e.winners[0]);
        setLine(t.wins(people[e.winners[0]!]!.name, e.amount, hand ? t.category[hand.category] : null));
      }
      if (e.kind === 'eliminated') setLine(t.eliminated(people[e.seat]!.name));
    });
  const v = game.view;
  const mine = v.players[me]!;

  useEffect(() => report(mine.stack), [mine.stack, report]);
  const done = useRef(false);
  useEffect(() => {
    if (game.matchOver && !done.current) {
      done.current = true;
      finish(mine.stack);
    }
  }, [game.matchOver, mine.stack, finish]);

  const myTurn = game.myTurn;
  const has = (type: HoldemAction['type']) => v.legalActions.some((a) => a.type === type);
  const raiseTo = (to: number): HoldemAction | null => (v.raiseTo ? { type: 'RAISE', seat: me, to: Math.max(v.raiseTo.min, Math.min(v.raiseTo.max, Math.round(to))) } : null);
  const betWord = v.currentBet === 0 ? t.bet : t.raiseTo;
  const presets = v.raiseTo
    ? [
        { label: t.min, a: raiseTo(v.raiseTo.min)! },
        { label: t.halfPot, a: raiseTo(v.currentBet + (v.pot + v.toCall) / 2)! },
        { label: t.fullPot, a: raiseTo(v.currentBet + v.pot + v.toCall)! },
        { label: t.allIn, a: raiseTo(v.raiseTo.max)! },
      ].filter((p, i, all) => all.findIndex((q) => (q.a as { to: number }).to === (p.a as { to: number }).to) === i)
    : [];
  const others = othersAfter(me, players);
  const shownOf = (seat: number) => v.lastResult?.shown.find((x) => x.seat === seat);

  return (
    <View style={styles.fill}>
      <CasinoHeader lang={lang} title={t.name} round={`${t.handOf(v.handNumber)} · ${t.blinds(v.smallBlind, v.bigBlind)}`} onLeave={leave} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* the others */}
        <View style={styles.seats}>
          {others.map((seat) => {
            const p = v.players[seat]!;
            const shown = shownOf(seat);
            return (
              <View key={seat} style={[styles.seat, v.toAct === seat && styles.onTurn, (p.status === 'folded' || p.status === 'out') && styles.dim]}>
                <View style={styles.seatHead}>
                  <Avatar id={people[seat]!.avatar} size={24} />
                  {v.button === seat ? <Text style={styles.button}>{t.button}</Text> : null}
                </View>
                <Text style={styles.seatName} numberOfLines={1}>
                  {people[seat]!.name}
                </Text>
                <Text style={[styles.seatStack, num]}>{p.status === 'out' ? c.out : p.stack}</Text>
                <View style={styles.cards}>
                  {p.status === 'out' || p.status === 'folded'
                    ? null
                    : (p.hole.length > 0 ? p.hole : [null, null]).map((card, i) => <Card52View key={card ? card.id : i} card={card} width={26} />)}
                </View>
                {shown ? <Text style={styles.cat}>{t.category[shown.category]}</Text> : null}
                {p.status === 'allIn' ? <Text style={styles.allIn}>{t.allIn}</Text> : null}
                <ChipPile amount={p.bet} size={14} />
              </View>
            );
          })}
        </View>

        {/* the board */}
        <View style={styles.board}>
          <View style={styles.cards}>
            {Array.from({ length: 5 }, (_, i) => v.board[i] ?? null).map((card, i) =>
              card ? <Card52View key={card.id} card={card} width={52} /> : <View key={i} style={styles.slot} />,
            )}
          </View>
          <Text style={[styles.pot, num]}>{t.pot(v.pot)}</Text>
          <Text style={styles.line}>{line}</Text>
        </View>

        {/* me */}
        <View style={[styles.box, myTurn && styles.onTurn]}>
          <View style={styles.seatHead}>
            <Avatar id={people[me]!.avatar} size={26} />
            {v.button === me ? <Text style={styles.button}>{t.button}</Text> : null}
            <Text style={styles.meName}>{people[me]!.name}</Text>
            <Text style={[styles.meStack, num]}>{c.balance(mine.stack)}</Text>
          </View>
          <View style={[styles.cards, styles.mine]}>
            {mine.hole.map((card) => (
              <Card52View key={card.id} card={card} width={78} />
            ))}
          </View>
          {shownOf(me) ? <Text style={styles.cat}>{t.category[shownOf(me)!.category]}</Text> : null}
          <ChipPile amount={mine.bet} size={20} />
        </View>

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
                    key={p.label}
                    label={`${p.label} · ${(p.a as { to: number }).to}`}
                    accessibilityLabel={betWord((p.a as { to: number }).to)}
                    compact
                    onPress={() => game.submit(p.a)}
                  />
                ))}
              </View>
            ) : null}
          </>
        ) : null}
        {game.roundOver && !game.matchOver ? (
          <View style={styles.buttons}>
            <Button label={lang.osmice.nextRound} tone="strong" onPress={game.nextRound} />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { padding: space.lg, gap: space.md },
  seats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' },
  seat: { width: 92, alignItems: 'center', padding: space.xs, borderRadius: radius.md, backgroundColor: surface.panel, borderWidth: 1, borderColor: stroke.hair, gap: 2 },
  onTurn: { borderColor: signal.turn },
  dim: { opacity: 0.45 },
  seatHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  seatName: { ...type.caption, color: ink.hi, maxWidth: 84 },
  seatStack: { ...type.caption, color: ink.mid },
  button: { ...type.caption, fontFamily: font.bold, color: garb.ink, backgroundColor: garb.cream, borderRadius: radius.pill, paddingHorizontal: 5, overflow: 'hidden' },
  cards: { flexDirection: 'row', gap: 3 },
  mine: { gap: space.sm },
  cat: { ...type.caption, color: ink.hi },
  allIn: { ...type.caption, color: theme.accent, fontFamily: font.bold },
  board: { alignItems: 'center', gap: space.xs, padding: space.md, borderRadius: radius.lg, backgroundColor: theme.felt, borderWidth: 2, borderColor: theme.wood },
  slot: { width: 52, height: 78, borderRadius: radius.card, borderWidth: 1, borderColor: stroke.hair, backgroundColor: surface.well },
  pot: { ...type.h3, color: ink.hi },
  line: { ...type.sub, color: ink.hi, textAlign: 'center', minHeight: 18 },
  box: { padding: space.md, borderRadius: radius.md, backgroundColor: surface.panel, borderWidth: 1, borderColor: stroke.hair, gap: space.sm, alignItems: 'center' },
  meName: { ...type.sub, color: ink.hi, flex: 1 },
  meStack: { ...type.sub, color: ink.hi },
  buttons: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
});
