import type { MotionPolicy } from './director';
import { useReduceMotion } from './useReduceMotion';
import type { MotionSetting } from '../storage';

/**
 * What the table actually does about motion: the in-app setting, and under
 * 'system' the phone's own reduce-motion switch. One answer for the
 * director's pacing, the sprites and every ambient loop.
 */
export function useMotionPolicy(setting: MotionSetting): MotionPolicy {
  const system = useReduceMotion();
  if (setting === 'reduced') return 'reduced';
  if (setting === 'full') return 'full';
  return system ? 'reduced' : 'full';
}
