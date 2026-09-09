import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { counters } from '../dev/counters';

/**
 * Screen-position registry for animation anchors.
 *
 * Sprites need pixel positions for "seat 2", "seat 2's trick slot", "the
 * wallet". Anchored views report their WINDOW-space rect; the overlay converts
 * to its own space at spawn time by subtracting its own window origin. Storing
 * window coordinates sidesteps every relative-measure pitfall, and works no
 * matter where the overlay sits in the tree.
 *
 * Anchors are nullable by design: a missing anchor means "skip the sprite,
 * still commit the state change" — animation must never gate correctness.
 *
 * WHEN anchors measure. An anchor's own `onLayout` only fires when its own
 * layout changes; an ancestor reflow (a prompt row appearing, the result sheet
 * leaving) moves it silently. The first version answered that by re-measuring
 * every anchor after EVERY commit — with ~10 anchors on the table and the
 * director committing twice per event, that was ~20 `measureInWindow` calls
 * per tick, and on the web ten forced layouts per render. Now the map is told
 * when something reflowed (`bump()`), coalesces that into one pass on the next
 * frame, and the director bumps once as each batch starts animating — the one
 * moment a stale rect could actually be seen.
 */

export interface AnchorRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Listener = () => void;

/** Next frame on a device or in a browser; next tick where neither exists (tests). */
function nextFrame(fn: () => void): void {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => fn());
  else setTimeout(fn, 0);
}

export class AnchorMap {
  private rects = new Map<string, AnchorRect>();
  private listeners = new Set<Listener>();
  private pending = false;

  set(key: string, rect: AnchorRect): void {
    this.rects.set(key, rect);
  }

  /** Centre of an anchor in window space, or null when unknown. */
  centre(key: string): { x: number; y: number } | null {
    const r = this.rects.get(key);
    if (!r) return null;
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }

  rect(key: string): AnchorRect | null {
    return this.rects.get(key) ?? null;
  }

  /**
   * Something moved a subtree without changing any anchor's own layout. Every
   * anchor re-measures once, on the next frame, however many times this is
   * called before then.
   */
  bump(): void {
    if (this.pending) return;
    this.pending = true;
    nextFrame(() => {
      this.pending = false;
      for (const l of this.listeners) l();
    });
  }

  /**
   * Re-measure now, and resolve once the measurements have had a frame to
   * land — for the moment before a sprite is spawned from a screen that has
   * been scrolled since the anchors last reported.
   */
  refresh(): Promise<void> {
    for (const l of this.listeners) l();
    return new Promise((resolve) => nextFrame(() => nextFrame(resolve)));
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

const Ctx = createContext<AnchorMap | null>(null);

/**
 * The map is created by the game screen (which also hands it to the fx
 * spawner) and provided here so `Anchor`s inside the table can register.
 */
export function AnchorHost({ map, children }: { map: AnchorMap; children: ReactNode }) {
  return <Ctx.Provider value={map}>{children}</Ctx.Provider>;
}

export function useAnchors(): AnchorMap {
  const map = useContext(Ctx);
  if (!map) throw new Error('useAnchors outside AnchorHost');
  return map;
}

/**
 * Wrap anything that sprites fly to or from. `collapsable={false}` keeps the
 * Android view from being optimized away, which would make it unmeasurable.
 */
export function Anchor({
  id,
  children,
  style,
}: {
  id: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const map = useAnchors();
  const ref = useRef<View>(null);
  const measure = useCallback(() => {
    counters.measure++;
    ref.current?.measureInWindow((x, y, w, h) => {
      if (Number.isFinite(x) && Number.isFinite(y)) map.set(id, { x, y, w, h });
    });
  }, [map, id]);
  // Once on mount, then whenever the map is told the table reflowed.
  useEffect(() => {
    measure();
    return map.subscribe(measure);
  }, [map, measure]);
  return (
    <View ref={ref} collapsable={false} style={style} onLayout={measure}>
      {children}
    </View>
  );
}
