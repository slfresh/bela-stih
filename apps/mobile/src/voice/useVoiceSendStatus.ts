import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Seat } from '@belot/engine';
import { sendEchoed, sendHeard, sendNoted, sendSettle, sendStarted, type SendStatus, type VoiceEcho } from './voice';

/**
 * What became of my last voice message - sending, sent, who has heard it,
 * nobody could, it never got there - kept up to date as the room and the
 * listeners' apps answer, and as time runs out on them. The rules are
 * voice.ts's (sendSettle); this only feeds them the clock.
 */
export function useVoiceSendStatus() {
  const [status, setStatus] = useState<SendStatus | null>(null);
  const apply = useCallback((f: (s: SendStatus | null, now: number) => SendStatus | null) => {
    setStatus((s) => {
      const now = Date.now();
      return sendSettle(f(s, now), now).status;
    });
  }, []);
  // No echo in time, no receipt in time, a word said for long enough: each
  // is a moment known in advance, so one timer to the next of them.
  useEffect(() => {
    const { nextIn } = sendSettle(status, Date.now());
    if (nextIn === null) return;
    const t = setTimeout(() => setStatus((s) => sendSettle(s, Date.now()).status), nextIn + 5);
    return () => clearTimeout(t);
  }, [status]);

  const started = useCallback(() => apply((_, now) => sendStarted(now)), [apply]);
  const echoed = useCallback((e: VoiceEcho) => apply((s, now) => sendEchoed(s, e, now)), [apply]);
  const heard = useCallback((id: number, by: Seat) => apply((s, now) => sendHeard(s, id, by, now)), [apply]);
  const noted = useCallback((why: 'short' | 'denied' | 'failed') => apply((_, now) => sendNoted(why, now)), [apply]);
  return useMemo(() => ({ status, started, echoed, heard, noted }), [status, started, echoed, heard, noted]);
}
