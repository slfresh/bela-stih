import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Lang } from '@belot/i18n';
import { EMOTES, emoteText } from '../emotes';
import { radius, theme } from '../theme';

/**
 * The emote bar.
 *
 * The old tray sat in the flex column, so opening it shrank the felt by ~120px,
 * moved every sprite anchor and forced a re-measure mid-animation. This one
 * costs a constant 34px whether it is open or shut: the six glyphs are always
 * visible (one tap, no chrome) and the four phrases float above them.
 */

const GLYPHS = EMOTES.filter((e) => e.glyph);
const PHRASES = EMOTES.filter((e) => !e.glyph);

export function EmoteStrip({
  lang,
  open,
  dimmed,
  onSend,
}: {
  lang: Lang;
  /** Phrases showing? The glyph row is always up. */
  open: boolean;
  /** Fade back while the player is deciding a card. */
  dimmed: boolean;
  onSend: (id: string) => void;
}) {
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {/* The phrases float, so opening them cannot move the felt or the hand. */}
      {open && (
        <View style={[styles.row, styles.phraseRow]}>
          {PHRASES.map((e) => (
            <Pressable key={e.id} onPress={() => onSend(e.id)} style={styles.phraseChip}>
              <Text style={styles.phrase}>{emoteText(lang, e.id)}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={[styles.row, dimmed && styles.faded]}>
        {GLYPHS.map((e) => (
          <Pressable key={e.id} onPress={() => onSend(e.id)} style={styles.chip} hitSlop={4}>
            <Text style={styles.glyph}>{emoteText(lang, e.id)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'flex-end', minHeight: 34 },
  phraseRow: { position: 'absolute', bottom: 40, left: 0, right: 0 },
  row: { flexDirection: 'row', gap: 6, justifyContent: 'center', flexWrap: 'wrap' },
  faded: { opacity: 0.55 },
  chip: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.32)',
    borderWidth: 1,
    borderColor: theme.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Android clips tall emoji without an explicit line height.
  glyph: { fontSize: 20, lineHeight: 24 },
  phraseChip: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.line,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  phrase: { color: theme.text, fontSize: 13, fontWeight: '700' },
});
