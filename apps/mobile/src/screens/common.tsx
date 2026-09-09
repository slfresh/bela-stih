import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PressScale } from '../ui/PressScale';
import { radius, theme } from '../theme';

/** The version shown in settings; keep in step with app.json. */
export const APP_VERSION = '1.0.0';

/**
 * The frame every secondary screen (shop, settings, profile) shares: a back
 * chevron, a title, and a scrolling body on the house background.
 */
export function ScreenShell({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <PressScale onPress={onBack} hitSlop={12} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </PressScale>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.backButton} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>{children}</ScrollView>
    </SafeAreaView>
  );
}

/** A labelled panel, matching the home screen's cards. */
export function Panel({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <View style={styles.panel}>
      {label ? <Text style={styles.panelLabel}>{label}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.feltDeep },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backButton: { width: 44, alignItems: 'flex-start' },
  backText: { color: theme.text, fontSize: 34, fontWeight: '600', marginTop: -6 },
  title: { flex: 1, color: theme.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  scroll: { padding: 16, gap: 14, paddingBottom: 40 },
  panel: {
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: theme.line,
    padding: 14,
    gap: 10,
  },
  panelLabel: { color: theme.textDim, fontSize: 13 },
});
