import { useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
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
import { anchorId, type FxBus } from './anim/FxBus';
import { SeatPuck } from './table/SeatPuck';
import { fitHand, seatAt, seatPosition, type Position } from './table/geometry';
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
  // cards fit one row on a 320dp phone and grow on a tablet.
  const { width: winW } = useWindowDimensions();
  const handWidth = Math.max(240, winW - 24);

  const [arranging, setArranging] = useState(false);
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

  return (
    <AnchorHost map={anchors}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.root}>
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

          {/* the table */}
          <View style={styles.tableArea}>
            <View style={styles.topSeat}>{puck(at('top'))}</View>

            <View style={styles.midRow}>
              <View style={styles.sideSeat}>{puck(at('left'))}</View>

              <View style={[styles.felt, { backgroundColor: baize.felt, borderColor: baize.rim }]}>
                <View style={styles.feltInner}>
                  {/* centre plaque: trump + multiplier; doubles as the deck anchor */}
                  <Anchor id={anchorId.deck} style={styles.plaque}>
                    {trump ? (
                      <>
                        <SuitPip suit={trump} size={26} />
                        {view.multiplier > 1 && (
                          <Text style={styles.plaqueMult}>×{view.multiplier}</Text>
                        )}
                      </>
                    ) : (
                      <Text style={styles.subDim}>{lang.s.trumpUndecided}</Text>
                    )}
                    {view.callerSeat !== null && (
                      <Text style={styles.plaqueCaller}>
                        {lang.s.calledBy(meta(view.callerSeat).name)}
                      </Text>
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
                          SLOT[pos],
                          // Whose card this is, at a glance — and whose empty
                          // slot, before anybody has played into it.
                          played
                            ? { borderWidth: 2, borderColor: seatTone(s, mySeat).edge, borderRadius: radius.card, margin: -2 }
                            : null,
                        ]}
                      >
                        {played ? (
                          <PlayingCard card={played.card} size="md" />
                        ) : (
                          <View style={[styles.slotGhost, { borderColor: seatTone(s, mySeat).dim }]} />
                        )}
                      </Anchor>
                    );
                  })}
                </View>
              </View>

              <View style={styles.sideSeat}>{puck(at('right'))}</View>
            </View>
          </View>

          {/* running zvanja record (bubbles are transient; this stays) */}
          {(view.announcedDeclarations.length > 0 || view.belaAnnouncedBy !== null) && (
            <View style={styles.callsRow}>
              {view.announcedDeclarations.map((d, i) => (
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
          )}

          {banner && (
            <View style={styles.awardRow}>
              <Text style={styles.awardText}>
                +{banner.xp} XP{banner.coins > 0 ? `   +${banner.coins} ●` : ''}
                {banner.levelUp !== null ? `   ★ ${lang.s.ui.level} ${banner.levelUp}` : ''}
              </Text>
            </View>
          )}

          {/* prompts that need words, not just buttons */}
          {!settled && view.mustDeclare && view.myDeclarations.length > 0 && (
            <View style={styles.promptRow}>
              <Text style={styles.promptText}>
                {lang.s.declarations}:{' '}
                {view.myDeclarations.map((d) => lang.declaration({ ...d, seat: mySeat })).join(', ')}
              </Text>
              <Text style={styles.promptHint}>{lang.s.declareHint}</Text>
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

          {/* my hand, fanned; the seat anchor for sprites sits underneath it */}
          <Anchor id={anchorId.seat(mySeat)} style={styles.handArea}>
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
                width={handWidth}
                arranging={arranging}
                onSwap={hand.swap}
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

          {/* Always-on emote row: a fixed 34px, so it never reflows the felt. */}
          {!settled && onEmote && (
            <EmoteStrip lang={lang} open={trayOpen} dimmed={myTurn} onSend={sendEmote} />
          )}

          {/* actions: bidding, declaring, bela, leave */}
          {!settled && (
            <View style={styles.actionsRow}>
              {onEmote && (
                <Pressable
                  onPress={() => setTrayOpen((o) => !o)}
                  hitSlop={8}
                  style={[styles.emoteToggle, trayOpen && styles.emoteToggleOn]}
                >
                  <Text style={styles.emoteToggleText}>😄</Text>
                </Pressable>
              )}
              <NonCardActions options={options} lang={lang} onChoose={onAction} />
              <Button label={finishLabel} tone="plain" onPress={tap(onFinish)} />
            </View>
          )}

          {/* result sheet */}
          {settled && (
            <View style={styles.resultBackdrop} pointerEvents="box-none">
              <DealResult
                lang={lang}
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
          )}

          {/* sprites, always last */}
          <EffectsOverlay bus={fxBus} />
        </View>
      </SafeAreaView>
    </AnchorHost>
  );
}

// A compact cross around the felt centre, so a full trick reads as one pile
// (slot is 46×67; offsets keep a small gap between neighbouring cards).
const SLOT: Record<Position, ViewStyle> = {
  bottom: { left: '50%', marginLeft: -23, top: '55%', marginTop: 39 },
  top: { left: '50%', marginLeft: -23, top: '55%', marginTop: -106 },
  left: { left: '50%', marginLeft: -77, top: '55%', marginTop: -33 },
  right: { left: '50%', marginLeft: 31, top: '55%', marginTop: -33 },
};

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
}: {
  lang: Lang;
  mySeat: Seat;
  matchScores: readonly [number, number];
  progress: DealProgress | null;
}) {
  const us = teamOf(mySeat);
  const them = (1 - us) as TeamId;

  // While trick 1 is open a later zvanje can still move the target, so the
  // count is shown dimmed rather than hidden — it is honest, just not final.
  const live = progress ? (progress.provisional ? styles.dealCountDim : styles.dealCount) : null;

  return (
    <View style={styles.scoreRow}>
      <View style={styles.pillRow}>
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
        <Text style={live!}>
          {progress.running[us]} : {progress.running[them]}
          <Text style={styles.subDim}>
            {'   '}
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
function ProfileBar({ profile }: { profile: PlayerProfile }) {
  const p = levelProgress(profile.xp);
  return (
    <View style={styles.profileBar}>
      <View style={styles.levelBadge}>
        <Text style={styles.levelText}>{p.level}</Text>
      </View>
      <View style={styles.xpWrap}>
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
  arranging = false,
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
  /** Arrange mode: taps swap cards and can never play one. */
  arranging?: boolean;
  onSwap?: (idA: string, idB: string) => void;
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
  const [armed, setArmed] = useState<string | null>(null);
  const forced = plays.length === 1;
  const needsConfirm =
    confirmPlay === 'always' ? true : confirmPlay === 'ambiguous' ? !forced : false;

  const fit = fitHand(width, cards.length);
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
        const playable = !arranging && enabled && chosen !== undefined;
        const illegalNow = !freePlay && !arranging && enabled && inPlayMoment && !playable;
        const isArmed = armed === id;
        const off = i - mid;

        const press = () => {
          if (arranging) {
            if (armed === null) setArmed(id);
            else {
              if (armed !== id) onSwap?.(armed, id);
              setArmed(null);
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
            disabled={!playable && !arranging}
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
                      (playable || (arranging && isArmed) ? lift : 0),
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
    <View style={styles.resultPanel}>
      <Text style={styles.resultTitle}>{lang.s.dealResult}</Text>
      {row(lang.s.cardsAndLastTrick, result.trickPoints)}
      {result.valatTeam !== null && row(lang.s.valat, result.valatBonus)}
      {result.declarationPoints[0] + result.declarationPoints[1] > 0 &&
        row(lang.s.declarations, result.declarationPoints)}
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
    </View>
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
  xpWrap: { flex: 1 },
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
  scoreText: {},
  scoreLabel: { color: theme.textDim, fontSize: 13 },
  scoreValue: { color: theme.text, fontSize: 20, fontWeight: '800' },
  subDim: { color: theme.textDim, fontSize: 12 },
  seriesLine: { color: theme.textDim, fontSize: 13, textAlign: 'center' },
  pillRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
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

  tableArea: { flex: 1, minHeight: 260 },
  topSeat: { alignItems: 'center' },
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

  handArea: { minHeight: 118, justifyContent: 'flex-end' },
  fan: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingTop: 16,
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
    padding: 16,
    gap: 4,
  },
  resultTitle: { color: theme.text, fontWeight: '800', fontSize: 16, marginBottom: 4 },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between' },
  resultLabel: { color: theme.textDim, fontSize: 14 },
  resultValue: { color: theme.text, fontSize: 14, fontVariant: ['tabular-nums'] },
  verdict: { fontSize: 14, fontWeight: '700', marginVertical: 6 },
  made: { color: theme.ok },
  failed: { color: theme.danger },
  winner: { color: theme.accent, fontSize: 18, fontWeight: '800', marginVertical: 8 },
  resultButtons: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginTop: 8 },
});
