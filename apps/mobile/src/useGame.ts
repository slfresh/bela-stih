import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HARD_CONFIG_OVERRIDES, type Action, type PublicView, type Seat } from '@belot/engine';
import { Table } from '@belot/table';
import type { BotLevel } from '@belot/bots';
import { Lang } from '@belot/i18n';
import type { Award, PlayerProfile } from '@belot/progression';
import { AnchorMap } from './anim/AnchorRegistry';
import { FxBus } from './anim/FxBus';
import { useDirector } from './anim/useDirector';
import { makeFxSpawner, spawnEmote } from './table/fx';
import { timingsFor, type MotionPolicy } from './anim/director';
import { cueFor, type TableCue } from './table/cues';
import { useMotionPolicy } from './anim/useMotionPolicy';
import { BOT_EMOTES } from './emotes';
import { playSfx } from './audio';
import { emptyTally, landingSound, processEvents } from './feedback';
import { loadProfile, saveProfile, type Settings } from './storage';

/** Offline, the person always sits south. */
export const HUMAN: Seat = 0;

/** What the table looks like before the first deal animation lands. */
function preDealView(v: PublicView): PublicView {
  return {
    ...v,
    hand: [],
    handCounts: [0, 0, 0, 0],
    currentTrick: [],
    announcedDeclarations: [],
    myDeclarations: [],
    belaAnnouncedBy: null,
    context: { contractType: 'SUIT', trumpSuit: null },
    callerSeat: null,
    multiplier: 1,
    toAct: null,
    legalActions: [],
    mustDeclare: false,
    canDeclare: false,
    canAnnounceBela: false,
  };
}

/**
 * One local game against the bots, presented through the animation director:
 * the screen renders the director's paced view, and every event drives sprites,
 * sound and progression exactly once — animated or flushed.
 *
 * A new match is a new mount (the screen keys on match id), so table, director
 * and effects always start together.
 */
export function useGame(settings: Settings, level: BotLevel = 'medium') {
  const tableRef = useRef<Table | null>(null);
  if (tableRef.current === null) {
    tableRef.current = new Table({
      humanSeats: [HUMAN],
      botLevel: level,
      config: settings.hardMode ? HARD_CONFIG_OVERRIDES : undefined,
    });
  }
  const table = tableRef.current;

  const profileRef = useRef<PlayerProfile>(loadProfile());
  const tally = useRef(emptyTally());
  const [banner, setBanner] = useState<Award | null>(null);
  // Whose move is being animated: the seat of every event as it starts,
  // cleared when the director goes idle. Presentation only — `toAct` on the
  // intermediate views stays null, and the turn cues never see this.
  const [spotlight, setSpotlight] = useState<Seat | null>(null);
  // What the table itself does about an event: a nod, a shake, a glow.
  const [cue, setCue] = useState<TableCue | null>(null);
  const cueN = useRef(0);
  // The dealer's button is in the air: the puck hides its own "D" meanwhile.
  const [dealerHop, setDealerHop] = useState(false);

  const anchors = useMemo(() => new AnchorMap(), []);
  const fxBus = useMemo(() => new FxBus(), []);
  const lang = useMemo(() => new Lang(settings.locale), [settings.locale]);
  // The spawner is built before the director exists; it reads the view
  // through a ref the director fills in just below.
  const getViewRef = useRef<() => PublicView | null>(() => null);
  const motionRef = useRef<MotionPolicy>('full');
  const fx = useMemo(
    () =>
      makeFxSpawner({
        anchors,
        bus: fxBus,
        lang,
        mySeat: () => HUMAN,
        view: () => getViewRef.current(),
        reduced: () => motionRef.current === 'reduced',
      }),
    [anchors, fxBus, lang],
  );

  // Pacing follows the motion policy, live: the director re-paces from the
  // next beat when it changes (the system switch resolves a tick in).
  const motion = useMotionPolicy(settings.motion);
  motionRef.current = motion;
  const { view, idle, enqueue, getView } = useDirector(
    HUMAN,
    useMemo(() => preDealView(table.view(HUMAN)), [table]),
    (e, flushed, speed) => {
      const r = processEvents({
        events: [e],
        profile: profileRef.current,
        tally: tally.current,
        mySeat: HUMAN,
        silent: flushed,
      });
      if (r.profile !== profileRef.current) {
        profileRef.current = r.profile;
        saveProfile(r.profile);
      }
      if (r.award) setBanner(r.award);
      if (!flushed) {
        fx.start(e, speed);
        // A seatless beat (the reveal, the deal, scoring) is nobody's move.
        setSpotlight('seat' in e ? e.seat : null);
        const c = cueFor(e, HUMAN, getViewRef.current(), ++cueN.current);
        // A cue is played once, by its `n`; a new deal wipes the last one so
        // nothing stale can replay when the table is rebuilt (a rotation).
        if (c) setCue(c);
        else if (e.kind === 'dealStarted') setCue(null);
        if (e.kind === 'dealScored' && motionRef.current !== 'reduced') setDealerHop(true);
      }
      // A bot that takes a trick occasionally gloats — the table talks back.
      if (!flushed && e.kind === 'trickWon' && e.seat !== HUMAN && Math.random() < 0.22) {
        const id = BOT_EMOTES[Math.floor(Math.random() * BOT_EMOTES.length)]!;
        const seat = e.seat;
        setTimeout(() => {
          spawnEmote({ anchors, bus: fxBus, lang, reduced: () => motionRef.current === 'reduced' }, seat, id);
          playSfx('pop');
        }, 800);
      }
    },
    // Anchors re-measure as each batch starts (the measurement lands a frame
    // in; the table bumps them on every reflow as well).
    () => anchors.bump(),
    {
      timings: timingsFor(motion),
      onEventEnd: (e, speed) => {
        landingSound(e, HUMAN);
        fx.end(e, speed);
        if (e.kind === 'dealScored') setDealerHop(false);
      },
      // A skip of any size is one short settle of air, not a hail of sounds.
      onSkip: (n) => {
        if (n >= 2) playSfx('settle');
      },
    },
  );

  getViewRef.current = getView;
  useEffect(() => {
    if (idle) {
      setSpotlight(null);
      setDealerHop(false);
    }
  }, [idle]);

  // The constructor already ran the bots to the first human decision; feed that
  // opening batch (deal animation included) into the director exactly once.
  const primed = useRef(false);
  if (!primed.current) {
    primed.current = true;
    // Deferred a tick so the first layout pass registers the anchors first.
    setTimeout(() => enqueue({ events: table.drainEvents(), finalView: table.view(HUMAN) }), 350);
  }

  const drain = useCallback(
    () => enqueue({ events: table.drainEvents(), finalView: table.view(HUMAN) }),
    [enqueue, table],
  );

  const submit = useCallback(
    (a: Action) => {
      // Buttons are disabled while the director drains, but a stale tap can
      // still slip through a re-render; the engine remains the authority.
      if (!idle || !table.isHumanTurn()) return;
      setBanner(null);
      try {
        table.submit(a);
      } catch {
        return;
      }
      drain();
    },
    [idle, table, drain],
  );

  const nextDeal = useCallback(() => {
    if (!idle || table.phase !== 'DEAL_OVER') return;
    setBanner(null);
    table.startNextDeal();
    drain();
  }, [idle, table, drain]);

  // Offline there is no server round-trip: the bubble is the whole emote.
  const emote = useCallback(
    (id: string) => {
      spawnEmote({ anchors, bus: fxBus, lang, reduced: () => motionRef.current === 'reduced' }, HUMAN, id);
      playSfx('pop');
    },
    [anchors, fxBus, lang],
  );

  return {
    table,
    view,
    idle,
    profile: profileRef.current,
    banner,
    anchors,
    fxBus,
    lang,
    myTurn: idle && view.toAct === HUMAN,
    spotlight,
    cue,
    dealerHop,
    motion,
    submit,
    nextDeal,
    emote,
  };
}
