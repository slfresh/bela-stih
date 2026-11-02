import type { Lang } from '@belot/i18n';
import { AVATAR_IDS } from '../../avatarIds';

export interface Person {
  name: string;
  avatar: string;
}

/**
 * Who sits at a table of `seats`: the person at seat 0 with their own face and
 * nickname, then the house's characters, never wearing the person's face.
 */
export function tablePeople(seats: number, lang: Lang, nickname: string, myAvatar: string): Person[] {
  const others = AVATAR_IDS.filter((a) => a !== myAvatar);
  return Array.from({ length: seats }, (_, seat) =>
    seat === 0
      ? { name: nickname.trim() || lang.games.you, avatar: myAvatar }
      : { name: lang.s.ui.cosmeticName(others[(seat - 1) % others.length]!), avatar: others[(seat - 1) % others.length]! },
  );
}
