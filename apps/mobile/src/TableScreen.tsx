import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type {
  Action,
  Card,
  DealProgress,
  DealScoreResult,
  PublicView,
  Seat,
  TeamId,
} from '@belot/engine';
import { cardId, teamOf } from '@belot/engine';
import type { Lang } from '@belot/i18n';
import { levelProgress, type Award, type PlayerProfile } from '@belot/progression';
import { Anchor, AnchorHost, type AnchorMap } from './anim/AnchorRegistry';
import { EffectsOverlay } from './anim/EffectsOverlay';
import { REVEAL_MS } from './anim/director';
import { COIN_CASCADE_COUNT, coinsLandedMs } from './anim/lifetimes';
import { useLaggedNumber } from './ui/useLaggedNumber';
import { anchorId, type FxBus } from './anim/FxBus';
import { SeatPuck } from './table/SeatPuck';
import {
  FAN_PAD,
  fanArc,
  fitHand,
  fitTrickCross,
  seatAt,
  seatPosition,
  slotOffsets,
  type Position,
} from './table/geometry';
import { useTableMetrics } from './table/useTableMetrics';
import { useHandOrder, type HandSort } from './table/useHandOrder';
import type { ConfirmPlay } from './storage';
import { TurnRing } from './anim/TurnRing';
import { cosmetics, feltStyle, type DeckStyle } from './cosmetics';
import { PerfProbe } from './dev/PerfProbe';
import { EmoteStrip } from './table/EmoteStrip';
import { useTurnCues } from './table/useTurnCues';
import { TurnBeacon } from './table/TurnBeacon';
import { FeltGlow } from './table/FeltGlow';
import { useReduceMotion } from './anim/useReduceMotion';
import { PlayingCard } from './PlayingCard';
import { SuitPip } from './deck';
import { playSfx, type Sfx } from './audio';
import { buzz } from './haptics';
import { radius, team, theme } from './theme';
import { isPartner, seatTone } from './table/teamColour';

/**
 * The table, drawn from one seat's point of view — the social-poker layout:
 * opponents as avatar pucks with countdown rings, the felt in the middle with a
 * trick slot per seat, your hand fanned at the bottom, and a transparent
 * effects overlay on top for everything that flies.
 *
 * Purely presentational and seat-agnostic: it renders a `PublicView` (which,
 * during animations, is the director's paced view) and a set of legal actions,
 * and knows nothing about where they came from. Offline and online render
 * through exactly this component.
 */

export interface SeatMeta {
  name: string;
  /** Preset avatar id; missing or unknown falls back to the initial letter. */
  avatar?: string | null;
  bot: boolean;
  connected: boolean;
}

/** Offline bots wear fixed faces so the table feels inhabited. */
const BOT_AVATARS: readonly string[] = ['djed', 'brko', 'teta', 'kapetan'];

export interface TableScreenProps {
  mySeat: Seat;
  lang: Lang;
  view: PublicView;
  options: Action[];
  myTurn: boolean;
  settled: boolean;
  matchOver: boolean;
  lastDealResult: DealScoreResult | null;
  matchScores: readonly [number, number];
  winnerTeam: TeamId | null;
  profile: PlayerProfile;
  banner: Award | null;
  /** Per-seat presence; falls back to relative labels for missing entries. */
  seatMeta?: (SeatMeta | null)[];
  status?: string | null;
  /** The seat whose move is being animated right now — presentation only, never `toAct`. */
  spotlightSeat?: Seat | null;
  anchors: AnchorMap;
  fxBus: FxBus;
  /** Absolute epoch deadline for the active seat's ring; null = soft ring. */
  turnDeadline?: number | null;
  turnTotalMs?: number;
  onAction: (a: Action) => void;
  onNext: () => void;
  onFinish: () => void;
  finishLabel: string;
  /** When set, the emote tray is available and sends through here. */
  onEmote?: (id: string) => void;
  /** Rematch flow (online): the series score and the accept controls. */
  /** How the player wants the hand laid out; persisted in Settings. */
  handSort?: HandSort;
  onHandSortChange?: (m: HandSort) => void;
  /** Misclick guard; 'ambiguous' (default) only asks when the card is a choice. */
  confirmPlay?: ConfirmPlay;
  series?: readonly [number, number] | null;
  askedRematch?: boolean;
  waitingFor?: number;
  onRematch?: () => void;
  onForceRematch?: () => void;
  /**
   * "Prava bela": no card assist — every card is tappable, and an illegal one
   * is a renons the engine punishes. The claim/bela buttons stay unassisted too.
   */
  hardMode?: boolean;
}

export function TableScreen(props: TableScreenProps) {
  const {
    mySeat, lang, view, options, myTurn, settled, matchOver, lastDealResult,
    matchScores, winnerTeam, profile, banner, seatMeta, status, anchors, fxBus, spotlightSeat = null,
    turnDeadline = null, turnTotalMs, onAction, onNext, onFinish, finishLabel, onEmote,
    hardMode = false, series, askedRematch, waitingFor, onRematch, onForceRematch,
    handSort = 'auto', onHandSortChange, confirmPlay = 'ambiguous',
  } = props;

  // Every dimension the table draws is derived from the real window, so eight
  // cards fit one row on a 320dp phone, grow on a tablet, and rearrange into
  // three columns when the phone is turned on its side.
  const m = useTableMetrics();
  const land = m.orientation === 'landscape';
  const reduced = useReduceMotion();

  // The trick cross is sized against the felt it is drawn in, not the window:
  // a landscape felt is a short wide ellipse and window-sized cards hang out
  // through its rim. Measured, because the felt is what flex left over.
  const [feltBox, setFeltBox] = useState({ w: 0, h: 0 });
  const slot = useMemo(
    () => fitTrickCross(feltBox.w, feltBox.h, m.slotH),
    [feltBox.w, feltBox.h, m.slotH],
  );
  const slots = useMemo(() => slotOffsets(slot.slotW, slot.slotH), [slot.slotW, slot.slotH]);

  const [arranging, setArranging] = useState(false);
  // The zvanja round: you mark the cards that make up your combination, then
  // confirm. The engine is the judge — a marking that is not a real zvanje
  // announces nothing, so this can never claim more than the hand holds.
  const [marked, setMarked] = useState<string[]>([]);
  const declaring = !settled && view.declareTurn === mySeat;
  // Does the marking actually form one of the zvanja this hand holds? In normal
  // play the app already knows them, so it arms the button only on a real
  // combination rather than letting the engine bounce a mistake back as an
  // error. In blind mode it stays armed regardless — the app refuses to spot
  // them for you there, so an honest miss is the whole point.
  const markedKey = [...marked].sort().join('|');
  const markingIsZvanje =
    hardMode ||
    view.myDeclarations.some(
      (d) => d.cards.map((c) => cardId(c)).sort().join('|') === markedKey,
    );
  const toggleMark = useCallback(
    (id: string) =>
      setMarked((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id])),
    [],
  );
  // A fresh question gets a clean slate.
  useEffect(() => {
    if (!declaring) setMarked([]);
  }, [declaring, view.dealer, view.declareTurn]);
  const hand = useHandOrder(view.hand, view.context.trumpSuit, handSort, onHandSortChange ?? (() => {}));

  // The tray closes on send; the cooldown mirrors the server's rate limit so
  // a spammed tap dies here instead of being silently dropped over the wire.
  const [trayOpen, setTrayOpen] = useState(false);
  const emoteReadyAt = useRef(0);
  const sendEmote = (id: string) => {
    setTrayOpen(false);
    if (!onEmote || Date.now() < emoteReadyAt.current) return;
    emoteReadyAt.current = Date.now() + 2500;
    // No sound here: the pop belongs to the bubble, which follows the echo.
    onEmote(id);
  };

  // Bela runs counter-clockwise, so the seat that acts AFTER me sits on my
  // RIGHT. Pucks and trick slots read the same map, so they can never drift
  // apart and fly a card to the wrong side of the table.
  const at = (pos: Position) => seatAt(pos, mySeat);

  const meta = (s: Seat): SeatMeta =>
    seatMeta?.[s] ?? {
      name: lang.seat(s, mySeat),
      avatar: s === mySeat ? null : BOT_AVATARS[s],
      bot: s !== mySeat,
      connected: true,
    };

  const puck = (s: Seat) => (
    <SeatPuck
      seat={s}
      name={meta(s).name}
      avatar={meta(s).avatar}
      cards={view.handCounts[s]}
      isDealer={view.dealer === s}
      isBot={meta(s).bot}
      connected={meta(s).connected}
      active={view.toAct === s}
      tone={seatTone(s, mySeat)}
      partner={isPartner(s, mySeat)}
      size={m.puck}
      deadline={turnDeadline}
      totalMs={turnTotalMs}
      thinking={spotlightSeat === s}
      reduced={reduced}
    />
  );

  // A ring of light bursts from the hand as a cue lands — the sound's
  // visible twin, fired from the very same edge so it can never be held on.
  const pulseHand = useCallback(() => {
    const at = anchors.centre(anchorId.seat(mySeat));
    if (at) fxBus.emit({ kind: 'pulse', at, speed: 1 });
  }, [anchors, fxBus, mySeat]);

  // Your turn, your call, your clock running out.
  useTurnCues({
    myTurn,
    mustDeclare: view.mustDeclare,
    canDeclare: view.canDeclare === true,
    deadline: turnDeadline,
    settled,
    onTurnEdge: pulseHand,
    onDeclareEdge: pulseHand,
  });

  const trump = view.context.trumpSuit;
  const baize = feltStyle(profile.selectedFelt);
  // Read once per render and passed down: the memoised cards must see a deck
  // change as a changed prop, not peek at module state and miss it.
  const deck = cosmetics().deckStyle;
  // Dev-only frame/render probe, toggled by long-pressing the profile bar.
  const [probe, setProbe] = useState(false);
  const toggleProbe = useCallback(() => setProbe((p) => !p), []);

  // ---------------------------------------------------------------------
  // The pieces, built once and placed by whichever layout is in force. Both
  // orientations render the SAME nodes, so every anchor stays single-sourced
  // and a rotation cannot leave sprites flying to a slot that moved.
  // ---------------------------------------------------------------------

  // The cards come DOWN again after a few seconds. Remembering what was shown is
  // part of playing the game well — leaving them up would turn that memory into
  // a reference sheet. A tap puts them away early for anyone who reads faster.
  const revealKey = view.revealedDeclarations
    .flatMap((d) => d.cards.map((c) => cardId(c)))
    .join('|');
  const [revealDone, setRevealDone] = useState(false);
  useEffect(() => {
    if (revealKey === '') return;
    setRevealDone(false);
    const t = setTimeout(() => setRevealDone(true), REVEAL_MS);
    return () => clearTimeout(t);
  }, [revealKey]);

  // The winning side's combinations, laid out for everyone. Only ever the
  // winner's: the losing side said its number and keeps its cards. A group
  // never wraps, so its cards shrink until the longest one fits the table.
  const revealLongest = Math.max(1, ...view.revealedDeclarations.map((d) => d.cards.length));
  const revealCardW = Math.min(
    Math.round(m.slotW * 1.1),
    Math.floor((m.width - 24 - 16 - 2 * (revealLongest - 1)) / revealLongest),
  );
  const revealRow =
    view.revealedDeclarations.length > 0 && !revealDone ? (
      <Pressable style={styles.revealRow} onPress={() => setRevealDone(true)}>
        {view.revealedDeclarations.map((d, i) => (
          <View key={i} style={styles.revealGroup}>
            <Text style={styles.revealLabel}>
              {meta(d.seat).name}: {lang.declaration(d)}
            </Text>
            <View style={styles.revealCards}>
              {d.cards.map((c) => (
                <PlayingCard key={cardId(c)} card={c} width={revealCardW} deckStyle={deck} />
              ))}
            </View>
          </View>
        ))}
      </Pressable>
    ) : null;

  const awardRow = banner ? (
    <View style={styles.awardRow}>
      <Text style={styles.awardText}>
        +{banner.xp} XP{banner.coins > 0 ? `   +${banner.coins} ●` : ''}
        {banner.levelUp !== null ? `   ★ ${lang.s.ui.level} ${banner.levelUp}` : ''}
      </Text>
    </View>
  ) : null;

  const feltBody = (
    <View
      style={[
        styles.felt,
        { backgroundColor: baize.felt, borderColor: baize.rim },
        // Landscape hangs the partner over the far rim, so the felt starts
        // just below their disc rather than below their whole puck.
        land && { marginTop: Math.round(m.puck * 0.5) },
      ]}
    >
      <View
        style={styles.feltInner}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setFeltBox((b) =>
            Math.abs(b.w - width) < 1 && Math.abs(b.h - height) < 1 ? b : { w: width, h: height },
          );
          // The felt is the only row that flexes: when a prompt or the result
          // sheet resizes it, every slot and puck inside has moved without its
          // own layout changing. Tell the anchors.
          anchors.bump();
        }}
      >
        {/* the light on the baize, under everything else on it */}
        <FeltGlow width={feltBox.w} height={feltBox.h} felt={baize.felt} />

        {/* the deck: cards are dealt from the felt's centre, whichever way up
            the table is — the plaque moves to the left lobe in landscape. */}
        <Anchor id={anchorId.deck} style={styles.deckAnchor} />

        {/* centre plaque: trump + multiplier */}
        <Anchor id={anchorId.plaque} style={[styles.plaque, land ? styles.plaqueLand : styles.plaquePortrait]}>
          {trump ? (
            <>
              <SuitPip suit={trump} size={30} />
              {view.multiplier > 1 && <Text style={styles.plaqueMult}>×{view.multiplier}</Text>}
            </>
          ) : (
            <Text style={styles.subDim}>{lang.s.trumpUndecided}</Text>
          )}
          {/* Sideways the plate is a single row along the bottom rim; the caller
              line would double its height into the bottom slot. */}
          {!land && view.callerSeat !== null && (
            <Text style={styles.plaqueCaller}>{lang.s.calledBy(meta(view.callerSeat).name)}</Text>
          )}
        </Anchor>

        {/* one trick slot per seat, positioned by table side */}
        {([0, 1, 2, 3] as Seat[]).map((s) => {
          const pos = seatPosition(s, mySeat);
          const played = view.currentTrick.find((p) => p.seat === s);
          return (
            <Anchor
              key={s}
              id={anchorId.slot(s)}
              style={[
                styles.slot,
                { width: slot.slotW, height: slot.slotH },
                slots[pos],
                // NB: nothing else goes in this array. `slots[pos]` places the
                // card with marginLeft / marginTop, and react-native-web emits
                // a `margin` shorthand as real CSS, which resets both of them:
                // a `margin: -2` composed here once put all four played cards
                // on the same pixel in the browser. Decoration is a child.
              ]}
            >
              {played ? (
                <>
                  <PlayingCard card={played.card} width={slot.slotW} deckStyle={deck} />
                  {/* Whose card this is, at a glance. Drawn OUTSIDE the card: a
                      border on the slot itself sat under the card's own edge
                      and was never actually seen. */}
                  <View
                    pointerEvents="none"
                    style={[styles.slotRing, { borderColor: seatTone(s, mySeat).edge }]}
                  />
                </>
              ) : (
                <View style={[styles.slotGhost, { borderColor: seatTone(s, mySeat).dim }]} />
              )}
            </Anchor>
          );
        })}
      </View>
    </View>
  );

  // Rows that appear for a moment — the zvanja reveal, the award — float
  // over the lower table instead of pushing the hand down. Over the whole
  // table area, not the felt: the felt's inner width on a phone is 140-184px
  // and a four-card sequence needs 190.
  const tableFloat = (
    <View style={styles.tableFloat} pointerEvents="box-none">
      {revealRow}
      {awardRow}
    </View>
  );

  const felt = land ? (
    // Sideways there is no room for a row above the table AND a row below it,
    // so the partner sits on the far rim the way they would at a real table.
    <View
      style={[styles.tableArea, { maxHeight: m.feltMaxHeight }]}
      onLayout={() => anchors.bump()}
    >
      <View style={styles.midRow}>
        <View style={styles.sideSeat}>{puck(at('left'))}</View>
        {feltBody}
        <View style={styles.sideSeat}>{puck(at('right'))}</View>
      </View>
      <View style={styles.landTopSeat} pointerEvents="box-none">
        {puck(at('top'))}
      </View>
      {tableFloat}
    </View>
  ) : (
    <View
      style={[styles.tableArea, { minHeight: m.feltMinHeight, maxHeight: m.feltMaxHeight }]}
      // A row above the felt moves the whole area without resizing the felt
      // inside it; this frame changes even when feltInner's does not.
      onLayout={() => anchors.bump()}
    >
      <View style={styles.topSeat}>{puck(at('top'))}</View>
      <View style={styles.midRow}>
        <View style={styles.sideSeat}>{puck(at('left'))}</View>
        {feltBody}
        <View style={styles.sideSeat}>{puck(at('right'))}</View>
      </View>
      {tableFloat}
    </View>
  );

  // Running zvanja record (bubbles are transient; this stays).
  // Once the winner's cards are on the table, their chip is saying the same
  // thing twice. The losing side's chips stay: they said their number out loud
  // and that is the only record of it.
  const revealedSeats = new Set(view.revealedDeclarations.map((d) => d.seat));
  const spokenCalls = view.announcedDeclarations.filter((d) => !revealedSeats.has(d.seat));
  // Gone with the deal: the chips were still hanging over the result sheet.
  const calls =
    !settled && (spokenCalls.length > 0 || view.belaAnnouncedBy !== null) ? (
      <View style={[styles.callsRow, land && styles.callsCol]}>
        {spokenCalls.map((d, i) => (
          <View key={i} style={[styles.callChip, land && styles.callChipLand]}>
            <Text style={[styles.callChipText, land && styles.callChipTextLand]}>
              {meta(d.seat).name}: {lang.declaration(d)}
            </Text>
          </View>
        ))}
        {view.belaAnnouncedBy !== null && (
          <View style={[styles.callChip, styles.callChipGold, land && styles.callChipLand]}>
            <Text style={[styles.callChipText, land && styles.callChipTextLand]}>
              {meta(view.belaAnnouncedBy).name}: {lang.s.bela} (20)
            </Text>
          </View>
        )}
      </View>
    ) : null;

  // Prompts that need words, not just buttons.
  const promptRows = (
    <>
      {declaring && (
        <View style={styles.promptRow}>
          <Text style={styles.promptText}>{lang.s.askZvanja}</Text>
          <Text style={styles.promptHint}>
            {marked.length === 0
              ? lang.s.markZvanjaHint
              : markingIsZvanje
                ? lang.s.markingOk
                : lang.s.markingNotZvanje}
          </Text>
        </View>
      )}
      {!settled && !declaring && view.mustDeclare && view.myDeclarations.length > 0 && (
        <View style={styles.promptRow}>
          <Text style={styles.promptText}>
            {lang.s.declarations}:{' '}
            {view.myDeclarations.map((d) => lang.declaration({ ...d, seat: mySeat })).join(', ')}
          </Text>
          {!m.compact && <Text style={styles.promptHint}>{lang.s.declareHint}</Text>}
        </View>
      )}
      {!settled && view.canDeclare === true && (
        <View style={styles.promptRow}>
          <Text style={styles.promptHint}>{lang.s.claimZvanjaHint}</Text>
        </View>
      )}
      {arranging && (
        <View style={styles.promptRow}>
          <Text style={styles.promptText}>{lang.s.ui.arrangeHint}</Text>
          <Button label={lang.s.ui.arrangeDone} tone="strong" onPress={() => setArranging(false)} />
        </View>
      )}
      {!settled && view.canAnnounceBela && !hardMode && (
        <View style={styles.promptRow}>
          <Text style={styles.promptText}>{lang.s.belaHint}</Text>
        </View>
      )}
    </>
  );
  // Portrait reserves the row's height, so a prompt coming or going never
  // moves the hand under your thumb; a compact phone cannot spare it, and
  // landscape flexes the felt instead.
  const prompts =
    !land && !m.compact ? <View style={styles.promptsReserve}>{promptRows}</View> : promptRows;

  // My hand, fanned; the seat anchor for sprites sits underneath it.
  const handBlock = (
    <Anchor id={anchorId.seat(mySeat)} style={[styles.handArea, { minHeight: m.handMinHeight }]}>
      {/* "Your turn", as light along the top of the hand. On the RENDERED
          turn prop: it fades across a drain and is never held on. */}
      {myTurn && !settled && <TurnBeacon reduced={reduced} />}
      <Pressable
        onLongPress={() => {
          playSfx('tap');
          setArranging((a) => !a);
        }}
        delayLongPress={500}
      >
        <Hand
          cards={hand.cards}
          options={options}
          enabled={myTurn}
          onPlay={onAction}
          freePlay={hardMode}
          width={m.handWidth}
          maxCardW={m.handCardMax}
          arranging={arranging}
          onSwap={hand.swap}
          marking={declaring}
          marked={marked}
          onToggleMark={toggleMark}
          confirmPlay={confirmPlay}
          deckStyle={deck}
          reduced={reduced}
          armCaption={lang.s.ui.play}
        />
      </Pressable>
      {/* online, my own turn is on the clock too — show it */}
      {myTurn && turnDeadline !== null && (
        <View style={styles.myTimer} pointerEvents="none">
          <TurnRing size={36} deadline={turnDeadline} totalMs={turnTotalMs} />
        </View>
      )}
    </Anchor>
  );

  // A fixed 34px (or one column wide), so it never reflows the felt.
  const emotes =
    !settled && onEmote ? (
      <EmoteStrip lang={lang} open={trayOpen} dimmed={myTurn} vertical={land} onSend={sendEmote} />
    ) : null;

  // "Prijavi" / "Nemam" — the two answers, and nothing else while the table is
  // waiting on you.
  const declareButtons = declaring ? (
    <>
      <Button
        label={lang.s.declareMarked}
        tone={marked.length >= 3 && markingIsZvanje ? 'strong' : 'plain'}
        compact={land}
        onPress={() => {
          if (marked.length < 3 || !markingIsZvanje) return;
          const cards = hand.cards.filter((c) => marked.includes(cardId(c)));
          onAction({ type: 'DECLARE_ANNOUNCE', seat: mySeat, cards });
        }}
      />
      <Button
        label={lang.s.noneToDeclare}
        tone="plain"
        compact={land}
        onPress={() => onAction({ type: 'DECLARE_SKIP', seat: mySeat })}
      />
    </>
  ) : null;

  const emoteToggle = onEmote ? (
    <Pressable
      onPress={() => setTrayOpen((o) => !o)}
      hitSlop={8}
      style={[styles.emoteToggle, trayOpen && styles.emoteToggleOn]}
    >
      <Text style={styles.emoteToggleText}>😄</Text>
    </Pressable>
  ) : null;

  // Every row that comes and goes around the felt — status line, zvanja
  // chips, a prompt — moves the pucks, slots and hand
  // without any of them changing their own layout (and on the web onLayout
  // is a ResizeObserver: a pure move fires nothing). Re-measure after each
  // such commit, so the next sprite flies to where things are now.
  const reflowKey = [
    // The text itself, not just its presence: a second line moves things too.
    status ?? '',
    spokenCalls.length,
    view.belaAnnouncedBy ?? '-',
    declaring ? 1 : 0,
    !settled && !declaring && view.mustDeclare && view.myDeclarations.length > 0 ? 1 : 0,
    arranging ? 1 : 0,
    !settled && view.canAnnounceBela && !hardMode ? 1 : 0,
  ].join('|');
  useEffect(() => {
    anchors.bump();
  }, [anchors, reflowKey]);

  const resultSheet = settled ? (
    <View style={styles.resultBackdrop} pointerEvents="box-none">
      <DealResult
        lang={lang}
        maxHeight={Math.round(m.height * 0.92)}
        result={lastDealResult}
        matchScores={matchScores}
        matchOver={matchOver}
        winnerLabel={winnerTeam !== null ? lang.team(winnerTeam, mySeat) : ''}
        renonsText={
          lastDealResult?.renonsSeat != null
            ? lang.s.renonsBy(meta(lastDealResult.renonsSeat).name)
            : null
        }
        series={series}
        askedRematch={askedRematch}
        waitingFor={waitingFor}
        onRematch={onRematch}
        onForceRematch={onForceRematch}
        onNext={onNext}
        onFinish={onFinish}
        finishLabel={finishLabel}
      />
    </View>
  ) : null;

  return (
    <AnchorHost map={anchors}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        {/* A rotation or a window resize moves everything at once. */}
        <View style={[styles.root, land && styles.rootLand]} onLayout={() => anchors.bump()}>
          {land ? (
            // Turned sideways there is no vertical room to stack chrome above
            // and below the felt, so everything that is not the table itself
            // moves into the two rails and the middle keeps its full height.
            <>
              <View style={[styles.rail, { width: m.railW }]}>
                <ProfileBar profile={profile} vertical onLongPress={toggleProbe} />
                <TableHeader
                  lang={lang}
                  mySeat={mySeat}
                  matchScores={matchScores}
                  progress={view.dealProgress}
                  vertical
                />
                {calls}
                <View style={styles.railGap} />
                <Button label={finishLabel} tone="plain" compact onPress={onFinish} />
              </View>

              <View style={styles.centre}>
                {status ? <Text style={styles.status}>{status}</Text> : null}
                {felt}
                {prompts}
                {handBlock}
              </View>

              <View style={[styles.rail, styles.railRight, { width: m.railW }]}>
                {emotes}
                <View style={styles.railGap} />
                {!settled && (
                  <View style={styles.actionsCol}>
                    {declareButtons ?? (
                      <NonCardActions options={options} lang={lang} onChoose={onAction} compact />
                    )}
                    {emoteToggle}
                  </View>
                )}
              </View>
            </>
          ) : (
            <>
              {/* wallet / level strip */}
              <ProfileBar profile={profile} onLongPress={toggleProbe} />
              {status ? <Text style={styles.status}>{status}</Text> : null}

              {/* score strip: match score, plus this deal's running count */}
              <TableHeader
                lang={lang}
                mySeat={mySeat}
                matchScores={matchScores}
                progress={view.dealProgress}
              />

              {felt}
              {calls}
              {prompts}
              {handBlock}
              {emotes}

              {/* actions: bidding, declaring, bela, leave */}
              {!settled && (
                <View style={styles.actionsRow}>
                  {emoteToggle}
                  {declareButtons ?? (
                    <NonCardActions options={options} lang={lang} onChoose={onAction} />
                  )}
                  <Button label={finishLabel} tone="plain" onPress={onFinish} />
                </View>
              )}
            </>
          )}

          {resultSheet}

          {/* sprites, always last */}
          <EffectsOverlay bus={fxBus} />
          {__DEV__ && probe && <PerfProbe />}
        </View>
      </SafeAreaView>
    </AnchorHost>
  );
}

/**
 * The match score, and — while a deal is being played — the running count for
 * it, ending in the number a real table keeps in its head: how many points the
 * caller still needs.
 *
 * "Mi" is always the left pill. `matchScores` is indexed by absolute team id,
 * but which team is "us" depends on where you sit, so everything here is
 * ordered by `teamOf(mySeat)` and never by index 0/1.
 */
const TableHeader = memo(function TableHeader({
  lang,
  mySeat,
  matchScores,
  progress,
  vertical = false,
}: {
  lang: Lang;
  mySeat: Seat;
  matchScores: readonly [number, number];
  progress: DealProgress | null;
  /** Landscape puts the whole strip in the left rail, stacked. */
  vertical?: boolean;
}) {
  const us = teamOf(mySeat);
  const them = (1 - us) as TeamId;

  // While trick 1 is open a later zvanje can still move the target, so the
  // count is shown dimmed rather than hidden — it is honest, just not final.
  // Dim while anything can still move the bar: unsettled zvanja, or a bela
  // nobody has called yet. Presenting "prošlo" at full confidence and then
  // scoring the deal as a pad is the one thing this counter must never do.
  const settling = progress !== null && (progress.provisional || progress.belaPending);
  const live = progress ? (settling ? styles.dealCountDim : styles.dealCount) : null;

  return (
    <View style={[styles.scoreRow, vertical && styles.scoreCol]}>
      <View style={[styles.pillRow, vertical && styles.pillCol]}>
        <View style={[styles.teamPill, { backgroundColor: team.usDim, borderColor: team.usEdge }]}>
          <Text style={styles.pillLabel}>{lang.team(us, mySeat)}</Text>
          <Text style={[styles.pillValue, { color: team.usInk }]}>{matchScores[us]}</Text>
        </View>
        <View style={[styles.teamPill, { backgroundColor: team.themDim, borderColor: team.themEdge }]}>
          {/* Side by side the two pills mirror each other around the centre;
              stacked in a rail there is no centre, so both read label, value. */}
          {vertical && <Text style={styles.pillLabel}>{lang.team(them, mySeat)}</Text>}
          <Text style={[styles.pillValue, { color: team.themInk }]}>{matchScores[them]}</Text>
          {!vertical && <Text style={styles.pillLabel}>{lang.team(them, mySeat)}</Text>}
        </View>
      </View>

      {progress ? (
        <Text style={[live!, vertical && styles.centreText]}>
          {progress.running[us]} : {progress.running[them]}
          <Text style={styles.subDim}>
            {vertical ? '\n' : '   '}
            {progress.callerNeeds === 0
              ? lang.s.contractSafe
              : lang.s.needsMore(progress.callerNeeds)}
          </Text>
        </Text>
      ) : (
        <Text style={styles.subDim}>{lang.s.gameToTarget(1001)}</Text>
      )}
    </View>
  );
},
// The view hands over fresh arrays and progress objects every tick; compare
// what the header actually prints, or memo would never hit.
(a, b) =>
  a.lang === b.lang &&
  a.mySeat === b.mySeat &&
  a.vertical === b.vertical &&
  a.matchScores[0] === b.matchScores[0] &&
  a.matchScores[1] === b.matchScores[1] &&
  (a.progress === null) === (b.progress === null) &&
  (a.progress === null ||
    (a.progress.running[0] === b.progress!.running[0] &&
      a.progress.running[1] === b.progress!.running[1] &&
      a.progress.callerNeeds === b.progress!.callerNeeds &&
      a.progress.provisional === b.progress!.provisional &&
      a.progress.belaPending === b.progress!.belaPending)));

/** Level, XP progress and the coin balance; the coins are the wallet anchor. */
const ProfileBar = memo(
  function ProfileBar({
    profile,
    vertical = false,
    onLongPress,
  }: {
    profile: PlayerProfile;
    vertical?: boolean;
    /** Dev builds: toggles the frame/render probe. */
    onLongPress?: () => void;
  }) {
    const p = levelProgress(profile.xp);
    // The total changes when the last coin lands on it, not when the deal is
    // scored with the coins still in the air.
    const coins = useLaggedNumber(profile.coins, coinsLandedMs(COIN_CASCADE_COUNT));
    return (
      <Pressable
        onLongPress={onLongPress}
        delayLongPress={600}
        style={[styles.profileBar, vertical && styles.profileBarCol]}
      >
        <View style={styles.levelBadge}>
          <Text style={styles.levelText}>{p.level}</Text>
        </View>
        <View style={[styles.xpWrap, vertical && styles.xpWrapCol]}>
          <View style={styles.xpTrack}>
            <View style={[styles.xpFill, { width: `${Math.round(p.fraction * 100)}%` }]} />
          </View>
        </View>
        <Anchor id={anchorId.wallet}>
          <Text style={styles.coins}>{coins} ●</Text>
        </Anchor>
      </Pressable>
    );
  },
  (a, b) =>
    a.profile.xp === b.profile.xp &&
    a.profile.coins === b.profile.coins &&
    a.vertical === b.vertical &&
    a.onLongPress === b.onLongPress,
);

/** The hand as a fan. A card is tappable only when the engine says it is legal. */
function Hand({
  cards,
  options,
  enabled,
  onPlay,
  freePlay = false,
  width,
  maxCardW,
  arranging = false,
  marking = false,
  marked = [],
  onToggleMark,
  onSwap,
  confirmPlay = 'ambiguous',
  deckStyle,
  reduced = false,
  armCaption,
}: {
  cards: Card[];
  options: Action[];
  enabled: boolean;
  onPlay: (a: Action) => void;
  /** Hard mode: any card is tappable and nothing is dimmed or lifted as a hint. */
  freePlay?: boolean;
  /** Space the fan may use; the cards size themselves to fit it in ONE row. */
  width: number;
  /** Height budget, expressed as a card width; landscape sets it low. */
  maxCardW?: number;
  /** Arrange mode: taps swap cards and can never play one. */
  arranging?: boolean;
  onSwap?: (idA: string, idB: string) => void;
  /** Zvanja round: taps mark cards for a declaration and can never play one. */
  marking?: boolean;
  marked?: string[];
  onToggleMark?: (id: string) => void;
  confirmPlay?: ConfirmPlay;
  deckStyle: DeckStyle;
  /** Reduce-motion: the cards step up instead of springing. */
  reduced?: boolean;
  /** What the second tap on an armed card does, on the card. */
  armCaption?: string;
}) {
  const plays = options.filter(
    (a): a is Extract<Action, { type: 'PLAY_CARD' }> => a.type === 'PLAY_CARD',
  );
  const byCard = new Map<string, Extract<Action, { type: 'PLAY_CARD' }>>();
  for (const p of plays) {
    // Keep the plain play; the bela call has its own explicit button.
    const key = cardId(p.card);
    if (!byCard.has(key) || p.announceBela !== true) byCard.set(key, p);
  }

  // One tap arms a card, the second plays it — but never when the card is
  // forced, which in bela is most tricks. That keeps the guard exactly where a
  // mistake is possible without taxing the taps that cannot go wrong.
  //
  // "Forced" must count what the player can TAP, not what the engine calls
  // legal. In hard mode every card in hand is submittable, so deriving it from
  // the legal list relaxed the guard precisely when one legal card sat among
  // seven renons-scoring ones — the most dangerous tap surface in the game.
  const [armed, setArmed] = useState<string | null>(null);
  // Arrange mode picks a card to SWAP, which is a different meaning; sharing
  // one slot left a swap selection armed to fire the moment arranging ended.
  const [arrangePick, setArrangePick] = useState<string | null>(null);
  const tappable = freePlay && plays.length > 0 ? cards.length : byCard.size;
  const forced = tappable === 1;
  const needsConfirm =
    confirmPlay === 'always' ? true : confirmPlay === 'ambiguous' ? !forced : false;

  // Disarm whenever the decision in front of the player changes — a new turn, a
  // new trick, entering or leaving arrange mode. Nothing here changes while they
  // are deliberating, so this never cancels a legitimate arm.
  const decision = `${arranging}|${enabled}|${plays.map((p) => cardId(p.card)).join(',')}`;
  useEffect(() => {
    setArmed(null);
    setArrangePick(null);
  }, [decision]);

  const fit = fitHand(width, cards.length, maxCardW);
  const mid = (cards.length - 1) / 2;
  const lift = 14 * fit.scale;
  // The arc pushes the outer cards DOWN, and `alignItems: flex-end` had already
  // put them on the floor of the row — so they hung out of the bottom of the
  // hand and under the emote strip, covering the faces you are choosing between.
  const drop = fanArc(cards.length) * fit.scale;

  /** What a tap on this card means right now. Reads the latest render's state. */
  const chosenFor = (card: Card) => {
    const id = cardId(card);
    const inPlayMoment = plays.length > 0;
    // Hard mode: every card is submittable — the engine, not the UI, is
    // the judge, and a wrong card is a renons.
    return (
      byCard.get(id) ??
      (freePlay && inPlayMoment
        ? ({ type: 'PLAY_CARD', seat: plays[0]!.seat, card } as Action)
        : undefined)
    );
  };

  const press = (id: string) => {
    if (marking) {
      onToggleMark?.(id);
      return;
    }
    if (arranging) {
      if (arrangePick === null) setArrangePick(id);
      else {
        if (arrangePick !== id) onSwap?.(arrangePick, id);
        setArrangePick(null);
      }
      return;
    }
    const card = cards.find((c) => cardId(c) === id);
    const chosen = card ? chosenFor(card) : undefined;
    if (!chosen) return;
    if (needsConfirm && armed !== id) {
      // Arming is a decision too; it used to happen in silence.
      playSfx('tap');
      buzz('select');
      setArmed(id);
      return;
    }
    setArmed(null);
    onPlay(chosen);
  };
  // One identity for the life of the hand, so a memoised card is not
  // re-rendered just because its handler closed over a new render.
  const pressRef = useRef(press);
  pressRef.current = press;
  const onPressCard = useCallback((id: string) => pressRef.current(id), []);

  return (
    <View style={[styles.fan, { paddingBottom: drop }]}>
      {cards.map((card, i) => {
        const id = cardId(card);
        const inPlayMoment = plays.length > 0;
        const playable = !arranging && !marking && enabled && chosenFor(card) !== undefined;
        const illegalNow = !freePlay && !arranging && enabled && inPlayMoment && !playable;
        const isArmed = marking ? marked.includes(id) : arranging ? arrangePick === id : armed === id;
        const off = i - mid;
        const picking = arranging || marking;
        return (
          <FanCard
            key={id}
            id={id}
            card={card}
            width={fit.cardW}
            deckStyle={deckStyle}
            marginLeft={i === 0 ? 0 : fit.overlap}
            baseY={Math.pow(Math.abs(off), 1.6) * 3.2 * fit.scale}
            lift={playable || (picking && isArmed) ? -lift : 0}
            // The lift ripples out from the middle of the fan, 30 ms a card.
            rippleDelay={Math.abs(off) * 30}
            reduced={reduced}
            rotate={off * 4.5}
            zIndex={i}
            dimmed={illegalNow}
            highlight={playable && !freePlay && !isArmed}
            selected={picking && isArmed}
            armed={!picking && isArmed}
            caption={armCaption}
            disabled={!playable && !arranging && !marking}
            onPress={onPressCard}
          />
        );
      })}
    </View>
  );
}

/**
 * One card in the fan. Memoised so that a director tick — which re-renders the
 * whole table — only re-renders the cards whose position, legality or state
 * actually changed. Every prop is a primitive or a stable callback except the
 * card itself, which is compared by identity of suit and rank.
 */
const FanCard = memo(
  function FanCard({
    id,
    card,
    width,
    deckStyle,
    marginLeft,
    baseY,
    lift,
    rippleDelay,
    reduced,
    rotate,
    zIndex,
    dimmed,
    highlight,
    selected,
    armed,
    caption,
    disabled,
    onPress,
  }: {
    id: string;
    card: Card;
    width: number;
    deckStyle: DeckStyle;
    marginLeft: number;
    /** The fan's arc: where this card sits when it is not lifted. */
    baseY: number;
    /** Lifted (negative) or resting; animated, never jumped. */
    lift: number;
    /** How long after the middle card this one moves — the ripple. */
    rippleDelay: number;
    reduced: boolean;
    rotate: number;
    zIndex: number;
    dimmed: boolean;
    highlight: boolean;
    selected: boolean;
    armed: boolean;
    caption?: string;
    disabled: boolean;
    onPress: (id: string) => void;
  }) {
    // The lift used to be a 14 px jump on the frame the turn arrived. Now the
    // playable cards spring up from the middle outward; a card that stops
    // being playable settles back the same way.
    const liftV = useSharedValue(lift);
    useEffect(() => {
      liftV.value = reduced
        ? withTiming(lift, { duration: 120 })
        : withDelay(rippleDelay, withSpring(lift, { damping: 16, stiffness: 190, mass: 0.6 }));
    }, [liftV, lift, rippleDelay, reduced]);
    const motion = useAnimatedStyle(() => ({
      transform: [{ translateY: baseY + liftV.value }, { rotateZ: `${rotate}deg` }],
    }));
    return (
      <Animated.View style={[styles.fanCard, { marginLeft, zIndex }, motion]}>
        <Pressable
          disabled={disabled}
          onPress={() => onPress(id)}
          // Vertical only: horizontal slop would overlap the neighbouring
          // card in touch space and make mis-taps MORE likely, not less.
          hitSlop={{ top: 12, bottom: 8 }}
        >
          <PlayingCard
            card={card}
            width={width}
            deckStyle={deckStyle}
            dimmed={dimmed}
            highlight={highlight}
            selected={selected}
            armed={armed}
            caption={caption}
          />
        </Pressable>
      </Animated.View>
    );
  },
  (a, b) =>
    a.id === b.id &&
    a.card.suit === b.card.suit &&
    a.card.rank === b.card.rank &&
    a.width === b.width &&
    a.deckStyle === b.deckStyle &&
    a.marginLeft === b.marginLeft &&
    a.baseY === b.baseY &&
    a.lift === b.lift &&
    a.rippleDelay === b.rippleDelay &&
    a.reduced === b.reduced &&
    a.rotate === b.rotate &&
    a.zIndex === b.zIndex &&
    a.dimmed === b.dimmed &&
    a.highlight === b.highlight &&
    a.selected === b.selected &&
    a.armed === b.armed &&
    a.caption === b.caption &&
    a.disabled === b.disabled &&
    a.onPress === b.onPress,
);

/** Bidding, declaring, and the explicit bela call. */
function NonCardActions({
  options,
  lang,
  onChoose,
  compact = false,
}: {
  options: Action[];
  lang: Lang;
  onChoose: (a: Action) => void;
  compact?: boolean;
}) {
  const buttons = options.filter((a) => a.type !== 'PLAY_CARD' || a.announceBela === true);
  return (
    <>
      {buttons.map((a, i) => {
        const isBela = a.type === 'PLAY_CARD';
        const strong = a.type === 'DECLARE_ANNOUNCE' || a.type === 'BID_CALL';
        return (
          <Button
            key={i}
            label={lang.action(a)}
            tone={isBela ? 'bela' : strong ? 'strong' : 'plain'}
            compact={compact}
            onPress={() => onChoose(a)}
          />
        );
      })}
    </>
  );
}

function DealResult({
  lang,
  maxHeight,
  result,
  matchScores,
  matchOver,
  winnerLabel,
  renonsText,
  series,
  askedRematch = false,
  waitingFor = 0,
  onRematch,
  onForceRematch,
  onNext,
  onFinish,
  finishLabel,
}: {
  lang: Lang;
  /** The sheet scrolls rather than run off a short (landscape) screen. */
  maxHeight: number;
  result: DealScoreResult | null;
  matchScores: readonly [number, number];
  matchOver: boolean;
  winnerLabel: string;
  renonsText?: string | null;
  /** Matches won per side since this roster sat down; online only. */
  series?: readonly [number, number] | null;
  /** Has this seat already asked for another match? */
  askedRematch?: boolean;
  /** How many players have yet to accept. */
  waitingFor?: number;
  onRematch?: () => void;
  onForceRematch?: () => void;
  onNext: () => void;
  onFinish: () => void;
  finishLabel: string;
}) {
  if (!result) return null;
  const row = (label: string, v: readonly [number, number]) => (
    <View style={styles.resultRow} key={label}>
      <Text style={styles.resultLabel}>{label}</Text>
      <Text style={styles.resultValue}>
        {v[0]} : {v[1]}
      </Text>
    </View>
  );

  return (
    <ScrollView
      style={[styles.resultPanel, { maxHeight }]}
      contentContainerStyle={styles.resultContent}
    >
      <Text style={styles.resultTitle}>{lang.s.dealResult}</Text>
      {row(lang.s.cardsAndLastTrick, result.trickPoints)}
      {result.valatTeam !== null && row(lang.s.valat, result.valatBonus)}
      {result.declarationPoints[0] + result.declarationPoints[1] > 0 &&
        row(lang.s.declarations, result.declarationPoints)}
      {/* Announced above, credited to the OTHER side in "Upisano" below — say
          so, rather than letting the reader hunt for the missing points. */}
      {result.tricksWon.some((t, i) => t === 0 && result.declarationPoints[i]! > 0) && (
        <Text style={styles.voidNote}>{lang.s.zvanjaNoTrickToOpponents}</Text>
      )}
      {result.bela[0] + result.bela[1] > 0 && row(lang.s.bela, result.bela)}
      {row(lang.s.total, result.rawTotal)}
      {renonsText ? (
        <Text style={[styles.verdict, styles.failed]}>
          {lang.s.renonsTitle} {renonsText}
        </Text>
      ) : (
        <Text style={[styles.verdict, result.callerMade ? styles.made : styles.failed]}>
          {result.callerMade ? lang.s.callerMade : lang.s.callerFailed}
        </Text>
      )}
      {row(lang.s.recorded, result.finalScore)}
      {row(lang.s.matchScore, matchScores)}

      {matchOver ? (
        <>
          <Text style={styles.winner}>{lang.s.winner(winnerLabel)}</Text>
          {series && (
            <Text style={styles.seriesLine}>
              {lang.s.ui.seriesScore}  {series[0]} : {series[1]}
            </Text>
          )}
          {onRematch && (
            <>
              {askedRematch ? (
                <Text style={styles.subDim}>
                  {waitingFor > 0 ? lang.s.ui.waitingForRematch(waitingFor) : lang.s.ui.rematchAsked}
                </Text>
              ) : (
                <Button label={lang.s.ui.playAgain} tone="strong" onPress={onRematch} />
              )}
              {/* The host never has to wait on somebody who has wandered off. */}
              {onForceRematch && askedRematch && waitingFor > 0 && (
                <Button label={lang.s.ui.startAnyway} tone="plain" onPress={onForceRematch} />
              )}
            </>
          )}
          <Button label={finishLabel} tone="plain" onPress={onFinish} />
        </>
      ) : (
        <View style={styles.resultButtons}>
          <Button label={lang.s.nextDeal} tone="strong" onPress={onNext} />
          <Button label={finishLabel} tone="plain" onPress={onFinish} />
        </View>
      )}
    </ScrollView>
  );
}

export function Button({
  label,
  onPress,
  tone = 'plain',
  compact = false,
  sound = 'tap',
}: {
  label: string;
  onPress: () => void;
  tone?: 'plain' | 'strong' | 'bela';
  /** Landscape rail size: caption type, tighter padding, a label wraps at most once. */
  compact?: boolean;
  /**
   * The click. Every button makes it — the bid, declare and rematch buttons
   * were mute while the leave button clicked — and the button makes it
   * itself, so no caller wraps its handler in a second one. `null` for a
   * press whose own sound follows at once (claiming coins).
   */
  sound?: Sfx | null;
}) {
  const toneStyle: StyleProp<ViewStyle> =
    tone === 'strong' ? styles.btnStrong : tone === 'bela' ? styles.btnBela : styles.btnPlain;
  return (
    <Pressable
      onPress={() => {
        if (sound) playSfx(sound);
        buzz('select');
        onPress();
      }}
      style={({ pressed }) => [
        styles.btn,
        toneStyle,
        compact && styles.btnCompact,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[styles.btnText, compact && styles.btnTextCompact]}
        numberOfLines={compact ? 2 : undefined}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.feltDeep },
  root: { flex: 1, padding: 12, gap: 8 },
  // Landscape: two narrow rails of chrome with the table between them.
  rootLand: { flexDirection: 'row', paddingVertical: 6, gap: 6 },
  rail: { gap: 6, alignItems: 'center' },
  railRight: { justifyContent: 'flex-end' },
  railGap: { flex: 1 },
  centre: { flex: 1, gap: 6 },

  profileBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  levelBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: theme.wood,
    borderWidth: 1,
    borderColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelText: { color: theme.accent, fontWeight: '800', fontSize: 12 },
  profileBarCol: { flexDirection: 'column', gap: 6, paddingVertical: 8, alignSelf: 'stretch' },
  xpWrap: { flex: 1 },
  // A column has no width to give the bar, so pin it instead of flexing.
  xpWrapCol: { flex: 0, alignSelf: 'stretch' },
  xpTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  xpFill: { height: 5, backgroundColor: theme.accent },
  coins: { color: theme.accent, fontWeight: '700', fontSize: 14 },

  status: { color: theme.accent, fontSize: 12, textAlign: 'center' },

  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  scoreCol: { flexDirection: 'column', gap: 4, alignItems: 'center', alignSelf: 'stretch' },
  centreText: { textAlign: 'center' },
  scoreText: {},
  scoreLabel: { color: theme.textDim, fontSize: 13 },
  scoreValue: { color: theme.text, fontSize: 20, fontWeight: '800' },
  subDim: { color: theme.textDim, fontSize: 12 },
  seriesLine: { color: theme.textDim, fontSize: 13, textAlign: 'center' },
  pillRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  pillCol: { flexDirection: 'column', gap: 4, alignSelf: 'stretch' },
  teamPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  pillLabel: { color: theme.textDim, fontSize: 12, fontWeight: '600' },
  pillValue: { fontSize: 17, fontWeight: '800' },
  dealCount: { color: theme.accent, fontSize: 13, fontWeight: '700' },
  dealCountDim: { color: theme.textDim, fontSize: 13, fontWeight: '700' },

  tableArea: { flex: 1 },
  topSeat: { alignItems: 'center' },
  landTopSeat: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
  midRow: { flex: 1, flexDirection: 'row', alignItems: 'stretch', gap: 4 },
  sideSeat: { justifyContent: 'center' },

  felt: {
    flex: 1,
    backgroundColor: theme.felt,
    borderRadius: 999,
    borderWidth: 6,
    borderColor: theme.wood,
    padding: 5,
    marginVertical: 4,
  },
  feltInner: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Sits in the felt's upper lobe, clear of the trick cross at the centre.
  // A plate on the baize, not a pip floating in space.
  plaque: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
    gap: 1,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  // Sits in the felt's upper lobe, clear of the trick cross at the centre.
  plaquePortrait: { top: '5%' },
  // Landscape parks the partner on the top rim and the trick cross fills the
  // felt's width, so the plate lies along the bottom rim as one row.
  plaqueLand: { bottom: '2%', flexDirection: 'row', gap: 6, paddingVertical: 3 },
  plaqueMult: { color: theme.accent, fontSize: 13, fontWeight: '800' },
  plaqueCaller: { color: theme.textDim, fontSize: 12 },

  slot: { position: 'absolute', width: 46, height: 67 },
  slotGhost: {
    // A place a card will go, marked the way a table mat is: a dashed outline
    // in the seat's colour over a shade of shadow. Four hard-edged boxes read
    // as placeholders that failed to load; four faint ones read as nothing.
    opacity: 0.7,
    flex: 1,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  // Sits 3px outside the played card, so the card's own edge cannot cover it.
  slotRing: {
    position: 'absolute',
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderWidth: 2,
    borderRadius: radius.card + 2,
  },
  deckAnchor: { position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 },
  tableFloat: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '4%',
    alignItems: 'center',
    gap: 6,
  },

  myTimer: { position: 'absolute', right: 8, top: -20, width: 36, height: 36 },

  callsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  revealRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  revealGroup: { alignItems: 'center', gap: 2 },
  revealLabel: { color: theme.accent, fontSize: 11, fontWeight: '700' },
  revealCards: { flexDirection: 'row', gap: 2 },
  callsCol: { flexDirection: 'column', flexWrap: 'nowrap', alignSelf: 'stretch' },
  callChip: {
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  callChipGold: { borderWidth: 1, borderColor: theme.accent },
  callChipText: { color: theme.text, fontSize: 12 },
  // The rail is 96dp wide: caption type and tighter padding. Never a line
  // cap — the chip is the only record of what a side called, and the rank
  // at the end of it is the tie-break.
  callChipTextLand: { fontSize: 11 },
  callChipLand: { paddingHorizontal: 8, alignSelf: 'stretch' },

  awardRow: { alignItems: 'center' },
  awardText: { color: theme.ok, fontWeight: '800', fontSize: 15 },

  promptRow: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: theme.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
  },
  promptText: { color: theme.accent, fontWeight: '700', fontSize: 13 },
  promptsReserve: { minHeight: 54, justifyContent: 'flex-end', gap: 8 },
  promptHint: { color: theme.textDim, fontSize: 12 },

  handArea: { justifyContent: 'flex-end' },
  fan: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    // Shared with fanHeight(), which reserves the row this padding sits in.
    paddingTop: FAN_PAD,
  },
  fanCard: {},

  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 2,
  },
  actionsCol: { gap: 6, alignItems: 'stretch', alignSelf: 'stretch' },

  emoteToggle: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoteToggleOn: { borderColor: theme.accent },
  emoteToggleText: { fontSize: 20 },

  pressed: { opacity: 0.7, transform: [{ translateY: 2 }] },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.line,
  },
  btnPlain: { backgroundColor: 'rgba(255,255,255,0.07)' },
  btnStrong: { backgroundColor: theme.wood, borderColor: theme.accent },
  btnBela: { backgroundColor: theme.accent, borderColor: theme.accent },
  btnText: { color: theme.text, fontSize: 14, fontWeight: '600' },
  btnCompact: { paddingHorizontal: 8, paddingVertical: 7 },
  btnTextCompact: { fontSize: 11, textAlign: 'center' },

  resultBackdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  resultPanel: {
    backgroundColor: theme.feltDeep,
    borderTopLeftRadius: radius.panel + 6,
    borderTopRightRadius: radius.panel + 6,
    borderWidth: 1,
    borderColor: theme.line,
    flexGrow: 0,
  },
  resultContent: { padding: 16, gap: 4 },
  resultTitle: { color: theme.text, fontWeight: '800', fontSize: 16, marginBottom: 4 },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between' },
  resultLabel: { color: theme.textDim, fontSize: 14 },
  voidNote: { color: theme.danger, fontSize: 12, fontStyle: 'italic' },
  resultValue: { color: theme.text, fontSize: 14, fontVariant: ['tabular-nums'] },
  verdict: { fontSize: 14, fontWeight: '700', marginVertical: 6 },
  made: { color: theme.ok },
  failed: { color: theme.danger },
  winner: { color: theme.accent, fontSize: 18, fontWeight: '800', marginVertical: 8 },
  resultButtons: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginTop: 8 },
});
