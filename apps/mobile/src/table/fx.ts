import type { Seat } from '@belot/engine';
import { SEATS } from '@belot/engine';
import type { TableEvent } from '@belot/table';
import type { Lang } from '@belot/i18n';
import type { AnchorMap } from '../anim/AnchorRegistry';
import { anchorId, type FxBus } from '../anim/FxBus';
import { BACK_SCALE, FALLBACK_CARD_W, FLIGHT_MS } from '../anim/lifetimes';
import { emoteText, isGlyphEmote } from '../emotes';

/**
 * Maps table events to sprites. Shared by the offline and online screens, so a
 * played card looks identical whether the engine ran on-device or on the
 * server.
 *
 * Any missing anchor simply skips the sprite — the director has already
 * committed the state change; decoration must never gate correctness.
 *
 * Every sprite carries the director's current `speed` and the measured card
 * width at its destination. The speed keeps a sprite inside the beat it fills
 * when the director runs at half pace with a batch waiting; the width keeps a
 * flight the size of the card it becomes, so nothing pops on landing.
 */
/** An emote thrown across the table: a bubble over the sender's seat. */
export function spawnEmote(
  opts: { anchors: AnchorMap; bus: FxBus; lang: Lang },
  seat: Seat,
  id: string,
): void {
  const text = emoteText(opts.lang, id);
  const at = opts.anchors.centre(anchorId.seat(seat));
  if (!text || !at) return;
  opts.bus.emit({
    kind: 'bubble',
    at,
    text,
    tone: 'plain',
    duration: 1800,
    big: isGlyphEmote(id),
  });
}

export function makeFxSpawner(opts: { anchors: AnchorMap; bus: FxBus; lang: Lang }) {
  const { anchors, bus, lang } = opts;

  /** The width of a card sitting in this seat's slot, or the fallback before the first layout. */
  const slotW = (seat: Seat): number => anchors.rect(anchorId.slot(seat))?.w ?? FALLBACK_CARD_W;
  /** Any measured slot will do for a sprite that is not bound to one seat. */
  const anySlotW = (): number => {
    for (const s of SEATS) {
      const r = anchors.rect(anchorId.slot(s));
      if (r) return r.w;
    }
    return FALLBACK_CARD_W;
  };

  const bubble = (
    seat: Seat,
    text: string,
    tone: 'plain' | 'gold',
    duration: number,
    speed: number,
  ) => {
    const at = anchors.centre(anchorId.seat(seat));
    if (at) bus.emit({ kind: 'bubble', at, text, tone, duration: duration * speed });
  };

  return (e: TableEvent, speed = 1): void => {
    switch (e.kind) {
      case 'dealStarted': {
        const from = anchors.centre(anchorId.deck);
        const to = SEATS.map((s) => anchors.centre(anchorId.seat(s))).filter(
          (p): p is NonNullable<typeof p> => p !== null,
        );
        if (from && to.length === 4) {
          bus.emit({ kind: 'deal', from, to, rounds: 2, speed, width: anySlotW() * BACK_SCALE });
        }
        break;
      }

      case 'handsCompleted': {
        // The talon: after the contract, everyone receives two more cards.
        const from = anchors.centre(anchorId.deck);
        const to = SEATS.map((s) => anchors.centre(anchorId.seat(s))).filter(
          (p): p is NonNullable<typeof p> => p !== null,
        );
        if (from && to.length === 4) {
          bus.emit({ kind: 'deal', from, to, rounds: 1, speed, width: anySlotW() * BACK_SCALE });
        }
        break;
      }

      case 'cardPlayed': {
        const from = anchors.centre(anchorId.seat(e.seat));
        const to = anchors.centre(anchorId.slot(e.seat));
        if (from && to) {
          bus.emit({
            kind: 'flight',
            card: e.card,
            from,
            to,
            duration: FLIGHT_MS * speed,
            faceUp: true,
            width: slotW(e.seat),
          });
        }
        break;
      }

      case 'trickWon': {
        const from = SEATS.map((s) => anchors.centre(anchorId.slot(s))).filter(
          (p): p is NonNullable<typeof p> => p !== null,
        );
        const to = anchors.centre(anchorId.seat(e.seat));
        if (from.length > 0 && to) {
          bus.emit({ kind: 'sweep', from, to, speed, width: anySlotW() * BACK_SCALE });
        }
        break;
      }

      case 'bidPassed':
        bubble(e.seat, lang.s.pass, 'plain', 500, speed);
        break;

      case 'bidCalled':
        bubble(e.seat, `${lang.s.callsVerb} ${lang.suitName(e.suit)}`, 'plain', 900, speed);
        break;

      case 'doubled':
        bubble(e.seat, e.multiplier === 2 ? lang.s.kontra : lang.s.rekontra, 'gold', 900, speed);
        break;

      case 'declared':
        // In blind mode a seat may claim with nothing, and the engine answers
        // with an empty list by design. Say so — an empty string painted a
        // blank gold pill with a chime behind it, several times a deal.
        bubble(
          e.seat,
          e.declarations.length > 0
            ? e.declarations.map((d) => lang.declaration(d)).join(' · ')
            : lang.s.noZvanja,
          'gold',
          1100,
          speed,
        );
        break;

      case 'belaCalled':
        bubble(e.seat, `${lang.s.bela.toUpperCase()}! (20)`, 'gold', 1100, speed);
        break;

      // dealScored / matchOver feedback is the result panel, coins and
      // confetti — driven by the screens off banner/winner state, not here.
      default:
        break;
    }
  };
}
