import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

/**
 * The sound bank.
 *
 * Players are created once, lazily, and reused: these are tiny one-shot effects
 * fired many times a deal, so allocating a player per play would churn native
 * objects for no reason. Everything is fire-and-forget — a failed sound must
 * never interrupt a card being played.
 */

export type Sfx =
  | 'deal'
  | 'play'
  | 'trick'
  | 'zvanje'
  | 'bela'
  | 'win'
  | 'lose'
  | 'levelup'
  | 'coin'
  | 'tap'
  | 'pop'
  | 'turn'
  | 'tick';

// require() rather than import so Metro bundles the asset and hands back a module id.
const SOURCES: Record<Sfx, number> = {
  deal: require('../assets/sfx/deal.wav'),
  play: require('../assets/sfx/play.wav'),
  trick: require('../assets/sfx/trick.wav'),
  zvanje: require('../assets/sfx/zvanje.wav'),
  bela: require('../assets/sfx/bela.wav'),
  win: require('../assets/sfx/win.wav'),
  lose: require('../assets/sfx/lose.wav'),
  levelup: require('../assets/sfx/levelup.wav'),
  coin: require('../assets/sfx/coin.wav'),
  tap: require('../assets/sfx/tap.wav'),
  pop: require('../assets/sfx/pop.wav'),
  // Aliased for now: swapping in dedicated art is one line each, and doing it
  // here rather than at the call sites keeps the intent readable meanwhile.
  turn: require('../assets/sfx/pop.wav'),
  tick: require('../assets/sfx/tap.wav'),
};

/**
 * The percussive effects vary a little in pitch per play, the way real cards
 * and coins never sound twice the same. The melodic ones stay put — a detuned
 * fanfare just sounds wrong.
 */
const VARIED: ReadonlySet<Sfx> = new Set(['deal', 'play', 'trick', 'coin', 'tap', 'pop', 'turn']);

const players = new Map<Sfx, AudioPlayer>();
let enabled = true;
let configured = false;

export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

export function isSoundEnabled(): boolean {
  return enabled;
}

/** Let the game be heard even when the phone is on silent — it is a game, not a notification. */
async function configureOnce(): Promise<void> {
  if (configured) return;
  configured = true;
  try {
    await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false });
  } catch {
    // Audio mode is a nicety; never let it stop playback from being attempted.
  }
}

/**
 * Create every player up front. Loading is asynchronous, so a player created
 * at first use plays its FIRST shot silently — the session's opening deal
 * riffle was going missing. One eager pass at app start fixes that for good.
 */
export function preloadSfx(): void {
  void configureOnce();
  for (const name of Object.keys(SOURCES) as Sfx[]) {
    try {
      if (!players.has(name)) players.set(name, createAudioPlayer(SOURCES[name]));
    } catch {
      // A player that fails to load simply stays silent; never block startup.
    }
  }
}

export function playSfx(name: Sfx): void {
  if (!enabled) return;
  void configureOnce();
  try {
    let player = players.get(name);
    if (!player) {
      player = createAudioPlayer(SOURCES[name]);
      players.set(name, player);
    }
    // Rewind first: the same effect often fires again before it has finished.
    player.seekTo(0);
    if (VARIED.has(name)) player.setPlaybackRate(0.92 + Math.random() * 0.16);
    player.play();
  } catch {
    // A missing or busy player must never break the game loop.
  }
}

/** Release every native player. Called when the app tears the game down. */
export function releaseSfx(): void {
  for (const p of players.values()) {
    try {
      p.remove();
    } catch {
      /* already gone */
    }
  }
  players.clear();
}
