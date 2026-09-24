import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync, useAudioRecorder } from 'expo-audio';
import { dropTake, readTake } from './clipFiles';
import {
  recordingOptions,
  sniffMime,
  VOICE_MAX_BYTES,
  VOICE_MAX_MS,
  VOICE_MIN_MS,
  webRecordingMime,
  type VoiceMime,
} from './voice';

/** A take ready to send: what it is, how long, the bytes. */
export interface Take {
  mime: VoiceMime;
  ms: number;
  data: Uint8Array;
}

/** How a press ended: sent, too short to mean anything, slid off, the mic refused, or the phone failed us. */
export type TakeEnd = 'sent' | 'short' | 'cancelled' | 'denied' | 'failed';

type Phase = 'idle' | 'starting' | 'recording';

const WEB_MIME =
  Platform.OS === 'web' && typeof MediaRecorder !== 'undefined'
    ? webRecordingMime((t) => MediaRecorder.isTypeSupported(t))
    : undefined;
const OPTIONS = recordingOptions(WEB_MIME);

/**
 * Hold to talk. `start` on the press, `finish(true)` when the finger lifts on
 * the button, `finish(false)` when it slid off. A take ends by itself at
 * VOICE_MAX_MS and is sent; one that is too short, cancelled, or cut by the
 * app going to the background is deleted unread. The first press on a phone
 * asks for the microphone and records nothing: the prompt took the press.
 */
export function useVoiceRecorder(onTake: (take: Take) => void, onEnd?: (why: TakeEnd) => void) {
  const recorder = useAudioRecorder(OPTIONS);
  const [phase, setPhase] = useState<Phase>('idle');
  const [startedAt, setStartedAt] = useState(0);
  const phaseRef = useRef<Phase>('idle');
  /** The finger is still on the button. */
  const holding = useRef(false);
  const startedRef = useRef(0);
  const limit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTakeRef = useRef(onTake);
  onTakeRef.current = onTake;
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  const to = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };
  const end = (why: TakeEnd) => onEndRef.current?.(why);

  const finish = useCallback(
    async (send: boolean) => {
      holding.current = false;
      // Still opening the microphone: `start` sees the finger gone and stops.
      if (phaseRef.current !== 'recording') return;
      to('idle');
      if (limit.current) clearTimeout(limit.current);
      limit.current = null;
      const ms = Math.min(Date.now() - startedRef.current, VOICE_MAX_MS);
      try {
        await recorder.stop();
      } catch {
        dropTake(recorder.uri);
        end('failed');
        return;
      }
      const uri = recorder.uri;
      if (!send || ms < VOICE_MIN_MS || !uri) {
        dropTake(uri);
        end(!send ? 'cancelled' : ms < VOICE_MIN_MS ? 'short' : 'failed');
        return;
      }
      try {
        const data = await readTake(uri);
        const mime = sniffMime(data);
        if (mime === null || data.length > VOICE_MAX_BYTES) {
          end('failed');
          return;
        }
        onTakeRef.current({ mime, ms, data });
        end('sent');
      } catch {
        end('failed');
      }
    },
    [recorder],
  );

  const start = useCallback(async () => {
    if (phaseRef.current !== 'idle') return;
    holding.current = true;
    to('starting');
    try {
      let perm = await getRecordingPermissionsAsync();
      if (!perm.granted) {
        if (perm.canAskAgain) perm = await requestRecordingPermissionsAsync();
        // Asked just now (the prompt took the press) or refused: nothing is recorded.
        to('idle');
        holding.current = false;
        if (!perm.granted) end('denied');
        return;
      }
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedRef.current = Date.now();
      setStartedAt(startedRef.current);
      to('recording');
      limit.current = setTimeout(() => void finish(true), VOICE_MAX_MS);
      // Let go while the microphone was opening: nothing meant, nothing sent.
      if (!holding.current) void finish(false);
    } catch {
      to('idle');
      holding.current = false;
      end('failed');
    }
  }, [recorder, finish]);

  // A call or the home button mid-take: the take is dropped, the mic let go.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') void finish(false);
    });
    return () => sub.remove();
  }, [finish]);
  useEffect(
    () => () => {
      if (limit.current) clearTimeout(limit.current);
      if (phaseRef.current === 'recording') void finish(false);
    },
    [finish],
  );

  return { phase, startedAt, start, finish };
}
