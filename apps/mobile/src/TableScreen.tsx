import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
  type CSSAnimationProperties,
} from 'react-native-reanimated';
import { useCountUp } from './anim/useCountUp';
import type { TableCue } from './table/cues';
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
import { levelProgress, type Award, type GiftId, type PlayerProfile } from '@belot/progression';
import { Anchor, AnchorHost, useAnchors, type AnchorMap } from './anim/AnchorRegistry';
import { EffectsOverlay } from './anim/EffectsOverlay';
import { REVEAL_MS } from './anim/director';
import { RevealRow } from './table/RevealRow';
import { xpFillSteps, type XpFillStep, type XpShown } from './table/xpFill';
import { REVEAL_EXIT_MS, type RevealPhase } from './table/revealTiming';
import { COIN_CASCADE_COUNT, COIN_CASCADE_DELAY_MS, coinsLandedMs, MATCH_CASCADE_HOLD_MS } from './anim/lifetimes';
import { isMatchAward } from './feedback';
import { useLaggedNumber } from './ui/useLaggedNumber';
import { anchorId, metaId, type FxBus } from './anim/FxBus';
import { SeatPuck } from './table/SeatPuck';
import {
  CARD_ASPECT,
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
import { EMOTE_TOGGLE, FAN_REST_SHORT, LAND_GAP, LAND_TRAY_H, SELF_NESTLE, SELF_PUCK_GAP } from './table/metrics';
import { useHandOrder, type HandSort } from './table/useHandOrder';
import { callsOnTable } from './table/calls';
import type { ConfirmPlay } from './storage';
import { cosmetics, room, roomStyle, type DeckStyle } from './cosmetics';
import { PerfProbe } from './dev/PerfProbe';
import { EmoteStrip } from './table/EmoteStrip';
import { GiftPicker } from './table/GiftPicker';
import { useTurnCues } from './table/useTurnCues';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { setBackGuard } from './ui/backGuard';
import { FeltArt, RIM_W } from './table/FeltArt';
import { garb } from './deck/palette';

/** `styles.felt` padding: the cloth's margin inside the rim. Pinned with the border and margin. */
const FELT_PAD = 5;
import { PlayingCard } from './PlayingCard';
import { CardBackFace, SuitPip } from './deck';
import { playSfx } from './audio';
import { pattern } from './haptics';
import { Button } from './ui/Button';
import { Coin, Crown, Star } from './ui/icons';
import { EmoteFace } from './emoteArt';
import { PressScale } from './ui/PressScale';
import { font, ink, num, radius, space, stroke, surface, team, theme, type } from './theme';
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
  /** The status line is an error (a refused move): danger ink, read out at once. */
  statusIsError?: boolean;
  /** The seat whose move is being animated right now — presentation only, never `toAct`. */
  spotlightSeat?: Seat | null;
  /** The motion policy: no loops, no springs, fades only. */
  reducedMotion?: boolean;
  /** What the table does in reaction to the current beat: a nod, a shake, a glow. */
  cue?: TableCue | null;
  /** The dealer's button is flying to the next puck: no puck shows its own "D" meanwhile. */
  dealerHop?: boolean;
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
  /** The rematch button's words: "Igraj opet" unless given (offline says "Nova partija"). */
  rematchLabel?: string;
  onForceRematch?: () => void;
  /**
   * "Prava bela": no card assist — every card is tappable, and an illegal one
   * is a renons the engine punishes. The claim/bela buttons stay unassisted too.
   */
  hardMode?: boolean;
  /** Each seat's latest table gift (useGifts). */
  gifts?: readonly (GiftId | null)[];
  /** Gifts that have landed on each seat, so each landing bounces once. */
  giftLanded?: readonly number[];
  /** Who gave each seat its gift, for the announcement when one lands on me. */
  giftFrom?: readonly (Seat | null)[];
  /** My gift cooldown: no gift before this instant. */
  giftReadyAt?: number;
  /** When set, the pucks open the gift picker, and a gift is sent through here. */
  onGift?: (id: GiftId, to: Seat | 'table') => unknown;
  /** Online: who can be given a gift, seat by seat (an older app cannot). Offline: everyone. */
  giftReach?: readonly boolean[];
  /** Online: players hidden on this device (their seat, never their name). */
  hidden?: readonly Seat[];
  /** Online: hide or show a player again (local only). */
  onHide?: (s: Seat, hide: boolean) => void;
  /** Online: report a player (the player's own e-mail). */
  onReport?: (s: Seat) => void;
}

/** How long touches are swallowed after the table shuts the gift picker by itself. */
export const GIFT_SHIELD_MS = 400;

export function TableScreen(props: TableScreenProps) {
  const {
    mySeat, lang, view, options, myTurn, settled, matchOver, lastDealResult,
    matchScores, winnerTeam, profile, banner, seatMeta, status, statusIsError = false, anchors, fxBus, spotlightSeat = null,
    reducedMotion = false,
    cue = null,
    dealerHop = false,
    turnDeadline = null, turnTotalMs, onAction, onNext, onFinish, finishLabel, onEmote,
    hardMode = false, series, askedRematch, waitingFor, onRematch, onForceRematch, rematchLabel,
    handSort = 'auto', onHandSortChange, confirmPlay = 'ambiguous',
    gifts, giftLanded, giftFrom, giftReadyAt = 0, onGift, giftReach, hidden, onHide, onReport,
  } = props;

  // Every dimension the table draws is derived from the real window, so eight
  // cards fit one row on a 320dp phone, grow on a tablet, and rearrange into
  // three columns when the phone is turned on its side.
  const m = useTableMetrics();
  const land = m.orientation === 'landscape';
  const reduced = reducedMotion;
  // A match's award waits for the fanfare (see the screens' cascade timers).
  const awardHold = banner && isMatchAward(banner) ? MATCH_CASCADE_HOLD_MS : 0;
  // The fan swells a hair over a long press, so the hold reads as "something
  // is about to happen" rather than as a dead tap.
  const hold = useSharedValue(1);
  const holdStyle = useAnimatedStyle(() => ({ transform: [{ scale: hold.value }] }));
  // Kontra rattles the table: three quick cycles, ±3 (±5 for rekontra),
  // scaled with the layout. Off under reduce-motion.
  const feltShake = useSharedValue(0);
  const feltShakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: feltShake.value }] }));
  // Played once per cue, by its `n` alone: keyed on the layout scale as well,
  // a rotation with the štiglja cue still current replayed the burst and the
  // shake over the result sheet. Everything else is read through refs.
  const cueRef = useRef(cue);
  cueRef.current = cue;
  const scaleRef = useRef(m.scale);
  scaleRef.current = m.scale;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  // ...and only a cue newer than this mount: a reconnect remounts the table
  // with the last cue still current.
  const seenCue = useRef(cue?.n ?? 0);
  useEffect(() => {
    const c = cueRef.current;
    if (!c || c.n === seenCue.current) return;
    seenCue.current = c.n;
    if (reducedRef.current) return;
    if (c.kind === 'stiglja') {
      const at = anchors.centre(anchorId.deck);
      if (at) fxBus.emit({ kind: 'burst', at, count: 40 });
    }
    if (c.kind !== 'shake' && c.kind !== 'stiglja') return;
    const a = (c.kind === 'stiglja' ? 6 : c.amp) * scaleRef.current;
    feltShake.value = withSequence(
      withTiming(a, { duration: 40 }),
      withTiming(-a, { duration: 80 }),
      withTiming(a, { duration: 80 }),
      withTiming(-a * 0.6, { duration: 80 }),
      withTiming(0, { duration: 60 }),
    );
  }, [cue?.n, feltShake, anchors, fxBus]);

  // The fan's layout numbers, for the dealt backs to land on the real cards.
  useEffect(() => {
    anchors.setMeta(metaId.handWidth, m.handWidth);
    anchors.setMeta(metaId.handCardMax, m.handCardMax);
  }, [anchors, m.handWidth, m.handCardMax]);

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
  // A rotation remounts the fan (the two orientations place it in different
  // rows); the hold's swell lives here and must not outlast the pressed view,
  // whose press-out never comes once it is gone.
  useEffect(() => {
    hold.value = 1;
  }, [land, hold]);

  // Is the table asking me something right now? The prompt rows' own
  // conditions — and a bid, whose buttons wrap to three lines on a phone.
  const bidding = options.some((a) => a.type === 'BID_CALL' || a.type === 'BID_PASS');
  // The bela buttons are an answer in every mode; only their hint is hard mode's to skip.
  const belaOffered = !settled && view.canAnnounceBela;
  const askingBesidesArranging =
    bidding ||
    declaring ||
    (!settled && !declaring && view.mustDeclare && view.myDeclarations.length > 0) ||
    (!settled && view.canDeclare === true) ||
    (belaOffered && !hardMode);
  const asking = askingBesidesArranging || arranging;
  // A short phone sheds the rows that are no use while it asks — or while the
  // bela buttons are up, hard mode included — so the buttons that answer stay
  // on the screen (see metrics' shortColumn).
  const shed = m.shortColumn && (asking || belaOffered);
  // And portrait's short column is built tighter throughout (metrics'
  // SHORT_CHROME counts every style this switches on).
  const short = !land && m.shortColumn;
  // A short column arranges in the faces' own slot when the faces were on
  // screen: they give way to it, so nothing moves. When a question had already
  // shed them, a new row under the fan would lift the fan under the finger, so
  // the hint asks above the fan instead, where the felt pays for it.
  const arrangeInSlot = short && arranging && !askingBesidesArranging && !belaOffered && !settled && !!onEmote;

  // The tray closes on send; the cooldown mirrors the server's rate limit so
  // a spammed tap dies here instead of being silently dropped over the wire.
  const [trayOpen, setTrayOpen] = useState(false);
  // Landscape keeps the faces in a fixed box in the right rail's free gap,
  // measured below. A question whose buttons leave that gap too short for it
  // (a four- or five-button bid on a phone held sideways; two two-line bela
  // buttons on the shortest rails) takes the room: the box gives way, as
  // portrait's short column sheds its strip, the tray shuts with it, and the
  // toggle rests until the question is answered. Portrait's toggle rests the
  // same way while a short column has shed the faces: there is no strip for
  // the phrases to open into.
  const [trayFits, setTrayFits] = useState(false);
  const trayShown = land ? trayFits : !shed;
  // What is drawn: never an open tray behind a resting toggle, even when a
  // press that began before the box gave way ends after it.
  const trayOpenShown = trayOpen && trayShown;
  useEffect(() => {
    if (!trayShown) setTrayOpen(false);
  }, [trayShown]);
  // Every entry into landscape measures afresh: a fit left over from before a
  // turn to portrait would draw the box, for a frame, over a bid's buttons.
  useEffect(() => {
    if (!land) setTrayFits(false);
  }, [land]);
  // The box and a question's buttons trade places under a finger, both ways:
  // for a moment after the box gives way a tap aimed at a face must not land
  // as a bid, and for a moment after it comes back a second tap on the bid
  // must not land as a face.
  const railQuietUntil = useRef(0);
  const faceQuietUntil = useRef(0);
  const boxWasUp = useRef(false);
  const boxUp = land && trayFits;
  useLayoutEffect(() => {
    if (land && boxWasUp.current && !boxUp && !settled) railQuietUntil.current = Date.now() + 300;
    if (land && !boxWasUp.current && boxUp && !settled) faceQuietUntil.current = Date.now() + 300;
    boxWasUp.current = boxUp;
  }, [land, boxUp, settled]);
  const answer = useCallback(
    (a: Action) => {
      if (Date.now() >= railQuietUntil.current) onAction(a);
    },
    [onAction],
  );

  // Leaving a match in progress asks first — from the leave button in the top
  // corner, from the result sheet between deals, and from Android's back. A
  // finished match leaves at once: there is nothing left to lose.
  const [leaving, setLeaving] = useState(false);
  const requestLeave = useCallback(() => {
    if (matchOver) onFinish();
    else setLeaving(true);
  }, [matchOver, onFinish]);
  // A match that ends under an open question closes it: offline the same
  // button then means "a new match", and "Napusti" must not start one.
  useEffect(() => {
    if (matchOver) setLeaving(false);
  }, [matchOver]);
  const leavingRef = useRef(leaving);
  leavingRef.current = leaving;

  // The gift picker: opened from a puck (mine is "treat the table"). It shuts
  // when my turn comes, when the sheet goes up, on back, and once sent — a
  // gift is never in the way of a decision.
  const [giftTarget, setGiftTarget] = useState<Seat | 'table' | null>(null);
  const giftTargetRef = useRef(giftTarget);
  giftTargetRef.current = giftTarget;
  // Online, a room that marks nobody as able to see gifts — not even me,
  // who joined saying I can — is an older server: no gifts at all there.
  const giftable = !!onGift && (giftReach?.[mySeat] ?? true) && !settled && !arranging && !leaving;
  // Whatever shuts the picker — the table (my turn, the sheet) or a tap on
  // send, close or beside it — shuts it under a finger that may be coming
  // down again, and under the picker lie the fan and the question's
  // buttons. For a moment after, a touch lands on nothing (the shield below),
  // so a tap meant for a gift never plays a card or answers for me. Only
  // Android back, which is no touch, closes it without.
  const [giftShield, setGiftShield] = useState(false);
  const shutGifts = useCallback(() => {
    if (giftTargetRef.current === null) return;
    setGiftTarget(null);
    setGiftShield(true);
  }, []);
  useEffect(() => {
    if (!giftShield) return;
    const t = setTimeout(() => setGiftShield(false), GIFT_SHIELD_MS);
    return () => clearTimeout(t);
  }, [giftShield]);
  useEffect(() => {
    if (!giftable) shutGifts();
  }, [giftable, shutGifts]);
  const myTurnWas = useRef(myTurn);
  useEffect(() => {
    if (myTurn && !myTurnWas.current) shutGifts();
    myTurnWas.current = myTurn;
  }, [myTurn, shutGifts]);
  const openGifts = useCallback(
    (target: Seat | 'table') => {
      if (!giftable) return;
      setTrayOpen(false);
      setGiftTarget(target);
    },
    [giftable],
  );
  const matchOverRef = useRef(matchOver);
  matchOverRef.current = matchOver;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  useEffect(() => {
    setBackGuard(() => {
      if (giftTargetRef.current !== null) {
        setGiftTarget(null); // back closes the picker; nothing was spent
        return true;
      }
      if (leavingRef.current) {
        setLeaving(false); // back answers the question safely
        return true;
      }
      // A finished match: back leaves exactly as the sheet's "Natrag" does —
      // online through leave(), which settles a gift still waiting for its
      // echo before the home screen reads the profile back.
      if (matchOverRef.current) {
        onFinishRef.current();
        return true;
      }
      setLeaving(true);
      return true;
    });
    return () => setBackGuard(null);
  }, []);
  const emoteReadyAt = useRef(0);
  const sendEmote = (id: string) => {
    // The second tap of a bid, landing on the face that just came back.
    if (Date.now() < faceQuietUntil.current) return;
    setTrayOpen(false);
    if (!onEmote || Date.now() < emoteReadyAt.current) return;
    emoteReadyAt.current = Date.now() + 2500;
    // No sound here: the pop belongs to the bubble, which follows the echo.
    onEmote(id);
  };

  // A gift landing on me is said aloud; the badge itself is decoration.
  const myLandings = giftLanded?.[mySeat] ?? 0;
  const seenMyLandings = useRef(myLandings);
  useEffect(() => {
    if (myLandings === seenMyLandings.current) return;
    seenMyLandings.current = myLandings;
    const id = gifts?.[mySeat];
    const from = giftFrom?.[mySeat];
    if (!id || from == null) return;
    AccessibilityInfo.announceForAccessibility(lang.s.ui.giftReceived(lang.s.ui.giftName(id), meta(from).name));
    // meta is re-derived each render; the landing count alone decides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myLandings]);

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

  /** A puck that opens the gift picker (for its seat, or the table for mine). */
  const giftPress = (s: Seat, child: ReactElement) => {
    if (!onGift) return child;
    const id = gifts?.[s] ?? null;
    return (
      <PressScale
        disabled={!giftable}
        onPress={() => openGifts(s === mySeat ? 'table' : s)}
        accessibilityRole="button"
        // The button hides the puck's own parts from a screen reader, so it
        // says them all: who deals, the cards, the tricks, the gift.
        accessibilityLabel={lang.s.ui.giftPuckLabel({
          name: meta(s).name,
          dealer: view.dealer === s && !dealerHop,
          cards: view.handCounts[s] ?? 0,
          tricks: view.dealProgress?.tricksWon[teamOf(s)] ?? 0,
          gift: id ? lang.s.ui.giftName(id) : null,
        })}
        accessibilityHint={
          giftable ? (s === mySeat ? lang.s.ui.giftTreatTable : onReport ? lang.s.ui.playerHint : lang.s.ui.giftHint) : undefined
        }
        scaleTo={0.95}
      >
        {child}
      </PressScale>
    );
  };

  const puck = (s: Seat) => (
    <Animated.View
      entering={reduced ? undefined : ZoomIn.delay(((s - mySeat + 4) % 4) * 60).duration(220)}
    >
    {giftPress(s, <SeatPuck
      seat={s}
      name={meta(s).name}
      avatar={meta(s).avatar}
      cards={view.handCounts[s]}
      isDealer={view.dealer === s && !dealerHop}
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
      gesture={cue && (cue.kind === 'nod' || cue.kind === 'pulse') && cue.seat === s ? cue : null}
      tricks={view.dealProgress?.tricksWon[teamOf(s)] ?? 0}
      gift={gifts?.[s] ?? null}
      giftN={giftLanded?.[s] ?? 0}
    />)}
    </Animated.View>
  );

  // A ring of light bursts from the hand as a cue lands — the sound's
  // visible twin, fired from the very same edge so it can never be held on.
  const pulseHand = useCallback(() => {
    if (reducedRef.current) return;
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
  const baize = roomStyle(profile.selectedFelt);
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
  // showing → leaving (the cards fly back) → gone (unmounted): the exit starts
  // REVEAL_EXIT_MS before REVEAL_MS so the row is empty when it comes down; a
  // tap starts the same exit early. All UI timers, cancelled on unmount.
  const [revealPhase, setRevealPhase] = useState<RevealPhase>('gone');
  const revealTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearRevealTimers = () => {
    for (const t of revealTimers.current) clearTimeout(t);
    revealTimers.current = [];
  };
  const leaveReveal = useCallback(
    (inMs: number) => {
      clearRevealTimers();
      revealTimers.current = [
        setTimeout(() => {
          setRevealPhase('leaving');
          playSfx('revealDown');
          // Counted from the exit that started, not the one that was due: a
          // late timer on a busy JS thread must not shorten the window.
          revealTimers.current.push(setTimeout(() => setRevealPhase('gone'), REVEAL_EXIT_MS));
        }, inMs),
      ];
    },
    [],
  );
  useEffect(() => {
    if (revealKey === '') return;
    setRevealPhase('showing');
    leaveReveal(REVEAL_MS - REVEAL_EXIT_MS);
    return clearRevealTimers;
  }, [revealKey, leaveReveal]);

  // The winning side's combinations, laid out for everyone. Only ever the
  // winner's: the losing side said its number and keeps its cards. A group
  // never wraps, so its cards shrink until the longest one fits the table.
  const revealLongest = Math.max(1, ...view.revealedDeclarations.map((d) => d.cards.length));
  const revealCardW = Math.min(
    Math.round(m.slotW * 1.1),
    Math.floor((m.width - 24 - 16 - 2 * (revealLongest - 1)) / revealLongest),
  );
  const revealRow =
    view.revealedDeclarations.length > 0 && revealPhase !== 'gone' ? (
      <RevealRow
        declarations={view.revealedDeclarations}
        cardW={revealCardW}
        deckStyle={deck}
        label={(d) => `${meta(d.seat).name}: ${lang.declaration(d)}`}
        sideOf={(d) => seatPosition(d.seat, mySeat)}
        phase={revealPhase}
        reduced={reduced}
        onTap={() => {
          if (revealPhase === 'showing') leaveReveal(0);
        }}
      />
    ) : null;

  // Trump, multiplier and who called it: a plate on the baize in portrait,
  // a row in the left rail in landscape (the trick cross fills a sideways
  // felt from rim to rim, and a plate anywhere on it covered a slot).
  // A wooden plate in the rim's own wood, lit on top and shaded underneath.
  // Bidding: three tiny backs and the question. Called: the pip on a cream
  // disc, and the ×2 / ×4 as a badge beside it.
  // The sprite anchor is the disc (or the mini fan before a call), not the
  // plate: a stamp centred on the plate landed under the disc, on the caller
  // line.
  const plaque = (
    <View
      style={[
        styles.plaque,
        land ? styles.plaqueRail : styles.plaquePortrait,
        { backgroundColor: baize.rim, borderTopColor: baize.rimLight, borderBottomColor: baize.rimDark },
      ]}
      accessibilityLabel={trump ? undefined : lang.s.trumpUndecided}
    >
      <View style={styles.plaqueRow}>
        {trump ? (
          <>
            <Anchor id={anchorId.plaque} style={styles.plaqueDisc}>
              <SuitPip suit={trump} size={24} />
            </Anchor>
            {view.multiplier > 1 && (
              <View style={styles.multBadge}>
                <Text style={styles.plaqueMult}>×{view.multiplier}</Text>
              </View>
            )}
          </>
        ) : (
          <>
            <Anchor id={anchorId.plaque} style={styles.miniFan}>
              {[-16, 0, 16].map((deg, i) => (
                <View key={deg} style={[styles.miniBack, i > 0 && styles.miniBackNext, { transform: [{ rotate: `${deg}deg` }] }]}>
                  <CardBackFace width={13} variant={cosmetics().cardBack} />
                </View>
              ))}
            </Anchor>
            <Text style={styles.plaqueUndecided} numberOfLines={1}>
              {lang.s.trumpQuestion}
            </Text>
          </>
        )}
      </View>
      {/* Who called trump, always — in the rail over two lines if it must. A
          short phone once dropped the line for room, and then nobody could
          read who had called. */}
      {view.callerSeat !== null && (
        <Text style={styles.plaqueCaller} numberOfLines={land ? 2 : 1}>
          {view.callerSeat === mySeat ? lang.s.calledByYou : lang.s.calledBy(meta(view.callerSeat).name)}
        </Text>
      )}
    </View>
  );

  const feltBody = (
    <Animated.View
      entering={reduced ? undefined : Platform.OS === 'web' ? FadeIn.duration(240) : feltEntering}
      style={[
        styles.felt,
        feltShakeStyle,
        // Landscape hangs the partner over the far rim, so the felt starts
        // just below their disc rather than below their whole puck.
        land && { marginTop: Math.round(m.puck * 0.5) },
        // A short column drops the margin; its floor is lower by as much.
        short && styles.feltFlush,
      ]}
    >
      {/* the table itself, drawn under everything: rim, baize, bevel */}
      <FeltArt
        width={feltBox.w + 2 * (RIM_W + FELT_PAD)}
        height={feltBox.h + 2 * (RIM_W + FELT_PAD)}
        room={baize}
        lit={myTurn && !settled}
        inset={RIM_W}
      />
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
        {/* the deck: cards are dealt from the felt's centre, whichever way up
            the table is — the plaque moves to the left lobe in landscape. */}
        <Anchor id={anchorId.deck} style={styles.deckAnchor} />


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
                  <PlayingCard card={played.card} width={slot.slotW} deckStyle={deck} locale={lang.id} />
                  {/* Whose card this is, at a glance. Drawn OUTSIDE the card: a
                      border on the slot itself sat under the card's own edge
                      and was never actually seen. */}
                  <View
                    pointerEvents="none"
                    style={[styles.slotRing, { borderColor: seatTone(s, mySeat).edge }]}
                  />
                </>
              ) : (
                <SlotGhost
                  colour={seatTone(s, mySeat).edge}
                  side={pos}
                  breathing={spotlightSeat === s}
                  reduced={reduced}
                />
              )}
            </Anchor>
          );
        })}
      </View>
    </Animated.View>
  );

  // Rows that appear for a moment — the zvanja reveal, the award — float
  // over the lower table instead of pushing the hand down. Over the whole
  // table area, not the felt: the felt's inner width on a phone is 140-184px
  // and a four-card sequence needs 190.
  const tableFloat = (
    <>
      {/* While the zvanja are up the table dims a little, so the cards read. */}
      {revealRow !== null && <View style={styles.revealScrim} pointerEvents="none" />}
      <View style={styles.tableFloat} pointerEvents="box-none">
        {revealRow}
      </View>
    </>
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
      {/* The plaque sits beside the partner's puck: the felt's upper lobe is
          15–35px tall on a phone and a plate there covered the top slot. */}
      <View style={styles.topSeat}>
        {puck(at('top'))}
        {plaque}
      </View>
      <View style={styles.midRow}>
        <View style={styles.sideSeat}>{puck(at('left'))}</View>
        {feltBody}
        <View style={styles.sideSeat}>{puck(at('right'))}</View>
      </View>
      {tableFloat}
    </View>
  );

  // The zvanja as chips, only while the table is still being asked: said
  // once, at the start of the deal, then the players' to remember. The round's
  // close hands over to the reveal row, and bela never has a chip (see
  // table/calls.ts). Gone with the deal too: they once hung over the result sheet.
  const spokenCalls = callsOnTable(view);
  // A short column writes each call as a tally, the caller over the call,
  // side by side: three calls take one row where they took three lines. The
  // call itself is never cut — the rank at its end is the tie-break.
  const callChip = (key: number, name: string, call: string) =>
    short ? (
      <View
        key={key}
        style={[styles.callChip, short && styles.callChipShort]}
        accessible
        accessibilityLabel={`${name}: ${call}`}
      >
        <Text style={styles.callChipName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.callChipCall}>{call}</Text>
      </View>
    ) : (
      <View key={key} style={[styles.callChip, land && styles.callChipLand]}>
        <Text style={[styles.callChipText, land && styles.callChipTextLand]}>
          {name}: {call}
        </Text>
      </View>
    );
  const calls =
    !settled && spokenCalls.length > 0 ? (
      <View style={[styles.callsRow, land && styles.callsCol, short && styles.callsRowShort]}>
        {spokenCalls.map((d, i) => callChip(i, meta(d.seat).name, lang.declaration(d)))}
      </View>
    ) : null;

  // Prompts that need words, not just buttons. A short column's are tighter,
  // and it asks one thing at a time, the first of these. Its arrange hint takes
  // the faces' slot under my puck when the faces were showing (arrangeInSlot),
  // and otherwise asks here, second only to the zvanja question.
  const promptRow = [styles.promptRow, short && styles.promptRowShort];
  const promptText = [styles.promptText, short && styles.promptLineShort];
  const promptHint = [styles.promptHint, short && styles.promptLineShort];
  const promptList = [
    declaring && (
      <View key="zvanja" style={promptRow}>
        <Text style={promptText}>{lang.s.askZvanja}</Text>
        <Text style={promptHint}>
          {marked.length === 0
            ? lang.s.markZvanjaHint
            : markingIsZvanje
              ? lang.s.markingOk
              : lang.s.markingNotZvanje}
        </Text>
      </View>
    ),
    short && arranging && !arrangeInSlot && (
      <View key="arrange" style={[promptRow, short && styles.promptInline]}>
        <Text style={[promptText, short && styles.promptInlineText]} numberOfLines={2}>
          {lang.s.ui.arrangeHint}
        </Text>
        <Button label={lang.s.ui.arrangeDone} tone="strong" compact onPress={() => setArranging(false)} />
      </View>
    ),
    !settled && !declaring && view.mustDeclare && view.myDeclarations.length > 0 && (
      <View key="declarations" style={promptRow}>
        <Text style={promptText}>
          {lang.s.declarations}:{' '}
          {view.myDeclarations.map((d) => lang.declaration({ ...d, seat: mySeat })).join(', ')}
        </Text>
        {!m.compact && <Text style={promptHint}>{lang.s.declareHint}</Text>}
      </View>
    ),
    !settled && view.canDeclare === true && (
      <View key="claim" style={promptRow}>
        <Text style={promptHint}>{lang.s.claimZvanjaHint}</Text>
      </View>
    ),
    arranging && !short && (
      <View key="arrange" style={promptRow}>
        <Text style={promptText}>{lang.s.ui.arrangeHint}</Text>
        <Button label={lang.s.ui.arrangeDone} tone="strong" onPress={() => setArranging(false)} />
      </View>
    ),
    !settled && view.canAnnounceBela && !hardMode && (
      <View key="bela" style={promptRow}>
        <Text style={promptText}>{lang.s.belaHint}</Text>
      </View>
    ),
  ].filter((p): p is ReactElement => Boolean(p));
  const promptRows = <>{short ? promptList.slice(0, 1) : promptList}</>;
  // Portrait reserves the row's height where the column can afford it, so a
  // prompt coming or going never moves the hand under your thumb; a shorter
  // phone cannot spare it, and landscape flexes the felt instead.
  const prompts = m.promptReserve ? <View style={styles.promptsReserve}>{promptRows}</View> : promptRows;

  // My hand, fanned; the seat anchor for sprites sits underneath it.
  const handBlock = (
    <Anchor id={anchorId.seat(mySeat)} style={[styles.handArea, { minHeight: m.handMinHeight }, short && styles.handNestle]}>
      <Pressable
        // The hand, named: a screen reader says what the block is, and the
        // device harness finds the fan by it wherever the layout moves it.
        accessibilityLabel={lang.s.yourCards}
        onLongPress={() => {
          playSfx('hold');
          pattern('longPress');
          setArranging((a) => !a);
        }}
        delayLongPress={500}
        onPressIn={() => {
          hold.value = withTiming(reduced ? 1 : 1.02, { duration: 500 });
        }}
        onPressOut={() => {
          hold.value = withTiming(1, { duration: 150 });
        }}
      >
        <Animated.View style={holdStyle}>
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
          locale={lang.id}
          reduced={reduced}
          armCaption={lang.s.ui.play}
          glow={cue?.kind === 'glow' ? cue : null}
          restFloor={short ? FAN_REST_SHORT : 0}
        />
        </Animated.View>
      </Pressable>
    </Anchor>
  );

  // My own puck: the same disc as everyone else's, a shade smaller, with my
  // clock on it — centred under my fan in portrait, beside it in landscape.
  // Its anchor is NOT the seat's: the hand is where my cards fly from and to.
  const selfPuck = giftPress(
    mySeat,
    <SeatPuck
      seat={mySeat}
      name={meta(mySeat).name}
      avatar={meta(mySeat).avatar ?? cosmetics().avatar}
      cards={view.handCounts[mySeat]}
      isDealer={view.dealer === mySeat && !dealerHop}
      isBot={false}
      connected={meta(mySeat).connected}
      active={view.toAct === mySeat}
      tone={seatTone(mySeat, mySeat)}
      size={m.selfPuck}
      deadline={myTurn ? turnDeadline : null}
      totalMs={turnTotalMs}
      // The "thinking" pulse is for the others' moves. Mine is the turn itself,
      // from the RENDERED turn prop, so it is never held on across a drain.
      thinking={false}
      yourTurn={myTurn && !settled}
      // Under the fan the disc is plainly mine and the row's height is the
      // scarce thing; beside the fan in landscape there is room for the name.
      showName={land}
      reduced={reduced}
      gesture={cue && (cue.kind === 'nod' || cue.kind === 'pulse') && cue.seat === mySeat ? cue : null}
      tricks={view.dealProgress?.tricksWon[teamOf(mySeat)] ?? 0}
      anchored={false}
      gift={gifts?.[mySeat] ?? null}
      giftN={giftLanded?.[mySeat] ?? 0}
    />,
  );

  // A fixed box — portrait's 34px row, landscape's 74x114 in the rail — so
  // opening or shutting it never reflows the felt.
  const emotes =
    !settled && onEmote ? (
      <EmoteStrip lang={lang} open={trayOpenShown} dimmed={myTurn} vertical={land} onSend={sendEmote} />
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
          answer({ type: 'DECLARE_ANNOUNCE', seat: mySeat, cards });
        }}
      />
      <Button
        label={lang.s.noneToDeclare}
        tone="plain"
        compact={land}
        onPress={() => answer({ type: 'DECLARE_SKIP', seat: mySeat })}
      />
    </>
  ) : null;

  const emoteToggle = onEmote ? (
    <PressScale
      onPress={() => {
        if (trayShown) setTrayOpen((o) => !o);
      }}
      hitSlop={8}
      // Resting while a question has the box's room: no click, no tray.
      disabled={!trayShown}
      accessibilityLabel={lang.s.ui.emoteToggle}
      accessibilityState={{ expanded: trayOpenShown }}
      style={[styles.emoteToggle, trayOpenShown && styles.emoteToggleOn]}
    >
      {trayShown ? (
        <EmoteFace id="smile" size={24} />
      ) : (
        // Greyed on a child: PressScale's animated opacity overrides its own.
        <View style={styles.emoteToggleIdle} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <EmoteFace id="smile" size={24} />
        </View>
      )}
    </PressScale>
  ) : null;

  // Leaving: a top corner, away from every button a thumb reaches for
  // mid-deal, and a question before it acts. A finished match's own sheet
  // says what comes next, so the corner is empty then.
  const leaveButton = !matchOver ? (
    <Button label={finishLabel} tone="plain" compact style={short ? styles.leaveSlim : undefined} onPress={requestLeave} />
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
    declaring ? 1 : 0,
    !settled && !declaring && view.mustDeclare && view.myDeclarations.length > 0 ? 1 : 0,
    arranging ? 1 : 0,
    !settled && view.canAnnounceBela && !hardMode ? 1 : 0,
    // Hard mode's bela buttons shed rows too, with no hint row of their own.
    shed ? 1 : 0,
  ].join('|');
  useEffect(() => {
    anchors.bump();
  }, [anchors, reflowKey]);

  const lostMatch = matchOver && winnerTeam !== null && winnerTeam !== teamOf(mySeat);
  const resultSheet = settled ? (
    <Animated.View
      style={[styles.resultBackdrop, lostMatch && styles.resultBackdropLost]}
      pointerEvents="box-none"
      entering={reduced ? undefined : FadeIn.duration(220)}
    >
      <DealResult
        lang={lang}
        mySeat={mySeat}
        reduced={reduced}
        maxHeight={Math.round(m.height * 0.92)}
        result={lastDealResult}
        matchScores={matchScores}
        matchOver={matchOver}
        award={banner}
        winnerLabel={winnerTeam !== null ? lang.team(winnerTeam, mySeat) : ''}
        renonsText={
          lastDealResult?.renonsSeat != null
            ? lastDealResult.renonsSeat === mySeat
              ? lang.s.renonsByYou
              : lang.s.renonsBy(meta(lastDealResult.renonsSeat).name)
            : null
        }
        series={series}
        askedRematch={askedRematch}
        waitingFor={waitingFor}
        onRematch={onRematch}
        rematchLabel={rematchLabel}
        onForceRematch={onForceRematch}
        onNext={onNext}
        onFinish={requestLeave}
        finishLabel={finishLabel}
      />
    </Animated.View>
  ) : null;

  return (
    <AnchorHost map={anchors}>
      <SafeAreaView style={[styles.safe, { backgroundColor: baize.page }]} edges={['top', 'bottom', 'left', 'right']}>
        {/* A rotation or a window resize moves everything at once. */}
        <View style={[styles.root, land && styles.rootLand, short && styles.rootShort]} onLayout={() => anchors.bump()}>
          {land ? (
            // Turned sideways there is no vertical room to stack chrome above
            // and below the felt, so everything that is not the table itself
            // moves into the two rails and the middle keeps its full height.
            <>
              <View style={[styles.rail, { width: m.railW }]}>
                <ProfileBar profile={profile} vertical holdMs={awardHold} reduced={reduced} onLongPress={toggleProbe} />
                <TableHeader
                  lang={lang}
                  mySeat={mySeat}
                  matchScores={matchScores}
                  progress={view.dealProgress}
                  vertical
                  reduced={reduced}
                  winner={matchOver ? winnerTeam : null}
                />
                {plaque}
                {calls}
              </View>

              <View style={styles.centre}>
                {status ? <Text style={[styles.status, statusIsError && styles.statusError]} role={statusIsError ? 'alert' : undefined}>{status}</Text> : null}
                {felt}
                {prompts}
                {/* My puck beside my fan, on the faces' side: between my cards
                    and the emotes, at the bottom, as portrait has it under the
                    fan. The rails have no height to spare for it. */}
                <View style={styles.landHandRow}>
                  <View style={styles.handGrow}>{handBlock}</View>
                  {selfPuck}
                </View>
              </View>

              <View style={[styles.rail, styles.railRight, { width: m.railW }]}>
                {leaveButton}
                {/* The emote box, in the rail's free gap under the leave
                    button: never over the table. (A float here once put the
                    faces on the right-hand player's disc.) It gives way when
                    a question's buttons leave the gap shorter than the box;
                    the gap clips the one frame before it hears. */}
                <View
                  style={styles.railGap}
                  onLayout={(e) => setTrayFits(e.nativeEvent.layout.height >= LAND_TRAY_H)}
                >
                  {trayFits && emotes ? (
                    <View style={styles.traySlot} pointerEvents="box-none">
                      {emotes}
                    </View>
                  ) : null}
                </View>
                {!settled && (
                  <View style={styles.actionsCol}>
                    {declareButtons ?? (
                      <NonCardActions options={options} lang={lang} onChoose={answer} compact />
                    )}
                    {emoteToggle}
                  </View>
                )}
              </View>
            </>
          ) : (
            <>
              {/* wallet / level strip, and leaving in the top corner */}
              <View style={styles.topRow}>
                <View style={styles.topRowGrow}>
                  <ProfileBar profile={profile} slim={short} holdMs={awardHold} reduced={reduced} onLongPress={toggleProbe} />
                </View>
                {leaveButton}
              </View>
              {status && !shed ? <Text style={[styles.status, statusIsError && styles.statusError]} role={statusIsError ? 'alert' : undefined}>{status}</Text> : null}

              {/* score strip: match score, plus this deal's running count */}
              <TableHeader
                lang={lang}
                mySeat={mySeat}
                matchScores={matchScores}
                progress={view.dealProgress}
                slim={short}
                reduced={reduced}
                winner={matchOver ? winnerTeam : null}
              />

              {felt}
              {calls}
              {prompts}
              {handBlock}
              {/* My own disc, centred under my cards and above the faces. Its
                  row lets touches through: a short column tucks it into the
                  fan's arc, under the outer cards' corners. */}
              <View style={styles.selfRow} pointerEvents="box-none">{selfPuck}</View>
              {!shed && emotes}
              {/* A short column's arrange hint takes the faces' own slot when
                  the faces were showing, so the long-press that starts
                  arranging moves nothing under the finger. */}
              {arrangeInSlot && (
                <View style={styles.arrangeSlot}>
                  <Text style={styles.arrangeSlotText} numberOfLines={2}>
                    {lang.s.ui.arrangeHint}
                  </Text>
                  <Button label={lang.s.ui.arrangeDone} tone="strong" compact onPress={() => setArranging(false)} />
                </View>
              )}

              {/* actions: bidding, declaring, bela — leaving is the top corner */}
              {!settled && (
                <View style={styles.actionsRow}>
                  {emoteToggle}
                  {declareButtons ?? (
                    <NonCardActions options={options} lang={lang} onChoose={onAction} short={short} />
                  )}
                </View>
              )}
            </>
          )}

          {resultSheet}

          {/* sprites, always last */}
          <EffectsOverlay bus={fxBus} />
          {__DEV__ && probe && <PerfProbe />}

          {/* The gift picker: an overlay, so opening it moves no row of the table. */}
          {giftTarget !== null && onGift && (
            <GiftPicker
              lang={lang}
              target={giftTarget}
              mySeat={mySeat}
              reach={giftReach}
              // Online, another player's puck also hides or reports them.
              moderate={
                onHide && onReport && giftTarget !== 'table'
                  ? {
                      hidden: hidden?.includes(giftTarget) ?? false,
                      onHide: () => {
                        const who = giftTarget;
                        const was = hidden?.includes(who) ?? false;
                        shutGifts();
                        onHide(who, !was);
                      },
                      onReport: () => onReport(giftTarget),
                    }
                  : undefined
              }
              nameOf={(s) => meta(s).name}
              profile={profile}
              readyAt={giftReadyAt}
              land={land}
              reduced={reduced}
              ground={baize.page}
              onClose={shutGifts}
              onSend={(id, to) => {
                shutGifts();
                onGift(id, to);
              }}
            />
          )}
          {giftShield && (
            // See giftShield: the touches of the moment after the picker shut.
            <View
              style={StyleSheet.absoluteFill}
              onStartShouldSetResponder={() => true}
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
            />
          )}

          {/* Not once the match is over: offline the same button then means a
              new match, and "Napusti" must never start one. */}
          {leaving && !matchOver && (
            <ConfirmDialog
              title={lang.s.ui.leaveConfirm}
              confirmLabel={lang.s.ui.leaveConfirmYes}
              cancelLabel={lang.s.ui.leaveConfirmNo}
              ground={baize.page}
              reduced={reduced}
              onCancel={() => setLeaving(false)}
              onConfirm={() => {
                setLeaving(false);
                if (!matchOverRef.current) onFinish();
              }}
            />
          )}
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
  slim = false,
  reduced = false,
  winner = null,
}: {
  lang: Lang;
  mySeat: Seat;
  matchScores: readonly [number, number];
  progress: DealProgress | null;
  /** Landscape puts the whole strip in the left rail, stacked. */
  vertical?: boolean;
  /** Portrait's short column: the strip on pinned lines, without its breathing room. */
  slim?: boolean;
  reduced?: boolean;
  /** The match is over and this side took it: its pill swells for a moment. */
  winner?: TeamId | null;
}) {
  const us = teamOf(mySeat);
  const them = (1 - us) as TeamId;
  // Scores count to their new value instead of jumping.
  const usScore = useCountUp(matchScores[us], 500, { reduced });
  const themScore = useCountUp(matchScores[them], 500, { reduced });
  const usRun = useCountUp(progress?.running[us] ?? 0, 350, { reduced });
  const themRun = useCountUp(progress?.running[them] ?? 0, 350, { reduced });
  const swell = useSharedValue(1);
  // Only a win that arrives AFTER this header mounted swells: a rotation
  // rebuilds the header (the rail and the portrait strip are different
  // trees) with the winner already current, and must not replay it.
  const seenWinner = useRef(winner);
  useEffect(() => {
    if (winner === seenWinner.current) return;
    seenWinner.current = winner;
    if (winner === null || reduced) return;
    swell.value = withSequence(
      withTiming(1.18, { duration: 220, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 360, easing: Easing.inOut(Easing.quad) }),
    );
  }, [winner, swell, reduced]);
  const swellUs = useAnimatedStyle(() => ({ transform: [{ scale: winner === us ? swell.value : 1 }] }));
  const swellThem = useAnimatedStyle(() => ({ transform: [{ scale: winner === them ? swell.value : 1 }] }));

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
        <Animated.View
          style={[styles.teamPill, slim && styles.teamPillSlim, { backgroundColor: team.usDim, borderColor: team.usEdge }, swellUs]}
        >
          <Text style={styles.pillLabel}>{lang.team(us, mySeat)}</Text>
          <Text style={[styles.pillValue, slim && styles.pillValueSlim, { color: team.usInk }]}>{usScore}</Text>
        </Animated.View>
        <Animated.View
          style={[styles.teamPill, slim && styles.teamPillSlim, { backgroundColor: team.themDim, borderColor: team.themEdge }, swellThem]}
        >
          {/* Side by side the two pills mirror each other around the centre;
              stacked in a rail there is no centre, so both read label, value. */}
          {vertical && <Text style={styles.pillLabel}>{lang.team(them, mySeat)}</Text>}
          <Text style={[styles.pillValue, slim && styles.pillValueSlim, { color: team.themInk }]}>{themScore}</Text>
          {!vertical && <Text style={styles.pillLabel}>{lang.team(them, mySeat)}</Text>}
        </Animated.View>
      </View>

      {progress ? (
        // The last trick's +10 flies here.
        <Anchor id={anchorId.running}>
          <Text style={[live!, vertical && styles.centreText, slim && styles.liveSlim]}>
            {usRun} : {themRun}
            <Text style={styles.subDim}>
              {vertical ? '\n' : '   '}
              {progress.callerNeeds === 0
                ? lang.s.contractSafe
                : lang.s.needsMore(progress.callerNeeds)}
            </Text>
          </Text>
        </Anchor>
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
  a.slim === b.slim &&
  a.reduced === b.reduced &&
  a.winner === b.winner &&
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
    slim = false,
    holdMs = 0,
    reduced = false,
    onLongPress,
  }: {
    profile: PlayerProfile;
    vertical?: boolean;
    /** Portrait's short column: the strip without its breathing room. */
    slim?: boolean;
    /** Extra wait before the wallet and the level move: a match's fanfare plays first. */
    holdMs?: number;
    /** The motion policy: the bar snaps and the badge stays still instead. */
    reduced?: boolean;
    /** Dev builds: toggles the frame/render probe. */
    onLongPress?: () => void;
  }) {
    // The level (its badge swell, its bar) lands with the level-up sound —
    // after the coins, not at the moment the deal was scored.
    const lag = COIN_CASCADE_DELAY_MS + coinsLandedMs(COIN_CASCADE_COUNT) + holdMs;
    const xp = useLaggedNumber(profile.xp, lag, 1);
    const p = levelProgress(xp);
    // The total changes when the last coin lands on it, not when the deal is
    // scored with the coins still in the air — and the coins set off from the
    // sheet's total, a moment after the sheet has slid up.
    // A gift paid for leaves the wallet at once; an award waits for its coins.
    const coins = useLaggedNumber(profile.coins, lag, 300, 0);
    // The XP bar fills rather than jumps; a new level swells the badge. Only on
    // a change: a rotation remounts the strip already full to where it is, and
    // an animation to that same value kept writing to the torn-down one. A
    // level crossed fills to the end and on from empty (xpFillSteps): going
    // straight to the new level's share ran the bar backwards.
    const fill = useSharedValue(p.fraction);
    const filledTo = useRef<XpShown>({ level: p.level, fraction: p.fraction });
    useEffect(() => {
      const steps = xpFillSteps(filledTo.current, { level: p.level, fraction: p.fraction, isMax: p.isMax }, reduced);
      if (steps.length === 0) return;
      filledTo.current = { level: p.level, fraction: p.fraction };
      const timed = (st: XpFillStep) =>
        withTiming(st.to, { duration: st.ms, easing: st.ease === 'in' ? Easing.in(Easing.quad) : Easing.out(Easing.cubic) });
      const only = steps[0]!;
      fill.value = steps.length > 1 ? withSequence(...steps.map(timed)) : only.ms === 0 ? only.to : timed(only);
    }, [fill, p.level, p.fraction, p.isMax, reduced]);
    const fillStyle = useAnimatedStyle(() => ({ width: `${Math.round(fill.value * 100)}%` }));
    const badge = useSharedValue(1);
    const level = useRef(p.level);
    useEffect(() => {
      if (level.current === p.level) return;
      level.current = p.level;
      if (reduced) return;
      badge.value = withSequence(
        withTiming(1.35, { duration: 220, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 320, easing: Easing.inOut(Easing.quad) }),
      );
    }, [badge, p.level, reduced]);
    const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: badge.value }] }));
    return (
      <Pressable
        onLongPress={onLongPress}
        delayLongPress={600}
        style={[styles.profileBar, vertical && styles.profileBarCol, slim && styles.profileBarSlim]}
      >
        <Animated.View style={[styles.levelBadge, badgeStyle]}>
          <Text style={styles.levelText}>{p.level}</Text>
        </Animated.View>
        <View style={[styles.xpWrap, vertical && styles.xpWrapCol]}>
          <View style={styles.xpTrack}>
            <Animated.View style={[styles.xpFill, fillStyle]} />
          </View>
        </View>
        <Anchor id={anchorId.wallet}>
          <View style={styles.coinsRow}>
            <Text style={styles.coins}>{coins}</Text>
            <Coin size={12} />
          </View>
        </Anchor>
      </Pressable>
    );
  },
  (a, b) =>
    a.profile.xp === b.profile.xp &&
    a.profile.coins === b.profile.coins &&
    a.vertical === b.vertical &&
    a.slim === b.slim &&
    a.reduced === b.reduced &&
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
  locale,
  reduced = false,
  armCaption,
  glow = null,
  restFloor = 0,
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
  locale?: string;
  /** Reduce-motion: the cards step up instead of springing. */
  reduced?: boolean;
  /** What the second tap on an armed card does, on the card. */
  armCaption?: string;
  /**
   * Where a resting card may come down to, above the fan's floor. A short
   * column tucks my puck up into the fan, and a small hand's flattened arc
   * would otherwise bring the middle cards down onto it.
   */
  restFloor?: number;
  /** Cards to glow gold for a moment: my bela's king and queen. */
  glow?: { cardIds: string[]; n: number } | null;
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
  // The card just tapped measured itself into a transient rect (see
  // FanCard). Only the LAST tap's rect may be live: a rect left from an
  // earlier tap would send a server-driven play of that card (the clock
  // running out online) off from where the card was several tricks ago.
  const anchors = useAnchors();
  const lastTap = useRef<string | null>(null);
  const decision = `${arranging}|${enabled}|${plays.map((p) => cardId(p.card)).join(',')}`;
  useEffect(() => {
    setArmed(null);
    setArrangePick(null);
  }, [decision]);
  // When the cards themselves change (a new deal, the talon, my own card
  // leaving) the last tapped rect describes a fan that no longer exists. Not
  // on the decision above: online, my play's echo arrives after it.
  const cardsKey = cards.map(cardId).join(',');
  useEffect(() => {
    if (lastTap.current !== null) {
      anchors.delete(anchorId.card(lastTap.current));
      lastTap.current = null;
    }
  }, [cardsKey, anchors]);
  // ...and when the fan itself goes: a rotation remounts it, and a rect
  // measured in the other orientation would send that card's server-driven
  // play off from where it no longer is.
  useEffect(
    () => () => {
      if (lastTap.current !== null) anchors.delete(anchorId.card(lastTap.current));
    },
    [anchors],
  );

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
    if (lastTap.current !== null && lastTap.current !== id) anchors.delete(anchorId.card(lastTap.current));
    lastTap.current = id;
    // A marking or arranging tap never becomes a flight; its rect goes at once.
    if (marking || arranging) {
      anchors.delete(anchorId.card(id));
      lastTap.current = null;
    }
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
      playSfx('arm');
      pattern('arm');
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
    <View style={[styles.fan, { paddingBottom: Math.max(drop, restFloor) }]}>
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
            locale={locale}
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
            glowN={glow && glow.cardIds.includes(id) ? glow.n : 0}
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
    locale,
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
    glowN,
    onPress,
  }: {
    id: string;
    card: Card;
    width: number;
    deckStyle: DeckStyle;
    locale?: string;
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
    /** Non-zero, and new: glow gold for a moment (my bela's king and queen). */
    glowN: number;
    onPress: (id: string) => void;
  }) {
    // A card has no entrance of its own: the dealt back flies to the very spot
    // it takes (table/fx.ts), and the face is simply there when it lands. Its
    // turning over was reanimated's `entering`, on the view that also carried
    // `layout`; a rotation remounts the fan, every card turned over again, and
    // the rotation's second pass (the safe-area insets) started the transition
    // over the flip and left the whole fan at ~3% opacity for the deal. Kept as
    // a shared value instead, its first frame was the view's resting style
    // whenever reanimated lost the finished values (react-native-reanimated
    // #9574, the app paused just after the talon: two slivers), and the view
    // that could drop it made a rotation's teardown heavier.
    const glowV = useSharedValue(0);
    // Only a glow that arrived AFTER this card mounted plays: a card dealt
    // while an old bela cue is still current must not light up on arrival.
    const seenGlow = useRef(glowN);
    useEffect(() => {
      if (!glowN || glowN === seenGlow.current) return;
      seenGlow.current = glowN;
      glowV.value = withSequence(
        withTiming(1, { duration: 150 }),
        withDelay(400, withTiming(0, { duration: 150 })),
      );
    }, [glowN, glowV]);
    const glowStyle = useAnimatedStyle(() => ({ opacity: glowV.value }));
    // The lift used to be a 14 px jump on the frame the turn arrived. Now the
    // playable cards spring up from the middle outward; a card that stops
    // being playable settles back the same way.
    // Only on a change: a card mounts where it rests, and a spring to where it
    // already is kept writing to a view a quick second rotation had already
    // torn down (reanimated then re-applies the dead view's props on every
    // native event until its registry lets it go).
    const liftV = useSharedValue(lift);
    const liftedTo = useRef(lift);
    useEffect(() => {
      if (liftedTo.current === lift) return;
      liftedTo.current = lift;
      liftV.value = reduced
        ? withTiming(lift, { duration: 120 })
        : withDelay(rippleDelay, withSpring(lift, { damping: 16, stiffness: 190, mass: 0.6 }));
    }, [liftV, lift, rippleDelay, reduced]);
    // The card's arc, tilt and lift on one view, as 1.2.5 had it. Splitting the
    // tilt out into a plain view of its own (so that a lost animated value
    // could not leave a card at another place's angle) cost more than it
    // saved: over quick rotations the table began to lag a whole orientation
    // behind, on the Samsung in 10 of 60 flips, and never with the one view.
    const motion = useAnimatedStyle(() => ({
      transform: [{ translateY: baseY + liftV.value }, { rotateZ: `${rotate}deg` }],
    }));
    // Where this card is on screen at the moment of the tap: the flight sets
    // off from here, at this size. One transient rect, read once by the
    // spawner — never a per-card anchor that re-measures every tick.
    const anchors = useAnchors();
    const ref = useRef<View>(null);
    const press = () => {
      const node = ref.current;
      if (!node) {
        onPress(id);
        return;
      }
      node.measureInWindow((x, y, w, h) => {
        // The measurement is the bounding box of the TILTED card, wider than
        // the card by up to a third at the fan's edge; its centre is right.
        // The rect is the card's own size about that centre, so the flight
        // sets off at the fan's size rather than popping from the box's.
        if (Number.isFinite(x) && w > 0) {
          const cardH = width * CARD_ASPECT;
          anchors.set(anchorId.card(id), { x: x + w / 2 - width / 2, y: y + h / 2 - cardH / 2, w: width, h: cardH });
        }
        onPress(id);
      });
    };
    return (
      // The card's place in the row is flex's, as it always was, and it moves
      // at once: no layout transition. Reanimated 4.5.1's could drop its last
      // frames under a rotation's re-render and leave a card standing behind
      // its neighbour, a gap where it belonged.
      <View style={[styles.fanCard, { marginLeft, zIndex }]}>
       <Animated.View style={motion}>
        <Pressable
          ref={ref}
          disabled={disabled}
          onPress={press}
          // Vertical only: horizontal slop would overlap the neighbouring
          // card in touch space and make mis-taps MORE likely, not less.
          hitSlop={{ top: 12, bottom: 8 }}
        >
          <PlayingCard
            card={card}
            width={width}
            deckStyle={deckStyle}
            locale={locale}
            dimmed={dimmed}
            highlight={highlight}
            selected={selected}
            armed={armed}
            caption={caption}
          />
          <Animated.View pointerEvents="none" style={[styles.cardGlow, glowStyle]} />
        </Pressable>
       </Animated.View>
      </View>
    );
  },
  (a, b) =>
    a.id === b.id &&
    a.card.suit === b.card.suit &&
    a.card.rank === b.card.rank &&
    a.width === b.width &&
    a.deckStyle === b.deckStyle &&
    a.locale === b.locale &&
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
    a.glowN === b.glowN &&
    // `enter` is read once, at mount: its later flips need no render.
    a.onPress === b.onPress,
);

/**
 * The table zooms in from a hair under full size as it mounts: an entrance,
 * not a cut. A worklet, as reanimated requires of a custom entering animation.
 */
const feltEntering = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.96 }] },
    animations: {
      opacity: withTiming(1, { duration: 240 }),
      transform: [{ scale: withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }) }],
    },
  };
};

/** An empty slot; the one whose seat is acting breathes a little. */
const SlotGhost = memo(function SlotGhost({
  colour,
  side,
  breathing,
  reduced,
}: {
  /** The seat's team colour: a small tab on the seat's side of the mat says whose place this is. */
  colour: string;
  side: Position;
  breathing: boolean;
  reduced: boolean;
}) {
  // The breath is a CSS animation: the compositor's on the web, the UI
  // thread's natively, and nothing per frame in JS.
  return (
    <Animated.View style={[styles.slotGhost, breathing && !reduced ? ghostBreath : styles.slotGhostStill]}>
      <View style={[styles.slotTab, SLOT_TAB[side], { backgroundColor: colour }]} />
    </Animated.View>
  );
});

const ghostBreath: CSSAnimationProperties = {
  animationName: { from: { opacity: 0.55 }, to: { opacity: 0.95 } },
  animationDuration: 700,
  animationIterationCount: 'infinite',
  animationDirection: 'alternate',
  animationTimingFunction: 'ease-in-out',
};

/** Where the mat's tab sits: on the edge nearest the seat. */
const SLOT_TAB: Record<Position, ViewStyle> = {
  bottom: { bottom: -1, left: '50%', marginLeft: -7, width: 14, height: 3 },
  top: { top: -1, left: '50%', marginLeft: -7, width: 14, height: 3 },
  left: { left: -1, top: '50%', marginTop: -7, width: 3, height: 14 },
  right: { right: -1, top: '50%', marginTop: -7, width: 3, height: 14 },
};

/** Bidding, declaring, and the explicit bela call. */
function NonCardActions({
  options,
  lang,
  onChoose,
  compact = false,
  short = false,
}: {
  options: Action[];
  lang: Lang;
  onChoose: (a: Action) => void;
  compact?: boolean;
  /**
   * Portrait's short column: a trump call is the suit alone and a bela button
   * drops its suit (the pip says both), so five bids take two lines at 320 dp
   * and the bela pair one. A screen reader still hears the whole call.
   */
  short?: boolean;
}) {
  const buttons = options.filter((a) => a.type !== 'PLAY_CARD' || a.announceBela === true);
  return (
    <>
      {buttons.map((a, i) => {
        const isBela = a.type === 'PLAY_CARD';
        const strong = a.type === 'DECLARE_ANNOUNCE' || a.type === 'BID_CALL';
        const label =
          // In the rail the pip says "zovi": the label is the suit alone.
          (compact || short) && a.type === 'BID_CALL'
            ? lang.suitName(a.suit)
            : short && a.type === 'PLAY_CARD'
              ? `${lang.rankShort(a.card.rank)} ${lang.s.withBela}`
              : lang.action(a);
        return (
          <Button
            key={i}
            label={label}
            accessibilityLabel={lang.action(a)}
            tone={isBela ? 'bela' : strong ? 'strong' : 'plain'}
            compact={compact}
            style={short && (a.type === 'BID_CALL' || a.type === 'BID_PASS') ? styles.bidShort : undefined}
            // The suit itself on a trump-call button, not only its name; and on
            // a short column's bela button, whose label dropped it.
            icon={
              a.type === 'BID_CALL' ? (
                <SuitPip suit={a.suit} size={compact ? 14 : 16} />
              ) : short && a.type === 'PLAY_CARD' ? (
                <SuitPip suit={a.card.suit} size={16} />
              ) : undefined
            }
            onPress={() => onChoose(a)}
          />
        );
      })}
    </>
  );
}

function DealResult({
  lang,
  mySeat,
  maxHeight,
  result,
  matchScores,
  matchOver,
  winnerLabel,
  renonsText,
  series,
  award = null,
  askedRematch = false,
  waitingFor = 0,
  onRematch,
  rematchLabel,
  onForceRematch,
  onNext,
  onFinish,
  finishLabel,
  reduced = false,
}: {
  lang: Lang;
  mySeat: Seat;
  reduced?: boolean;
  /** The sheet scrolls rather than run off a short (landscape) screen. */
  maxHeight: number;
  result: DealScoreResult | null;
  matchScores: readonly [number, number];
  matchOver: boolean;
  winnerLabel: string;
  renonsText?: string | null;
  /** Matches won per side since this roster sat down; online only. */
  series?: readonly [number, number] | null;
  /** What this deal (or match) earned: shown at the foot of the sheet, where the coins set off from. */
  award?: Award | null;
  /** Has this seat already asked for another match? */
  askedRematch?: boolean;
  /** How many players have yet to accept. */
  waitingFor?: number;
  onRematch?: () => void;
  rematchLabel?: string;
  onForceRematch?: () => void;
  onNext: () => void;
  onFinish: () => void;
  finishLabel: string;
}) {
  if (!result) return null;
  const us = teamOf(mySeat);
  const them = (1 - us) as TeamId;
  // Ours or theirs — the same rule the sounds use (feedback.ts).
  const won = result.finalScore[us] > result.finalScore[them];
  const made = renonsText ? false : result.callerMade;
  const stiglja = result.valatTeam !== null;
  // Rows arrive one after another; the totals count up to their values.
  let order = 0;
  const enter = () => (reduced ? undefined : FadeInDown.delay(order++ * 60).duration(220));
  const row = (
    label: string,
    v: readonly [number, number],
    opts: { from?: readonly [number, number]; anchor?: string; hero?: boolean } = {},
  ) => (
    <Animated.View style={[styles.resultRow, opts.hero && styles.resultHero]} key={label} entering={enter()}>
      <Text style={[styles.resultLabel, opts.hero && styles.resultLabelHero]}>{label}</Text>
      <Pair
        us={v[us]}
        them={v[them]}
        from={opts.from ? [opts.from[us], opts.from[them]] : undefined}
        reduced={reduced}
        anchor={opts.anchor}
        hero={opts.hero}
      />
    </Animated.View>
  );
  const rule = <View style={styles.rule} />;

  return (
    <Animated.View entering={reduced ? undefined : SlideInDown.duration(280)}>
    <ScrollView
      style={[styles.resultPanel, { maxHeight, backgroundColor: room().page }]}
      contentContainerStyle={styles.resultContent}
    >
      {/* The header band says whose deal it was at a glance: tinted by our
          outcome, the caller's verdict as one word at its end. */}
      <View
        style={[
          styles.sheetBand,
          matchOver ? styles.sheetBandMatch : won ? styles.sheetBandWon : styles.sheetBandLost,
        ]}
      >
        {matchOver && <Crown size={26} />}
        <View style={styles.sheetBandText}>
          <Text style={[styles.sheetTitle, stiglja && !matchOver && styles.sheetTitleStiglja]} numberOfLines={2}>
            {matchOver ? lang.s.winner(winnerLabel) : stiglja ? `${lang.s.valat}!` : lang.s.dealResult}
          </Text>
          <Text style={styles.sheetVerdict} numberOfLines={2}>
            {renonsText ? `${lang.s.renonsTitle} ${renonsText}` : made ? lang.s.callerMade : lang.s.callerFailed}
          </Text>
        </View>
        {!matchOver && (
          <Animated.Text
            style={[styles.sheetWord, made ? styles.sheetWordMade : styles.sheetWordFailed]}
            entering={reduced ? undefined : ZoomIn.springify().damping(14).delay(120)}
          >
            {made ? lang.s.madeShort : lang.s.failedShort}
          </Animated.Text>
        )}
      </View>

      {/* the columns, ours first */}
      <View style={styles.resultHeads}>
        <Text style={[styles.resultHead, styles.resultHeadUs]}>{lang.team(us, mySeat)}</Text>
        <Text style={[styles.resultHead, styles.resultHeadThem]}>{lang.team(them, mySeat)}</Text>
      </View>
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
      {rule}
      {row(lang.s.total, result.rawTotal)}
      {rule}
      {/* The sheet mounts with the final numbers already in the view, so the
          two totals count from where they were: nought, and the match score
          before this deal was added to it. */}
      {row(lang.s.recorded, result.finalScore, { from: [0, 0], anchor: anchorId.sheetTotal, hero: true })}
      {row(lang.s.matchScore, matchScores, {
        from: [
          Math.max(0, matchScores[0] - result.finalScore[0]),
          Math.max(0, matchScores[1] - result.finalScore[1]),
        ],
      })}

      {award && (award.xp > 0 || award.coins > 0 || award.levelUp !== null) && (
        <Animated.View style={styles.sheetAward} entering={enter()}>
          {award.xp > 0 && <Text style={styles.sheetAwardText}>+{award.xp} XP</Text>}
          {award.coins > 0 && (
            <View style={styles.sheetAwardCoins}>
              <Text style={styles.sheetAwardText}>+{award.coins}</Text>
              <Coin size={13} />
            </View>
          )}
          {award.levelUp !== null && (
            <View style={styles.sheetLevel}>
              <Star size={14} />
              <Text style={styles.sheetLevelText}>
                {lang.s.ui.level} {award.levelUp}
              </Text>
            </View>
          )}
        </Animated.View>
      )}

      {matchOver ? (
        // Online stacks the series line over its buttons; offline has no
        // series, and its two answers sit side by side like a deal's.
        <View style={series ? styles.sheetFoot : styles.resultButtons}>
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
                <Button label={rematchLabel ?? lang.s.ui.playAgain} tone="strong" onPress={onRematch} />
              )}
              {/* The host never has to wait on somebody who has wandered off. */}
              {onForceRematch && askedRematch && waitingFor > 0 && (
                <Button label={lang.s.ui.startAnyway} tone="plain" onPress={onForceRematch} />
              )}
            </>
          )}
          <Button label={finishLabel} tone="plain" onPress={onFinish} />
        </View>
      ) : (
        <View style={styles.resultButtons}>
          <Button label={lang.s.nextDeal} tone="strong" onPress={onNext} />
          <Button label={finishLabel} tone="plain" onPress={onFinish} />
        </View>
      )}
    </ScrollView>
    </Animated.View>
  );
}

/**
 * Ours and theirs, side by side in the team inks — each counting up from
 * `from` when given; optionally the anchor the coins set off from.
 */
function Pair({
  us,
  them,
  from,
  reduced,
  anchor,
  hero = false,
}: {
  us: number;
  them: number;
  from?: readonly [number, number];
  reduced: boolean;
  anchor?: string;
  hero?: boolean;
}) {
  const steps = useRef(0);
  const a = useCountUp(us, 600, {
    reduced,
    from: from?.[0] ?? us,
    // Every other step ticks, softly: a tally being written, not a rattle.
    onStep: () => {
      // Only the hero row ticks, or two tallies rattle under the stinger.
      if (hero && ++steps.current % 2 === 0) playSfx('tick', { gain: 0.6, rate: 1.4 });
    },
  });
  const b = useCountUp(them, 600, { reduced, from: from?.[1] ?? them });
  const pair = (
    <View style={styles.pair}>
      <Text style={[styles.pairValue, styles.pairUs, hero && styles.pairHero]}>{a}</Text>
      <Text style={[styles.pairSep, hero && styles.pairHero]}>:</Text>
      <Text style={[styles.pairValue, styles.pairThem, hero && styles.pairHero]}>{b}</Text>
    </View>
  );
  return anchor ? <Anchor id={anchor}>{pair}</Anchor> : pair;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.feltDeep },
  root: { flex: 1, padding: 12, gap: 8 },
  // Landscape: two narrow rails of chrome with the table between them.
  rootLand: { flexDirection: 'row', paddingVertical: 6, gap: LAND_GAP },
  rail: { gap: 6, alignItems: 'center' },
  railRight: { justifyContent: 'flex-end' },
  // The right rail's free gap, and the emote box's home: stretched, because the
  // rail centres its children, and clipping, for the frame before onLayout.
  railGap: { flex: 1, alignSelf: 'stretch', overflow: 'hidden' },
  traySlot: { position: 'absolute', top: 0, left: 0, right: 0, height: LAND_TRAY_H },
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
  levelText: { color: theme.accent, fontFamily: font.bold, fontSize: 12 },
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
  coinsRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  coins: { color: theme.accent, fontFamily: font.bold, fontSize: 14 },

  status: { color: theme.accent, fontSize: 12, textAlign: 'center' },
  statusError: { color: theme.dangerInk },

  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  scoreCol: { flexDirection: 'column', gap: 4, alignItems: 'center', alignSelf: 'stretch' },
  centreText: { textAlign: 'center' },
  scoreText: {},
  scoreLabel: { color: theme.textDim, fontSize: 13 },
  scoreValue: { color: theme.text, fontSize: 20, fontFamily: font.bold },
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
  pillLabel: { color: theme.textDim, fontSize: 12, fontFamily: font.medium },
  pillValue: { fontSize: 17, fontFamily: font.bold, fontVariant: ['tabular-nums'] },
  dealCount: { color: theme.accent, fontSize: 13, fontFamily: font.bold, fontVariant: ['tabular-nums'] },
  dealCountDim: { color: theme.textDim, fontSize: 13, fontFamily: font.bold, fontVariant: ['tabular-nums'] },

  tableArea: { flex: 1 },
  topSeat: { alignItems: 'center' },
  landTopSeat: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
  midRow: { flex: 1, flexDirection: 'row', alignItems: 'stretch', gap: 4 },
  sideSeat: { justifyContent: 'center' },

  // The felt's frame is layout only — FeltArt paints the rim and the baize
  // underneath it, sized from this very box. Border 6, padding 5, margin 4
  // are pinned: the trick cross is derived from the measured inner box.
  felt: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: 999,
    borderWidth: 6,
    borderColor: 'transparent',
    padding: 5,
    marginVertical: 4,
  },
  feltInner: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Sits in the felt's upper lobe, clear of the trick cross at the centre.
  // A plate, not a pip floating in space — and a small one: ~44px tall.
  plaque: {
    alignItems: 'center',
    gap: 2,
    borderRadius: radius.sm,
    // The plate's depth: a lit hairline on top, a shaded one beneath (the
    // colours come from the room, inline).
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: 132,
  },
  plaqueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  plaqueDisc: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.cardFace,
    borderWidth: 1,
    borderColor: stroke.shade,
    alignItems: 'center',
    justifyContent: 'center',
  },
  multBadge: {
    backgroundColor: garb.redDark,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: stroke.edge,
  },
  miniFan: { flexDirection: 'row', alignItems: 'flex-end', height: 22, paddingHorizontal: 4 },
  miniBack: { width: 13, height: 19 },
  miniBackNext: { marginLeft: -5 },
  plaqueUndecided: { color: ink.mid, fontSize: 11, fontFamily: font.bold },
  // Portrait: at the left end of the partner's row, which is as tall as a puck.
  plaquePortrait: { position: 'absolute', left: 0, top: 0 },
  // In the rail it is a row in the flow, the width of the rail.
  plaqueRail: { alignSelf: 'stretch', paddingHorizontal: 6, paddingVertical: 3 },
  plaqueMult: { color: theme.cardFace, fontSize: 12, fontFamily: font.bold },
  plaqueCaller: { color: ink.mid, fontSize: 11 },

  slot: { position: 'absolute', width: 46, height: 67 },
  slotGhost: {
    // A place a card will go, marked the way a table mat is: a shallow well
    // with a hairline edge and a small tab in the seat's colour on the seat's
    // side. Four hard-edged boxes read as placeholders that failed to load;
    // four faint ones read as nothing. (Opacity is animated: the acting
    // seat's slot breathes.)
    flex: 1,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: stroke.hair,
    backgroundColor: surface.well,
    overflow: 'visible',
  },
  slotGhostStill: { opacity: 0.7 },
  slotTab: { position: 'absolute', borderRadius: 2 },
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


  callsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  revealScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 999,
  },
  // In the rail the chips are what gives when the height runs out: they
  // shrink and clip, and the leave button below them stays reachable.
  callsCol: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
    alignSelf: 'stretch',
    flexShrink: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  callChip: {
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  callChipText: { color: theme.text, ...type.rail },
  // The rail is 96dp wide: caption type and tighter padding. Never a line
  // cap — the rank at the end of a call is the tie-break.
  callChipTextLand: { ...type.caption },
  callChipLand: { paddingHorizontal: 8, alignSelf: 'stretch' },
  // Portrait's short column: metrics' SHORT_CHROME is these numbers.
  rootShort: { paddingVertical: 4, gap: 4 },
  profileBarSlim: { paddingVertical: 2 },
  leaveSlim: { paddingVertical: 4 },
  teamPillSlim: { paddingVertical: 1 },
  pillValueSlim: { lineHeight: 20 },
  liveSlim: { lineHeight: 18 },
  feltFlush: { marginVertical: 0 },
  // A call as a tally, the caller over the call, beside the others; the row
  // never wraps, the tallies share its width, and a call wraps inside its own.
  callsRowShort: { flexWrap: 'nowrap', gap: 4 },
  callChipShort: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm, flexShrink: 1, minWidth: 0 },
  callChipName: { color: ink.mid, ...type.caption },
  callChipCall: { color: theme.text, ...type.caption },
  promptRowShort: { paddingVertical: 4, paddingHorizontal: 10, gap: 0 },
  promptLineShort: { lineHeight: 16 },
  // The arrange hint as a short column's prompt: its Done beside it, one row.
  promptInline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  promptInlineText: { flexShrink: 1 },
  handNestle: { marginBottom: -SELF_NESTLE },
  // The arrange hint in the faces' own 34 dp, with its Done beside it.
  arrangeSlot: { height: 34, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  arrangeSlotText: { flex: 1, color: theme.accent, ...type.caption },
  bidShort: { paddingHorizontal: 10 },


  promptRow: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: theme.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
  },
  promptText: { color: theme.accent, fontFamily: font.bold, fontSize: 13 },
  // The zvanja prompt measures 58 on a phone; a shorter reserve still moved the hand.
  promptsReserve: { minHeight: 58, justifyContent: 'flex-end', gap: 8 },
  promptHint: { color: theme.textDim, fontSize: 12 },

  handArea: { justifyContent: 'flex-end' },
  // Landscape: the fan, and my puck beside it on the faces' side.
  landHandRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SELF_PUCK_GAP },
  handGrow: { flex: 1 },
  // Portrait: my puck centred under the fan.
  selfRow: { alignItems: 'center' },
  // The profile strip, and the leave button in the top corner beside it.
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  topRowGrow: { flex: 1, minWidth: 0 },
  fan: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    // Shared with fanHeight(), which reserves the row this padding sits in.
    paddingTop: FAN_PAD,
  },
  fanCard: {},
  // Bela: the king and queen of trumps light up gold for a moment.
  cardGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.card,
    backgroundColor: 'rgba(216,165,49,0.45)',
    borderWidth: 2,
    borderColor: theme.accent,
  },

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
    width: EMOTE_TOGGLE,
    height: EMOTE_TOGGLE,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoteToggleOn: { borderColor: theme.accent },
  emoteToggleIdle: { opacity: 0.4 },


  resultBackdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  // A lost match: the room dims a shade more, no vignette imagery.
  resultBackdropLost: { backgroundColor: 'rgba(0,0,0,0.55)' },
  resultPanel: {
    backgroundColor: theme.feltDeep, // overridden by the room's page inline
    borderTopLeftRadius: radius.panel + 6,
    borderTopRightRadius: radius.panel + 6,
    borderWidth: 1,
    borderColor: theme.line,
    flexGrow: 0,
  },
  resultContent: { padding: space.lg, gap: 2 },
  // The header band: our outcome as a tint, the caller's verdict as a word.
  sheetBand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginBottom: space.sm,
  },
  sheetBandWon: { backgroundColor: team.usDim, borderColor: team.usEdge },
  sheetBandLost: { backgroundColor: team.themDim, borderColor: team.themEdge },
  sheetBandMatch: { backgroundColor: surface.sunk, borderColor: theme.accent },
  sheetBandText: { flex: 1, gap: 2 },
  sheetTitle: { color: ink.hi, ...type.h3, fontFamily: font.bold },
  sheetTitleStiglja: { color: theme.accent },
  sheetVerdict: { color: ink.mid, ...type.caption },
  sheetWord: { ...type.h2, fontFamily: font.bold },
  sheetWordMade: { color: theme.okInk },
  sheetWordFailed: { color: theme.dangerInk },
  resultHeads: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.xs, paddingBottom: 2 },
  resultHead: { ...type.caption, fontFamily: font.bold, width: 44, textAlign: 'right' },
  resultHeadUs: { color: team.usInk, marginRight: 12 },
  resultHeadThem: { color: team.themInk },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
  resultHero: { paddingVertical: space.xs },
  resultLabel: { color: ink.mid, ...type.body },
  resultLabelHero: { color: ink.hi, fontFamily: font.bold },
  rule: { height: 1, backgroundColor: stroke.hair, marginVertical: space.xs },
  voidNote: { color: theme.dangerInk, ...type.caption, fontStyle: 'italic' },
  pair: { flexDirection: 'row', alignItems: 'baseline' },
  pairValue: { ...type.body, ...num, width: 44, textAlign: 'right' },
  pairUs: { color: team.usInk },
  pairThem: { color: team.themInk },
  pairSep: { color: ink.lo, ...type.body, width: 12, textAlign: 'center' },
  pairHero: { ...type.h2, fontFamily: font.bold },
  sheetAward: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    marginTop: space.sm,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    backgroundColor: surface.raised,
  },
  sheetAwardCoins: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  sheetAwardText: { color: theme.okInk, ...type.body, fontFamily: font.bold },
  sheetLevel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: surface.chip,
    borderWidth: 1,
    borderColor: theme.accent,
  },
  sheetLevelText: { color: theme.accent, ...type.sub, fontFamily: font.bold },
  sheetFoot: { gap: space.sm, alignItems: 'center', marginTop: space.sm },
  resultButtons: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginTop: space.sm },
});
