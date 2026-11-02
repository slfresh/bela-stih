import { useEffect, useRef } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Lang } from '@belot/i18n';
import type { OtherGame } from '../home/MoreGames';
import { Button } from '../ui/Button';
import { useBackCloses } from '../ui/backGuard';
import { room } from '../cosmetics';
import { ink, radius, space, stroke, surface, type } from '../theme';

/** How to play one of the games beyond Bela: its rules, numbered, over the home screen. */
export function RulesSheet({ lang, game, onClose }: { lang: Lang; game: OtherGame; onClose: () => void }) {
  // Back closes the sheet (App counts it as a step off the home screen, so
  // Back reaches this guard instead of leaving the app), as do a tap beside
  // it and, on the web, Escape: the ways any sheet is put away.
  useBackCloses(true, onClose);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const strings = game === 'osmice' ? lang.osmice : game === 'holdem' ? lang.holdem : game === 'blackjack' ? lang.blackjack : lang.baccarat;
  return (
    <View style={styles.scrim} accessibilityViewIsModal>
      {/* The tap beside the sheet. Out of a screen reader's way: it has the
          sheet's own Back button, and the label is for anything that lists it anyway. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessible={false}
        importantForAccessibility="no"
        accessibilityLabel={lang.games.back}
      />
      <View style={[styles.sheet, { backgroundColor: room().page }]}>
        <Text style={styles.title}>{strings.name}</Text>
        <Text style={styles.tagline}>{strings.tagline}</Text>
        <ScrollView style={styles.list} contentContainerStyle={styles.listInner}>
          {strings.rules.map((r, i) => (
            <View key={i} style={styles.rule}>
              <Text style={styles.n}>{i + 1}</Text>
              <Text style={styles.text}>{r}</Text>
            </View>
          ))}
          {game !== 'osmice' ? <Text style={styles.note}>{lang.casino.playMoney}</Text> : null}
        </ScrollView>
        <Button label={lang.games.back} tone="strong" onPress={onClose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: surface.scrim, justifyContent: 'center', padding: space.lg },
  sheet: { maxHeight: '90%', borderRadius: radius.panel, padding: space.lg, gap: space.sm, borderWidth: 1, borderColor: stroke.edge },
  title: { ...type.h2, color: ink.hi, textAlign: 'center' },
  tagline: { ...type.sub, color: ink.mid, textAlign: 'center' },
  list: { flexGrow: 0 },
  listInner: { gap: space.md, paddingVertical: space.sm },
  rule: { flexDirection: 'row', gap: space.sm },
  n: { ...type.h3, color: ink.mid, width: 20 },
  text: { ...type.body, color: ink.hi, flex: 1 },
  note: { ...type.caption, color: ink.lo },
});
