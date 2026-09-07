import type { Action, Card, DealScoreResult, PublicView, Seat, Suit } from '@belot/engine';
import { Lang, SUIT_PIP, isRedSuit, type LocaleId } from '@belot/i18n';
import type { TableEvent } from '@belot/table';

/**
 * Terminal presentation. Every word comes from @belot/i18n so the phone and the
 * terminal cannot drift apart; this file only decides colour and layout.
 */

// --- language ----------------------------------------------------------------

let lang = new Lang('hr');

export function setLocale(id: LocaleId): void {
  lang = new Lang(id);
}

// --- colour ------------------------------------------------------------------

const useColour = process.env.NO_COLOR === undefined;
/** ANSI escapes, built explicitly so no control characters live in this file. */
const ESC = String.fromCharCode(27);
const wrap = (code: string, s: string) =>
  useColour ? `${ESC}[${code}m${s}${ESC}[0m` : s;

export const dim = (s: string) => wrap('2', s);
export const bold = (s: string) => wrap('1', s);
export const red = (s: string) => wrap('31', s);
export const cyan = (s: string) => wrap('36', s);
export const yellow = (s: string) => wrap('33', s);
export const green = (s: string) => wrap('32', s);

// --- cards -------------------------------------------------------------------

export function suitLabel(suit: Suit): string {
  const text = lang.suit(suit);
  return isRedSuit(suit) ? red(text) : text;
}

export function renderCard(card: Card): string {
  const text = `${card.rank}${SUIT_PIP[card.suit]}`;
  return isRedSuit(card.suit) ? red(text) : text;
}

/** Sort a hand by suit then natural rank, the way a person holds it. */
const SUIT_ORDER: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANK_ORDER = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export function sortHand(hand: Card[]): Card[] {
  return hand.slice().sort((a, b) => {
    const s = SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit);
    return s !== 0 ? s : RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank);
  });
}

export function renderHand(hand: Card[]): string {
  return sortHand(hand).map(renderCard).join('  ');
}

// --- actions -----------------------------------------------------------------

export function actionLabel(a: Action): string {
  const base = lang.action(a);
  switch (a.type) {
    case 'BID_CALL':
      return `${lang.s.callVerb} ${suitLabel(a.suit)}`;
    case 'DOUBLE_KONTRA':
    case 'DOUBLE_REKONTRA':
      return bold(base);
    case 'DECLARE_ANNOUNCE':
      return bold(base);
    case 'PLAY_CARD':
      return a.announceBela === true
        ? `${renderCard(a.card)}  ${bold(yellow(lang.s.withBela))}`
        : renderCard(a.card);
    default:
      return base;
  }
}

// --- the table ---------------------------------------------------------------

export function renderTable(view: PublicView, humanSeat: Seat | null): string {
  const lines: string[] = [];
  const trump = view.context.trumpSuit;
  const who = (s: Seat) => lang.seat(s, humanSeat);

  lines.push(dim('─'.repeat(64)));
  const contract = trump
    ? `${lang.s.trump} ${suitLabel(trump)}${view.multiplier > 1 ? bold(` ×${view.multiplier}`) : ''}` +
      dim(` (${lang.s.calledBy(who(view.callerSeat!))})`)
    : dim(lang.s.trumpUndecided);
  lines.push(
    `${bold(lang.s.score)}  ${lang.team(0, humanSeat)} ${view.matchScores[0]}` +
      ` : ${view.matchScores[1]} ${lang.team(1, humanSeat)}   ${contract}`,
  );

  if (view.announcedDeclarations.length > 0) {
    const said = view.announcedDeclarations
      .map((d) => `${who(d.seat)}: ${lang.declaration(d)}`)
      .join(', ');
    lines.push(`${dim(lang.s.declarations)}    ${said}`);
  }
  if (view.belaAnnouncedBy !== null) {
    lines.push(`${dim(lang.s.bela)}      ${who(view.belaAnnouncedBy)} ${yellow('(20)')}`);
  }

  if (view.currentTrick.length > 0) {
    const played = view.currentTrick
      .map((p) => `${dim(who(p.seat))} ${renderCard(p.card)}`)
      .join('   ');
    lines.push(`${bold(lang.s.trick)}      ${played}`);
  } else {
    lines.push(`${bold(lang.s.trick)}      ${dim(lang.s.emptyTrick)}`);
  }

  lines.push(`${bold(lang.s.yourCards)} ${renderHand(view.hand)}`);
  lines.push(dim('─'.repeat(64)));
  return lines.join('\n');
}

// --- events ------------------------------------------------------------------

/** One line per event — the running commentary of the hand. */
export function renderEvent(e: TableEvent, humanSeat: Seat | null): string | null {
  const who = (s: Seat) => lang.seat(s, humanSeat);
  switch (e.kind) {
    case 'dealStarted':
      return dim(`\n── ${lang.s.dealHeading(e.dealNumber + 1, who(e.dealer))} ──`);
    case 'bidPassed':
      return dim(`${who(e.seat)}: ${lang.s.pass}`);
    case 'bidCalled':
      return `${who(e.seat)}: ${bold(lang.s.callsVerb)} ${suitLabel(e.suit)}`;
    case 'doubled':
      return bold(red(`${who(e.seat)}: ${e.multiplier === 2 ? lang.s.kontra : lang.s.rekontra}!`));
    case 'doublePassed':
      return null; // too chatty to be worth a line
    case 'handsCompleted':
      return dim(`${lang.s.trump}: ${suitLabel(e.trumpSuit)}`);
    case 'declared':
      // Blind mode lets a seat claim with nothing, and the engine answers with
      // an empty list — which rendered as a dangling label with no zvanja.
      return cyan(
        e.declarations.length > 0
          ? `${who(e.seat)} ${lang.s.announces}: ${e.declarations.map((d) => lang.declaration(d)).join(', ')}`
          : `${who(e.seat)}: ${lang.s.noZvanja}`,
      );
    case 'declarationSkipped':
      return null; // silence is the whole point; do not announce it
    case 'declarationsRevealed':
      // The winning side lays its combinations down for everyone to see.
      return cyan(
        `${lang.team(e.team, humanSeat)} ${lang.s.showsZvanja}: ` +
          e.declarations
            .map((d) => `${lang.declaration(d)} (${d.cards.map(renderCard).join(' ')})`)
            .join(', '),
      );
    case 'belaCalled':
      return bold(yellow(`${who(e.seat)}: ${lang.s.bela.toUpperCase()}! (20)`));
    case 'cardPlayed':
      return `${dim(who(e.seat).padEnd(8))} ${renderCard(e.card)}`;
    case 'trickWon':
      return dim(
        `   → ${lang.s.trick.toLowerCase()} ${e.trickNumber}: ${who(e.seat)} (${e.points})` +
          (e.isLastTrick ? ' +10' : ''),
      );
    case 'dealScored':
      return renderDealResult(e.result, e.matchScores, humanSeat);
    case 'matchOver':
      return bold(
        green(
          `\n★ ${lang.s.winner(lang.team(e.winner, humanSeat))} ` +
            `(${e.matchScores[0]} : ${e.matchScores[1]})`,
        ),
      );
    case 'matchStarted':
      return bold(`
═══ ${lang.s.newMatch} #${e.matchNumber + 1} ═══`);
  }
}

export function renderDealResult(
  r: DealScoreResult,
  matchScores: [number, number],
  _humanSeat: Seat | null,
): string {
  const rows: string[] = ['', bold(lang.s.dealResult)];
  const pair = (label: string, v: readonly [number, number]) =>
    `  ${label.padEnd(22)} ${String(v[0]).padStart(4)} : ${String(v[1]).padStart(4)}`;

  rows.push(pair(lang.s.cardsAndLastTrick, r.trickPoints));
  if (r.valatTeam !== null) rows.push(pair(lang.s.valat, r.valatBonus));
  if (r.declarationPoints[0] + r.declarationPoints[1] > 0) {
    rows.push(pair(lang.s.declarations, r.declarationPoints));
  }
  if (r.bela[0] + r.bela[1] > 0) rows.push(pair(lang.s.bela, r.bela));
  rows.push(pair(lang.s.total, r.rawTotal));
  rows.push(r.callerMade ? green(`  ${lang.s.callerMade}`) : red(bold(`  ${lang.s.callerFailed}`)));
  rows.push(bold(pair(lang.s.recorded, r.finalScore)));
  rows.push(dim(pair(lang.s.matchScore, matchScores)));
  return rows.join('\n');
}

export function renderPrompt(view: PublicView, humanSeat: Seat): string {
  const lines: string[] = [];
  if (view.mustDeclare && view.myDeclarations.length > 0) {
    const mine = view.myDeclarations
      .map((d) => lang.declaration({ ...d, seat: humanSeat }))
      .join(', ');
    lines.push(cyan(`${lang.s.declarations}: ${mine}`));
    lines.push(dim(lang.s.declareHint));
  }
  if (view.canAnnounceBela) {
    // The i18n copy says "babe", which is the vocabulary this deck uses; the
    // hand-written duplicate said "damu" and only existed in Croatian.
    lines.push(yellow(lang.s.belaHint));
  }
  return lines.join('\n');
}

export function renderOptions(actions: Action[]): string {
  return actions
    .map((a, i) => `  ${String(i + 1).padStart(2)}) ${actionLabel(a)}`)
    .join('\n');
}
