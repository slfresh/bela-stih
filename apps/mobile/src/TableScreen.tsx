import { useEffect, useMemo, useRef, useState } from 'react';
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
import { anchorId, type FxBus } from './anim/FxBus';
import { SeatPuck } from './table/SeatPuck';
import {
  FAN_PAD,
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
import { feltStyle } from './cosmetics';
import { EmoteStrip } from './table/EmoteStrip';
import { useTurnCues } from './table/useTurnCues';
import { PlayingCard } from './PlayingCard';
import { SuitPip } from './deck';
import { playSfx } from './audio';
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
    matchScores, winnerTeam, profile, banner, seatMeta, status, anchors, fxBus,
    turnDeadline = null, turnTotalMs, onAction, onNext, onFinish, finishLabel, onEmote,
    hardMode = false, series, askedRematch, waitingFor, onRematch, onForceRematch,
    handSort = 'auto', onHandSortChange, confirmPlay = 'ambiguous',
  } = props;

  // Every dimension the table draws is derived from the real window, so eight
  // cards fit one row on a 320dp phone, grow on a tablet, and rearrange into
  // three columns when the phone is turned on its side.
  const m = useTableMetrics();
  const land = m.orientation === 'landscape';

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
  const toggleMark = (id: string) =>
    setMarked((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
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

  const tap = (fn: () => void) => () => {
    playSfx('tap');
    fn();
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
    />
  );

  // Your turn, your call, your clock running out.
  useTurnCues({
    myTurn,
    mustDeclare: view.mustDeclare,
    canDeclare: view.canDeclare === true,
    deadline: turnDeadline,
    settled,
  });

  const trump = view.context.trumpSuit;
  const baize = feltStyle(profile.selectedFelt);

  // ---------------------------------------------------------------------
  // The pieces, built once and placed by whichever layout is in force. Both
  // orientations render the SAME nodes, so every anchor stays single-sourced
  // and a rotation cannot leave sprites flying to a slot that moved.
  // ---------------------------------------------------------------------

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
        }}
      >
        {/* centre plaque: trump + multiplier; doubles as the deck anchor */}
        <Anchor id={anchorId.deck} style={[styles.plaque, land && styles.plaqueLand]}>
          {trump ? (
            <>
              <SuitPip suit={trump} size={26} />
              {view.multiplier > 1 && <Text style={styles.plaqueMult}>×{view.multiplier}</Text>}
            </>
          ) : (
            <Text style={styles.subDim}>{lang.s.trumpUndecided}</Text>
          )}
          {view.callerSeat !== null && (
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
                // Whose card this is, at a glance — and whose empty slot,
                // before anybody has played into it.
                played
                  ? {
                      borderWidth: 2,
                      borderColor: seatTone(s, mySeat).edge,
                      borderRadius: radius.card,
                      margin: -2,
                    }
                  : null,
              ]}
            >
              {played ? (
                <PlayingCard card={played.card} width={slot.slotW} />
              ) : (
                <View style={[styles.slotGhost, { borderColor: seatTone(s, mySeat).dim }]} />
              )}
            </Anchor>
          );
        })}
      </View>
    </View>
  );

  const felt = land ? (
    // Sideways there is no room for a row above the table AND a row below it,
    // so the partner sits on the far rim the way they would at a real table.
    <View style={styles.tableArea}>
      <View style={styles.midRow}>
        <View style={styles.sideSeat}>{puck(at('left'))}</View>
        {feltBody}
        <View style={styles.sideSeat}>{puck(at('right'))}</View>
      </View>
      <View style={styles.landTopSeat} pointerEvents="box-none">
        {puck(at('top'))}
      </View>
    </View>
  ) : (
    <View style={[styles.tableArea, { minHeight: m.feltMinHeight }]}>
      <View style={styles.topSeat}>{puck(at('top'))}</View>
      <View style={styles.midRow}>
        <View style={styles.sideSeat}>{puck(at('left'))}</View>
        {feltBody}
        <View style={styles.sideSeat}>{puck(at('right'))}</View>
      </View>
    </View>
  );

  // Running zvanja record (bubbles are transient; this stays).
  // Once the winner's cards are on the table, their chip is saying the same
  // thing twice. The losing side's chips stay: they said their number out loud
  // and that is the only record of it.
  const revealedSeats = new Set(view.revealedDeclarations.map((d) => d.seat));
  const spokenCalls = view.announcedDeclarations.filter((d) => !revealedSeats.has(d.seat));
  const calls =
    spokenCalls.length > 0 || view.belaAnnouncedBy !== null ? (
      <View style={[styles.callsRow, land && styles.callsCol]}>
        {spokenCalls.map((d, i) => (
          <View key={i} style={styles.callChip}>
            <Text style={styles.callChipText}>
              {meta(d.seat).name}: {lang.declaration(d)}
            </Text>
          </View>
        ))}
        {view.belaAnnouncedBy !== null && (
          <View style={[styles.callChip, styles.callChipGold]}>
            <Text style={styles.callChipText}>
              {meta(view.belaAnnouncedBy).name}: {lang.s.bela} (20)
            </Text>
          </View>
        )}
      </View>
    ) : null;

  // Prompts that need words, not just buttons.
  const prompts = (
    <>
      {declaring && (
        <View style={styles.promptRow}>
          <Text style={styles.promptText}>{lang.s.askZvanja}</Text>
          <Text style={styles.promptHint}>{lang.s.markZvanjaHint}</Text>
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

  // My hand, fanned; the seat anchor for sprites sits underneath it.
  const handBlock = (
    <Anchor id={anchorId.seat(mySeat)} style={[styles.handArea, { minHeight: m.handMinHeight }]}>
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

  // "Prijavi" / "Nemam" — the two answers, and nothing else while the table is
  // waiting on you.
  const declareButtons = declaring ? (
    <>
      <Button
        label={lang.s.declareMarked}
        tone={marked.length >= 3 && markingIsZvanje ? 'strong' : 'plain'}
        onPress={() => {
          if (marked.length < 3 || !markingIsZvanje) return;
          const cards = hand.cards.filter((c) => marked.includes(cardId(c)));
          onAction({ type: 'DECLARE_ANNOUNCE', seat: mySeat, cards });
        }}
      />
      <Button
        label={lang.s.noneToDeclare}
        tone="plain"
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
  // winner's: the losing side said its number and keeps its cards.
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
                <PlayingCard key={cardId(c)} card={c} width={Math.round(m.slotW * 0.72)} />
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
        onNext={tap(onNext)}
        onFinish={tap(onFinish)}
        finishLabel={finishLabel}
      />
    </View>
  ) : null;

  return (
    <AnchorHost map={anchors}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        <View style={[styles.root, land && styles.rootLand]}>
          {land ? (
            // Turned sideways there is no vertical room to stack chrome above
            // and below the felt, so everything that is not the table itself
            // moves into the two rails and the middle keeps its full height.
            <>
              <View style={[styles.rail, { width: m.railW }]}>
                <ProfileBar profile={profile} vertical />
                <TableHeader
                  lang={lang}
                  mySeat={mySeat}
                  matchScores={matchScores}
                  progress={view.dealProgress}
                  vertical
                />
                {calls}
                <View style={styles.railGap} />
                <Button label={finishLabel} tone="plain" onPress={tap(onFinish)} />
              </View>

              <View style={styles.centre}>
                {status ? <Text style={styles.status}>{status}</Text> : null}
                {felt}
                {revealRow}
                {awardRow}
                {prompts}
                {handBlock}
              </View>

              <View style={[styles.rail, styles.railRight, { width: m.railW }]}>
                {emotes}
                <View style={styles.railGap} />
                {!settled && (
                  <View style={styles.actionsCol}>
                    {declareButtons ?? (
                      <NonCardActions options={options} lang={lang} onChoose={onAction} />
                    )}
                    {emoteToggle}
                  </View>
                )}
              </View>
            </>
          ) : (
            <>
              {/* wallet / level strip */}
              <ProfileBar profile={profile} />
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
              {revealRow}
              {awardRow}
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
                  <Button label={finishLabel} tone="plain" onPress={tap(onFinish)} />
                </View>
              )}
            </>
          )}

          {resultSheet}

          {/* sprites, always last */}
          <EffectsOverlay bus={fxBus} />
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
function TableHeader({
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
          <Text style={[styles.pillValue, { color: team.themInk }]}>{matchScores[them]}</Text>
          <Text style={styles.pillLabel}>{lang.team(them, mySeat)}</Text>
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
}

/** Level, XP progress and the coin balance; the coins are the wallet anchor. */
function ProfileBar({ profile, vertical = false }: { profile: PlayerProfile; vertical?: boolean }) {
  const p = levelProgress(profile.xp);
  return (
    <View style={[styles.profileBar, vertical && styles.profileBarCol]}>
      <View style={styles.levelBadge}>
        <Text style={styles.levelText}>{p.level}</Text>
      </View>
      <View style={[styles.xpWrap, vertical && styles.xpWrapCol]}>
        <View style={styles.xpTrack}>
          <View style={[styles.xpFill, { width: `${Math.round(p.fraction * 100)}%` }]} />
        </View>
      </View>
      <Anchor id={anchorId.wallet}>
        <Text style={styles.coins}>{profile.coins} ●</Text>
      </Anchor>
    </View>
  );
}

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

  return (
    <View style={styles.fan}>
      {cards.map((card, i) => {
        const id = cardId(card);
        const inPlayMoment = plays.length > 0;
        const action = byCard.get(id);
        // Hard mode: every card is submittable — the engine, not the UI, is
        // the judge, and a wrong card is a renons.
        const chosen =
          action ??
          (freePlay && inPlayMoment
            ? ({ type: 'PLAY_CARD', seat: plays[0]!.seat, card } as Action)
            : undefined);
        const playable = !arranging && !marking && enabled && chosen !== undefined;
        const illegalNow = !freePlay && !arranging && enabled && inPlayMoment && !playable;
        const isArmed = marking ? marked.includes(id) : arranging ? arrangePick === id : armed === id;
        const off = i - mid;

        const press = () => {
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
          if (!chosen) return;
          if (needsConfirm && !isArmed) {
            setArmed(id);
            return;
          }
          setArmed(null);
          onPlay(chosen);
        };

        return (
          <Pressable
            key={id}
            disabled={!playable && !arranging && !marking}
            onPress={press}
            // Vertical only: horizontal slop would overlap the neighbouring
            // card in touch space and make mis-taps MORE likely, not less.
            hitSlop={{ top: 12, bottom: 8 }}
            style={[
              styles.fanCard,
              {
                marginLeft: i === 0 ? 0 : fit.overlap,
                transform: [
                  {
                    translateY:
                      Math.pow(Math.abs(off), 1.6) * 3.2 * fit.scale -
                      (playable || ((arranging || marking) && isArmed) ? lift : 0),
                  },
                  { rotateZ: `${off * 4.5}deg` },
                ],
                zIndex: i,
              },
            ]}
          >
            <PlayingCard
              card={card}
              width={fit.cardW}
              dimmed={illegalNow}
              highlight={playable && !freePlay && !isArmed}
              selected={isArmed}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

/** Bidding, declaring, and the explicit bela call. */
function NonCardActions({
  options,
  lang,
  onChoose,
}: {
  options: Action[];
  lang: Lang;
  onChoose: (a: Action) => void;
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
      {/* Announced above, absent from "Upisano" below — say why, rather than
          letting the reader hunt for a hundred and fifty missing points. */}
      {result.tricksWon.some((t, i) => t === 0 && result.declarationPoints[i]! > 0) && (
        <Text style={styles.voidNote}>{lang.s.zvanjaVoidNoTrick}</Text>
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
}: {
  label: string;
  onPress: () => void;
  tone?: 'plain' | 'strong' | 'bela';
}) {
  const toneStyle: StyleProp<ViewStyle> =
    tone === 'strong' ? styles.btnStrong : tone === 'bela' ? styles.btnBela : styles.btnPlain;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.btn, toneStyle, pressed && styles.pressed]}
    >
      <Text style={styles.btnText}>{label}</Text>
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
  plaque: { position: 'absolute', top: '5%', alignSelf: 'center', alignItems: 'center', gap: 1 },
  // Landscape parks the partner on the top rim, so the plaque moves to the
  // left lobe, which the trick cross never reaches.
  plaqueLand: { top: '38%', left: '4%', alignSelf: 'flex-start' },
  plaqueMult: { color: theme.accent, fontSize: 13, fontWeight: '800' },
  plaqueCaller: { color: theme.textDim, fontSize: 10 },

  slot: { position: 'absolute', width: 46, height: 67 },
  slotGhost: {
    flex: 1,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
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
