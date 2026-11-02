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
      {/* The tap beside the sheet. A Pressable, because on the web its onPress
          runs on the click itself: a plain View closing on touchend unmounted
          at once, and the click a phone browser sends after the tap then
          landed on whatever home control was under the finger (a Play, a
          quick-play table, the rules again). The scrim takes that click now.
          It is no button for a keyboard or a screen reader, though: without
          tabIndex -1 react-native-web makes it a tab stop the size of the
          screen, and aria-hidden (the web) with the two native flags keeps it
          out of every screen reader's list, so its label (there for anything
          that lists it anyway) is never a second "Back". The sheet's own Back
          button, the Back key and Escape close it without a pointer. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        tabIndex={-1}
        accessible={false}
        accessibilityLabel={lang.games.back}
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
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
