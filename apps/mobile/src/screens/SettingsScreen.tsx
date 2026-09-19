import { useState } from 'react';
import { Linking, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { PressScale } from '../ui/PressScale';
import type { Lang } from '@belot/i18n';
import type { PlayerProfile } from '@belot/progression';
import { resetProfile, type Settings, VOLUME_OPTIONS } from '../storage';
import { setDeckStyle } from '../cosmetics';
import { PlayingCard } from '../PlayingCard';
import { playSfx, setMasterVolume, setSoundEnabled } from '../audio';
import { garb } from '../deck/palette';
import { font, ink, radius, space, surface, theme, type } from '../theme';
import { APP_VERSION, Panel, ScreenShell } from './common';

const LOCALES: ReadonlyArray<{ id: Settings['locale']; label: string }> = [
  { id: 'hr', label: 'Hrvatski' },
  { id: 'sr-Cyrl', label: 'Српски' },
  { id: 'en', label: 'English' },
];

export function SettingsScreen({
  lang,
  settings,
  onSettingsChange,
  onProfileChange,
  onBack,
}: {
  lang: Lang;
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  onProfileChange: (p: PlayerProfile) => void;
  onBack: () => void;
}) {
  const ui = lang.s.ui;
  // Reset arms on the first tap and fires on the second — a dialog would be
  // heavier machinery than one destructive dev-facing action deserves.
  const [armed, setArmed] = useState(false);

  const toggleRow = (label: string, value: boolean, set: (v: boolean) => void) => (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={(v) => {
          // The sound gate is applied by App's effect a commit later; set it
          // now too, or turning sound ON is silent and OFF clicks.
          if (label === ui.sound) setSoundEnabled(v);
          playSfx('tap');
          set(v);
        }}
        trackColor={{ false: 'rgba(255,255,255,0.15)', true: theme.accent }}
        thumbColor={theme.cardFace}
      />
    </View>
  );

  return (
    <ScreenShell title={ui.settings} onBack={onBack} backLabel={ui.back}>
      <Panel label={ui.nicknameLabel}>
        <TextInput
          value={settings.nickname}
          onChangeText={(nickname) => onSettingsChange({ ...settings, nickname })}
          placeholder={ui.nicknamePlaceholder}
          placeholderTextColor={ink.lo}
          maxLength={20}
          autoCorrect={false}
          style={styles.input}
        />
        {/* Play's user-content policy: the rules, accepted where the name is made. */}
        <PressScale
          onPress={() => {
            void Linking.openURL('https://belastih.com/#pravila').catch(() => {});
          }}
          hitSlop={6}
          accessibilityRole="link"
        >
          <Text style={styles.hint}>{ui.nicknameRules} ↗</Text>
        </PressScale>
      </Panel>
      <Panel>
        {toggleRow(ui.sound, settings.sound, (sound) => onSettingsChange({ ...settings, sound }))}
        {toggleRow(ui.haptics, settings.haptics, (haptics) =>
          onSettingsChange({ ...settings, haptics }),
        )}
        <Text style={styles.rowLabel}>{ui.volumeLabel}</Text>
        <View style={styles.localeRow}>
          {(
            [
              { v: VOLUME_OPTIONS[0], label: ui.volumeQuiet },
              { v: VOLUME_OPTIONS[1], label: ui.volumeMedium },
              { v: VOLUME_OPTIONS[2], label: ui.volumeLoud },
            ] as const
          ).map((o) => (
            <PressScale
              key={o.v}
              // Its own click already plays at the new level.
              onPressIn={() => setMasterVolume(o.v)}
              onPress={() => onSettingsChange({ ...settings, volume: o.v })}
              accessibilityState={{ selected: settings.volume === o.v }}
              style={[styles.localeChip, settings.volume === o.v && styles.localeChipOn]}
            >
              <Text style={[styles.localeText, settings.volume === o.v && styles.localeTextOn]}>
                {o.label}
              </Text>
            </PressScale>
          ))}
        </View>
      </Panel>

      <Panel label={lang.s.deckStyleLabel}>
        <View style={styles.localeRow}>
          {(
            [
              { id: 'madarice', label: lang.s.deckMadarice },
              { id: 'starinske', label: lang.s.deckStarinske },
              { id: 'francuske', label: lang.s.deckFrancuske },
              { id: 'simple', label: lang.s.deckSimple },
            ] as const
          ).map((d) => (
            <PressScale
              key={d.id}
              onPress={() => {
                setDeckStyle(d.id);
                onSettingsChange({ ...settings, deckStyle: d.id });
              }}
              accessibilityState={{ selected: settings.deckStyle === d.id }}
              style={[styles.localeChip, settings.deckStyle === d.id && styles.localeChipOn]}
            >
              <Text
                style={[styles.localeText, settings.deckStyle === d.id && styles.localeTextOn]}
              >
                {d.label}
              </Text>
            </PressScale>
          ))}
        </View>
        {/* live preview in the selected style */}
        <View style={styles.previewRow}>
          <PlayingCard card={{ suit: 'hearts', rank: 'A' }} size="lg" deckStyle={settings.deckStyle} locale={lang.id} />
          <PlayingCard card={{ suit: 'spades', rank: 'K' }} size="lg" deckStyle={settings.deckStyle} locale={lang.id} />
          <PlayingCard card={{ suit: 'clubs', rank: '10' }} size="lg" deckStyle={settings.deckStyle} locale={lang.id} />
        </View>
      </Panel>

      <Panel label={ui.sortHand}>
        <View style={styles.localeRow}>
          {(
            [
              { id: 'auto', label: ui.sortAuto },
              { id: 'suits', label: ui.sortSuits },
              { id: 'manual', label: ui.sortManual },
            ] as const
          ).map((o) => (
            <PressScale
              key={o.id}
              onPress={() => {
                onSettingsChange({ ...settings, handSort: o.id });
              }}
              accessibilityState={{ selected: settings.handSort === o.id }}
              style={[styles.localeChip, settings.handSort === o.id && styles.localeChipOn]}
            >
              <Text style={[styles.localeText, settings.handSort === o.id && styles.localeTextOn]}>
                {o.label}
              </Text>
            </PressScale>
          ))}
        </View>
        <Text style={styles.hint}>{ui.arrangeHint}</Text>
      </Panel>

      <Panel label={ui.confirmPlayLabel}>
        <View style={styles.localeRow}>
          {(
            [
              { id: 'off', label: ui.confirmOff },
              { id: 'ambiguous', label: ui.confirmAmbiguous },
              { id: 'always', label: ui.confirmAlways },
            ] as const
          ).map((o) => (
            <PressScale
              key={o.id}
              onPress={() => {
                onSettingsChange({ ...settings, confirmPlay: o.id });
              }}
              accessibilityState={{ selected: settings.confirmPlay === o.id }}
              style={[styles.localeChip, settings.confirmPlay === o.id && styles.localeChipOn]}
            >
              <Text style={[styles.localeText, settings.confirmPlay === o.id && styles.localeTextOn]}>
                {o.label}
              </Text>
            </PressScale>
          ))}
        </View>
      </Panel>

      <Panel label={ui.motionLabel}>
        <View style={styles.localeRow}>
          {(
            [
              { id: 'system', label: ui.motionSystem },
              { id: 'full', label: ui.motionFull },
              { id: 'reduced', label: ui.motionReduced },
            ] as const
          ).map((o) => (
            <PressScale
              key={o.id}
              onPress={() => {
                onSettingsChange({ ...settings, motion: o.id });
              }}
              accessibilityState={{ selected: settings.motion === o.id }}
              style={[styles.localeChip, settings.motion === o.id && styles.localeChipOn]}
            >
              <Text style={[styles.localeText, settings.motion === o.id && styles.localeTextOn]}>
                {o.label}
              </Text>
            </PressScale>
          ))}
        </View>
      </Panel>

      <Panel label={lang.s.difficulty}>
        <View style={styles.localeRow}>
          {(
            [
              { hard: false, label: lang.s.difficultyEasy },
              { hard: true, label: lang.s.difficultyHard },
            ] as const
          ).map((d) => (
            <PressScale
              key={String(d.hard)}
              onPress={() => {
                onSettingsChange({ ...settings, hardMode: d.hard });
              }}
              accessibilityState={{ selected: settings.hardMode === d.hard }}
              style={[styles.localeChip, settings.hardMode === d.hard && styles.localeChipOn]}
            >
              <Text
                style={[styles.localeText, settings.hardMode === d.hard && styles.localeTextOn]}
              >
                {d.label}
              </Text>
            </PressScale>
          ))}
        </View>
        {settings.hardMode && <Text style={styles.hint}>{lang.s.difficultyHardHint}</Text>}
      </Panel>

      <Panel label={ui.language}>
        <View style={styles.localeRow}>
          {LOCALES.map((l) => (
            <PressScale
              key={l.id}
              onPress={() => {
                onSettingsChange({ ...settings, locale: l.id });
              }}
              accessibilityState={{ selected: settings.locale === l.id }}
              style={[styles.localeChip, settings.locale === l.id && styles.localeChipOn]}
            >
              <Text
                style={[styles.localeText, settings.locale === l.id && styles.localeTextOn]}
              >
                {l.label}
              </Text>
            </PressScale>
          ))}
        </View>
      </Panel>

      <Panel>
        <PressScale
          onPress={() => {
            if (!armed) {
              setArmed(true);
              return;
            }
            setArmed(false);
            onProfileChange(resetProfile());
          }}
          style={[styles.resetButton, armed && styles.resetArmed]}
        >
          <Text style={styles.resetText}>{armed ? ui.resetConfirm : ui.resetProgress}</Text>
        </PressScale>
      </Panel>

      {/* Google Play's User Data policy requires the policy reachable in-app. */}
      <Panel>
        <PressScale
          onPress={() => {
            void Linking.openURL('https://belastih.com').catch(() => {});
          }}
          hitSlop={6}
          accessibilityRole="link"
          accessibilityLabel={ui.privacyPolicy}
        >
          <Text style={styles.link}>{ui.privacyPolicy} ↗</Text>
        </PressScale>
      </Panel>

      <Text style={styles.version}>
        {ui.version} {APP_VERSION}
      </Text>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  input: {
    color: ink.hi,
    backgroundColor: surface.chip,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg - 2,
    paddingVertical: space.sm + 2,
    ...type.body,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { color: theme.text, fontSize: 15 },

  // The chips share the row equally, but never below the width their own
  // words need: four of them in a 320 dp column gave each 72 dp, which turned
  // "Mađarice" into a circle and broke "Jednostavne" across two lines. Below
  // the minimum the row wraps instead, and each chip grows to fill its line.
  localeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  localeChip: {
    flex: 1,
    minWidth: 88,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.line,
    paddingVertical: 9,
    alignItems: 'center',
  },
  localeChipOn: { borderColor: theme.accent, backgroundColor: 'rgba(216,165,49,0.14)' },
  localeText: { color: theme.textDim, fontSize: 13, fontFamily: font.medium },
  localeTextOn: { color: theme.accent },

  resetButton: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.danger,
    paddingVertical: 10,
    alignItems: 'center',
  },
  // The deep red: cream on the outcome red is 4.4:1, a hair under body text's bar.
  resetArmed: { backgroundColor: garb.redDark, borderColor: garb.redDark },
  resetText: { color: theme.text, fontSize: 14, fontFamily: font.bold },

  hint: { color: theme.textDim, fontSize: 12, lineHeight: 17, marginTop: 10 },
  previewRow: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginTop: 12 },
  link: { color: theme.accent, fontSize: 15, fontFamily: font.medium, textAlign: 'center' },
  version: { color: theme.textDim, fontSize: 12, textAlign: 'center' },
});
