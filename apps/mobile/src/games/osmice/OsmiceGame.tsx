import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
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
import { buzz, pattern } from '../../haptics';
import { loadProfile, saveProfile, type Settings } from '../../storage';
import { useMotionPolicy } from '../../anim/useMotionPolicy';
import { font, ink, num, radius, signal, space, stroke, surface, theme, type } from '../../theme';
import { garb } from '../../deck/palette';
import { TableBanner } from '../TableBanner';

/**
 * Osmice against the bots: the first table of the games beyond Bela.
 *
 * The person sits at seat 0, the bots round the table in play order above (in
 * landscape, down the left side, so the felt never sits on top of them). The
 * pile and the deck sit in the middle; the hand is a strip along the bottom,
 * sorted by colour, every card that may go now lifted, the rest shaded. A
 * wild asks for its colour. Between rounds a sheet shows the score; at the
 * end, the match and what it earned.
 */

const COLOURS: Colour[] = ['red', 'gold', 'green', 'blue'];
const HAND_GAP = 4;
/**
 * How much of an overlapped card stays in view: enough for its corner index
 * ("+2" is the widest), so a fanned hand still reads card by card.
 */
const PEEK = 0.36;
/** The room above the hand for a lifted card. */
const LIFT = 12;

/** The hand in colour order, numbers before actions, wilds last: a long hand reads at a glance. */
const COLOUR_ORDER: Record<Colour, number> = { red: 0, gold: 1, green: 2, blue: 3 };
const VALUE_ORDER = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2', 'wild', 'wild4'];
function byColour(a: OCard, b: OCard): number {
  const ca = a.colour === null ? 4 : COLOUR_ORDER[a.colour];
  const cb = b.colour === null ? 4 : COLOUR_ORDER[b.colour];
  return ca - cb || VALUE_ORDER.indexOf(a.value) - VALUE_ORDER.indexOf(b.value) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

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
 * What the last move did, in words: who played what, who took cards and lost
 * a go, who passed. One move arrives as a burst of events in the same tick
 * (a +4 is a card played, four drawn and a go skipped), so the line is built
 * from the whole burst rather than event by event, where each one used to
 * overwrite the one before. Returns null when the burst says nothing new.
 */
function describeMove(burst: OsmiceEvent[], me: number, t: Lang['osmice'], nameOf: (seat: number) => string): string | null {
  let parts: string[] | null = null;
  let afterPlay = false;
  let penalty: { seat: number; count: number } | null = null;
  const add = (s: string) => (parts ??= []).push(s);
  for (const e of burst) {
    switch (e.kind) {
      case 'matchStarted':
      case 'roundStarted':
        parts = [];
        afterPlay = false;
        break;
      case 'cardPlayed':
        parts = [];
        afterPlay = true;
        penalty = null;
        // The person knows what they played; for anyone else, it is the news.
        if (e.seat !== me) {
          const card = cardLabel(t, e.card);
          add(isWild(e.card) ? t.playedWild(nameOf(e.seat), card, t.colour[e.colour]) : t.played(nameOf(e.seat), card));
        }
        break;
      case 'reversed':
        add(t.reversed);
        break;
      case 'drew':
        if (afterPlay && e.penalty) {
          // Half of a +2 or +4: said together with the skip that follows.
          penalty = { seat: e.seat, count: e.count };
          break;
        }
        parts = [];
        afterPlay = false;
        if (e.seat !== me) add(t.drewCards(nameOf(e.seat), e.count));
        else if (e.penalty) add(t.drewCardsMe(e.count));
        break;
      case 'skipped':
        if (penalty && penalty.seat === e.seat) {
          add(e.seat === me ? t.drewAndSkippedMe(penalty.count) : t.drewAndSkipped(nameOf(e.seat), penalty.count));
          penalty = null;
        } else {
          add(e.seat === me ? t.skippedMe : t.skipped(nameOf(e.seat)));
        }
        break;
      case 'passed':
        parts = [];
        afterPlay = false;
        if (e.seat !== me) add(t.passed(nameOf(e.seat)));
        break;
      case 'roundOver':
        parts = [e.winner === me ? t.roundWonMe(e.points) : t.roundWon(nameOf(e.winner), e.points)];
        break;
      default:
        break;
    }
  }
  // A penalty with no skip after it (a rule set without one): still say who drew.
  if (penalty) add(penalty.seat === me ? t.drewCardsMe(penalty.count) : t.drewCards(nameOf(penalty.seat), penalty.count));
  return parts === null ? null : parts.join(' · ');
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
  const win = useWindowDimensions();
  const profileRef = useRef(loadProfile());

  const [remark, setRemark] = useState<string>('');
  const [award, setAward] = useState<Award | null>(null);
  const [lastCardSeat, setLastCardSeat] = useState<number | null>(null);

  // The events of one move arrive together; the line is written once they all have.
  const burst = useRef<OsmiceEvent[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const onEvent = useCallback(
    (e: OsmiceEvent) => {
      if (burst.current.length === 0) {
        queueMicrotask(() => {
          const events = burst.current;
          burst.current = [];
          const said = describeMove(events, me, t, (seat) => people[seat]!.name);
          if (said !== null) setRemark(said);
        });
      }
      burst.current.push(e);
      const levelCue = (got: Award) => {
        // A new level is its own moment, after the win or loss has sounded, as at Bela.
        if (got.levelUp === null) return;
        timers.current.push(
          setTimeout(() => {
            playSfx('levelup');
            pattern('levelUp');
          }, 700),
        );
      };
      switch (e.kind) {
        case 'roundStarted':
          setAward(null);
          setLastCardSeat(null);
          playSfx('shuffle');
          break;
        case 'cardPlayed':
          playSfx('play');
          break;
        case 'drew':
          playSfx('deal');
          break;
        case 'skipped':
          playSfx('knock');
          break;
        case 'reversed':
          playSfx('sort');
          break;
        case 'lastCard':
          playSfx('call');
          setLastCardSeat(e.seat);
          break;
        case 'roundOver': {
          const mine = e.winner === me;
          playSfx(mine ? 'win' : 'lose');
          if (mine) buzz('medium');
          // The round is over: "Zadnja!" has nothing left to warn about behind the sheet.
          setLastCardSeat(null);
          const r = applyRoundOutcome(profileRef.current, 'osmice', mine);
          profileRef.current = r.profile;
          saveProfile(r.profile);
          setAward(r.award);
          levelCue(r.award);
          break;
        }
        case 'matchOver': {
          const mine = e.winner === me;
          playSfx(mine ? 'matchWon' : 'matchLost');
          const r = applyGameMatchOutcome(profileRef.current, 'osmice', mine);
          profileRef.current = r.profile;
          saveProfile(r.profile);
          // The match's award joins the round's on the one sheet.
          setAward((prev) =>
            prev
              ? { xp: prev.xp + r.award.xp, coins: prev.coins + r.award.coins, levelUp: r.award.levelUp ?? prev.levelUp, reasons: [...prev.reasons, ...r.award.reasons] }
              : r.award,
          );
          levelCue(r.award);
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

  // A wild waits for its colour.
  const [wildFor, setWildFor] = useState<OCard | null>(null);
  // Online, the room's clock can play my move while the colour picker is
  // still open; the picker then names a colour for a card no longer in hand.
  useEffect(() => {
    if (!game.myTurn && wildFor) setWildFor(null);
  }, [game.myTurn, wildFor]);

  // Leaving mid-match asks first, from the back button too. Back closes what
  // is open over the table first: the leave question, then the colour picker.
  const [confirmLeave, setConfirmLeave] = useState(false);
  const leave = useCallback(() => {
    if (game.matchOver || (view.roundNumber <= 1 && view.handCounts.every((n) => n === 7))) onExit();
    else setConfirmLeave(true);
  }, [game.matchOver, view.roundNumber, view.handCounts, onExit]);
  useEffect(() => {
    const guard = () => {
      if (confirmLeave) setConfirmLeave(false);
      else if (wildFor) setWildFor(null);
      else leave();
      return true;
    };
    setBackGuard(guard);
    return () => clearBackGuard(guard);
  }, [leave, confirmLeave, wildFor]);

  const legal = view.legalActions;
  const playable = new Set(legal.filter((a) => a.type === 'PLAY').map((a) => (a as { cardId: string }).cardId));
  const canDraw = legal.some((a) => a.type === 'DRAW');
  const canPass = legal.some((a) => a.type === 'PASS');

  // A card that cannot go says so when tapped: a sound, a buzz and, on my
  // turn, a word in the status line for a moment.
  const [hint, setHint] = useState(false);
  useEffect(() => {
    if (!hint) return;
    const h = setTimeout(() => setHint(false), 1400);
    return () => clearTimeout(h);
  }, [hint]);
  const deny = () => {
    playSfx('denied');
    buzz('light');
    if (game.myTurn) setHint(true);
  };
  const tapCard = (c: OCard) => {
    if (!game.myTurn || !playable.has(c.id)) {
      deny();
      return;
    }
    setHint(false);
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

  // Sizes come from the space the table actually has, measured, not from the
  // window: on a tablet or in a browser the app sits in a narrower frame, and
  // the window's width put two dealt cards outside it.
  const [area, setArea] = useState<{ w: number; h: number } | null>(null);
  const [middle, setMiddle] = useState<{ w: number; h: number } | null>(null);
  const [stripW, setStripW] = useState<number | null>(null);
  // Where the header and the online strip under it end. The sheets and the
  // colour picker darken the table from there down, not the whole screen: the
  // header's Leave table stays in reach, and online the clock, the countdown
  // and a rematch vote's "start anyway" stay readable and pressable.
  const [headerBottom, setHeaderBottom] = useState(0);
  const measure = (set: (v: { w: number; h: number }) => void) => (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    set({ w: Math.round(w), h: Math.round(h) });
  };
  const areaW = area?.w ?? win.width;
  const areaH = area?.h ?? win.height - 60;
  const landscape = areaW > areaH;
  // The rail is wide enough for a three-digit score with its unit ("147 bodova")
  // beside the card count; scores run past 500 through most of a match.
  const sideW = landscape ? Math.round(Math.min(220, Math.max(184, areaW * 0.22))) : 0;
  // A tablet held upright has room to spare: bigger tiles for the others, a
  // bigger hand and pile, so the table fills the screen instead of floating
  // in a field of empty felt. Told by the height: in a browser the app sits
  // in a phone-wide frame, as tall as the tablet but no wider.
  const roomy = !landscape && areaH >= 900;
  // Their tiles share the width, four to a row (five on a wide screen), never
  // smaller than a phone's nor so big a row holds only two.
  const perRow = Math.max(1, Math.min(players - 1, areaW >= 700 ? 5 : 4));
  const tileW = roomy ? Math.round(Math.max(92, Math.min(128, (areaW - space.lg * 2 - space.md * (perRow - 1)) / perRow))) : undefined;

  // The hand: one card size for the whole round, whatever the hand's length,
  // so the table does not jump as cards come and go. As wide as seven cards
  // fanned at 40% each fill the strip, and never taller than the hand's share
  // of the height: the rest is the pile's.
  const inner = (stripW ?? areaW - sideW) - space.lg * 2;
  const handCard = Math.round(Math.max(40, Math.min(roomy ? 170 : 120, inner / (1 + 6 * 0.4), (areaH * (landscape ? 0.34 : roomy ? 0.21 : 0.18)) / 1.5)));

  const ground = room();
  const order = othersAfter(me, players);
  const name = (seat: number) => people[seat]!.name;

  // Sorted by colour; the card just drawn goes first and is ringed, so the
  // one card that may go is never off at the far end of a long hand.
  const hand = useMemo(() => {
    const sorted = view.hand.slice().sort(byColour);
    const drawnId = view.drawn?.id;
    const i = drawnId ? sorted.findIndex((c) => c.id === drawnId) : -1;
    if (i > 0) sorted.unshift(sorted.splice(i, 1)[0]!);
    return sorted;
  }, [view.hand, view.drawn]);
  // Side by side while they fit; then fanned, each showing at least its corner; past that, it scrolls.
  const n = hand.length;
  const step = n <= 1 || n * handCard + (n - 1) * HAND_GAP <= inner ? handCard + HAND_GAP : Math.max(handCard * PEEK, (inner - handCard) / (n - 1));
  const overflow = n > 1 && handCard + (n - 1) * step > inner + 1;
  const handScroll = useRef<ScrollView>(null);
  const firstLive = game.myTurn ? hand.findIndex((c) => playable.has(c.id)) : -1;
  useEffect(() => {
    if (firstLive < 0) return;
    handScroll.current?.scrollTo({ x: Math.max(0, (firstLive - 1) * step), animated: !reduced });
  }, [firstLive, view.drawn?.id, step, reduced]);

  // The pile from what the middle has left once the words under it are placed.
  const words = landscape ? 56 : roomy ? 210 : 180;
  const pileFromH = middle ? (middle.h - words) / 1.5 : landscape ? 64 : 88;
  // Across: the middle's and the felt's padding, the felt's rim, the gap
  // between the two, and each card's own frame (the pile's ring, the deck's
  // edge). Counted in full, now that a tall screen lets the cap stop binding.
  const pileFromW = landscape ? 130 : middle ? (middle.w - space.lg * 2 - space.md * 2 - 6 - space.xxl - 20) / 2 : 88;
  const pileCard = Math.round(Math.max(44, Math.min(landscape ? 110 : roomy ? 240 : 150, pileFromH, pileFromW)));

  const status = game.myTurn
    ? hint
      ? t.cantPlay
      : view.pendingDraw > 0
        ? t.mustTake(view.pendingDraw)
        : view.drawn
          ? t.drewPlayable
          : t.yourTurn
    : game.actor !== null
      ? t.turnOf(name(game.actor))
      : '';

  const opponents = order.map((seat) => (
    <OpponentTile
      key={seat}
      compact={landscape}
      tileW={tileW}
      person={people[seat]!}
      cards={view.handCounts[seat]!}
      score={view.scores[seat]!}
      onTurn={view.toAct === seat}
      lastCard={lastCardSeat === seat}
      reduced={reduced}
      t={t}
    />
  ));

  const felt = (
    <View style={[styles.middle, landscape && styles.middleLand]} onLayout={measure(setMiddle)}>
      <View style={[styles.felt, landscape && styles.feltLand, roomy && styles.feltRoomy, { backgroundColor: ground.felt, borderColor: ground.rim }]}>
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
        <View style={[styles.words, landscape && styles.wordsLand]}>
          <View style={[styles.colourRow, landscape && styles.colourRowLand]}>
            <View style={[styles.colourDot, { backgroundColor: OSMICE_INK[view.colour] }]} />
            <Text style={styles.colourText}>{t.activeColour(t.colour[view.colour])}</Text>
            <Text style={styles.direction}>{view.direction === 1 ? '↻' : '↺'}</Text>
          </View>
          {/* What just happened, and whose go it is now: two lines, so neither hides the other. */}
          <Text style={[styles.remark, landscape && styles.textLand]} numberOfLines={2} accessibilityLiveRegion="polite">
            {remark}
          </Text>
          <Text style={[styles.status, landscape ? styles.textLand : styles.statusTwoLines]} numberOfLines={2}>
            {status}
          </Text>
        </View>
      </View>
    </View>
  );

  const mine = (
    <View style={[styles.me, game.myTurn && styles.meOnTurn]} onLayout={(e) => setStripW(Math.round(e.nativeEvent.layout.width))}>
      <View style={styles.meRow}>
        <Avatar id={people[me]!.avatar} size={28} />
        <Text style={styles.meName} numberOfLines={1}>
          {people[me]!.name}
        </Text>
        {lastCardSeat === me ? <LastCard text={t.lastCard} reduced={reduced} /> : null}
        <Text style={[styles.meScore, num]} numberOfLines={1}>
          {t.score}: {view.scores[me]}
        </Text>
        {canPass && game.myTurn ? <Button label={t.pass} compact onPress={() => game.submit({ type: 'PASS', seat: me })} /> : null}
        {canDraw && game.myTurn && !view.drawn ? <Button label={t.draw} compact tone="strong" onPress={() => game.submit({ type: 'DRAW', seat: me })} /> : null}
      </View>
      <ScrollView
        ref={handScroll}
        horizontal
        style={{ height: handCard * 1.5 + LIFT + 2 }}
        contentContainerStyle={styles.hand}
        // Shown when the hand runs past the strip, so it is plain there is more.
        showsHorizontalScrollIndicator={overflow}
      >
        {hand.map((c, i) => {
          const live = game.myTurn && playable.has(c.id);
          const drawn = view.drawn?.id === c.id;
          return (
            <View key={c.id} style={[{ marginLeft: i === 0 ? 0 : step - handCard }, live && styles.lifted]}>
              <Pressable
                onPress={() => tapCard(c)}
                accessibilityRole="button"
                accessibilityLabel={drawn ? `${cardLabel(t, c)}, ${t.drawnTag}` : cardLabel(t, c)}
                // Disabled, not only shaded: react-native-web writes aria-disabled from this prop
                // alone, so a card that cannot go says so to a screen reader in a browser too.
                disabled={!live}
              >
                <OsmiceCard card={c} width={handCard} />
                {game.myTurn && !live ? <View pointerEvents="none" style={[styles.shade, { borderRadius: handCard * 0.09 }]} /> : null}
                {drawn ? <View pointerEvents="none" style={[styles.drawnRing, { borderRadius: handCard * 0.09 }]} /> : null}
              </Pressable>
              {/* A card that cannot go still answers a tap. Not from inside the button: a disabled
                  <button> in a browser swallows a mouse click on anything in it. A layer over it,
                  hidden from screen readers (the button below says "disabled" to them); a
                  scroll takes the touch away from it first, so a swipe across the hand is silent. */}
              {!live ? (
                <View
                  style={styles.catcher}
                  onStartShouldSetResponder={() => true}
                  onResponderRelease={deny}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                />
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: ground.page }]}>
      {/* header, and the online strip under it */}
      <View
        onLayout={(e) => {
          const { y, height } = e.nativeEvent.layout;
          setHeaderBottom(Math.round(y + height));
        }}
      >
        <View style={styles.header}>
          <Button label={lang.s.ui.leaveTable} compact onPress={leave} />
          <Text style={styles.title}>{t.name}</Text>
          <Text style={styles.target}>{t.target(view.matchTarget)}</Text>
        </View>
        <TableBanner />
      </View>

      <View style={[styles.body, landscape && styles.bodyLand]} onLayout={measure(setArea)}>
        {landscape ? (
          <>
            {/* the others down the side, where the felt cannot cover them */}
            <ScrollView style={[styles.sideRail, { width: sideW }]} contentContainerStyle={styles.side}>
              {opponents}
            </ScrollView>
            <View style={styles.main}>
              {felt}
              {mine}
            </View>
          </>
        ) : (
          <>
            <View style={[styles.opponents, roomy && styles.opponentsRoomy]}>{opponents}</View>
            {felt}
            {mine}
          </>
        )}
      </View>

      {/* a wild's colour */}
      {wildFor ? (
        <View style={[styles.scrim, { top: headerBottom }]}>
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
        // In landscape the sheet starts under the header (and online under the
        // strip too), which leaves a phone about 250px: too little for six rows
        // stacked over the award and the button. So it goes wide instead, the
        // scores on the left and the award and buttons beside them, and every
        // player's row is in view without a scroll.
        <View style={[styles.scrim, landscape && styles.scrimLand, { top: headerBottom }]}>
          <Animated.View
            entering={reduced ? undefined : FadeInDown.duration(200)}
            style={[styles.sheet, styles.sheetTall, landscape && styles.sheetWide, { backgroundColor: ground.page }]}
          >
            <Text style={styles.sheetTitle}>{sheetTitle(t, view.lastRound, game.matchOver, me, name)}</Text>
            <View style={landscape ? styles.sheetCols : styles.sheetStack}>
              <RoundScores t={t} people={people} me={me} scores={view.scores} last={view.lastRound} wide={landscape} />
              <View style={landscape ? styles.sheetSide : styles.sheetFoot}>
                {award && (award.xp > 0 || award.coins > 0 || award.levelUp !== null) ? (
                  <View style={styles.award}>
                    {award.xp > 0 ? (
                      <>
                        <Star size={16} />
                        <Text style={[styles.awardText, num]}>+{award.xp} XP</Text>
                      </>
                    ) : null}
                    {award.coins > 0 ? (
                      <>
                        <Coin size={14} />
                        <Text style={[styles.awardText, num]}>+{award.coins}</Text>
                      </>
                    ) : null}
                    {/* A new level, the way Bela's sheet says it. */}
                    {award.levelUp !== null ? (
                      <Text style={[styles.levelText, num]}>
                        {lang.s.ui.level} {award.levelUp}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                {game.matchOver ? (
                  // Beside the scores the column is too narrow for two buttons
                  // side by side ("Nova partija"), so there they stack.
                  <View style={landscape ? styles.sheetButtonsSide : styles.sheetButtons}>
                    <Button label={g.back} onPress={onExit} />
                    <Button label={t.newMatch} tone="strong" onPress={game.newMatch} />
                  </View>
                ) : (
                  <Button label={t.nextRound} tone="strong" onPress={game.nextRound} />
                )}
              </View>
            </View>
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

/** The sheet's heading: the person's own win in their own words ("You win!", never "You wins!"). */
function sheetTitle(t: Lang['osmice'], last: { winner: number; points: number } | null, matchOver: boolean, me: number, name: (seat: number) => string): string {
  if (!last) return '';
  const mine = last.winner === me;
  if (matchOver) return mine ? t.matchWonMe : t.matchWon(name(last.winner));
  return mine ? t.roundWonMe(last.points) : t.roundWon(name(last.winner), last.points);
}

/**
 * The round sheet's table. Only the winner scores in Osmice, so only the
 * winner's row carries a "+": the others' leftover cards are what the winner
 * was paid, shown plainly beside a small card, not as red points taken off
 * them (their totals never change). The round's winner comes first.
 */
function RoundScores({
  t,
  people,
  me,
  scores,
  last,
  wide,
}: {
  t: Lang['osmice'];
  people: Person[];
  me: number;
  scores: number[];
  last: { winner: number; points: number; left: number[] } | null;
  /** Beside the award and buttons (landscape) rather than above them. */
  wide: boolean;
}) {
  const rows = scores.map((_, seat) => seat).sort((a, b) => (last ? Number(b === last.winner) - Number(a === last.winner) : 0) || scores[b]! - scores[a]!);
  // On a screen too short for every row the list scrolls; its bar shows for a
  // moment when the sheet opens (and stays, on Android), so a row below the
  // edge is never silently out of sight.
  const list = useRef<ScrollView>(null);
  useEffect(() => {
    const id = setTimeout(() => list.current?.flashScrollIndicators?.(), 250);
    return () => clearTimeout(id);
  }, []);
  return (
    <ScrollView ref={list} style={[styles.scores, wide && styles.scoresWide]} contentContainerStyle={styles.scoresInner} persistentScrollbar>
      <View style={styles.scoreRow} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={styles.scoreAvatar} />
        <Text style={styles.scoreName} />
        <Text style={styles.scoreHead}>{t.roundColumn}</Text>
        <Text style={[styles.scoreHead, styles.scoreHeadTotal]}>{t.totalColumn}</Text>
      </View>
      {rows.map((seat) => {
        const won = last !== null && seat === last.winner;
        const left = last ? last.left[seat]! : 0;
        const said = won ? `+${last!.points}` : last ? t.leftInHand(left) : '';
        return (
          <View key={seat} style={styles.scoreRow} accessible accessibilityLabel={`${people[seat]!.name}, ${said}, ${t.totalColumn}: ${t.points(scores[seat]!)}`}>
            <Avatar id={people[seat]!.avatar} size={22} />
            <Text style={[styles.scoreName, seat === me && styles.scoreMe, won && styles.scoreWinner]} numberOfLines={1}>
              {people[seat]!.name}
            </Text>
            <View style={styles.scoreRound}>
              {won ? (
                <Text style={[styles.scoreGain, num]}>+{last!.points}</Text>
              ) : last ? (
                <>
                  <OsmiceCard card={null} width={10} />
                  <Text style={[styles.scoreLeft, num]}>{left}</Text>
                </>
              ) : null}
            </View>
            <Text style={[styles.scoreValue, num]}>{scores[seat]}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

/** "Zadnja!": over a tile's corner, or in line under a name or beside my own. */
function LastCard({ text, reduced, over = false }: { text: string; reduced: boolean; over?: boolean }) {
  return (
    <Animated.View entering={reduced ? undefined : FadeInDown.duration(160)} style={[styles.bubble, over && styles.bubbleOver]}>
      <Text style={styles.bubbleText} numberOfLines={1}>
        {text}
      </Text>
    </Animated.View>
  );
}

/**
 * One of the others: who, how many cards, and their score — the score with
 * its unit ("188 bodova"), so the two numbers are not mistaken for each other.
 * In landscape a compact row, so five fit down the side of a phone; on a
 * tablet held upright a bigger tile, `tileW` wide.
 */
function OpponentTile({
  person,
  cards,
  score,
  onTurn,
  lastCard,
  compact,
  tileW,
  reduced,
  t,
}: {
  person: Person;
  cards: number;
  score: number;
  onTurn: boolean;
  lastCard: boolean;
  compact: boolean;
  tileW?: number;
  reduced: boolean;
  t: Lang['osmice'];
}) {
  const label = `${person.name}, ${t.cardsLeft(cards)}, ${t.points(score)}`;
  const big = tileW !== undefined;
  const count = (
    <View style={styles.oppRow}>
      <OsmiceCard card={null} width={compact ? 12 : big ? 20 : 14} />
      <Text style={[big ? styles.oppCountBig : styles.oppCount, num]}>{cards}</Text>
    </View>
  );
  if (compact) {
    return (
      <View style={[styles.opponent, styles.opponentCompact, onTurn && styles.onTurn]} accessible accessibilityLabel={label}>
        <Avatar id={person.avatar} size={28} />
        <View style={styles.oppText}>
          <Text style={styles.oppName} numberOfLines={1}>
            {person.name}
          </Text>
          <View style={styles.oppLine}>
            {count}
            {/* "Zadnja!" stands in for the score for its moment, under the name: in
                the row beside it, it squeezed the name down to one letter. */}
            {lastCard ? (
              <LastCard text={t.lastCard} reduced={reduced} />
            ) : (
              <Text style={[styles.oppScore, num]} numberOfLines={1}>
                {t.points(score)}
              </Text>
            )}
          </View>
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.opponent, big && [styles.opponentBig, { width: tileW }], onTurn && styles.onTurn]} accessible accessibilityLabel={label}>
      <Avatar id={person.avatar} size={big ? 48 : 34} />
      <Text style={[styles.oppName, styles.oppNameTile, big && [styles.oppNameBig, { maxWidth: tileW - space.sm * 2 }]]} numberOfLines={1}>
        {person.name}
      </Text>
      {count}
      <Text style={[big ? styles.oppScoreBig : styles.oppScore, num]} numberOfLines={1}>
        {t.points(score)}
      </Text>
      {lastCard ? <LastCard text={t.lastCard} reduced={reduced} over /> : null}
    </View>
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
  body: { flex: 1, minHeight: 0 },
  bodyLand: { flexDirection: 'row' },
  main: { flex: 1, minWidth: 0 },
  // A ScrollView grows to fill a row by default; the rail keeps its width.
  sideRail: { flexGrow: 0, flexShrink: 0 },
  side: { paddingLeft: space.md, paddingTop: space.sm, paddingBottom: space.md, gap: space.sm },
  opponents: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.md, paddingTop: space.sm },
  // On a tablet the others spread across the top rather than huddle in the middle.
  opponentsRoomy: { justifyContent: 'space-evenly', gap: space.md, paddingHorizontal: space.lg, paddingTop: space.md },
  opponent: {
    alignItems: 'center',
    width: 92,
    paddingVertical: space.xs,
    borderRadius: radius.md,
    backgroundColor: surface.panel,
    borderWidth: 1,
    borderColor: stroke.hair,
  },
  opponentBig: { paddingVertical: space.sm },
  opponentCompact: { width: '100%', flexDirection: 'row', gap: space.sm, paddingHorizontal: space.sm },
  onTurn: { borderColor: signal.turn, backgroundColor: surface.raised },
  oppText: { flex: 1, minWidth: 0 },
  oppName: { ...type.caption, color: ink.hi, maxWidth: 140 },
  oppNameTile: { marginTop: 2, maxWidth: 84 },
  oppNameBig: { ...type.sub, marginTop: space.xs },
  oppLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 2 },
  oppRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  oppCount: { ...type.sub, color: ink.hi },
  oppCountBig: { ...type.body, color: ink.hi },
  oppScore: { ...type.caption, color: ink.mid, marginTop: 1 },
  oppScoreBig: { ...type.sub, color: ink.mid, marginTop: 2 },
  bubble: { flexShrink: 1, backgroundColor: theme.accent, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  bubbleOver: { position: 'absolute', top: -8, right: -4 },
  bubbleText: { ...type.caption, color: garb.ink, fontFamily: font.bold },
  // The middle can only ever have what is left: it never paints over the others or the hand.
  middle: { flex: 1, minHeight: 0, overflow: 'hidden', justifyContent: 'center', paddingHorizontal: space.lg },
  middleLand: { paddingHorizontal: space.md, paddingVertical: space.xs },
  felt: { alignItems: 'center', paddingVertical: space.md, paddingHorizontal: space.md, borderRadius: radius.lg, borderWidth: 3 },
  feltLand: { flexDirection: 'row', paddingVertical: space.sm, gap: space.lg },
  // On a tall screen the table takes the whole middle, the piles and the words
  // spread down it, rather than a small felt with a band of bare page above and below.
  feltRoomy: { flex: 1, justifyContent: 'space-evenly', marginVertical: space.md },
  piles: { flexDirection: 'row', alignItems: 'center', gap: space.xxl },
  deck: { borderRadius: radius.card, borderWidth: 2, borderColor: 'transparent' },
  deckLive: { borderColor: signal.turn },
  deckCount: { ...type.caption, color: ink.mid, textAlign: 'center', marginTop: 2 },
  pile: { borderRadius: radius.card + 2, borderWidth: 3, padding: 2 },
  words: { alignItems: 'center', alignSelf: 'stretch' },
  wordsLand: { flex: 1, minWidth: 0, alignItems: 'flex-start' },
  colourRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  colourRowLand: { marginTop: 0 },
  colourDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: stroke.edge },
  colourText: { ...type.sub, color: ink.hi },
  direction: { ...type.h3, color: ink.mid },
  remark: { ...type.sub, color: ink.mid, marginTop: 6, minHeight: type.sub.lineHeight * 2, textAlign: 'center', paddingHorizontal: space.sm },
  status: { ...type.body, color: ink.hi, fontFamily: font.bold, marginTop: 2, textAlign: 'center', paddingHorizontal: space.sm },
  // Two lines' room whether it says one or two, so the felt under it never jumps as it wraps.
  statusTwoLines: { minHeight: type.body.lineHeight * 2 },
  textLand: { textAlign: 'left', paddingHorizontal: 0 },
  me: { paddingTop: space.sm, paddingBottom: space.sm, borderTopWidth: 1, borderTopColor: stroke.hair },
  meOnTurn: { borderTopColor: signal.turn },
  meRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, marginBottom: space.xs },
  meName: { ...type.sub, color: ink.hi, flexShrink: 1 },
  meScore: { ...type.sub, color: ink.mid, flex: 1 },
  hand: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: space.lg, paddingTop: LIFT + 2, alignItems: 'flex-end' },
  lifted: { transform: [{ translateY: -LIFT }] },
  // A shade over the card rather than see-through: fanned, a faded card let the one under it show through.
  shade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: surface.scrim },
  catcher: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  drawnRing: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 3, borderColor: theme.accent },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: surface.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },
  // Landscape: every pixel of height goes to the rows.
  scrimLand: { paddingVertical: space.sm },
  sheet: { width: '100%', maxWidth: 420, borderRadius: radius.panel, padding: space.lg, gap: space.md, borderWidth: 1, borderColor: stroke.edge },
  sheetTall: { maxHeight: '100%' },
  sheetWide: { maxWidth: 620, paddingVertical: space.md, gap: space.sm },
  // The portrait sheet's one column; the scores in it may shrink and scroll.
  sheetStack: { gap: space.md, flexShrink: 1, minHeight: 0 },
  sheetFoot: { gap: space.md },
  sheetCols: { flexDirection: 'row', alignItems: 'center', gap: space.lg, flexShrink: 1, minHeight: 0 },
  sheetSide: { width: 200, gap: space.md, justifyContent: 'center' },
  sheetButtonsSide: { gap: space.sm },
  sheetTitle: { ...type.h2, color: ink.hi, textAlign: 'center' },
  colourPick: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' },
  swatch: { width: 140, paddingVertical: space.md, borderRadius: radius.md, alignItems: 'center', borderWidth: 1, borderColor: stroke.edge },
  swatchText: { ...type.h3, color: garb.cream },
  scores: { flexGrow: 0, flexShrink: 1 },
  // Beside the award and buttons it takes the rest of the width, and the row's
  // full height. Spelled out rather than `flex: 1`: the `flexGrow: 0` above
  // would win over the shorthand, and the list would shrink to no width at all.
  scoresWide: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, alignSelf: 'stretch' },
  scoresInner: { gap: space.xs },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  scoreAvatar: { width: 22 },
  scoreName: { ...type.body, color: ink.mid, flex: 1 },
  scoreMe: { color: ink.hi },
  scoreWinner: { color: ink.hi, fontFamily: font.bold },
  scoreHead: { ...type.caption, color: ink.lo, width: 64, textAlign: 'right' },
  scoreHeadTotal: { width: 56 },
  scoreRound: { width: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  scoreGain: { ...type.sub, color: theme.accent, fontFamily: font.bold },
  scoreLeft: { ...type.sub, color: ink.lo },
  scoreValue: { ...type.h3, color: ink.hi, width: 56, textAlign: 'right' },
  award: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' },
  awardText: { ...type.body, color: ink.hi },
  levelText: { ...type.body, color: theme.accent, fontFamily: font.bold, marginLeft: space.sm },
  sheetButtons: { flexDirection: 'row', justifyContent: 'center', gap: space.md },
});
