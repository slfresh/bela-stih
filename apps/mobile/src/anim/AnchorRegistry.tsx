import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Screen-position registry for animation anchors.
 *
 * Sprites need pixel positions for "seat 2", "seat 2's trick slot", "the
 * wallet". Anchored views report their WINDOW-space rect on every layout; the
 * overlay converts to its own space at spawn time by subtracting its own
 * window origin. Storing window coordinates sidesteps every relative-measure
 * pitfall, and works no matter where the overlay sits in the tree.
 *
 * Anchors are nullable by design: a missing anchor means "skip the sprite,
 * still commit the state change" — animation must never gate correctness.
 */

export interface AnchorRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class AnchorMap {
  private rects = new Map<string, AnchorRect>();

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
  const measure = () => {
    ref.current?.measureInWindow((x, y, w, h) => {
      if (Number.isFinite(x) && Number.isFinite(y)) map.set(id, { x, y, w, h });
    });
  };
  // `onLayout` only fires when THIS view's layout changes — an ancestor reflow
  // (a prompt row appearing, the result sheet leaving) moves it silently. Those
  // reflows always come from a re-render, so re-measuring after every commit
  // keeps the window rect at most one render behind.
  useEffect(measure);
  return (
    <View ref={ref} collapsable={false} style={style} onLayout={measure}>
      {children}
    </View>
  );
}
