import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Lang } from '@belot/i18n';
import { BLACKJACK, handValue, type BlackjackEvent, type Hand } from '@belot/games-blackjack';
import type { BotLevel } from '@belot/game-core';
import type { Card52 } from '@belot/cards';
import { useLocalSession } from '../useLocalSession';
import { CasinoHeader, CasinoScreen, type TableProps } from './CasinoScreen';
import { Card52View } from './Card52';
import { ChipPile, ChipRow } from './Chips';
import { tablePeople } from './people';
import { Avatar } from '../../avatars';
import { Button } from '../../ui/Button';
import { playSfx } from '../../audio';
import { buzz } from '../../haptics';
import { loadProfile, type Settings } from '../../storage';
import { useMotionPolicy } from '../../anim/useMotionPolicy';
import { ink, num, radius, signal, space, stroke, surface, theme, type } from '../../theme';

/**
 * Blackjack against the dealer, with bots in the other boxes. Chips into the
 * box, deal, then hit, stand, double or split; the dealer plays by the house
 * rules and the round is paid.
 */

const STACK = 1000;

export function BlackjackGame({ settings, players, level, onExit }: { settings: Settings; players: number; level: BotLevel; onExit: () => void }) {
  const lang = useMemo(() => new Lang(settings.locale), [settings.locale]);
  return (
    <CasinoScreen settings={settings} tableStack={STACK} minimum={BLACKJACK.defaultConfig.minBet} title={lang.blackjack.name} onExit={onExit}>
      {(p) => <BlackjackTable {...p} players={players} level={level} />}
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

function BlackjackTable({ stack, report, finish, lang, settings, leave, players, level }: TableProps & { players: number; level: BotLevel }) {
  const t = lang.blackjack;
  const c = lang.casino;
  const reduced = useMotionPolicy(settings.motion) === 'reduced';
  const people = useMemo(() => tablePeople(players, lang, settings.nickname, loadProfile().selectedAvatar), [players, lang, settings.nickname]);
  const [line, setLine] = useState('');

  const game = useLocalSession(BLACKJACK, {
    seats: players,
    botLevel: level,
    stacks: [stack, ...Array<number>(players - 1).fill(STACK)],
    thinkMs: () => (reduced ? 150 : 400 + Math.floor(Math.random() * 400)),
    onEvent: (e: BlackjackEvent) => {
      if (e.kind === 'dealt') playSfx('deal');
      if (e.kind === 'betPlaced' && e.seat === 0) playSfx('arm');
      if (e.kind === 'busted' && e.seat === 0) {
        setLine(t.bust);
        buzz('light');
      }
      if (e.kind === 'blackjack' && e.seat === 0) {
        setLine(t.blackjack);
        playSfx('win');
      }
      if (e.kind === 'settled' && e.seat === 0) {
        if (e.result === 'win' || e.result === 'blackjack') playSfx('win');
        else if (e.result === 'lose') playSfx('lose');
      }
      if (e.kind === 'roundStarted') setLine('');
    },
  });
  const v = game.view;
  const myHands = v.hands[0]!;

  useEffect(() => report(v.stacks[0]! + v.bets[0]! + myHands.reduce((a, h) => a + (h.result === null ? h.bet : 0), 0)), [v.stacks, v.bets, myHands, report]);
  const done = useRef(false);
  useEffect(() => {
    if (game.matchOver && !done.current) {
      done.current = true;
      finish(v.stacks[0]!);
    }
  }, [game.matchOver, v.stacks, finish]);

  const betting = v.phase === 'BETTING' && !v.ready[0];
  const playing = v.phase === 'PLAYING' && v.turn?.seat === 0;
  const has = (type: string) => v.legalActions.some((a) => a.type === type);
  const totalOf = (h: Hand) => {
    const { total, soft } = handValue(h.cards);
    return t.total(total, soft && total <= 21);
  };
  const others = Array.from({ length: players - 1 }, (_, i) => i + 1);
  const net = myHands.reduce((a, h) => a + (h.result === 'win' ? h.bet : h.result === 'blackjack' ? Math.floor((h.bet * 3) / 2) : h.result === 'lose' ? -h.bet : 0), 0);

  return (
    <View style={styles.fill}>
      <CasinoHeader lang={lang} title={t.name} round={c.roundOf(v.roundNumber, v.rounds)} onLeave={leave} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* the dealer */}
        <View style={styles.dealer}>
          <Text style={styles.dealerTitle}>
            {t.dealer}
            {v.dealerTotal !== null ? `  ${v.dealerTotal}` : ''}
          </Text>
          <Cards cards={v.dealer} width={56} />
        </View>

        {/* the other boxes */}
        <View style={styles.seats}>
          {others.map((seat) => (
            <View key={seat} style={[styles.seat, v.turn?.seat === seat && styles.onTurn]}>
              <View style={styles.seatHead}>
                <Avatar id={people[seat]!.avatar} size={22} />
                <Text style={styles.seatName} numberOfLines={1}>
                  {people[seat]!.name}
                </Text>
              </View>
              <Text style={[styles.seatStack, num]}>{v.out[seat] ? c.out : v.stacks[seat]}</Text>
              {v.hands[seat]!.map((h, i) => (
                <View key={i} style={styles.miniHand}>
                  <Cards cards={h.cards} width={26} />
                  <Text style={[styles.mini, num]}>{totalOf(h)}</Text>
                </View>
              ))}
              <ChipPile amount={v.bets[seat]! + v.hands[seat]!.reduce((a, h) => a + h.bet, 0)} size={14} />
            </View>
          ))}
        </View>

        {/* my box */}
        <View style={[styles.box, (playing || betting) && styles.onTurn]}>
          <View style={styles.seatHead}>
            <Avatar id={people[0]!.avatar} size={26} />
            <Text style={styles.meName}>{people[0]!.name}</Text>
            <Text style={[styles.meStack, num]}>{c.balance(v.stacks[0]!)}</Text>
          </View>
          {myHands.length === 0 ? <ChipPile amount={v.bets[0]!} size={30} /> : null}
          <View style={styles.hands}>
            {myHands.map((h, i) => (
              <View key={i} style={[styles.hand, v.turn?.seat === 0 && v.turn.hand === i && styles.handLive]}>
                <Cards cards={h.cards} width={64} />
                <Text style={[styles.total, num]}>{totalOf(h)}</Text>
                <ChipPile amount={h.bet} size={20} />
                {h.result ? <Text style={styles.result}>{t.result[h.result]}</Text> : null}
              </View>
            ))}
          </View>
          <Text style={styles.line}>{line}</Text>
        </View>

        {betting ? (
          <>
            <ChipRow chips={v.chips} canAdd={(x) => v.legalActions.some((a) => a.type === 'BET' && a.amount === x)} onAdd={(x) => game.submit({ type: 'BET', seat: 0, amount: x })} />
            <View style={styles.buttons}>
              <Button label={c.clear} onPress={() => game.submit({ type: 'CLEAR', seat: 0 })} disabled={!has('CLEAR')} />
              {/* No bet, no deal: a Deal that silently sat the round out was a trap. */}
              <Button label={c.deal} tone="strong" onPress={() => game.submit({ type: 'READY', seat: 0 })} disabled={!has('READY') || v.bets[0] === 0} />
            </View>
          </>
        ) : null}
        {v.phase === 'BETTING' && !betting ? <Text style={styles.line}>{c.waitingForBets}</Text> : null}
        {playing ? (
          <View style={styles.buttons}>
            <Button label={t.hit} tone="strong" onPress={() => game.submit({ type: 'HIT', seat: 0 })} />
            <Button label={t.stand} onPress={() => game.submit({ type: 'STAND', seat: 0 })} />
            {has('DOUBLE') ? <Button label={t.double} onPress={() => game.submit({ type: 'DOUBLE', seat: 0 })} /> : null}
            {has('SPLIT') ? <Button label={t.split} onPress={() => game.submit({ type: 'SPLIT', seat: 0 })} /> : null}
          </View>
        ) : null}
        {game.roundOver && !game.matchOver ? (
          <View style={styles.buttons}>
            {myHands.length > 0 ? (
              <Text style={[styles.net, num, net > 0 ? styles.netWin : net < 0 ? styles.netLose : null]}>{net > 0 ? c.won(net) : net < 0 ? c.lost(-net) : c.push}</Text>
            ) : null}
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
  cards: { flexDirection: 'row' },
  dealer: { alignItems: 'center', gap: space.xs, padding: space.md, borderRadius: radius.md, backgroundColor: theme.felt, borderWidth: 1, borderColor: stroke.hair },
  dealerTitle: { ...type.h3, color: ink.hi },
  seats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' },
  seat: { minWidth: 96, alignItems: 'center', padding: space.xs, borderRadius: radius.md, backgroundColor: surface.panel, borderWidth: 1, borderColor: stroke.hair, gap: 2 },
  onTurn: { borderColor: signal.turn },
  seatHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  seatName: { ...type.caption, color: ink.hi, maxWidth: 70 },
  seatStack: { ...type.caption, color: ink.mid },
  miniHand: { alignItems: 'center' },
  mini: { ...type.caption, color: ink.hi },
  box: { padding: space.md, borderRadius: radius.md, backgroundColor: surface.panel, borderWidth: 1, borderColor: stroke.hair, gap: space.sm, alignItems: 'center' },
  meName: { ...type.sub, color: ink.hi, flex: 1 },
  meStack: { ...type.sub, color: ink.hi },
  hands: { flexDirection: 'row', gap: space.lg, justifyContent: 'center' },
  hand: { alignItems: 'center', gap: 4, padding: space.xs, borderRadius: radius.sm, borderWidth: 1, borderColor: 'transparent' },
  handLive: { borderColor: signal.turn },
  total: { ...type.h3, color: ink.hi },
  result: { ...type.sub, color: ink.mid },
  line: { ...type.body, color: ink.hi, textAlign: 'center', minHeight: 20 },
  buttons: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  net: { ...type.h3, color: ink.hi },
  netWin: { color: theme.okInk },
  netLose: { color: theme.dangerInk },
});
