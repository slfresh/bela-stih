import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Lang } from '@belot/i18n';
import { OSMICE, isWild, type Colour, type OCard, type OsmiceAction, type OsmiceEvent } from '@belot/games-osmice';
import type { BotLevel } from '@belot/game-core';
import { applyGameMatchOutcome, applyRoundOutcome, type Award } from '@belot/progression';
import { useLocalSession } from '../useLocalSession';
import { OsmiceCard, OSMICE_INK } from './OsmiceCard';
import { Avatar } from '../../avatars';
import { tablePeople, type Person } from '../casino/people';
import { othersAfter, type SessionSource } from '../source';
import { Button } from '../../ui/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { Coin, Star } from '../../ui/icons';
import { clearBackGuard, setBackGuard } from '../../ui/backGuard';
import { PressScale } from '../../ui/PressScale';
import { room } from '../../cosmetics';
import { playSfx } from '../../audio';
import { buzz } from '../../haptics';
import { loadProfile, saveProfile, type Settings } from '../../storage';
import { useMotionPolicy } from '../../anim/useMotionPolicy';
import { font, ink, num, radius, signal, space, stroke, surface, theme, type } from '../../theme';
import { garb } from '../../deck/palette';

/**
 * Osmice against the bots: the first table of the games beyond Bela.
 *
 * The person sits at seat 0, the bots round the table in play order above. The
 * pile and the deck sit in the middle; the hand is a strip along the bottom,
 * every card that may go now lifted, the rest dimmed. A wild asks for its
 * colour. Between rounds a sheet shows the score; at the end, the match and
 * what it earned.
 */

const COLOURS: Colour[] = ['red', 'gold', 'green', 'blue'];
const HAND_GAP = 4;

/** Osmice against the bots, on the device. */
export function OsmiceGame({ settings, players, level = 'medium', onExit }: { settings: Settings; players: number; level?: BotLevel; onExit: () => void }) {
  const lang = useMemo(() => new Lang(settings.locale), [settings.locale]);
  const reduced = useMotionPolicy(settings.motion) === 'reduced';
  const people = useMemo(() => tablePeople(players, lang, settings.nickname, loadProfile().selectedAvatar), [players, lang, settings.nickname]);
  const source: SessionSource<typeof OSMICE> = (onEvent) =>
    useLocalSession(OSMICE, { seats: players, botLevel: level, thinkMs: () => (reduced ? 250 : 650 + Math.floor(Math.random() * 450)), onEvent });
  return <OsmiceTable settings={settings} players={players} me={0} people={people} source={source} onExit={onExit} />;
}

/**
 * The Osmice table, for any session: on the device or online. `me` is where
 * the person sits — online, wherever the room put them.
 */
export function OsmiceTable({
  settings,
  players,
  me,
  people,
  source,
  onExit,
}: {
  settings: Settings;
  players: number;
  me: number;
  people: Person[];
  source: SessionSource<typeof OSMICE>;
  onExit: () => void;
}) {
  const lang = useMemo(() => new Lang(settings.locale), [settings.locale]);
  const t = lang.osmice;
  const g = lang.games;
  const motion = useMotionPolicy(settings.motion);
  const reduced = motion === 'reduced';
  const { width, height } = useWindowDimensions();
  const profileRef = useRef(loadProfile());

  const [line, setLine] = useState<string>('');
  const [award, setAward] = useState<Award | null>(null);
  const [lastCardSeat, setLastCardSeat] = useState<number | null>(null);

  const onEvent = useCallback(
    (e: OsmiceEvent) => {
      const name = (seat: number) => people[seat]!.name;
      switch (e.kind) {
        case 'roundStarted':
          setAward(null);
          setLine('');
          playSfx('shuffle');
          break;
        case 'cardPlayed':
          playSfx('play');
          // A new card on the pile retires the last remark; whose go it is shows by itself.
          setLine('');
          break;
        case 'drew':
          playSfx('deal');
          if (e.seat !== me) setLine(t.drewCards(name(e.seat), e.count));
          else if (e.penalty) setLine(t.drewCardsMe(e.count));
          break;
        case 'skipped':
          playSfx('knock');
          setLine(e.seat === me ? t.skippedMe : t.skipped(name(e.seat)));
          break;
        case 'reversed':
          playSfx('sort');
          setLine(t.reversed);
          break;
        case 'lastCard':
          playSfx('call');
          setLastCardSeat(e.seat);
          break;
        case 'roundOver': {
          const won = e.winner === me;
          playSfx(won ? 'win' : 'lose');
          if (won) buzz('medium');
          const r = applyRoundOutcome(profileRef.current, 'osmice', won);
          profileRef.current = r.profile;
          saveProfile(r.profile);
          setAward(r.award);
          setLine(t.roundWon(name(e.winner), e.points));
          break;
        }
        case 'matchOver': {
          const won = e.winner === me;
          playSfx(won ? 'matchWon' : 'matchLost');
          const r = applyGameMatchOutcome(profileRef.current, 'osmice', won);
          profileRef.current = r.profile;
          saveProfile(r.profile);
          // The match's award joins the round's on the one sheet.
          setAward((prev) =>
            prev
              ? { xp: prev.xp + r.award.xp, coins: prev.coins + r.award.coins, levelUp: r.award.levelUp ?? prev.levelUp, reasons: [...prev.reasons, ...r.award.reasons] }
              : r.award,
          );
          break;
        }
        default:
          break;
      }
    },
    [people, t, me],
  );

  const game = source(onEvent);
  const view = game.view;

  // "Zadnja!" shows for a moment over whoever said it.
  useEffect(() => {
    if (lastCardSeat === null) return;
    const h = setTimeout(() => setLastCardSeat(null), 1600);
    return () => clearTimeout(h);
  }, [lastCardSeat]);

  // My turn: a soft cue, once per turn.
  const wasMyTurn = useRef(false);
  useEffect(() => {
    if (game.myTurn && !wasMyTurn.current) playSfx('turn');
    wasMyTurn.current = game.myTurn;
  }, [game.myTurn]);

  // Leaving mid-match asks first, from the back button too.
  const [confirmLeave, setConfirmLeave] = useState(false);
  const leave = useCallback(() => {
    if (game.matchOver || (view.roundNumber <= 1 && view.handCounts.every((n) => n === 7))) onExit();
    else setConfirmLeave(true);
  }, [game.matchOver, view.roundNumber, view.handCounts, onExit]);
  useEffect(() => {
    const guard = () => {
      if (confirmLeave) setConfirmLeave(false);
      else leave();
      return true;
    };
    setBackGuard(guard);
    return () => clearBackGuard(guard);
  }, [leave, confirmLeave]);

  // A wild waits for its colour.
  const [wildFor, setWildFor] = useState<OCard | null>(null);
  const legal = view.legalActions;
  const playable = new Set(legal.filter((a) => a.type === 'PLAY').map((a) => (a as { cardId: string }).cardId));
  const canDraw = legal.some((a) => a.type === 'DRAW');
  const canPass = legal.some((a) => a.type === 'PASS');

  const tapCard = (c: OCard) => {
    if (!game.myTurn || !playable.has(c.id)) {
      playSfx('denied');
      buzz('light');
      return;
    }
    if (isWild(c)) {
      setWildFor(c);
      return;
    }
    game.submit({ type: 'PLAY', seat: me, cardId: c.id });
  };
  const pickColour = (colour: Colour) => {
    if (!wildFor) return;
    const a: OsmiceAction = { type: 'PLAY', seat: me, cardId: wildFor.id, colour };
    setWildFor(null);
    game.submit(a);
  };

  const ground = room();
  const portrait = height >= width;
  // Up to seven cards fit across the screen; more scroll.
  const shown = Math.min(7, Math.max(5, view.hand.length));
  const handCard = Math.max(40, Math.min(84, (Math.min(width, 640) - space.lg * 2 - HAND_GAP * (shown - 1)) / shown));
  const pileCard = portrait ? 88 : 72;

  // Opponents in play order, from my left.
  const order = othersAfter(me, players);
  const name = (seat: number) => people[seat]!.name;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: ground.page }]}>
      {/* header */}
      <View style={styles.header}>
        <Button label={lang.s.ui.leaveTable} compact onPress={leave} />
        <Text style={styles.title}>{t.name}</Text>
        <Text style={styles.target}>{t.target(view.matchTarget)}</Text>
      </View>

      {/* the others */}
      <View style={styles.opponents}>
        {order.map((seat) => {
          const onTurn = view.toAct === seat;
          return (
            <View key={seat} style={[styles.opponent, onTurn && styles.onTurn]} accessibilityLabel={`${name(seat)}, ${t.cardsLeft(view.handCounts[seat]!)}`}>
              <Avatar id={people[seat]!.avatar} size={34} />
              <Text style={styles.oppName} numberOfLines={1}>
                {name(seat)}
              </Text>
              <View style={styles.oppRow}>
                <OsmiceCard card={null} width={14} />
                <Text style={[styles.oppCount, num]}>{view.handCounts[seat]}</Text>
                <Text style={[styles.oppScore, num]}>{view.scores[seat]}</Text>
              </View>
              {lastCardSeat === seat ? (
                <Animated.View entering={reduced ? undefined : FadeInDown.duration(160)} style={styles.bubble}>
                  <Text style={styles.bubbleText}>{t.lastCard}</Text>
                </Animated.View>
              ) : null}
            </View>
          );
        })}
      </View>

      {/* the middle: deck, pile, colour, direction */}
      <View style={styles.middle}>
        <View style={[styles.felt, { backgroundColor: ground.felt, borderColor: ground.rim }]}>
          <View style={styles.piles}>
            <PressScale
              onPress={() => canDraw && game.myTurn && game.submit({ type: 'DRAW', seat: me })}
              disabled={!canDraw || !game.myTurn}
              accessibilityLabel={`${t.draw} (${view.drawPileCount})`}
              accessibilityRole="button"
            >
              <View style={[styles.deck, canDraw && game.myTurn && styles.deckLive]}>
                <OsmiceCard card={null} width={pileCard} />
              </View>
              <Text style={[styles.deckCount, num]}>{view.drawPileCount}</Text>
            </PressScale>
            <View style={[styles.pile, { borderColor: OSMICE_INK[view.colour] }]} accessibilityLabel={view.top ? cardLabel(t, view.top) : ''}>
              {view.top ? <OsmiceCard card={view.top} width={pileCard} /> : null}
            </View>
          </View>
          <View style={styles.colourRow}>
            <View style={[styles.colourDot, { backgroundColor: OSMICE_INK[view.colour] }]} />
            <Text style={styles.colourText}>{t.activeColour(t.colour[view.colour])}</Text>
            <Text style={styles.direction}>{view.direction === 1 ? '↻' : '↺'}</Text>
          </View>
          <Text style={styles.line} numberOfLines={2}>
            {game.myTurn
              ? view.pendingDraw > 0
                ? t.mustTake(view.pendingDraw)
                : view.drawn
                  ? t.drewPlayable
                  : t.yourTurn
              : line || (game.actor !== null ? t.turnOf(name(game.actor)) : '')}
          </Text>
        </View>
      </View>

      {/* me */}
      <View style={[styles.me, game.myTurn && styles.meOnTurn]}>
        <View style={styles.meRow}>
          <Avatar id={people[me]!.avatar} size={28} />
          <Text style={styles.meName} numberOfLines={1}>
            {people[me]!.name}
          </Text>
          <Text style={[styles.meScore, num]}>
            {t.score}: {view.scores[me]}
          </Text>
          {canPass && game.myTurn ? <Button label={t.pass} compact onPress={() => game.submit({ type: 'PASS', seat: me })} /> : null}
          {canDraw && game.myTurn && !view.drawn ? <Button label={t.draw} compact tone="strong" onPress={() => game.submit({ type: 'DRAW', seat: me })} /> : null}
        </View>
        <ScrollView horizontal contentContainerStyle={styles.hand} showsHorizontalScrollIndicator={false}>
          {view.hand.map((c) => {
            const live = game.myTurn && playable.has(c.id);
            return (
              <Pressable
                key={c.id}
                onPress={() => tapCard(c)}
                accessibilityRole="button"
                accessibilityLabel={cardLabel(t, c)}
                // Disabled, not only dimmed: react-native-web writes aria-disabled from this prop
                // alone, so a card that cannot go says so to a screen reader in a browser too.
                disabled={!live}
                style={[styles.handCard, live ? styles.lifted : game.myTurn ? styles.dimmed : null]}
              >
                <OsmiceCard card={c} width={handCard} />
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* a wild's colour */}
      {wildFor ? (
        <View style={styles.scrim}>
          <Animated.View entering={reduced ? undefined : FadeIn.duration(140)} style={[styles.sheet, { backgroundColor: ground.page }]}>
            <Text style={styles.sheetTitle}>{t.pickColour}</Text>
            <View style={styles.colourPick}>
              {COLOURS.map((c) => (
                <PressScale key={c} onPress={() => pickColour(c)} accessibilityRole="button" accessibilityLabel={t.colour[c]}>
                  <View style={[styles.swatch, { backgroundColor: OSMICE_INK[c] }]}>
                    <Text style={styles.swatchText}>{t.colour[c]}</Text>
                  </View>
                </PressScale>
              ))}
            </View>
            <Button label={lang.s.ui.back} onPress={() => setWildFor(null)} />
          </Animated.View>
        </View>
      ) : null}

      {/* between rounds, and the end */}
      {game.roundOver || game.matchOver ? (
        <View style={styles.scrim}>
          <Animated.View entering={reduced ? undefined : FadeInDown.duration(200)} style={[styles.sheet, { backgroundColor: ground.page }]}>
            <Text style={styles.sheetTitle}>
              {game.matchOver && view.lastRound ? t.matchWon(name(view.lastRound.winner)) : view.lastRound ? t.roundWon(name(view.lastRound.winner), view.lastRound.points) : ''}
            </Text>
            <View style={styles.scores}>
              {Array.from({ length: players }, (_, seat) => seat)
                .sort((a, b) => view.scores[b]! - view.scores[a]!)
                .map((seat) => (
                  <View key={seat} style={styles.scoreRow}>
                    <Avatar id={people[seat]!.avatar} size={22} />
                    <Text style={[styles.scoreName, seat === me && styles.scoreMe]} numberOfLines={1}>
                      {name(seat)}
                    </Text>
                    <Text style={[styles.scoreLeft, num]}>{view.lastRound && seat !== view.lastRound.winner ? `−${view.lastRound.left[seat]}` : ''}</Text>
                    <Text style={[styles.scoreValue, num]}>{view.scores[seat]}</Text>
                  </View>
                ))}
            </View>
            {award ? (
              <View style={styles.award}>
                <Star size={16} />
                <Text style={[styles.awardText, num]}>+{award.xp} XP</Text>
                {award.coins > 0 ? (
                  <>
                    <Coin size={14} />
                    <Text style={[styles.awardText, num]}>+{award.coins}</Text>
                  </>
                ) : null}
              </View>
            ) : null}
            {game.matchOver ? (
              <View style={styles.sheetButtons}>
                <Button label={g.back} onPress={onExit} />
                <Button label={t.newMatch} tone="strong" onPress={game.newMatch} />
              </View>
            ) : (
              <Button label={t.nextRound} tone="strong" onPress={game.nextRound} />
            )}
          </Animated.View>
        </View>
      ) : null}

      {confirmLeave ? (
        <ConfirmDialog
          title={lang.s.ui.leaveConfirm}
          confirmLabel={lang.s.ui.leaveConfirmYes}
          cancelLabel={lang.s.ui.leaveConfirmNo}
          onConfirm={onExit}
          onCancel={() => setConfirmLeave(false)}
          ground={ground.page}
          reduced={reduced}
        />
      ) : null}
    </SafeAreaView>
  );
}

function cardLabel(t: Lang['osmice'], c: OCard): string {
  const value = c.value === 'skip' || c.value === 'reverse' || c.value === 'draw2' || c.value === 'wild' || c.value === 'wild4' ? t.actionName[c.value] : c.value;
  return t.cardName(value, c.colour ? t.colour[c.colour] : null);
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.sm },
  title: { ...type.h3, color: ink.hi },
  target: { ...type.sub, color: ink.mid },
  opponents: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.md },
  opponent: {
    alignItems: 'center',
    width: 92,
    paddingVertical: space.xs,
    borderRadius: radius.md,
    backgroundColor: surface.panel,
    borderWidth: 1,
    borderColor: stroke.hair,
  },
  onTurn: { borderColor: signal.turn, backgroundColor: surface.raised },
  oppName: { ...type.caption, color: ink.hi, marginTop: 2, maxWidth: 84 },
  oppRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  oppCount: { ...type.sub, color: ink.hi },
  oppScore: { ...type.caption, color: ink.lo, marginLeft: 4 },
  bubble: { position: 'absolute', top: -10, right: -6, backgroundColor: theme.accent, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  bubbleText: { ...type.caption, color: garb.ink, fontFamily: font.bold },
  middle: { flex: 1, justifyContent: 'center', paddingHorizontal: space.lg },
  felt: { alignItems: 'center', paddingVertical: space.lg, borderRadius: radius.lg, borderWidth: 3 },
  piles: { flexDirection: 'row', alignItems: 'center', gap: space.xxl },
  deck: { borderRadius: radius.card, borderWidth: 2, borderColor: 'transparent' },
  deckLive: { borderColor: signal.turn },
  deckCount: { ...type.caption, color: ink.mid, textAlign: 'center', marginTop: 2 },
  pile: { borderRadius: radius.card + 2, borderWidth: 3, padding: 2 },
  colourRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
  colourDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: stroke.edge },
  colourText: { ...type.sub, color: ink.hi },
  direction: { ...type.h3, color: ink.mid },
  line: { ...type.body, color: ink.hi, marginTop: space.sm, minHeight: 40, textAlign: 'center', paddingHorizontal: space.md },
  me: { paddingTop: space.sm, paddingBottom: space.md, borderTopWidth: 1, borderTopColor: stroke.hair },
  meOnTurn: { borderTopColor: signal.turn },
  meRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, marginBottom: space.sm },
  meName: { ...type.sub, color: ink.hi, flexShrink: 1 },
  meScore: { ...type.sub, color: ink.mid, flex: 1 },
  hand: { paddingHorizontal: space.lg, paddingTop: 14, gap: HAND_GAP, alignItems: 'flex-end' },
  handCard: {},
  lifted: { transform: [{ translateY: -12 }] },
  dimmed: { opacity: 0.45 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: surface.scrim, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  sheet: { width: '100%', maxWidth: 420, borderRadius: radius.panel, padding: space.lg, gap: space.md, borderWidth: 1, borderColor: stroke.edge },
  sheetTitle: { ...type.h2, color: ink.hi, textAlign: 'center' },
  colourPick: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' },
  swatch: { width: 140, paddingVertical: space.md, borderRadius: radius.md, alignItems: 'center', borderWidth: 1, borderColor: stroke.edge },
  swatchText: { ...type.h3, color: garb.cream },
  scores: { gap: space.xs },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  scoreName: { ...type.body, color: ink.mid, flex: 1 },
  scoreMe: { color: ink.hi },
  scoreLeft: { ...type.sub, color: theme.dangerInk, width: 48, textAlign: 'right' },
  scoreValue: { ...type.h3, color: ink.hi, width: 56, textAlign: 'right' },
  award: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  awardText: { ...type.body, color: ink.hi },
  sheetButtons: { flexDirection: 'row', justifyContent: 'center', gap: space.md },
});
