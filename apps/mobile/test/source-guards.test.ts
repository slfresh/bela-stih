import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Pins that live in the source rather than in behaviour.
 *
 * Each of these guards a fix whose failure mode is silent: a card face that
 * loses its memo just renders twelve times a tick again, an anchor that goes
 * back to measuring on every commit just costs frames, and nothing in a test
 * of behaviour would notice. So the text itself is checked.
 */

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel: string) => readFileSync(join(here, '../src', rel), 'utf8');

describe('the card tree stays memoised', () => {
  it('CardFace, CardBackFace, PlayingCard, SeatPuck and FanCard are wrapped in memo', () => {
    const cardFace = src('deck/CardFace.tsx');
    expect(cardFace).toMatch(/export const CardFace = memo\(/);
    expect(cardFace).toMatch(/export const CardBackFace = memo\(/);
    expect(src('PlayingCard.tsx')).toMatch(/export const PlayingCard = memo\(/);
    expect(src('table/SeatPuck.tsx')).toMatch(/export const SeatPuck = memo\(/);
    expect(src('TableScreen.tsx')).toMatch(/const FanCard = memo\(/);
  });

  it('a memoised card never reads cosmetics() during its own render', () => {
    // The parent reads it and passes it down, so a deck change reaches the
    // card as a changed prop instead of being swallowed by the memo.
    const cardFace = src('deck/CardFace.tsx');
    expect(cardFace).not.toMatch(/cosmetics\(\)/);
    const playingCard = src('PlayingCard.tsx');
    const body = playingCard.slice(playingCard.indexOf('export const PlayingCard'));
    expect(body).not.toMatch(/cosmetics\(\)/);
  });
});

describe('anchors measure on demand', () => {
  it('has no bare useEffect(measure) that re-measures on every commit', () => {
    const registry = src('anim/AnchorRegistry.tsx');
    expect(registry).not.toMatch(/useEffect\(measure\)/);
    expect(registry).toMatch(/map\.subscribe\(measure\)/);
  });

  it('the table re-measures whenever a row around the felt comes or goes', () => {
    // A status line, a chip row or a prompt moves every anchor without any
    // of them changing its own layout; on the web onLayout cannot see a move.
    const table = src('TableScreen.tsx');
    expect(table).toMatch(/const reflowKey = \[/);
    expect(table).toMatch(/\}, \[anchors, reflowKey\]\);/);
    expect(table.match(/onLayout=\{\(\) => anchors\.bump\(\)\}/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('my turn lights my own puck, from the rendered turn state alone', () => {
    // Turn visuals may fade OUT across a drain but must never be held ON by
    // anything the director suppresses on intermediate views.
    const table = src('TableScreen.tsx');
    expect(table).toMatch(/yourTurn=\{myTurn && !settled\}/);
    expect(table).not.toMatch(/spotlightSeat === mySeat/);
    // The bar along the top of the hand is gone: the puck is the signal now.
    expect(table).not.toMatch(/TurnBeacon/);
    expect(existsSync(join(here, '../src/table/TurnBeacon.tsx'))).toBe(false);
  });

  it('the motion policy has one source: the table reads a prop, the games read the hook', () => {
    expect(src('TableScreen.tsx')).not.toMatch(/useReduceMotion/);
    expect(src('anim/useMotionPolicy.ts')).toMatch(/useReduceMotion\(\)/);
    expect(src('useGame.ts')).toMatch(/timingsFor\(motion\)/);
    expect(src('net/useNetGame.ts')).toMatch(/timingsFor\(motionRef\.current\)/);
  });

  it('every button and chip presses through PressScale, which clicks for it', () => {
    // A press that plays its own tap on top of PressScale's would click twice;
    // a bare Pressable would neither give nor click.
    expect(src('TableScreen.tsx')).not.toMatch(/function Button\(/);
    for (const f of ['HomeScreen.tsx', 'screens/common.tsx', 'table/EmoteStrip.tsx', 'screens/SettingsScreen.tsx', 'screens/ShopScreen.tsx']) {
      expect(src(f), f).not.toMatch(/<Pressable\b/);
    }
    for (const f of ['HomeScreen.tsx', 'screens/common.tsx', 'table/EmoteStrip.tsx']) {
      expect(src(f), f).not.toMatch(/playSfx\('tap'\)/);
    }
    // The shop tile is silent itself; act() clicks only when a selection really changes.
    expect(src('screens/ShopScreen.tsx')).toMatch(/sound=\{null\}/);
    // The Switch is not a pressable; its click stays.
    expect(src('screens/SettingsScreen.tsx').match(/playSfx\('tap'\)/g)?.length ?? 0).toBe(1);
  });

  it('screens and the table enter; nothing ever exits', () => {
    // There is no router to hold the old screen for an exit animation, and a
    // rematch remount would show two tables.
    expect(readFileSync(join(here, '../App.tsx'), 'utf8')).not.toMatch(/exiting=/);
    expect(src('TableScreen.tsx')).not.toMatch(/exiting=/);
    // Reanimated's web build cannot run a custom entering worklet (it warns
    // and skips it): the web gets a preset, the phone the flip and the zoom.
    expect(src('TableScreen.tsx')).toMatch(
      /entering=\{reduced \? undefined : Platform\.OS === 'web' \? FadeIn\.duration\(240\) : feltEntering\}/,
    );
    // ...on every mount, a rotation's included: playing it once only (tried in
    // 1.2.6's making) doubled reanimated's dead-view flood on quick rotations.
    expect(src('TableScreen.tsx')).toMatch(/entering=\{reduced \? undefined : ZoomIn\.delay\(/);
    // The fan's cards have no entrance of their own (see 'a rotation never
    // leaves the fan invisible'): the dealt back lands where the card is.
    expect(src('TableScreen.tsx')).not.toMatch(/cardEntering/);
  });

  it('a rotation never leaves the fan invisible', () => {
    // 1.2.5: a card's reanimated `entering` flip shared its view with the
    // `layout` transition. A rotation remounts the fan, every card flipped
    // again, and the rotation's second layout pass started the transition
    // over the flip and left it on its first frames — the whole hand at ~3%
    // opacity and a fifth of its width for the rest of the deal, on the
    // Samsung in 8 of 24 quick flips. No animated view may pair the two.
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.tsx') ? [join(dir, e.name)] : [],
      );
    // Read by the TypeScript parser, not by pattern: any JSX element, whatever
    // its tag (Animated.View, a createAnimatedComponent, anything), with both
    // props — a comment or a '>' in a label cannot hide one.
    const scan = (name: string, s: string) => {
      const sf = ts.createSourceFile(name, s, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const paired: string[] = [];
      const layouts: string[] = [];
      let elements = 0;
      const visit = (n: ts.Node): void => {
        if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
          elements++;
          const props = n.attributes.properties.filter(ts.isJsxAttribute).map((a) => a.name.getText(sf));
          const at = `${name}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1} <${n.tagName.getText(sf)}>`;
          if (props.includes('layout')) layouts.push(at);
          if (props.includes('layout') && props.includes('entering')) paired.push(at);
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
      return { paired, layouts, elements };
    };
    // The scan itself: it sees 1.2.5's pairing, and one behind a comment or a
    // label with a '>' in it; it does not join two elements' props.
    const fan125 = `const x = <Animated.View
        style={[styles.fanCard, { marginLeft, zIndex }]}
        // a note -> with an arrow in it
        layout={reduced ? undefined : LinearTransition.duration(220)}
        entering={reduced ? undefined : Platform.OS === 'web' ? FadeIn.duration(180) : cardEntering}
      ><Card /></Animated.View>;`;
    expect(scan('fan125.tsx', fan125).paired).toHaveLength(1);
    expect(scan('label.tsx', `const x = <Flip accessibilityLabel="a > b" layout={x} entering={(p) => p > 0 ? y : z} />;`).paired)
      .toHaveLength(1);
    expect(scan('apart.tsx', `const x = <Animated.View layout={x}>{/* entering= */}<Animated.View entering={y} /></Animated.View>;`).paired)
      .toEqual([]);
    const files = [...walk(join(here, '../src')), join(here, '../App.tsx')];
    expect(files.some((f) => f.endsWith('TableScreen.tsx'))).toBe(true);
    let elements = 0;
    for (const f of files) {
      const r = scan(f, readFileSync(f, 'utf8'));
      elements += r.elements;
      expect(r.paired).toEqual([]);
    }
    expect(elements).toBeGreaterThan(500); // the scan really read the tree
    const t = src('TableScreen.tsx');
    // A card has no entrance animation at all: the dealt back lands on its
    // spot. Its flip, as `entering`, went invisible on a rotation; as a shared
    // value, its first frame came back as slivers after a pause (#9574); and
    // the view that could shed it made every rotation's teardown heavier.
    const card = t.slice(t.indexOf('const FanCard = memo('), t.indexOf('const feltEntering'));
    expect(card.length).toBeGreaterThan(1000);
    expect(card).not.toMatch(/scaleX|useState\(|runOnJS|entering=/);
    // The lift animates only on a change: a spring to where a card already
    // rests kept writing to views a quick second rotation had torn down, and
    // reanimated 4.5.1 re-applies such a dead view's props on every native
    // event until its registry lets it go — tens of thousands of exceptions on
    // the UI thread over a few quick rotations. The same for everything a
    // rotation rebuilds: the pucks' ring fade, the turn ring's breath, the XP bar.
    expect(card).toMatch(/if \(liftedTo\.current === lift\) return;/);
    expect(src('table/SeatPuck.tsx')).toMatch(/if \(ringWas\.current === active\) return;/);
    expect(src('anim/TurnRing.tsx')).toMatch(/\} else if \(breathed\.current\) \{/);
    expect(t).toMatch(/if \(filledTo\.current === p\.fraction\) return;/);
    // No layout transition anywhere on the table: 4.5.1 could drop one's
    // frames under a rotation's re-render and leave a card standing behind its
    // neighbour (seen on the Samsung once the flip was fixed).
    expect(scan('TableScreen.tsx', t).layouts).toEqual([]);
    // Reanimated's static flags stay as shipped. Turning its settled-props
    // sync off (the documented workaround for #9574) made 4.5.1 on RN 0.86
    // push every retained value into views a rotation had already destroyed,
    // on every frame: 20 000 exceptions logged in 50 s, until the table
    // stopped following the phone round at all.
    const pkg = JSON.parse(readFileSync(join(here, '../package.json'), 'utf8'));
    expect(pkg.reanimated).toBeUndefined();
    // The hold's swell and the last tap's rect do not outlive the view they belonged to.
    expect(t).toMatch(/useEffect\(\(\) => \{\s*hold\.value = 1;\s*\}, \[land, hold\]\);/);
    expect(t).toMatch(/\(\) => \(\) => \{\s*if \(lastTap\.current !== null\) anchors\.delete\(anchorId\.card\(lastTap\.current\)\);/);
  });

  it('the zvanja are said once: chips only while the table is asked, and never for bela', () => {
    const t = src('TableScreen.tsx');
    expect(t).toMatch(/const spokenCalls = callsOnTable\(view\);/);
    expect(t).toMatch(/!settled && spokenCalls\.length > 0 \? \(/);
    // The gold bela chip is gone; its bubble and the king and queen's glow say it once.
    expect(t).not.toMatch(/callChip\('bela'/);
    expect(t).not.toMatch(/callChipGold/);
    expect(t).not.toMatch(/belaAnnouncedBy/);
    expect(t).not.toMatch(/revealedSeats/);
    expect(src('table/fx.ts')).toMatch(/case 'belaCalled':\s*bubble\(/);
  });

  it("a card's place is React's; one animated view carries its arc, tilt and lift", () => {
    // The place in the row is flex's (React's): an animated place came back
    // at its first frame when reanimated lost the finished value (#9574). The
    // arc, the tilt and the lift share one animated view, as in 1.2.5: a
    // separate plain view for the tilt made the table lag a whole orientation
    // behind over quick rotations.
    const fan = src('TableScreen.tsx');
    expect(fan).toMatch(/<View style=\{\[styles\.fanCard, \{ marginLeft, zIndex \}\]\}>\s*<Animated\.View style=\{motion\}>\s*<Pressable/);
    expect(fan).toMatch(/transform: \[\{ translateY: baseY \+ liftV\.value \}, \{ rotateZ: `\$\{rotate\}deg` \}\],/);
    expect(fan).not.toMatch(/translateX: xV|useSharedValue\(x\)/);
    expect(fan).toMatch(/fanCard: \{\},/);
    expect(fan).toMatch(/marginLeft=\{i === 0 \? 0 : fit\.overlap\}/);
  });

  it('the spotlight clears on a seatless beat, and the countdown survives reduce-motion', () => {
    expect(src('useGame.ts')).toMatch(/setSpotlight\('seat' in e \? e\.seat : null\)/);
    expect(src('net/useNetGame.ts')).toMatch(/setSpotlight\('seat' in e \? e\.seat : null\)/);
    expect(src('anim/TurnRing.tsx')).toMatch(/reduceMotion: ReduceMotion\.Never/);
    expect(src('TableScreen.tsx')).toMatch(/m\.promptReserve/);
  });

  it('the reveal comes down at REVEAL_MS, imported from the director in one place', () => {
    const table = src('TableScreen.tsx');
    expect(table).toMatch(/leaveReveal\(REVEAL_MS - REVEAL_EXIT_MS\)/);
    expect(table).not.toMatch(/setTimeout\([^)]*5000/);
    expect(src('table/RevealRow.tsx')).toMatch(/duration: REVEAL_MS/);
    expect(src('table/RevealRow.tsx')).toMatch(/reduceMotion: ReduceMotion\.Never/);
  });

  it('every haptic goes through the pattern table, behind one gate', () => {
    // feedback.ts used to carry its own `haptics` flag and call expo-haptics
    // directly; two gates drifted. Now only haptics.ts touches the module.
    for (const f of ['feedback.ts', 'TableScreen.tsx', 'table/useTurnCues.ts', 'ui/PressScale.tsx', 'HomeScreen.tsx']) {
      expect(src(f), f).not.toMatch(/from 'expo-haptics'/);
    }
    expect(src('feedback.ts')).not.toMatch(/haptics:/);
  });

  it('the default volume is one of the chips, and the online cleanup is a departure', () => {
    // A default that matches no chip lit nothing on a fresh install.
    const storage = src('storage.ts');
    const options = storage.match(/VOLUME_OPTIONS = \[([^\]]*)\]/)![1]!.split(',').map((v) => Number(v.trim()));
    const dflt = Number(storage.match(/DEFAULT_SETTINGS: Settings = \{[^}]*volume: ([\d.]+)/s)![1]);
    expect(options).toContain(dflt);
    // colyseus fires onLeave for a consented leave too: the refs go first, or
    // the drop handler buzzes and reconnects for a minute on the home screen.
    expect(src('net/useNetGame.ts')).toMatch(/roomRef\.current = null;\s*reconnectTokenRef\.current = null;\s*void room\?\.leave\(true\)/);
    // A banner change never clears the previous banner's timers.
    for (const f of ['OfflineGame.tsx', 'net/OnlineGame.tsx']) {
      expect(src(f), f).toMatch(/useEffect\(\(\) => \(\) => timers\.current\.forEach\(clearTimeout\), \[\]\)/);
      expect(src(f), f).not.toMatch(/return \(\) => timers\.forEach\(clearTimeout\)/);
    }
  });

  it('a cue plays once even across a remount, and a fresh online table has none', () => {
    expect(src('TableScreen.tsx')).toMatch(/const seenCue = useRef\(cue\?\.n \?\? 0\);/);
    const net = src('net/useNetGame.ts');
    expect((net.match(/setCue\(null\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('the level and the wallet move when their sounds play', () => {
    const t = src('TableScreen.tsx');
    expect(t).toMatch(/const xp = useLaggedNumber\(profile\.xp, lag, 1\);/);
    expect(t).toMatch(/levelProgress\(xp\)/);
    expect(t).not.toMatch(/levelProgress\(profile\.xp\)/);
  });

  it('the felt is drawn by FeltArt under a transparent, pinned frame', () => {
    const t = src('TableScreen.tsx');
    // The frame's numbers position the trick cross; FeltArt paints under them.
    expect(t).toMatch(/felt: \{[^}]*backgroundColor: 'transparent'[^}]*borderWidth: 6[^}]*borderColor: 'transparent'[^}]*padding: 5[^}]*marginVertical: 4/s);
    expect(t).toMatch(/<FeltArt[^>]*width=\{feltBox\.w \+ 2 \* \(RIM_W \+ FELT_PAD\)\}/);
    expect(t).not.toMatch(/FeltGlow/);
    // Every page reads the room, so a felt cosmetic recolours the whole app.
    for (const f of ['HomeScreen.tsx', 'net/OnlineGame.tsx', 'screens/common.tsx', 'DeckGallery.tsx', 'WebShell.tsx']) {
      expect(src(f), f).toMatch(/backgroundColor: room\(\)\.page/);
    }
    expect(t).toMatch(/backgroundColor: baize\.page/);
  });

  it('my puck stands beside my hand without stealing the hand\'s anchor', () => {
    const t = src('TableScreen.tsx');
    expect(t).toMatch(/anchored=\{false\}/);
    expect(t).toMatch(/<Anchor id=\{anchorId\.seat\(mySeat\)\} style=\{\[styles\.handArea/);
    expect(t).not.toMatch(/myTimer/); // the clock is on the puck now
    expect(src('table/SeatPuck.tsx')).toMatch(/anchored \? anchorId\.seat\(seat\) : anchorId\.puck\(seat\)/);
  });

  it('the lobby is a seat map on a felt, with a way back from an error', () => {
    const online = src('net/OnlineGame.tsx');
    expect(online).toMatch(/<SeatMap/);
    expect(online).not.toMatch(/styles\.teamRow/);
    expect(online).toMatch(/onPress=\{net\.retry\}/);
    const map = src('net/SeatMap.tsx');
    expect(map).toMatch(/<FeltArt/);
    expect(map).toMatch(/seatPosition\(seat, me\)/);
    expect(map).toMatch(/anchored=\{false\}/);
  });

  it('the invitation carries the code, and the felt carries only the seats', () => {
    // The code sat on a plate in the middle of the seat map, wider than the
    // gap the side seats leave on any phone under ~380 dp: two pucks, a name
    // and the host's crown were drawn over it. On its side the phone pushed
    // both buttons under the fold, and a browser with no share sheet did
    // nothing at all when "Pozovi prijatelje" was pressed.
    const map = src('net/SeatMap.tsx');
    expect(map).not.toMatch(/styles\.plate|roomId|lang\.s\.ui\.tableCode/);
    const online = src('net/OnlineGame.tsx');
    const waiting = online.slice(online.indexOf('function Waiting'));
    expect(waiting).toMatch(/<Panel[\s\S]*\{net\.roomId\}[\s\S]*label=\{ui\.invite\}/);
    expect(waiting).toMatch(/clipboard\?\.writeText\?\.\(text\)/);
    // Only the web falls back, and a cancelled share sheet is not a failure.
    expect(waiting).toMatch(/if \(Platform\.OS !== 'web' \|\| \(err as \{ name\?: string \} \| null\)\?\.name === 'AbortError'\) return;/);
    expect(waiting).toMatch(/ui\.inviteCopied/);
    expect(waiting).toMatch(/land && styles\.row/);
  });

  it('the rail\'s trump buttons say the suit alone and read the full call aloud', () => {
    const t = src('TableScreen.tsx');
    expect(t).toMatch(/\(compact \|\| short\) && a\.type === 'BID_CALL'\s*\? lang\.suitName\(a\.suit\)/);
    expect(t).toMatch(/accessibilityLabel=\{lang\.action\(a\)\}/);
  });

  it('the overlay sizes itself, caps its sprites, and the ambient loops are CSS animations', () => {
    const overlay = src('anim/EffectsOverlay.tsx');
    expect(overlay).not.toMatch(/useWindowDimensions/);
    expect(overlay).toMatch(/MAX_LIVE_SPRITES = 40/);
    expect(overlay).toMatch(/CONFETTI_PIECES = Platform\.OS === 'web' \? 18 : 26/);
    // A loop on a shared value is a JS timer on the web; a CSS animation is the compositor's.
    expect(src('table/SeatPuck.tsx')).not.toMatch(/withRepeat/);
    expect(src('table/SeatPuck.tsx')).toMatch(/const yourTurnPing: CSSAnimationProperties/);
    expect(src('table/SeatPuck.tsx')).toMatch(/const yourTurnBreath: CSSAnimationProperties/);
    expect(src('table/SeatPuck.tsx')).toMatch(/const thinkPulse: CSSAnimationProperties/);
    expect(src('TableScreen.tsx')).toMatch(/const ghostBreath: CSSAnimationProperties/);
  });

  it('the home screen no longer re-renders on every scroll event', () => {
    const home = src('HomeScreen.tsx');
    expect(home).not.toMatch(/setScrollTick/);
    expect(home).not.toMatch(/onScroll=/);
  });
});

describe('sprite timing has one source of truth', () => {
  it('the overlay carries no hard-coded card width or sprite duration', () => {
    const overlay = src('anim/EffectsOverlay.tsx');
    expect(overlay).not.toMatch(/const CARD_W/);
    expect(overlay).not.toMatch(/withTiming\(1, \{ duration: 240/);
    expect(overlay).not.toMatch(/withTiming\(1, \{ duration: 320/);
    expect(overlay).toMatch(/from '\.\/lifetimes'/);
    // The unmount timer is the lifetime, full stop.
    expect(overlay).toMatch(/\}, lifetimeOf\(fx\)\);/);
    expect(overlay).not.toMatch(/lifetimeOf\(fx\) \+ \d+/);
  });

  it('the spawner scales every duration by the speed it is given', () => {
    const fx = src('table/fx.ts');
    expect(fx).toMatch(/flightDuration\(.*\) \* speed/);
    expect(fx).not.toMatch(/duration: 260/);
  });

  it('fx.ts stays free of react-native, so the golden-timings test can run under node', () => {
    expect(src('table/fx.ts')).not.toMatch(/from 'react-native/);
  });
});

describe('the first frame and the last resort', () => {
  it('every screen renders inside the error boundary', () => {
    // A thrown render used to leave a blank page with no way back. The
    // boundary must wrap the screen switch itself, not sit inside one branch.
    const app = readFileSync(join(here, '../App.tsx'), 'utf8');
    const open = app.indexOf('<ErrorBoundary');
    const close = app.indexOf('</ErrorBoundary>');
    expect(open).toBeGreaterThan(-1);
    expect(app.slice(open, close)).toMatch(/\{content\}/);
    expect(app.slice(open, close)).toMatch(/onReset=/);
  });

  it('the phone-sized lobby stays legible', () => {
    // Both were found on a real 360 dp phone with the release build: the
    // word on the baize sat across all three characters, and the two mode
    // tiles clipped their own titles to "Igraj proti…".
    const hero = src('home/TableHero.tsx');
    expect(hero).toMatch(/heroLayout\(width, label\)/);
    expect(hero).not.toMatch(/\.\.\.type\.h1/);
    expect(hero).not.toMatch(/paddingHorizontal: space\./);
    const home = src('HomeScreen.tsx');
    const tile = home.slice(home.indexOf('function ModeTile'), home.indexOf('const styles'));
    expect(tile).not.toMatch(/numberOfLines=\{1\}/);
    expect((tile.match(/numberOfLines=\{2\}/g) ?? []).length).toBe(2);
  });

  it('a packaged build can reach the real server without an env var', () => {
    // eas.json sets EXPO_PUBLIC_SERVER_URL; a local `gradlew bundleRelease`
    // does not read eas.json, and versionCode 15 and 16 shipped to the Play
    // track dialling ws://localhost:2567.
    const net = src('net/useNetGame.ts');
    expect(net).toMatch(/export const PRODUCTION_SERVER_URL = 'wss:\/\/belastih\.com';/);
    expect(net).toMatch(/return dev \? 'ws:\/\/localhost:2567' : PRODUCTION_SERVER_URL;/);
    // The localhost default survives only behind the development flag.
    const hits = net.match(/'ws:\/\/localhost:2567'/g) ?? [];
    expect(hits.length).toBe(1);

    // …and the build refuses to hand over an artifact that still names it.
    const build = readFileSync(join(here, '../../../scripts/build-android.sh'), 'utf8');
    expect(build).toMatch(/EXPO_PUBLIC_SERVER_URL:-wss:\/\/belastih\.com/);
    expect(build).toMatch(/index\.android\.bundle/);
    expect(build).toMatch(/not shippable/);
    expect(build).toMatch(/ws:\/\/localhost:2567" in blob/);
  });

  it('the table as the player asked for it: my puck under my cards, leaving in a corner and asked first', () => {
    const t = src('TableScreen.tsx');
    // Portrait: the fan, then my puck centred, then the faces.
    const portrait = t.slice(t.indexOf('{/* wallet / level strip'));
    const hand = portrait.indexOf('{handBlock}');
    const puck = portrait.indexOf('<View style={styles.selfRow} pointerEvents="box-none">{selfPuck}</View>');
    const faces = portrait.indexOf('{!shed && emotes}');
    expect(hand).toBeGreaterThan(-1);
    expect(puck).toBeGreaterThan(hand);
    expect(faces).toBeGreaterThan(puck);
    // Leaving: in the top row beside the profile strip, and at the top of the right rail.
    expect(portrait.slice(0, portrait.indexOf('<TableHeader'))).toMatch(/\{leaveButton\}/);
    expect(t).toMatch(/<View style=\{\[styles\.rail, styles\.railRight, \{ width: m\.railW \}\]\}>\s*\{leaveButton\}/);
    // …and nowhere in the actions row a thumb reaches for mid-deal.
    const rowAt = portrait.indexOf('<View style={styles.actionsRow}>');
    expect(rowAt).toBeGreaterThan(-1);
    const row = portrait.slice(rowAt);
    const rowEnd = row.indexOf('</View>');
    expect(rowEnd).toBeGreaterThan(0);
    expect(row.slice(0, rowEnd)).toMatch(/emoteToggle/); // the slice is really the row
    expect(row.slice(0, rowEnd)).not.toMatch(/finishLabel|onFinish/);
    // Every way out asks first while a match is on.
    expect(t).toMatch(/onPress=\{requestLeave\}/);
    expect(t).toMatch(/onFinish=\{requestLeave\}/);
    expect(t).toMatch(/<ConfirmDialog/);
    expect(t).toMatch(/setBackGuard\(/);
    const app = readFileSync(join(here, '../App.tsx'), 'utf8');
    expect(app).toMatch(/if \(runBackGuard\(\)\) return true;/);
    // A short phone sheds the emote strip and the bot line while a prompt is up.
    expect(t).toMatch(/const shed = m\.shortColumn && \(asking \|\| belaOffered\);/);
    expect(t).toMatch(/a\.type === 'BID_CALL' \|\| a\.type === 'BID_PASS'/);
    // The dialog never outlives the match it was about.
    expect(t).toMatch(/\{leaving && !matchOver && \(/);
    expect(t).toMatch(/if \(!matchOverRef\.current\) onFinish\(\);/);
    // The constants the budget uses are the ones the styles use.
    expect(t).toMatch(/rootLand: \{[^}]*gap: LAND_GAP/);
    expect(src('table/SeatPuck.tsx')).toMatch(/const width = size \+ PUCK_NAME_ROOM;/);
    expect(portrait).toMatch(/\{!shed && emotes\}/);
    expect(portrait).toMatch(/\{status && !shed \?/);
    // The corner letters are gone from the cards.
    const face = src('deck/CardFace.tsx');
    expect(face).not.toMatch(/CornerIndex|cornerIndex|indexColour/);
    // Whatever a corner index is called, it is text away from the centre line:
    // every SVG text on a mađarica is the printing's own, at x = 50.
    const xs = [...face.matchAll(/<SvgText\s+x=(\{[^}]*\}|"[^"]*")/g)].map((m) => m[1]);
    expect(xs.length).toBeGreaterThan(0);
    for (const x of xs) expect(x, 'an SvgText off the centre line').toBe('"50"');
    // The vintage card is the photograph alone: no text or overlay drawn on it.
    expect(face).not.toMatch(/<RNText|Text as RNText/);
    expect(face).toMatch(/if \(style === 'starinske'\) \{\s*return \(\s*<RNImage/);
    expect(existsSync(join(here, '../src/deck/cornerIndex.ts'))).toBe(false);
  });

  it('the phrases open in the faces\' own place, never over a puck, in either orientation', () => {
    const s = src('table/EmoteStrip.tsx');
    // Portrait: the phrase row is the glyph row's 34px, in the flow — it used
    // to float 40px up, which is where my puck has stood since 1.2.2.
    const row = s.match(/phraseRow: \{[^}]*\}/)?.[0] ?? '';
    expect(row).not.toBe('');
    expect(row).not.toMatch(/absolute/);
    expect(row).toMatch(/height: 34\b/);
    // …and the glyphs make way while it is open, or the strip would be two rows.
    expect(s).toMatch(/\{!open && \(/);
    // Landscape: nothing floats either — the phrases once opened over the
    // right-hand player. They fill the faces' own 74x114 box in the rail.
    expect(s).not.toMatch(/position: 'absolute'/);
    expect(s).not.toMatch(/phraseCol|inPlace/);
    expect(s).toMatch(/wrapRail: \{[^}]*height: LAND_TRAY_H/);
    expect(s).toMatch(/faceGrid: \{[^}]*width: LAND_TRAY_W/);
    expect(s).toMatch(/phraseChipRail: \{[^}]*height: LAND_PHRASE_H/);
    expect(s).toMatch(/phraseChipRail: \{[^}]*paddingHorizontal: 6/);
    expect(s).toMatch(/includeFontPadding: false/);
  });

  it('the landscape emote box lives in the right rail, never over the table beside it', () => {
    const t = src('TableScreen.tsx');
    // The float that stood here put the faces' right edge on the right-hand
    // player's box, and the phrases over the rest of the disc.
    expect(t).not.toMatch(/emoteFloat/);
    expect(t).not.toMatch(/right: m\.railW/);
    expect(t).not.toMatch(/tightRail/);
    // The box is the rail's measured free gap's; it gives way when a question takes the room.
    const rail = t.slice(t.indexOf('styles.railRight'), t.indexOf('{/* wallet / level strip'));
    expect(rail).toMatch(/<View\s+style=\{styles\.railGap\}\s+onLayout=\{\(e\) => setTrayFits\(e\.nativeEvent\.layout\.height >= LAND_TRAY_H\)\}\s*>/);
    expect(rail).toMatch(/\{trayFits && emotes \? \(\s*<View style=\{styles\.traySlot\} pointerEvents="box-none">/);
    expect(t).toMatch(/railGap: \{ flex: 1, alignSelf: 'stretch', overflow: 'hidden' \}/);
    expect(t).toMatch(/traySlot: \{ position: 'absolute', top: 0, left: 0, right: 0, height: LAND_TRAY_H \}/);
    expect(t).toMatch(/const trayShown = land \? trayFits : !shed;/);
    expect(t).toMatch(/if \(!trayShown\) setTrayOpen\(false\);/);
    expect(t).toMatch(/disabled=\{!trayShown\}/);
    // A tap meant for a face cannot land on the bid that took its place.
    expect(t).toMatch(/useLayoutEffect\(\(\) => \{\s*if \(land && boxWasUp\.current && !boxUp && !settled\) railQuietUntil\.current = Date\.now\(\) \+ 300;/);
    expect(t).toMatch(/if \(Date\.now\(\) >= railQuietUntil\.current\) onAction\(a\);/);
    expect(rail).toMatch(/<NonCardActions options=\{options\} lang=\{lang\} onChoose=\{answer\} compact \/>/);
    expect(t).toMatch(/answer\(\{ type: 'DECLARE_SKIP', seat: mySeat \}\)/);
    // Never an open tray behind a resting toggle; every landscape entry measures afresh.
    expect(t).toMatch(/const trayOpenShown = trayOpen && trayShown;/);
    expect(t).toMatch(/open=\{trayOpenShown\}/);
    expect(t).toMatch(/trayOpenShown && styles\.emoteToggleOn/);
    expect(t).toMatch(/if \(trayShown\) setTrayOpen\(\(o\) => !o\);/);
    expect(t).toMatch(/if \(!land\) setTrayFits\(false\);/);
    // …and a second tap on the bid cannot land on the face that came back.
    expect(t).toMatch(/if \(land && !boxWasUp\.current && boxUp && !settled\) faceQuietUntil\.current = Date\.now\(\) \+ 300;/);
    expect(t).toMatch(/const sendEmote = \(id: string\) => \{\s*\/\/[^\n]*\n\s*if \(Date\.now\(\) < faceQuietUntil\.current\) return;/);
    // A press that outlives its control's enabling neither clicks nor acts.
    expect(src('ui/PressScale.tsx')).toMatch(/onPress=\{\(e\) => \{[\s\S]*?if \(rest\.disabled\) return;\s*if \(sound\) playSfx\(sound\);/);
    // Portrait keeps answering at once: its guard never arms.
    const portrait = t.slice(t.indexOf('{/* wallet / level strip'));
    expect(portrait).toMatch(/<NonCardActions options=\{options\} lang=\{lang\} onChoose=\{onAction\} short=\{short\} \/>/);
  });

  it('a short column is built from the numbers its budget counts, and only there', () => {
    const t = src('TableScreen.tsx');
    expect(src('table/metrics.ts')).toMatch(/export const SHORT_CHROME = 8 \+ 30 \+ 32 \+ 24 \+ 46 \+ 34 \+ 42 \+ 8 \* 4;/);
    // Each number the sum uses, in the style that draws it.
    expect(t).toMatch(/rootShort: \{ paddingVertical: 4, gap: 4 \}/);
    expect(t).toMatch(/profileBarSlim: \{ paddingVertical: 2 \}/);
    expect(t).toMatch(/leaveSlim: \{ paddingVertical: 4 \}/);
    expect(t).toMatch(/teamPillSlim: \{ paddingVertical: 1 \}/);
    expect(t).toMatch(/pillValueSlim: \{ lineHeight: 20 \}/);
    expect(t).toMatch(/feltFlush: \{ marginVertical: 0 \}/);
    expect(t).toMatch(/callsRowShort: \{ flexWrap: 'nowrap', gap: 4 \}/);
    expect(t).toMatch(/callChipShort: \{[^}]*paddingVertical: 2[^}]*flexShrink: 1, minWidth: 0 \}/);
    expect(t).toMatch(/promptRowShort: \{ paddingVertical: 4, paddingHorizontal: 10, gap: 0 \}/);
    expect(t).toMatch(/promptLineShort: \{ lineHeight: 16 \}/);
    expect(t).toMatch(/handNestle: \{ marginBottom: -SELF_NESTLE \}/);
    expect(t).toMatch(/arrangeSlot: \{ height: 34,/);
    // The call is never cut: only the caller's name may ellipsize.
    expect(t).toMatch(/<Text style=\{styles\.callChipName\} numberOfLines=\{1\}>/);
    expect(t).toMatch(/<Text style=\{styles\.callChipCall\}>\{call\}<\/Text>/);
    // One question at a time.
    expect(t).toMatch(/const promptRows = <>\{short \? promptList\.slice\(0, 1\) : promptList\}<\/>;/);
    // The arrange hint takes the faces' own slot, right after them.
    const portrait = t.slice(t.indexOf('{/* wallet / level strip'));
    expect(portrait.indexOf('{arrangeInSlot && (')).toBeGreaterThan(portrait.indexOf('{!shed && emotes}'));
    // …but only when the faces were showing; a question that shed them keeps
    // the hint above the fan, where the felt pays, and the felt has no ceiling.
    expect(t).toMatch(/const arrangeInSlot = short && arranging && !askingBesidesArranging && !belaOffered && !settled && !!onEmote;/);
    expect(t).toMatch(/short && arranging && !arrangeInSlot && \(\s*<View key="arrange"/);
    expect(t).toMatch(/!settled && view\.canAnnounceBela && !hardMode && \(\s*<View key="bela"/);
    expect(src('table/metrics.ts')).toMatch(/: shortColumn\s*\?[\s\S]*?usableH\s*: Math\.round\(usableH \* 0\.48\)/);
    // A small hand rests clear of my tucked puck.
    expect(t).toMatch(/restFloor=\{short \? FAN_REST_SHORT : 0\}/);
    expect(t).toMatch(/paddingBottom: Math\.max\(drop, restFloor\)/);
    // The bela buttons shed in hard mode too, and a shed re-measures the anchors.
    expect(t).toMatch(/const belaOffered = !settled && view\.canAnnounceBela;/);
    expect(t).toMatch(/shed \? 1 : 0,\s*\]\.join\('\|'\);/);
    // Every short style hangs on the short column, on the line that uses it.
    for (const name of ['rootShort', 'profileBarSlim', 'leaveSlim', 'teamPillSlim', 'pillValueSlim', 'liveSlim', 'feltFlush',
      'callsRowShort', 'callChipShort', 'promptRowShort', 'promptLineShort', 'handNestle', 'bidShort',
      'promptInline', 'promptInlineText']) {
      const uses = [...t.matchAll(new RegExp(`styles\\.${name}\\b`, 'g'))];
      expect(uses.length, name).toBeGreaterThan(0);
      for (const u of uses) {
        const line = t.slice(t.lastIndexOf('\n', u.index!) + 1, t.indexOf('\n', u.index!));
        expect(line, `${name}: ${line.trim()}`).toMatch(/\b(short|slim)\b/);
      }
    }
    expect(t).toMatch(/const short = !land && m\.shortColumn;/);
    // The toggle rests while the faces are shed.
    expect(t).toMatch(/const trayShown = land \? trayFits : !shed;/);
    // The harness bids by the suit alone, too.
    expect(readFileSync(join(here, '../../../scripts/play-deal.sh'), 'utf8')).toMatch(/for label in "\$suit" "\$\{suit#zovi \}"; do/);
  });

  it('the web template paints dark before the bundle parses', () => {
    const html = readFileSync(join(here, '../public/index.html'), 'utf8');
    expect(html).toMatch(/<html lang="hr">/);
    expect(html).toMatch(/<meta name="color-scheme" content="dark"/);
    expect(html).toMatch(/<meta name="theme-color" content="#0d2a1f"/);
    expect(html).toMatch(/#root\s*\{[^}]*background:\s*#0d2a1f/);
    expect(html).toMatch(/id="boot"/);
    // Expo substitutes the title; a hard-coded one would silently drift from app.json.
    expect(html).toMatch(/%WEB_TITLE%/);
    // SVG text has no family of its own; without this the browser set the
    // card indices and seat initials in Times.
    expect(html).toMatch(/#root\s*\{[^}]*font-family:\s*system-ui/s);
  });

  it('the verification\'s fixes stay put', () => {
    const t = src('TableScreen.tsx');
    // The art inside the 6 px rim is pulled back by it, or it draws 6 px off the frame.
    expect(t).toMatch(/<FeltArt[^>]*inset=\{RIM_W\}/s);
    expect(src('table/FeltArt.tsx')).toMatch(/top: -inset, left: -inset/);
    // The stamp lands on the disc, not the plate's centre.
    expect(t).toMatch(/<Anchor id=\{anchorId\.plaque\} style=\{styles\.plaqueDisc\}>/);
    expect(t).toMatch(/<Anchor id=\{anchorId\.plaque\} style=\{styles\.miniFan\}>/);
    expect(t).not.toMatch(/<Anchor\s+id=\{anchorId\.plaque\}\s+style=\{\[\s*styles\.plaque,/s);
    // A short phone's rails: who called trump is never dropped. (The emote box
    // has its own guard: 'the landscape emote box lives in the right rail'.)
    expect(t).not.toMatch(/m\.tightRail && selfPuck|m\.tightRail \? selfPuck/);
    expect(t).not.toMatch(/view\.callerSeat !== null && !m\.tightRail/);
    expect(t).toMatch(/numberOfLines=\{land \? 2 : 1\}/);
    // The dealer's badge hops between pucks, mine included.
    expect(src('table/fx.ts')).toMatch(/anchors\.rect\(anchorId\.puck\(seat\)\) \?\? anchors\.rect\(anchorId\.seat\(seat\)\)/);
    // The hero reserves its box and measures itself; the lobby no longer measures the scroller.
    const hero = src('home/TableHero.tsx');
    expect(hero).toMatch(/aspectRatio: HERO_ASPECT/);
    expect(hero).toMatch(/onLayout=/);
    const home = src('HomeScreen.tsx');
    expect(home).not.toMatch(/<TableHero[^>]*width=/s);
    expect(home).not.toMatch(/<ScrollView[^>]*onLayout/s);
    // Every SVG text names the face, and never a weight on top of it.
    for (const f of ['deck/CardFace.tsx', 'deck/courts.tsx', 'deck/french.tsx', 'deck/simple.tsx', 'table/SeatPuck.tsx']) {
      expect(src(f), f).not.toMatch(/fontWeight=/);
      expect(src(f), f).toMatch(/fontFamily=\{font\.bold\}/);
    }
    // Confetti spreads by slot, not by a modular walk.
    expect(src('anim/EffectsOverlay.tsx')).toMatch(/x: confettiX\(seed, i, CONFETTI_PIECES\)/);
  });

  it('metrics stay a pure function of the box, so the landscape invariant is testable', () => {
    expect(src('table/metrics.ts')).not.toMatch(/from 'react-native/);
    expect(src('table/useTableMetrics.ts')).toMatch(/computeTableMetrics\(usableW, usableH\)/);
  });
});

describe('table gifts', () => {
  it('the puck wears a gift through primitive props, and bounces only for a new landing', () => {
    const p = src('table/SeatPuck.tsx');
    expect(p).toMatch(/gift\?: string \| null;/);
    expect(p).toMatch(/giftN\?: number;/);
    expect(p).toMatch(/const seenGift = useRef\(giftN\);/);
    expect(p).toMatch(/if \(giftN === seenGift\.current\) return;/);
    expect(p).toMatch(/giftBadgeBox\(size\)/);
    const badge = p.slice(p.indexOf('{gift ? ('), p.indexOf(') : null}', p.indexOf('{gift ? (')));
    expect(badge).toMatch(/pointerEvents="none"/);
    expect(badge).not.toMatch(/entering=|layout=/);
  });

  it('the table passes each seat its gift, and draws the picker over the sprites', () => {
    const t = src('TableScreen.tsx');
    expect(t).toMatch(/gift=\{gifts\?\.\[s\] \?\? null\}\s*giftN=\{giftLanded\?\.\[s\] \?\? 0\}/);
    expect(t).toMatch(/gift=\{gifts\?\.\[mySeat\] \?\? null\}\s*giftN=\{giftLanded\?\.\[mySeat\] \?\? 0\}/);
    expect(t.indexOf('<GiftPicker')).toBeGreaterThan(t.indexOf('<EffectsOverlay'));
    // A gift never stands in the way of a decision or a question: the table
    // shuts the picker when my turn comes or the sheet goes up...
    expect(t).toMatch(/const giftable = !!onGift && \(giftReach\?\.\[mySeat\] \?\? true\) && !settled && !arranging && !leaving;/);
    expect(t).toMatch(/if \(myTurn && !myTurnWas\.current\) shutGifts\(\);/);
    expect(t).toMatch(/if \(!giftable\) shutGifts\(\);/);
    // ...and a shut it did by itself raises the shield, which swallows the
    // touches of the next moment and always comes down again.
    const shut = t.slice(t.indexOf('const shutGifts = useCallback'), t.indexOf('const myTurnWas'));
    expect(shut).toMatch(/setGiftTarget\(null\);\s*setGiftShield\(true\);/);
    expect(shut).toMatch(/setTimeout\(\(\) => setGiftShield\(false\), GIFT_SHIELD_MS\);\s*return \(\) => clearTimeout\(t\);/);
    const shield = t.slice(t.indexOf('{giftShield && ('));
    expect(t.indexOf('{giftShield && (')).toBeGreaterThan(t.indexOf('<GiftPicker'));
    expect(shield.slice(0, 400)).toMatch(/style=\{StyleSheet\.absoluteFill\}\s*onStartShouldSetResponder=\{\(\) => true\}/);
    // Every touch that shuts it raises the shield too (a double tap on send);
    // only shutGifts itself and Android back set the target directly.
    expect((t.match(/setGiftTarget\(null\)/g) ?? []).length).toBe(2);
    expect(t).toMatch(/onClose=\{shutGifts\}/);
    expect(t).toMatch(/onSend=\{\(id, to\) => \{\s*shutGifts\(\);\s*onGift\(id, to\);/);
    // Back closes the picker before it asks about leaving.
    const guard = t.slice(t.indexOf('setBackGuard(() => {'));
    expect(guard.indexOf('giftTargetRef.current !== null')).toBeLessThan(guard.indexOf('leavingRef.current'));
    // A spend leaves the wallet at once.
    expect(t).toMatch(/useLaggedNumber\(profile\.coins, lag, 300, 0\)/);
    expect(src('table/GiftPicker.tsx')).not.toMatch(/exiting=|layout=/);
    // The lobby's seat map shows no badges.
    expect(src('net/SeatMap.tsx')).not.toMatch(/gift=/);
  });

  it('the server takes gifts only at a table that plays, and on its own clock', () => {
    const room = readFileSync(join(here, '../../server/src/BelaRoom.ts'), 'utf8');
    const branch = room.slice(room.indexOf("if (packet.type === 'gift')"));
    // The first statement after its comment is the start gate.
    const firstStatement = branch
      .split('\n')
      .slice(1)
      .map((l) => l.trim())
      .find((l) => l !== '' && !l.startsWith('//'));
    expect(firstStatement).toBe('if (!this.started) return;');
    expect(branch).toMatch(/< GIFT_GAP_MS\) return;/);
    expect(branch.slice(0, branch.indexOf('this.broadcast(MSG.gift'))).not.toMatch(/this\.publish\(\)/);
  });

  it('online, the sender pays on the echo — or on leaving before it — and nowhere else', () => {
    const n = src('net/useNetGame.ts');
    const send = n.slice(n.indexOf('const sendGift'), n.indexOf('/** Host only: start the game now'));
    expect(send).toMatch(/room\.send\('gift', \{ id, to \}\)/);
    expect(send).not.toMatch(/profileRef\.current =|saveProfile|spendOnGift/);
    expect((n.match(/applyGiftEcho\(/g) ?? []).length).toBe(1);
    const handler = n.slice(n.indexOf("room.onMessage('gift'"), n.indexOf("room.onMessage('emote'"));
    expect(handler).toMatch(/if \(!isGiftMessage\(msg\)\) return;/);
    // A room I have left neither bills nor draws — checked before anything
    // else (a stale view on the old socket can set my seat again).
    const gate = handler.indexOf('if (roomRef.current !== room) return;');
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(handler.indexOf('applyGiftEcho('));
    // Only the echo of my own pending send, on the room that carried it,
    // pays — capped at the count I was shown — and restarts the wait.
    expect(handler).toMatch(/if \(unpaid && unpaid\.room === room && unpaid\.id === msg\.id && msg\.from === mySeatRef\.current\) \{\s*unpaidRef\.current = null;/);
    expect(handler).toMatch(/applyGiftEcho\(profileRef\.current, msg, mySeatRef\.current, unpaid\.n\)/);
    expect(handler).toMatch(/giftsRef\.current\.arm\(GIFT_COOLDOWN_MS\);/);
    // A dropped socket forgets its unanswered send (lost sends cost nothing).
    const onLeave = n.slice(n.indexOf('room.onLeave((code) => {'));
    expect(onLeave.slice(0, 600)).toMatch(/if \(unpaidRef\.current\?\.room === room\) unpaidRef\.current = null;/);
    // One gift in the air at a time, paid for as many as can see it.
    expect(send).toMatch(/recipientsOf\(to, me, reachOf\(seatsRef\.current\)\)\.length/);
    expect(send).toMatch(/unpaid && now - unpaid\.at < GIFT_ECHO_WAIT_MS/);
    expect(send).toMatch(/unpaidRef\.current = \{ id, n, at: now, room \};/);
    // The picker waits while the send is waited for.
    expect(send).toMatch(/g\.arm\(GIFT_ECHO_WAIT_MS\);/);
    // leave() pays for a send still unanswered on the socket it is leaving,
    // while it still knows my seat.
    const leave = n.slice(n.indexOf('const leave = useCallback'), n.indexOf('giftsRef.current.reset();'));
    expect((n.match(/spendOnGift\(/g) ?? []).length).toBe(1);
    expect(leave).toMatch(/spendOnGift\(profileRef\.current, unpaid\.id, unpaid\.n\)/);
    expect(leave).toMatch(/unpaid && unpaid\.room === roomRef\.current && mySeatRef\.current !== null/);
    expect(leave.indexOf('unpaid.room === roomRef.current')).toBeLessThan(leave.indexOf('roomRef.current = null'));
    expect(leave.indexOf('spendOnGift(')).toBeLessThan(leave.indexOf('mySeatRef.current = null'));
  });

  it('online, every join tells the room this app draws gifts', () => {
    const n = src('net/useNetGame.ts');
    const joins = n.match(/c\.(joinOrCreate|create|joinById)\(.*\{[^}]*\}\)/g) ?? [];
    expect(joins.length).toBe(4);
    for (const j of joins) expect(j, j).toMatch(/gifts: true/);
  });

  it('a disabled button looks disabled: its tone drops and its label greys (the root cannot dim)', () => {
    const b = src('ui/Button.tsx');
    expect(b).toMatch(/disabled \? styles\.plain :/);
    expect(b).toMatch(/disabled && styles\.disabled\]\}/);
    expect(b).not.toMatch(/withIcon, disabled && styles\.disabled/);
  });

  it("offline, the bots' gift manners outlive a rematch, like the badges", () => {
    const o = src('OfflineGame.tsx');
    expect(o).toMatch(/const botGiftStore = useRef<BotGiftState>\(BOT_GIFTS_START\);/);
    // Above the keyed match, so a remount keeps it.
    expect(o.indexOf('const botGiftStore')).toBeLessThan(o.indexOf('key={matchId}'));
    expect(o).toMatch(/useGame\(settings, 'medium', giftStore, botGiftStore\)/);
    expect(src('useGame.ts')).toMatch(/const botGifts = botGiftStore \?\? ownBotGifts;/);
  });

  it('offline, a gift is paid through the match profile the awards are saved through', () => {
    const g = src('useGame.ts');
    expect(g).toMatch(/const next = spendOnGift\(profileRef\.current, id, targets\.length\);/);
    expect(g).toMatch(/profileRef\.current = next;\s*saveProfile\(next\);/);
    // Every delayed beat dies with the match.
    expect(g).not.toMatch(/setTimeout\(\(\) => \{\s*spawnEmote/);
  });
});
