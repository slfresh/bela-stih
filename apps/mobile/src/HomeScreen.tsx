import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lang } from '@belot/i18n';
import {
  canClaimDaily,
  claimDaily,
  claimQuest,
  isoDay,
  isQuestComplete,
  levelProgress,
  previewDaily,
  type PlayerProfile,
} from '@belot/progression';
import { AnchorMap, Anchor, AnchorHost } from './anim/AnchorRegistry';
import { EffectsOverlay } from './anim/EffectsOverlay';
import { anchorId, FxBus } from './anim/FxBus';
import { Avatar } from './avatars';
import { Button } from './TableScreen';
import type { Settings } from './storage';
import { playSfx } from './audio';
import { radius, theme } from './theme';

/**
 * The lobby, laid out the social-poker way: identity in the header, one hero
 * PLAY, and the retention loop (daily bonus, quests) as claimable moments with
 * coins that visibly fly to the wallet.
 */

export type Launch =
  | { mode: 'offline' }
  | { mode: 'quick' }
  | { mode: 'create' }
  | { mode: 'join'; code: string }
  | { mode: 'gallery' };

export function HomeScreen({
  lang,
  profile,
  settings,
  onProfileChange,
  onSettingsChange,
  onLaunch,
  onOpenShop,
  onOpenSettings,
  onOpenProfile,
}: {
  lang: Lang;
  profile: PlayerProfile;
  settings: Settings;
  onProfileChange: (p: PlayerProfile) => void;
  onSettingsChange: (s: Settings) => void;
  onLaunch: (l: Launch) => void;
  onOpenShop: () => void;
  onOpenSettings: () => void;
  onOpenProfile: () => void;
}) {
  const ui = lang.s.ui;
  const [code, setCode] = useState('');
  const anchors = useMemo(() => new AnchorMap(), []);
  const fxBus = useMemo(() => new FxBus(), []);

  const today = isoDay(new Date());
  const claimable = canClaimDaily(profile, today);
  const level = levelProgress(profile.xp);

  const go = (l: Launch) => {
    playSfx('tap');
    onLaunch(l);
  };
  const open = (fn: () => void) => () => {
    playSfx('tap');
    fn();
  };

  // Scrolling moves the anchors without any layout changing, so ask them to
  // re-measure at the one moment it matters: just before the coins fly. This
  // used to be a re-render of the whole lobby on every scroll event instead.
  //
  // Measure BEFORE applying the claim: the claim unmounts the very button the
  // coins fly from, and on the web a measure lands a task later — after that
  // commit — so measuring afterwards read a detached node as (0, 0) and the
  // coins set off from the corner of the window.
  const claim = (fromKey: string, count: number, apply: () => void) => {
    void anchors.refresh().then(() => {
      const from = anchors.centre(fromKey);
      const to = anchors.centre(anchorId.wallet);
      apply();
      if (from && to) fxBus.emit({ kind: 'coins', from, to, count });
    });
  };

  const collect = () => {
    const r = claimDaily(profile, today);
    if (r.coins > 0) {
      playSfx('coin');
      claim('bonus', 8, () => onProfileChange(r.profile));
    }
  };

  const collectQuest = (index: number) => {
    const r = claimQuest(profile, index);
    if (r.coins > 0) {
      playSfx('coin');
      claim(`quest:${index}`, 6, () => onProfileChange(r.profile));
    }
  };

  return (
    <AnchorHost map={anchors}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.fill}>
          <ScrollView contentContainerStyle={styles.scroll}>
            {/* identity header */}
            <View style={styles.headerRow}>
              <Pressable
                onPress={open(onOpenProfile)}
                style={[styles.identity, styles.identityFlex]}
                hitSlop={6}
              >
                <Avatar id={profile.selectedAvatar} size={42} />
                <View style={[styles.identityText, styles.identityFlex]}>
                  <Text style={styles.headerName} numberOfLines={1}>
                    {settings.nickname.trim() || ui.profile}
                  </Text>
                  <Text style={styles.headerLevel}>
                    {ui.level} {level.level}
                  </Text>
                </View>
              </Pressable>

              <Pressable onPress={open(onOpenShop)} hitSlop={6}>
                <Anchor id={anchorId.wallet}>
                  <View style={styles.coinChip}>
                    <Text style={styles.coinText}>{profile.coins} ●</Text>
                  </View>
                </Anchor>
              </Pressable>
              <Pressable onPress={open(onOpenSettings)} hitSlop={6} style={styles.gear}>
                <Text style={styles.gearText}>⚙️</Text>
              </Pressable>
            </View>

            <View style={styles.brand}>
              {/* Long-press opens the deck gallery — review harness and easter egg. */}
              <Text style={styles.title} onLongPress={() => onLaunch({ mode: 'gallery' })}>
                Bela Štih
              </Text>
              <Text style={styles.sub}>{lang.s.gameToTarget(1001)}</Text>
            </View>

            {/* the hero: online quick play */}
            <Pressable onPress={() => go({ mode: 'quick' })} style={styles.hero}>
              <Text style={styles.heroText}>{ui.play}</Text>
            </Pressable>

            <View style={styles.modeRow}>
              <Button label={ui.playBots} tone="plain" onPress={() => go({ mode: 'offline' })} />
              <Button label={ui.privateTable} tone="plain" onPress={() => go({ mode: 'create' })} />
            </View>

            {claimable ? (
              <View style={[styles.panel, styles.bonusPanel]}>
                <Text style={styles.bonusTitle}>
                  {ui.dailyBonus(previewDaily(profile, today).coins)}
                </Text>
                <Text style={styles.hint}>
                  {previewDaily(profile, today).streakDays > 1
                    ? ui.streakDays(profile.streakDays)
                    : ui.startStreak}
                </Text>
                <Anchor id="bonus">
                  <Button label={ui.claim} tone="strong" onPress={collect} />
                </Anchor>
              </View>
            ) : (
              <Text style={styles.hint}>{ui.bonusClaimed(profile.streakDays)}</Text>
            )}

            {profile.quests.length > 0 && (
              <View style={styles.panel}>
                <Text style={styles.label}>{ui.dailyQuests}</Text>
                {profile.quests.map((q, i) => (
                  <View key={i} style={styles.questRow}>
                    <View style={styles.questLeft}>
                      <Text style={[styles.questText, isQuestComplete(q) && styles.questDone]}>
                        {ui.questLabel(q.kind)} {q.progress}/{q.target}
                      </Text>
                      <View style={styles.questTrack}>
                        <View
                          style={[
                            styles.questFill,
                            { width: `${Math.round((q.progress / q.target) * 100)}%` },
                          ]}
                        />
                      </View>
                    </View>
                    {q.claimed ? (
                      <Text style={styles.questClaimed}>✓</Text>
                    ) : isQuestComplete(q) ? (
                      <Anchor id={`quest:${i}`}>
                        <Button label={`+${q.reward} ●`} tone="strong" onPress={() => collectQuest(i)} />
                      </Anchor>
                    ) : (
                      <Text style={styles.questReward}>+{q.reward} ●</Text>
                    )}
                  </View>
                ))}
              </View>
            )}

            <View style={styles.panel}>
              <Text style={styles.label}>{ui.joinByCode}</Text>
              <View style={styles.joinRow}>
                <TextInput
                  value={code}
                  onChangeText={setCode}
                  placeholder={ui.tableCode}
                  placeholderTextColor={theme.textDim}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
                <Button
                  label={ui.enter}
                  tone={code.trim() ? 'strong' : 'plain'}
                  onPress={() => code.trim() && go({ mode: 'join', code: code.trim() })}
                />
              </View>
            </View>

            <View style={styles.panel}>
              <Text style={styles.label}>{ui.nicknameLabel}</Text>
              <TextInput
                value={settings.nickname}
                onChangeText={(nickname) => onSettingsChange({ ...settings, nickname })}
                placeholder={ui.nicknamePlaceholder}
                placeholderTextColor={theme.textDim}
                maxLength={20}
                autoCorrect={false}
                style={styles.input}
              />
            </View>

            <Text style={styles.disclaimer}>{ui.coinsDisclaimer}</Text>
          </ScrollView>

          <EffectsOverlay bus={fxBus} />
        </View>
      </SafeAreaView>
    </AnchorHost>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.feltDeep },
  fill: { flex: 1 },
  scroll: { padding: 20, gap: 16, paddingBottom: 40 },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // The name gets the room the row actually has: it was being squeezed into its
  // own text width and truncated to two letters while half the row sat empty.
  identityFlex: { flex: 1, minWidth: 0 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  identityText: { flexShrink: 1, minWidth: 0 },
  headerName: { color: theme.text, fontSize: 15, fontWeight: '700' },
  headerLevel: { color: theme.textDim, fontSize: 12 },
  coinChip: {
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  coinText: { color: theme.accent, fontSize: 14, fontWeight: '800' },
  gear: { padding: 4 },
  gearText: { fontSize: 20 },

  brand: { alignItems: 'center', gap: 2 },
  title: { color: theme.text, fontSize: 30, fontWeight: '800' },
  sub: { color: theme.textDim, fontSize: 14 },

  hero: {
    backgroundColor: theme.accent,
    borderRadius: radius.panel,
    paddingVertical: 18,
    alignItems: 'center',
  },
  heroText: { color: '#241a05', fontSize: 24, fontWeight: '900', letterSpacing: 2 },
  modeRow: { gap: 10 },

  panel: {
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: theme.line,
    padding: 14,
    gap: 10,
  },
  bonusPanel: { borderColor: theme.accent, alignItems: 'center' },
  bonusTitle: { color: theme.accent, fontSize: 17, fontWeight: '800' },
  label: { color: theme.textDim, fontSize: 13 },
  hint: { color: theme.textDim, fontSize: 12, textAlign: 'center' },

  joinRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: {
    flex: 1,
    color: theme.text,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },

  questRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  questLeft: { flex: 1, gap: 5 },
  questText: { color: theme.text, fontSize: 14 },
  questDone: { color: theme.ok, fontWeight: '700' },
  questTrack: {
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  questFill: { height: 5, borderRadius: radius.pill, backgroundColor: theme.accent },
  questReward: { color: theme.accent, fontSize: 14 },
  questClaimed: { color: theme.ok, fontSize: 16, fontWeight: '800' },

  disclaimer: { color: theme.textDim, fontSize: 11, textAlign: 'center', marginTop: 8 },
});
