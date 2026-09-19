import type {
  Action,
  DeclarationSummary,
  Rank,
  Seat,
  Suit,
  TeamId,
} from '@belot/shared-types';

/**
 * @belot/i18n — the words, and the deck.
 *
 * Bela is played with **mađarice** (Hungarian-suited cards), not the French deck:
 * žir (acorns), list (leaves), srce (hearts) and bundeva (bells), with ranks
 * VII–X plus dečko, baba, kralj and as. The engine's internal `Suit` names stay
 * French because they are just identifiers; everything a player ever SEES is
 * mapped here.
 *
 * Every surface says the same things from this file, so the phone, the terminal
 * and later the server cannot drift apart.
 */

export type LocaleId = 'hr' | 'sr-Cyrl' | 'en';

/**
 * Engine suit -> the mađarice suit it stands for.
 * acorns↔clubs, leaves↔spades, hearts↔hearts, bells↔diamonds.
 */
export type MadaricaSuit = 'acorns' | 'leaves' | 'hearts' | 'bells';

export const MADARICA_SUIT: Record<Suit, MadaricaSuit> = {
  clubs: 'acorns',
  spades: 'leaves',
  hearts: 'hearts',
  diamonds: 'bells',
};

/**
 * Mađarice are a FOUR-colour deck, unlike the French red/black pair. Surfaces map
 * these roles to their own palette; sharing the roles keeps them consistent.
 */
export type SuitColourRole = 'brown' | 'green' | 'red' | 'gold';

export const SUIT_COLOUR: Record<Suit, SuitColourRole> = {
  clubs: 'brown', // žir
  spades: 'green', // list
  hearts: 'red', // srce
  diamonds: 'gold', // bundeva
};

/** Kept for terminal output, where drawing a real pip is not an option. */
export const SUIT_PIP: Record<Suit, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

/** True for the suits a French-deck player expects in red. Terminal use only. */
export function isRedSuit(suit: Suit): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}

/**
 * App-shell vocabulary: home screen, shop, settings, profile. Same contract as
 * the table strings — every surface pulls from here, nothing is hardcoded.
 */
export interface UiStrings {
  play: string;
  playBots: string;
  privateTable: string;
  /** Under the two mode tiles on the home screen. */
  modeBotsSub: string;
  modePrivateSub: string;
  /** The one panel that holds the daily bonus and the quests. */
  daily: string;
  joinByCode: string;
  tableCode: string;
  enter: string;
  nicknameLabel: string;
  nicknamePlaceholder: string;
  dailyBonus: (coins: number) => string;
  streakDays: (days: number) => string;
  startStreak: string;
  claim: string;
  /** The claimed state's title. The streak is the line under it; repeated here it cut the title short on a phone. */
  bonusClaimed: string;
  dailyQuests: string;
  questLabel: (kind: 'playDeals' | 'winDeals' | 'callZvanja' | 'callBela' | 'winMatch') => string;
  level: string;
  coins: string;
  wins: string;
  shop: string;
  settings: string;
  profile: string;
  sectionCardBacks: string;
  sectionFelts: string;
  sectionAvatars: string;
  /** Display name for a cosmetic id; an unknown id falls back to the id itself. */
  cosmeticName: (id: string) => string;
  buy: (price: number) => string;
  needsLevel: (level: number) => string;
  select: string;
  selected: string;
  sound: string;
  haptics: string;
  language: string;
  resetProgress: string;
  resetConfirm: string;
  version: string;
  statMatches: string;
  statWinRate: string;
  statDeals: string;
  statZvanja: string;
  statBela: string;
  statValat: string;
  statBestDeal: string;
  coinsDisclaimer: string;
  back: string;
  /** The branded screen a render error lands on, instead of a blank one. */
  crashTitle: string;
  crashBody: string;

  privacyPolicy: string;

  /** Localized text for the phrase emotes (bravo/brze/ajme/hvala). */
  emotePhrase: (id: string) => string;
  /** A screen reader's name for an emote: a face by what it shows, a phrase by its words. */
  emoteName: (id: string) => string;
  /** The emote bar's toggle (faces <-> phrases), for a screen reader. */
  emoteToggle: string;
  /** The home screen's coin chip, which opens the shop, for a screen reader. */
  walletLabel: (coins: number) => string;

  /* Online table flow. */
  connecting: string;
  cannotConnect: (server: string) => string;
  connectionLost: string;
  disconnectedWithCode: (code: number) => string;
  waitingForPlayers: (seated: number) => string;
  shareCode: string;
  leaveTable: string;
  /** Asked before a match in progress is abandoned: the leave button, the result sheet's, Android's back. */
  leaveConfirm: string;
  leaveConfirmYes: string;
  leaveConfirmNo: string;
  botPlaysFor: (names: string) => string;
  /** The server refused a move (usually a stale tap): said plainly, never in the server's own words. */
  moveRefused: string;
  /** A seat nobody named, counted from 1 as the server counts it ("Igrač 3"). */
  playerN: (n: number) => string;
  /** The gift picker's pill that opens the player view (hide / report). */
  reportOpen: string;
  reportOpenLabel: string;
  /** The player view's title. */
  playerTitle: (name: string) => string;
  hidePlayer: string;
  showPlayer: string;
  hidePlayerNote: string;
  reportPlayer: string;
  reportPlayerNote: string;
  /** Shown under the report button: the address, in case no mail app opens. */
  reportFallback: (email: string) => string;
  reportSubject: string;
  reportBody: (p: { name: string; code: string; at: string; version: string }) => string;
  /** A screen reader's hint on another player's puck, online. */
  playerHint: string;
  startWithBots: string;
  sitHere: string;
  /** The lobby's error state: try the connection again. */
  retry: string;
  /** Rematch flow after a finished match. */
  playAgain: string;
  waitingForRematch: (n: number) => string;
  rematchAsked: string;
  startAnyway: string;
  seriesScore: string;
  /** Hand arranging + sorting. */
  arrangeHint: string;
  arrangeDone: string;
  sortHand: string;
  sortAuto: string;
  sortSuits: string;
  sortManual: string;
  confirmPlayLabel: string;
  confirmOff: string;
  confirmAmbiguous: string;
  confirmAlways: string;
  motionLabel: string;
  motionSystem: string;
  motionFull: string;
  motionReduced: string;
  volumeLabel: string;
  volumeQuiet: string;
  volumeMedium: string;
  volumeLoud: string;
  soundBlocked: string;
  invite: string;
  inviteText: (url: string) => string;
  /** A browser with no share sheet: the invitation went to the clipboard instead. */
  inviteCopied: string;

  // --- table gifts ---
  /** A gift's name, by its catalogue id (kava, caj, …). */
  giftName: (id: string) => string;
  /** The picker's title and its send button before a gift is chosen. */
  giftSend: string;
  /** Opened from your own puck: a gift for everyone else. */
  giftTreatTable: string;
  giftToEveryone: (n: number) => string;
  /** The send button once a gift is chosen: its total price. */
  giftSendFor: (price: number) => string;
  giftWait: string;
  giftNoCoins: string;
  /** Under the grid: a gift is decoration, never value. */
  giftForFun: string;
  /** A screen reader's hint on a tappable puck. */
  giftHint: string;
  /** Closing a sheet (the gift picker). */
  close: string;
  /** Online, the chosen player's app is too old to draw gifts. */
  giftNotSeen: string;
  /** Online, nobody else at the table has an app that draws gifts. */
  giftNobodySees: string;
  /**
   * A puck as a screen reader hears it: everything the puck shows, since the
   * gift button over it hides its parts. "Name: value" pairs, so no count or
   * name is ever inflected.
   */
  giftPuckLabel: (p: { name: string; dealer: boolean; cards: number; tricks: number; gift: string | null }) => string;
  giftCellLabel: (gift: string, price: number) => string;
  /** Announced when a gift lands on you. */
  giftReceived: (gift: string, from: string) => string;
}

interface Strings {
  suit: Record<Suit, string>;
  /** Season shown on each ace, per the Tell pattern (srce=spring ... zir=winter). */
  season: Record<Suit, string>;
  /** Short face label as printed on the card: VII, VIII, IX, X, D, B, K, A. */
  rankShort: Record<Rank, string>;
  /** Spoken name, for declarations: "terca do dečka". */
  rankName: Record<Rank, string>;

  /**
   * Relative seat names, indexed by offset in PLAY order from the viewer:
   * [me, next-to-act, partner, previous]. Bela runs counter-clockwise, so the
   * seat that acts after me is on my RIGHT — index 1 is "Desni", not "Lijevi".
   */
  seat: [string, string, string, string];
  seatAbsolute: (seat: Seat) => string;
  us: string;
  them: string;
  teamA: string;
  teamB: string;

  trump: string;
  trumpUndecided: string;
  /** The plaque while the trump is being called: a question, two words at most. */
  trumpQuestion: string;
  calledBy: (who: string) => string;
  /** The same, when the caller is the viewer: "zvao si ti", not "zvao Ti". */
  calledByYou: string;
  score: string;
  trick: string;
  emptyTrick: string;
  yourCards: string;
  declarations: string;
  bela: string;

  pass: string;
  /** Imperative, for buttons the player presses: "zovi". */
  callVerb: string;
  /** Third person, for narrating what somebody else did: "zove". */
  callsVerb: string;
  call: (suit: string) => string;
  kontra: string;
  rekontra: string;
  noKontra: string;
  announce: string;
  /** Third person narration of the same act. */
  announces: string;
  staySilent: string;
  withBela: string;
  declareHint: string;
  belaHint: string;

  /**
   * The value word a player would say out loud — sequences are announced by
   * VALUE, never by name: "dvadeset do kralja", not "terca". Per the UHDDR
   * "koliko i dokle" convention.
   */
  declValue: (value: number) => string;
  /** The "do" in "dvadeset do kralja". */
  declTo: string;
  carre: (rank: string) => string;
  /** Renons/auzmeš — the hard-mode misplay call. */
  renonsTitle: string;
  renonsBy: (who: string) => string;
  /** The same, when the offender is the viewer, without a gendered verb. */
  renonsByYou: string;
  /** Hard-mode blind claim button + empty-claim toast. */
  claimZvanja: string;
  claimZvanjaHint: string;
  noZvanja: string;
  /** The asking, spoken by the seat that leads: "do you have zvanja?" */
  askZvanja: string;
  /** Why a pair's announced zvanja are not in the recorded score. */
  zvanjaNoTrickToOpponents: string;
  /** What the winning side does when the asking is over. */
  showsZvanja: string;
  /** Answering with nothing. */
  noneToDeclare: string;
  /** Mark the cards, then confirm. */
  markZvanjaHint: string;
  markingOk: string;
  markingNotZvanje: string;
  declareMarked: string;
  /** Difficulty setting. */
  difficulty: string;
  difficultyEasy: string;
  difficultyHard: string;
  difficultyHardHint: string;
  /** Card-face style chooser. */
  deckStyleLabel: string;
  deckMadarice: string;
  deckStarinske: string;
  deckFrancuske: string;
  deckSimple: string;

  dealHeading: (n: number, dealer: string) => string;
  dealResult: string;
  cardsAndLastTrick: string;
  /**
   * Shown as "Štiglja" — the name the table actually uses. The engine calls the
   * same thing `valatTeam` / `valatBonus`, which is the international term.
   */
  valat: string;
  total: string;
  recorded: string;
  matchScore: string;
  callerMade: string;
  callerFailed: string;
  /** The verdict as one word on the sheet's header band: the call was made / fell. */
  madeShort: string;
  failedShort: string;
  winner: (team: string) => string;
  nextDeal: string;
  newMatch: string;
  gameToTarget: (target: number) => string;
  /** Live deal counter: how many points the caller still needs. */
  needsMore: (points: number) => string;
  /** The caller is already past the line. */
  contractSafe: string;

  ui: UiStrings;
}

type QuestKind = 'playDeals' | 'winDeals' | 'callZvanja' | 'callBela' | 'winMatch';

/** 1 dan, 21 dan, 101 dan — everything else dana. Serbian follows the same rule. */
function hrDan(n: number): string {
  return n % 10 === 1 && n % 100 !== 11 ? 'dan' : 'dana';
}

function srDan(n: number): string {
  return n % 10 === 1 && n % 100 !== 11 ? 'дан' : 'дана';
}

const ROMAN: Pick<Record<Rank, string>, '7' | '8' | '9' | '10'> = {
  '7': 'VII',
  '8': 'VIII',
  '9': 'IX',
  '10': 'X',
};

const HR_EMOTE_NAMES: Record<string, string> = {
  smile: 'Osmijeh',
  laugh: 'Smijeh',
  wow: 'Iznenađenje',
  cry: 'Tuga',
  clap: 'Pljesak',
  think: 'Razmišljam',
};

const HR_EMOTES: Record<string, string> = {
  bravo: 'Bravo!',
  brze: 'Brže!',
  ajme: 'Ajme!',
  hvala: 'Hvala!',
};

const HR_GIFTS: Record<string, string> = {
  kava: 'Kava',
  caj: 'Čaj',
  limunada: 'Limunada',
  rakija: 'Rakija',
  pivo: 'Pivo',
  gemist: 'Gemišt',
  burek: 'Burek',
  kolac: 'Kolač',
  sladoled: 'Sladoled',
  maramice: 'Maramice',
  ruza: 'Ruža',
  djetelina: 'Djetelina',
  potkova: 'Potkova',
  pehar: 'Pehar',
  kruna: 'Kruna',
};

const HR_COSMETICS: Record<string, string> = {
  classic: 'Klasična',
  lattice: 'Rešetka',
  oak: 'Hrast',
  green: 'Zeleni',
  walnut: 'Orah',
  midnight: 'Ponoć',
  djed: 'Djed',
  baka: 'Baka',
  brko: 'Brko',
  snasa: 'Snaša',
  student: 'Student',
  teta: 'Teta',
  sofer: 'Šofer',
  majstor: 'Majstor',
  gazda: 'Gazda',
  profesorica: 'Profesorica',
  ribar: 'Ribar',
  kapetan: 'Kapetan',
};

const HR_QUESTS: Record<QuestKind, string> = {
  playDeals: 'Odigraj dijeljenja',
  winDeals: 'Osvoji dijeljenja',
  callZvanja: 'Zovi zvanja',
  callBela: 'Zovi belu',
  winMatch: 'Pobijedi u partiji',
};

const hr: Strings = {
  suit: { clubs: 'žir', spades: 'list', hearts: 'srce', diamonds: 'bundeva' },
  season: { hearts: 'Proljeće', diamonds: 'Ljeto', spades: 'Jesen', clubs: 'Zima' },
  rankShort: { ...ROMAN, J: 'D', Q: 'B', K: 'K', A: 'A' },
  rankName: {
    '7': 'sedmice',
    '8': 'osmice',
    '9': 'devetke',
    '10': 'desetke',
    J: 'dečka',
    Q: 'babe',
    K: 'kralja',
    A: 'asa',
  },

  seat: ['Ti', 'Desni', 'Partner', 'Lijevi'],
  seatAbsolute: (seat) => `Igrač ${seat}`,
  us: 'Mi',
  them: 'Oni',
  teamA: 'Tim A',
  teamB: 'Tim B',

  trump: 'adut',
  trumpUndecided: 'adut još nije određen',
  trumpQuestion: 'adut?',
  calledBy: (who) => `zvao ${who}`,
  calledByYou: 'zvao si ti',
  score: 'Rezultat',
  trick: 'Štih',
  emptyTrick: '(prazan)',
  yourCards: 'Tvoje karte',
  declarations: 'Zvanja',
  bela: 'Bela',

  pass: 'dalje',
  callVerb: 'zovi',
  callsVerb: 'zove',
  call: (suit) => `zovi ${suit}`,
  kontra: 'KONTRA',
  rekontra: 'REKONTRA',
  noKontra: 'bez kontre',
  announce: 'zovi zvanja',
  announces: 'zove zvanja',
  staySilent: 'šuti (ne zovi)',
  withBela: '+ BELA',
  declareHint: 'Ako ne zoveš sada, propada — ali protivnici ništa ne saznaju.',
  belaHint: 'Belu zoveš uz kralja ili babu aduta.',

  declValue: (value) =>
    ({ 20: 'dvadeset', 50: 'pedeset', 100: 'sto', 150: 'sto pedeset', 200: 'dvjesto' })[value] ??
    String(value),
  declTo: 'do',
  carre: (rank) => `četiri ${rank}`,
  renonsTitle: 'Auzmeš!',
  renonsBy: (who) => `${who} je pogriješio — cijelo dijeljenje ide protivnicima`,
  renonsByYou: 'Tvoj auzmeš — cijelo dijeljenje ide protivnicima',
  claimZvanja: 'Zovem zvanje',
  claimZvanjaHint: 'Imaš li zvanje? Pazi — tko ne zove, propada mu.',
  noZvanja: 'Nemaš ništa za zvati',
  askZvanja: 'Imaš li zvanja?',
  zvanjaNoTrickToOpponents: 'Bez štiha — zvanje ide protivniku',
  showsZvanja: 'pokazuje zvanja',
  noneToDeclare: 'Nemam',
  markZvanjaHint: 'Označi karte koje čine zvanje',
  markingOk: 'To je zvanje — pritisni Prijavi',
  markingNotZvanje: 'Označene karte nisu zvanje',
  declareMarked: 'Prijavi',
  difficulty: 'Težina',
  difficultyEasy: 'Lagana',
  difficultyHard: 'Prava bela',
  difficultyHardHint:
    'Prava bela: aplikacija ne čuva pravila umjesto tebe. Zvanja tražiš bez pomoći, a kriva karta je auzmeš — protivnici pišu sve.',
  deckStyleLabel: 'Karte',
  deckMadarice: 'Mađarice',
  deckStarinske: 'Starinske',
  deckFrancuske: 'Francuske',
  deckSimple: 'Jednostavne',

  dealHeading: (n, dealer) => `Dijeljenje ${n} — dijeli ${dealer}`,
  dealResult: 'Obračun dijeljenja',
  cardsAndLastTrick: 'Karte + zadnji štih',
  valat: 'Štiglja',
  total: 'Ukupno',
  recorded: 'Upisano',
  matchScore: 'Rezultat meča',
  callerMade: 'Zvač je prošao.',
  callerFailed: 'PAD — zvač nije prošao, sve ide protivnicima.',
  madeShort: 'Prošli',
  failedShort: 'Pad',
  winner: (team) => `Pobjeđuje ${team}`,
  nextDeal: 'Sljedeće dijeljenje',
  newMatch: 'Nova partija',
  gameToTarget: (target) => `igra do ${target}`,
  needsMore: (points) => `treba još ${points}`,
  contractSafe: 'prošlo',

  ui: {
    play: 'IGRAJ',
    playBots: 'Igraj protiv botova',
    privateTable: 'Napravi privatni stol',
    modeBotsSub: 'Odmah, i bez interneta',
    modePrivateSub: 'Pozovi prijatelje šifrom',
    daily: 'Dnevno',
    joinByCode: 'Pridruži se šifrom',
    tableCode: 'šifra stola',
    enter: 'Uđi',
    nicknameLabel: 'Tvoje ime za online igru',
    nicknamePlaceholder: 'bez prijave — samo ime',
    dailyBonus: (coins) => `Dnevni bonus: +${coins}`,
    streakDays: (days) => `Niz: ${days} ${hrDan(days)}`,
    startStreak: 'Počni niz danas',
    claim: 'Pokupi',
    bonusClaimed: 'Dnevni bonus pokupljen',
    dailyQuests: 'Dnevni zadaci',
    questLabel: (kind) => HR_QUESTS[kind],
    level: 'Nivo',
    coins: 'Novčići',
    wins: 'Pobjede',
    shop: 'Trgovina',
    settings: 'Postavke',
    profile: 'Profil',
    sectionCardBacks: 'Poleđine karata',
    sectionFelts: 'Stolovi',
    sectionAvatars: 'Avatari',
    cosmeticName: (id) => HR_COSMETICS[id] ?? id,
    buy: (price) => `Kupi · ${price}`,
    needsLevel: (level) => `Nivo ${level}`,
    select: 'Odaberi',
    selected: 'Odabrano',
    sound: 'Zvuk',
    haptics: 'Vibracija',
    language: 'Jezik',
    resetProgress: 'Izbriši napredak',
    resetConfirm: 'Sigurno? Pritisni opet',
    version: 'Verzija',
    statMatches: 'Partije',
    statWinRate: 'Postotak pobjeda',
    statDeals: 'Dijeljenja',
    statZvanja: 'Zvanja',
    statBela: 'Bele',
    statValat: 'Štiglje',
    statBestDeal: 'Najbolje dijeljenje',
    coinsDisclaimer: 'Novčići služe samo za igru. Nema uplata ni isplata pravog novca.',
    back: 'Natrag',
    crashTitle: 'Nešto je pošlo po zlu',
    crashBody: 'Aplikacija je naletjela na grešku. Vrati se na početni ekran i pokušaj ponovno.',
    privacyPolicy: 'Pravila privatnosti',

    emotePhrase: (id) => HR_EMOTES[id] ?? id,
    emoteName: (id) => HR_EMOTE_NAMES[id] ?? HR_EMOTES[id] ?? id,
    emoteToggle: 'Poruke',
    walletLabel: (coins) => `Trgovina, novčići: ${coins}`,

    connecting: 'Spajanje…',
    cannotConnect: (server) => `Ne mogu se spojiti na ${server}`,
    connectionLost: 'Veza je prekinuta.',
    disconnectedWithCode: (code) => `veza prekinuta (${code})`,
    waitingForPlayers: (seated) => `Čekamo igrače… ${seated}/4`,
    shareCode: 'Pošalji je prijateljima da ti se pridruže.',
    leaveTable: 'Napusti stol',
    leaveConfirm: 'Želiš li stvarno napustiti stol?',
    leaveConfirmYes: 'Napusti',
    leaveConfirmNo: 'Ostani',
    botPlaysFor: (names) => `${names} — igra bot`,
    moveRefused: 'Taj potez nije dopušten.',
    playerN: (n) => `Igrač ${n}`,
    reportOpen: 'Prijavi',
    reportOpenLabel: 'Sakrij ili prijavi igrača',
    playerTitle: (name) => `Igrač: ${name}`,
    hidePlayer: 'Sakrij ovog igrača',
    showPlayer: 'Ponovno prikaži igrača',
    hidePlayerNote: 'Do kraja ovog stola ne vidiš ime, emotikone ni darove ovog igrača.',
    reportPlayer: 'Prijavi igrača',
    reportPlayerNote: 'Otvara e-poruku razvijatelju s nadimkom i kodom stola. Šalješ je ti; poslužitelj ništa ne sprema.',
    reportFallback: (email) => `Ako se pošta ne otvori, piši na ${email}`,
    reportSubject: 'Bela Štih: prijava igrača',
    reportBody: (p) =>
      `Prijavljujem igrača s nadimkom: „${p.name}”\nKod stola: ${p.code}\nVrijeme: ${p.at}\nVerzija igre: ${p.version}\n\nŠto je bilo neprimjereno (nije obavezno):\n`,
    playerHint: 'Dodirni za dar ili prijavu',
    startWithBots: 'Počni s botovima',
    sitHere: 'sjedni ovdje',
    retry: 'Pokušaj ponovno',
    playAgain: 'Igraj opet',
    waitingForRematch: (n) => `Čekamo još ${n} igrača…`,
    rematchAsked: 'Nova partija je zatražena',
    startAnyway: 'Počni svejedno',
    seriesScore: 'Partije',
    arrangeHint: 'Dodirni dvije karte da ih zamijeniš.',
    arrangeDone: 'Gotovo',
    sortHand: 'Slaganje karata',
    sortAuto: 'Adut prvi',
    sortSuits: 'Po bojama',
    sortManual: 'Ručno',
    confirmPlayLabel: 'Potvrda bacanja',
    confirmOff: 'Bez potvrde',
    confirmAmbiguous: 'Kad ima izbora',
    confirmAlways: 'Uvijek',
    motionLabel: 'Animacije',
    motionSystem: 'Kao sustav',
    motionFull: 'Pune',
    motionReduced: 'Smanjene',
    volumeLabel: 'Glasnoća',
    volumeQuiet: 'Tiho',
    volumeMedium: 'Srednje',
    volumeLoud: 'Glasno',
    soundBlocked: 'Zvuk je isključen — dodirni za uključivanje',
    invite: 'Pozovi prijatelje',
    inviteText: (url) => `Zaigraj belu sa mnom! Pridruži se mom stolu: ${url}`,
    inviteCopied: 'Pozivnica je kopirana — zalijepi je prijateljima.',
    giftName: (id) => HR_GIFTS[id] ?? id,
    giftSend: 'Pošalji dar',
    giftTreatTable: 'Počasti cijeli stol',
    giftToEveryone: (n) => `Svima za stolom (${n})`,
    giftSendFor: (price) => `Pošalji · ${price}`,
    giftWait: 'Malo pričekaj pa pošalji novi dar.',
    giftNoCoins: 'Nemaš dovoljno novčića.',
    giftForFun: 'Dar je samo za veselje: primatelj ne dobiva novčiće.',
    giftHint: 'Dodirni za dar',
    close: 'Zatvori',
    giftNotSeen: 'Ovaj igrač ima stariju verziju igre i ne vidi darove.',
    giftNobodySees: 'Nitko drugi za stolom još ne vidi darove: imaju stariju verziju igre.',
    giftPuckLabel: (p) =>
      [p.name, p.dealer && 'dijeli', `karte: ${p.cards}`, p.tricks > 0 && `štihovi: ${p.tricks}`, p.gift && `dar: ${p.gift}`]
        .filter(Boolean)
        .join(', '),
    giftCellLabel: (gift, price) => `${gift}, ${price} novčića`,
    giftReceived: (gift, from) => `Novi dar: ${gift} (${from})`,
  },
};

const SR_EMOTE_NAMES: Record<string, string> = {
  smile: 'Осмех',
  laugh: 'Смех',
  wow: 'Изненађење',
  cry: 'Туга',
  clap: 'Аплауз',
  think: 'Размишљам',
};

const SR_EMOTES: Record<string, string> = {
  bravo: 'Браво!',
  brze: 'Брже!',
  ajme: 'Ајме!',
  hvala: 'Хвала!',
};

const SR_GIFTS: Record<string, string> = {
  kava: 'Кафа',
  caj: 'Чај',
  limunada: 'Лимунада',
  rakija: 'Ракија',
  pivo: 'Пиво',
  gemist: 'Шприцер',
  burek: 'Бурек',
  kolac: 'Колач',
  sladoled: 'Сладолед',
  maramice: 'Марамице',
  ruza: 'Ружа',
  djetelina: 'Детелина',
  potkova: 'Потковица',
  pehar: 'Пехар',
  kruna: 'Круна',
};

const SR_COSMETICS: Record<string, string> = {
  classic: 'Класична',
  lattice: 'Решетка',
  oak: 'Храст',
  green: 'Зелени',
  walnut: 'Орах',
  midnight: 'Поноћ',
  djed: 'Деда',
  baka: 'Бака',
  brko: 'Брка',
  snasa: 'Снаја',
  student: 'Студент',
  teta: 'Тета',
  sofer: 'Шофер',
  majstor: 'Мајстор',
  gazda: 'Газда',
  profesorica: 'Професорка',
  ribar: 'Рибар',
  kapetan: 'Капетан',
};

const SR_QUESTS: Record<QuestKind, string> = {
  playDeals: 'Одиграј дељења',
  winDeals: 'Освоји дељења',
  callZvanja: 'Зови звања',
  callBela: 'Зови белу',
  winMatch: 'Победи у партији',
};

/** Same vocabulary, Cyrillic script — the toggle Serbian players expect. */
const srCyrl: Strings = {
  ...hr,
  suit: { clubs: 'жир', spades: 'лист', hearts: 'срце', diamonds: 'бундева' },
  season: { hearts: 'Пролеће', diamonds: 'Лето', spades: 'Јесен', clubs: 'Зима' },
  rankShort: { ...ROMAN, J: 'Д', Q: 'Б', K: 'К', A: 'А' },
  rankName: {
    '7': 'седмице',
    '8': 'осмице',
    '9': 'деветке',
    '10': 'десетке',
    J: 'дечка',
    Q: 'бабе',
    K: 'краља',
    A: 'аса',
  },

  seat: ['Ти', 'Десни', 'Партнер', 'Леви'],
  seatAbsolute: (seat) => `Играч ${seat}`,
  us: 'Ми',
  them: 'Они',
  teamA: 'Тим А',
  teamB: 'Тим Б',

  trump: 'адут',
  trumpUndecided: 'адут још није одређен',
  trumpQuestion: 'адут?',
  calledBy: (who) => `звао ${who}`,
  calledByYou: 'звао си ти',
  score: 'Резултат',
  trick: 'Штих',
  emptyTrick: '(празан)',
  yourCards: 'Твоје карте',
  declarations: 'Звања',
  bela: 'Бела',

  pass: 'даље',
  callVerb: 'зови',
  callsVerb: 'зове',
  call: (suit) => `зови ${suit}`,
  kontra: 'КОНТРА',
  rekontra: 'РЕКОНТРА',
  noKontra: 'без контре',
  announce: 'зови звања',
  announces: 'зове звања',
  staySilent: 'ћути (не зови)',
  withBela: '+ БЕЛА',
  declareHint: 'Ако не зовеш сада, пропада — али противници ништа не сазнају.',
  belaHint: 'Белу зовеш уз краља или бабу адута.',

  declValue: (value) =>
    ({ 20: 'двадесет', 50: 'педесет', 100: 'сто', 150: 'сто педесет', 200: 'двеста' })[value] ??
    String(value),
  declTo: 'до',
  carre: (rank) => `четири ${rank}`,
  renonsTitle: 'Аузмеш!',
  renonsBy: (who) => `${who} је погрешио — цело дељење иде противницима`,
  renonsByYou: 'Твој аузмеш — цело дељење иде противницима',
  claimZvanja: 'Зовем звање',
  claimZvanjaHint: 'Имаш ли звање? Пази — ко не зове, пропада му.',
  noZvanja: 'Немаш ништа за звати',
  askZvanja: 'Имаш ли звања?',
  zvanjaNoTrickToOpponents: 'Без штиха — звање иде противнику',
  showsZvanja: 'показује звања',
  noneToDeclare: 'Немам',
  markZvanjaHint: 'Означи карте које чине звање',
  markingOk: 'То је звање — притисни Пријави',
  markingNotZvanje: 'Означене карте нису звање',
  declareMarked: 'Пријави',
  difficulty: 'Тежина',
  difficultyEasy: 'Лагана',
  difficultyHard: 'Права бела',
  difficultyHardHint:
    'Права бела: апликација не чува правила уместо тебе. Звања тражиш без помоћи, а крива карта је аузмеш — противници пишу све.',
  deckStyleLabel: 'Карте',
  deckMadarice: 'Мађарице',
  deckStarinske: 'Старинске',
  deckFrancuske: 'Француске',
  deckSimple: 'Једноставне',

  dealHeading: (n, dealer) => `Дељење ${n} — дели ${dealer}`,
  dealResult: 'Обрачун дељења',
  cardsAndLastTrick: 'Карте + последњи штих',
  valat: 'Штигља',
  total: 'Укупно',
  recorded: 'Уписано',
  matchScore: 'Резултат меча',
  callerMade: 'Звач је прошао.',
  callerFailed: 'ПАД — звач није прошао, све иде противницима.',
  madeShort: 'Прошли',
  failedShort: 'Пад',
  winner: (team) => `Побеђује ${team}`,
  nextDeal: 'Следеће дељење',
  newMatch: 'Нова партија',
  gameToTarget: (target) => `игра до ${target}`,
  needsMore: (points) => `треба још ${points}`,
  contractSafe: 'прошло',

  ui: {
    play: 'ИГРАЈ',
    playBots: 'Играј против ботова',
    privateTable: 'Направи приватни сто',
    modeBotsSub: 'Одмах, и без интернета',
    modePrivateSub: 'Позови пријатеље шифром',
    daily: 'Дневно',
    joinByCode: 'Придружи се шифром',
    tableCode: 'шифра стола',
    enter: 'Уђи',
    nicknameLabel: 'Твоје име за онлајн игру',
    nicknamePlaceholder: 'без пријаве — само име',
    dailyBonus: (coins) => `Дневни бонус: +${coins}`,
    streakDays: (days) => `Низ: ${days} ${srDan(days)}`,
    startStreak: 'Почни низ данас',
    claim: 'Покупи',
    bonusClaimed: 'Дневни бонус покупљен',
    dailyQuests: 'Дневни задаци',
    questLabel: (kind) => SR_QUESTS[kind],
    level: 'Ниво',
    coins: 'Новчићи',
    wins: 'Победе',
    shop: 'Продавница',
    settings: 'Подешавања',
    profile: 'Профил',
    sectionCardBacks: 'Полеђине карата',
    sectionFelts: 'Столови',
    sectionAvatars: 'Аватари',
    cosmeticName: (id) => SR_COSMETICS[id] ?? id,
    buy: (price) => `Купи · ${price}`,
    needsLevel: (level) => `Ниво ${level}`,
    select: 'Изабери',
    selected: 'Изабрано',
    sound: 'Звук',
    haptics: 'Вибрација',
    language: 'Језик',
    resetProgress: 'Избриши напредак',
    resetConfirm: 'Сигурно? Притисни поново',
    version: 'Верзија',
    statMatches: 'Партије',
    statWinRate: 'Проценат победа',
    statDeals: 'Дељења',
    statZvanja: 'Звања',
    statBela: 'Беле',
    statValat: 'Штигље',
    statBestDeal: 'Најбоље дељење',
    coinsDisclaimer: 'Новчићи служе само за игру. Нема уплата ни исплата правог новца.',
    back: 'Назад',
    crashTitle: 'Нешто је пошло по злу',
    crashBody: 'Апликација је наишла на грешку. Врати се на почетни екран и покушај поново.',
    privacyPolicy: 'Правила приватности',

    emotePhrase: (id) => SR_EMOTES[id] ?? id,
    emoteName: (id) => SR_EMOTE_NAMES[id] ?? SR_EMOTES[id] ?? id,
    emoteToggle: 'Поруке',
    walletLabel: (coins) => `Продавница, новчићи: ${coins}`,

    connecting: 'Повезивање…',
    cannotConnect: (server) => `Не могу да се повежем на ${server}`,
    connectionLost: 'Веза је прекинута.',
    disconnectedWithCode: (code) => `веза прекинута (${code})`,
    waitingForPlayers: (seated) => `Чекамо играче… ${seated}/4`,
    shareCode: 'Пошаљи је пријатељима да ти се придруже.',
    leaveTable: 'Напусти сто',
    leaveConfirm: 'Желиш ли стварно да напустиш сто?',
    leaveConfirmYes: 'Напусти',
    leaveConfirmNo: 'Остани',
    botPlaysFor: (names) => `${names} — игра бот`,
    moveRefused: 'Тај потез није дозвољен.',
    playerN: (n) => `Играч ${n}`,
    reportOpen: 'Пријави',
    reportOpenLabel: 'Сакриј или пријави играча',
    playerTitle: (name) => `Играч: ${name}`,
    hidePlayer: 'Сакриј овог играча',
    showPlayer: 'Поново прикажи играча',
    hidePlayerNote: 'До краја овог стола не видиш име, емотиконе ни поклоне овог играча.',
    reportPlayer: 'Пријави играча',
    reportPlayerNote: 'Отвара имејл програмеру са надимком и кодом стола. Шаљеш га ти; сервер ништа не чува.',
    reportFallback: (email) => `Ако се пошта не отвори, пиши на ${email}`,
    reportSubject: 'Бела Штих: пријава играча',
    reportBody: (p) =>
      `Пријављујем играча са надимком: „${p.name}”\nКод стола: ${p.code}\nВреме: ${p.at}\nВерзија игре: ${p.version}\n\nШта је било неприкладно (није обавезно):\n`,
    playerHint: 'Додирни за поклон или пријаву',
    startWithBots: 'Почни са ботовима',
    sitHere: 'седни овде',
    retry: 'Покушај поново',
    playAgain: 'Играј опет',
    waitingForRematch: (n) => `Чекамо још ${n} играча…`,
    rematchAsked: 'Нова партија је затражена',
    startAnyway: 'Почни свеједно',
    seriesScore: 'Партије',
    arrangeHint: 'Додирни две карте да их замениш.',
    arrangeDone: 'Готово',
    sortHand: 'Слагање карата',
    sortAuto: 'Адут први',
    sortSuits: 'По бојама',
    sortManual: 'Ручно',
    confirmPlayLabel: 'Потврда бацања',
    confirmOff: 'Без потврде',
    confirmAmbiguous: 'Кад има избора',
    confirmAlways: 'Увек',
    motionLabel: 'Анимације',
    motionSystem: 'Као систем',
    motionFull: 'Пуне',
    motionReduced: 'Смањене',
    volumeLabel: 'Јачина звука',
    volumeQuiet: 'Тихо',
    volumeMedium: 'Средње',
    volumeLoud: 'Гласно',
    soundBlocked: 'Звук је искључен — додирни за укључивање',
    invite: 'Позови пријатеље',
    inviteText: (url) => `Заиграј белу са мном! Придружи се мом столу: ${url}`,
    inviteCopied: 'Позивница је копирана — налепи је пријатељима.',
    giftName: (id) => SR_GIFTS[id] ?? id,
    giftSend: 'Пошаљи поклон',
    giftTreatTable: 'Почасти цео сто',
    giftToEveryone: (n) => `Свима за столом (${n})`,
    giftSendFor: (price) => `Пошаљи · ${price}`,
    giftWait: 'Сачекај мало па пошаљи нови поклон.',
    giftNoCoins: 'Немаш довољно новчића.',
    giftForFun: 'Поклон је само за забаву: прималац не добија новчиће.',
    giftHint: 'Додирни за поклон',
    close: 'Затвори',
    giftNotSeen: 'Овај играч има старију верзију игре и не види поклоне.',
    giftNobodySees: 'Нико други за столом још не види поклоне: имају старију верзију игре.',
    giftPuckLabel: (p) =>
      [p.name, p.dealer && 'дели', `карте: ${p.cards}`, p.tricks > 0 && `штихови: ${p.tricks}`, p.gift && `поклон: ${p.gift}`]
        .filter(Boolean)
        .join(', '),
    giftCellLabel: (gift, price) => `${gift}, ${price} новчића`,
    giftReceived: (gift, from) => `Нови поклон: ${gift} (${from})`,
  },
};

const EN_EMOTE_NAMES: Record<string, string> = {
  smile: 'Smile',
  laugh: 'Laughing',
  wow: 'Surprised',
  cry: 'Sad',
  clap: 'Applause',
  think: 'Thinking',
};

const EN_EMOTES: Record<string, string> = {
  bravo: 'Nice!',
  brze: 'Faster!',
  ajme: 'Oops!',
  hvala: 'Thanks!',
};

const EN_GIFTS: Record<string, string> = {
  kava: 'Coffee',
  caj: 'Tea',
  limunada: 'Lemonade',
  rakija: 'Rakija',
  pivo: 'Beer',
  gemist: 'Spritzer',
  burek: 'Burek',
  kolac: 'Cake',
  sladoled: 'Ice cream',
  maramice: 'Tissues',
  ruza: 'Rose',
  djetelina: 'Four-leaf clover',
  potkova: 'Horseshoe',
  pehar: 'Trophy',
  kruna: 'Crown',
};

const EN_COSMETICS: Record<string, string> = {
  classic: 'Classic',
  lattice: 'Lattice',
  oak: 'Oak',
  green: 'Green',
  walnut: 'Walnut',
  midnight: 'Midnight',
  djed: 'Grandpa',
  baka: 'Grandma',
  brko: 'Moustache',
  snasa: 'Village belle',
  student: 'Student',
  teta: 'Auntie',
  sofer: 'Chauffeur',
  majstor: 'Handyman',
  gazda: 'Boss',
  profesorica: 'Professor',
  ribar: 'Fisherman',
  kapetan: 'Captain',
};

const EN_QUESTS: Record<QuestKind, string> = {
  playDeals: 'Play deals',
  winDeals: 'Win deals',
  callZvanja: 'Make declarations',
  callBela: 'Call bela',
  winMatch: 'Win a match',
};

const en: Strings = {
  ...hr,
  suit: { clubs: 'acorns', spades: 'leaves', hearts: 'hearts', diamonds: 'bells' },
  season: { hearts: 'Spring', diamonds: 'Summer', spades: 'Autumn', clubs: 'Winter' },
  rankShort: { ...ROMAN, J: 'J', Q: 'Q', K: 'K', A: 'A' },
  rankName: {
    '7': 'seven',
    '8': 'eight',
    '9': 'nine',
    '10': 'ten',
    J: 'jack',
    Q: 'queen',
    K: 'king',
    A: 'ace',
  },

  seat: ['You', 'Right', 'Partner', 'Left'],
  seatAbsolute: (seat) => `Player ${seat}`,
  us: 'Us',
  them: 'Them',
  teamA: 'Team A',
  teamB: 'Team B',

  trump: 'trump',
  trumpUndecided: 'trump not yet chosen',
  trumpQuestion: 'trump?',
  calledBy: (who) => `called by ${who}`,
  calledByYou: 'called by you',
  score: 'Score',
  trick: 'Trick',
  emptyTrick: '(empty)',
  yourCards: 'Your cards',
  declarations: 'Declarations',
  bela: 'Bela',

  pass: 'pass',
  callVerb: 'call',
  callsVerb: 'calls',
  call: (suit) => `call ${suit}`,
  noKontra: 'no kontra',
  announce: 'declare',
  announces: 'declares',
  staySilent: 'stay silent',
  declareHint: 'Stay silent and it is forfeited — but the opponents learn nothing.',
  belaHint: 'Call bela with the king or over of trumps.',

  declValue: (value) =>
    ({ 20: 'twenty', 50: 'fifty', 100: 'a hundred', 150: '150', 200: '200' })[value] ??
    String(value),
  declTo: 'to the',
  carre: (rank) => `four ${rank}s`,
  renonsTitle: 'Renons!',
  renonsBy: (who) => `${who} broke the rules of play — the whole deal goes to the opponents`,
  renonsByYou: 'Your renons — the whole deal goes to the opponents',
  claimZvanja: 'Declare',
  claimZvanjaHint: 'Got a declaration? Spot it yourself — unclaimed is forfeited.',
  noZvanja: 'Nothing to declare',
  askZvanja: 'Any declarations?',
  zvanjaNoTrickToOpponents: 'No trick taken — declarations go to the opponents',
  showsZvanja: 'shows declarations',
  noneToDeclare: 'Nothing',
  markZvanjaHint: 'Mark the cards that make up your declaration',
  markingOk: 'That is a declaration — press Declare',
  markingNotZvanje: 'Those cards are not a declaration',
  declareMarked: 'Declare',
  difficulty: 'Difficulty',
  difficultyEasy: 'Casual',
  difficultyHard: 'True bela',
  difficultyHardHint:
    'True bela: the app stops policing for you. Find your own declarations, and an illegal card is renons — the opponents write everything.',
  deckStyleLabel: 'Cards',
  deckMadarice: 'Hungarian',
  deckStarinske: 'Vintage',
  deckFrancuske: 'French',
  deckSimple: 'Simple',

  dealHeading: (n, dealer) => `Deal ${n} — dealt by ${dealer}`,
  dealResult: 'Deal result',
  cardsAndLastTrick: 'Cards + last trick',
  valat: 'Štiglja',
  total: 'Total',
  recorded: 'Recorded',
  matchScore: 'Match score',
  callerMade: 'The caller made it.',
  callerFailed: 'Down — the caller failed; everything goes to the opponents.',
  madeShort: 'Made',
  failedShort: 'Down',
  winner: (team) => `${team} wins`,
  nextDeal: 'Next deal',
  newMatch: 'New match',
  gameToTarget: (target) => `game to ${target}`,
  needsMore: (points) => `needs ${points} more`,
  contractSafe: 'safe',

  ui: {
    play: 'PLAY',
    playBots: 'Play vs bots',
    privateTable: 'Create a private table',
    modeBotsSub: 'Right away, offline too',
    modePrivateSub: 'Invite friends with a code',
    daily: 'Daily',
    joinByCode: 'Join with a code',
    tableCode: 'table code',
    enter: 'Enter',
    nicknameLabel: 'Your name for online play',
    nicknamePlaceholder: 'no sign-up — just a name',
    dailyBonus: (coins) => `Daily bonus: +${coins}`,
    streakDays: (days) => `Streak: ${days} ${days === 1 ? 'day' : 'days'}`,
    startStreak: 'Start a streak today',
    claim: 'Claim',
    bonusClaimed: 'Daily bonus claimed',
    dailyQuests: 'Daily quests',
    questLabel: (kind) => EN_QUESTS[kind],
    level: 'Level',
    coins: 'Coins',
    wins: 'Wins',
    shop: 'Shop',
    settings: 'Settings',
    profile: 'Profile',
    sectionCardBacks: 'Card backs',
    sectionFelts: 'Tables',
    sectionAvatars: 'Avatars',
    cosmeticName: (id) => EN_COSMETICS[id] ?? id,
    buy: (price) => `Buy · ${price}`,
    needsLevel: (level) => `Level ${level}`,
    select: 'Select',
    selected: 'Selected',
    sound: 'Sound',
    haptics: 'Haptics',
    language: 'Language',
    resetProgress: 'Erase progress',
    resetConfirm: 'Sure? Tap again',
    version: 'Version',
    statMatches: 'Matches',
    statWinRate: 'Win rate',
    statDeals: 'Deals',
    statZvanja: 'Declarations',
    statBela: 'Belas',
    statValat: 'Štiglje',
    statBestDeal: 'Best deal',
    coinsDisclaimer: 'Coins are for play only. No real-money deposits or payouts.',
    back: 'Back',
    crashTitle: 'Something went wrong',
    crashBody: 'The app hit an error. Go back to the home screen and try again.',
    privacyPolicy: 'Privacy policy',

    emotePhrase: (id) => EN_EMOTES[id] ?? id,
    emoteName: (id) => EN_EMOTE_NAMES[id] ?? EN_EMOTES[id] ?? id,
    emoteToggle: 'Messages',
    walletLabel: (coins) => `Shop, coins: ${coins}`,

    connecting: 'Connecting…',
    cannotConnect: (server) => `Cannot reach ${server}`,
    connectionLost: 'Connection lost.',
    disconnectedWithCode: (code) => `connection lost (${code})`,
    waitingForPlayers: (seated) => `Waiting for players… ${seated}/4`,
    shareCode: 'Send it to friends so they can join you.',
    leaveTable: 'Leave table',
    leaveConfirm: 'Do you really want to leave the table?',
    leaveConfirmYes: 'Leave',
    leaveConfirmNo: 'Stay',
    botPlaysFor: (names) => `${names} — a bot plays for them`,
    moveRefused: "That move isn't allowed.",
    playerN: (n) => `Player ${n}`,
    reportOpen: 'Report',
    reportOpenLabel: 'Hide or report this player',
    playerTitle: (name) => `Player: ${name}`,
    hidePlayer: 'Hide this player',
    showPlayer: 'Show this player again',
    hidePlayerNote: "For the rest of this table you won't see this player's name, emotes or gifts.",
    reportPlayer: 'Report this player',
    reportPlayerNote: 'Opens an email to the developer with the nickname and table code. You send it; the server keeps nothing.',
    reportFallback: (email) => `If no mail app opens, write to ${email}`,
    reportSubject: 'Bela Štih: player report',
    reportBody: (p) =>
      `Reporting the player with the nickname: "${p.name}"\nTable code: ${p.code}\nTime: ${p.at}\nApp version: ${p.version}\n\nWhat was wrong (optional):\n`,
    playerHint: 'Tap to send a gift or report',
    startWithBots: 'Start with bots',
    sitHere: 'sit here',
    retry: 'Try again',
    playAgain: 'Play again',
    waitingForRematch: (n) => `Waiting for ${n} more…`,
    rematchAsked: 'You asked for another match',
    startAnyway: 'Start anyway',
    seriesScore: 'Matches',
    arrangeHint: 'Tap two cards to swap them.',
    arrangeDone: 'Done',
    sortHand: 'Card order',
    sortAuto: 'Trump first',
    sortSuits: 'By suit',
    sortManual: 'Manual',
    confirmPlayLabel: 'Confirm play',
    confirmOff: 'Never',
    confirmAmbiguous: 'When there is a choice',
    confirmAlways: 'Always',
    motionLabel: 'Animations',
    motionSystem: 'Follow system',
    motionFull: 'Full',
    motionReduced: 'Reduced',
    volumeLabel: 'Volume',
    volumeQuiet: 'Quiet',
    volumeMedium: 'Medium',
    volumeLoud: 'Loud',
    soundBlocked: 'Sound is off — tap to turn it on',
    invite: 'Invite friends',
    inviteText: (url) => `Come play Bela with me! Join my table: ${url}`,
    inviteCopied: 'Invite copied — paste it to your friends.',
    giftName: (id) => EN_GIFTS[id] ?? id,
    giftSend: 'Send a gift',
    giftTreatTable: 'Treat the table',
    giftToEveryone: (n) => `Everyone (${n})`,
    giftSendFor: (price) => `Send · ${price}`,
    giftWait: 'Wait a moment before the next gift.',
    giftNoCoins: 'Not enough coins.',
    giftForFun: 'Gifts are just for fun: the receiver gets no coins.',
    giftHint: 'Tap to send a gift',
    close: 'Close',
    giftNotSeen: "This player has an older version of the game and can't see gifts.",
    giftNobodySees: 'Nobody else here can see gifts yet: they have an older version of the game.',
    giftPuckLabel: (p) =>
      [p.name, p.dealer && 'deals', `cards: ${p.cards}`, p.tricks > 0 && `tricks: ${p.tricks}`, p.gift && `gift: ${p.gift}`]
        .filter(Boolean)
        .join(', '),
    giftCellLabel: (gift, price) => `${gift}, ${price} coins`,
    giftReceived: (gift, from) => `New gift: ${gift} (${from})`,
  },
};

const LOCALES: Record<LocaleId, Strings> = { hr, 'sr-Cyrl': srCyrl, en };

export class Lang {
  readonly id: LocaleId;
  private readonly t: Strings;

  constructor(id: LocaleId = 'hr') {
    this.id = id;
    // A locale id read back from storage is not necessarily one this build
    // knows — a rolled-back client, or settings written by a newer one. Falling
    // back beats throwing on every screen that touches `lang.s`.
    this.t = LOCALES[id] ?? LOCALES.hr;
  }

  get s(): Strings {
    return this.t;
  }

  /** The mađarice name: žir, list, srce, bundeva. */
  suitName(suit: Suit): string {
    return this.t.suit[suit];
  }

  /** The season on this suit's ace (Tell pattern: srce=spring ... žir=winter). */
  seasonName(suit: Suit): string {
    return this.t.season[suit];
  }

  /** Name plus a French pip, for terminals that cannot draw a real one. */
  suit(suit: Suit): string {
    return `${SUIT_PIP[suit]} ${this.t.suit[suit]}`;
  }

  /** What is printed on the card face. */
  rankShort(rank: Rank): string {
    return this.t.rankShort[rank];
  }

  rankName(rank: Rank): string {
    return this.t.rankName[rank];
  }

  /** Seats read relative to the person; absolute when nobody is seated. */
  seat(seat: Seat, humanSeat: Seat | null): string {
    if (humanSeat === null) return this.t.seatAbsolute(seat);
    return this.t.seat[((seat - humanSeat + 4) % 4) as 0 | 1 | 2 | 3];
  }

  team(team: TeamId, humanSeat: Seat | null): string {
    if (humanSeat === null) return team === 0 ? this.t.teamA : this.t.teamB;
    return team === ((humanSeat % 2) as TeamId) ? this.t.us : this.t.them;
  }

  declaration(d: DeclarationSummary): string {
    // Announced the way it is said at the table: by value, "dvadeset do kralja" —
    // never by name, and never revealing more than the top card.
    const top = this.rankName(d.topRank);
    if (d.kind === 'carre') return `${this.t.declValue(d.value)} (${this.t.carre(top)})`;
    return `${this.t.declValue(d.value)} ${this.t.declTo} ${top}`;
  }

  /** Short label for a legal action, for buttons and numbered lists. */
  action(a: Action): string {
    switch (a.type) {
      case 'BID_PASS':
        return this.t.pass;
      case 'BID_CALL':
        return this.t.call(this.suitName(a.suit));
      case 'DOUBLE_KONTRA':
        return this.t.kontra;
      case 'DOUBLE_REKONTRA':
        return this.t.rekontra;
      case 'DOUBLE_PASS':
        return this.t.noKontra;
      case 'DECLARE_ANNOUNCE':
        return this.t.announce;
      case 'DECLARE_SKIP':
        return this.t.staySilent;
      case 'PLAY_CARD':
        return (
          `${this.rankShort(a.card.rank)} ${this.suitName(a.card.suit)}` +
          (a.announceBela === true ? ` ${this.t.withBela}` : '')
        );
    }
  }
}

export const LOCALE_IDS: LocaleId[] = ['hr', 'sr-Cyrl', 'en'];
