import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { Seat } from '@belot/engine';
import { isGiftId, type GiftId } from '@belot/progression';
import type { AnchorMap } from '../anim/AnchorRegistry';
import type { FxBus } from '../anim/FxBus';
import { GIFT_FLY_MS } from '../anim/lifetimes';
import { playSfx } from '../audio';
import { pattern } from '../haptics';
import { spawnGift } from './fx';

/**
 * What each seat wears: its latest gift, and how many gifts have LANDED on it
 * (a puck bounces once per landing, never on a rebuild).
 */
export interface GiftSeats {
  ids: readonly (GiftId | null)[];
  landed: readonly number[];
  /** Who gave each seat its gift, when this client saw it land. */
  from: readonly (Seat | null)[];
}

export const NO_GIFTS: GiftSeats = { ids: [null, null, null, null], landed: [0, 0, 0, 0], from: [null, null, null, null] };

/**
 * The table's gifts, for the offline and the online game alike.
 *
 * A gift flies from the giver's puck and only becomes the receiver's badge
 * when it lands (like the dealer's button: the state follows the sprite, so a
 * badge never shows before its gift arrives). No flight — reduce-motion, the
 * app in the background, a puck not yet measured — and the badge is simply
 * there. The server's own record (`resync`) never overrides a seat whose gift
 * is still in the air.
 */
export function useGifts(opts: {
  anchors: AnchorMap;
  fxBus: FxBus;
  reduced: () => boolean;
  mySeat: () => Seat | null;
  /** Offline: kept by the screen above the match, so badges survive a rematch. */
  store?: { current: GiftSeats };
}) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const [seats, setSeats] = useState<GiftSeats>(() => opts.store?.current ?? NO_GIFTS);
  const [readyAt, setReadyAt] = useState(0);
  const pending = useRef([0, 0, 0, 0]);
  const gen = useRef([0, 0, 0, 0]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      timers.current.forEach(clearTimeout);
      timers.current.clear();
    };
  }, []);
  useEffect(() => {
    if (opts.store) opts.store.current = seats;
  }, [seats, opts.store]);

  const land = useCallback((t: Seat, id: GiftId, g: number, giver: Seat) => {
    pending.current[t] = Math.max(0, pending.current[t]! - 1);
    // A newer gift for this seat has set off since: it has the last word.
    if (!alive.current || gen.current[t] !== g) return;
    setSeats((prev) => {
      const ids = [...prev.ids];
      const landed = [...prev.landed];
      const from = [...prev.from];
      ids[t] = id;
      from[t] = giver;
      // Every landing counts, flown or not: a screen reader hears either, and
      // the puck's bounce starts and ends at rest, so it is safe even for a
      // gift that landed while the app was in the background (under
      // reduce-motion the puck skips it itself).
      landed[t] = landed[t]! + 1;
      return { ids, landed, from };
    });
  }, []);

  /** A gift from `from` to each of `to`: one sound and one touch, however many it is for. */
  const fly = useCallback(
    (from: Seat, to: readonly Seat[], id: GiftId) => {
      if (to.length === 0) return;
      const { anchors, fxBus, reduced, mySeat } = optsRef.current;
      const me = mySeat();
      const marks = to.map((t) => {
        pending.current[t] = pending.current[t]! + 1;
        gen.current[t] = gen.current[t]! + 1;
        return { t, g: gen.current[t]! };
      });
      const arrive = () => {
        marks.forEach(({ t, g }) => land(t, id, g, from));
        if (!alive.current) return;
        playSfx('gift');
        if (me !== null && to.includes(me)) pattern('giftLand');
      };
      if (reduced() || AppState.currentState !== 'active') {
        arrive();
        return;
      }
      void anchors.refresh().then(() => {
        if (!alive.current) return;
        const flew = marks.map(({ t }) => spawnGift({ anchors, bus: fxBus }, from, t, id, me));
        if (!flew.some(Boolean)) {
          arrive();
          return;
        }
        const h = setTimeout(() => {
          timers.current.delete(h);
          arrive();
        }, GIFT_FLY_MS);
        timers.current.add(h);
      });
    },
    [land],
  );

  /** The server's record of every seat's gift (online, on each room message). */
  const resync = useCallback((server: readonly (string | null | undefined)[]) => {
    setSeats((prev) => {
      let changed = false;
      const ids = [...prev.ids];
      for (let t = 0; t < 4; t++) {
        if (pending.current[t]! > 0) continue;
        const v = server[t];
        const next = typeof v === 'string' && isGiftId(v) ? v : null;
        if (ids[t] !== next) {
          ids[t] = next;
          changed = true;
        }
      }
      return changed ? { ids, landed: prev.landed, from: prev.from } : prev;
    });
  }, []);

  /** My own cooldown, after a send. */
  const arm = useCallback((ms: number) => setReadyAt(Date.now() + ms), []);

  /** Leaving the table: nobody's gift comes along. */
  const reset = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
    for (let t = 0; t < 4; t++) {
      gen.current[t] = gen.current[t]! + 1;
      pending.current[t] = 0;
    }
    setSeats(NO_GIFTS);
    setReadyAt(0);
  }, []);

  return {
    gifts: seats.ids,
    giftLanded: seats.landed,
    giftFrom: seats.from,
    giftReadyAt: readyAt,
    fly,
    resync,
    arm,
    reset,
  };
}

export type Gifts = ReturnType<typeof useGifts>;
