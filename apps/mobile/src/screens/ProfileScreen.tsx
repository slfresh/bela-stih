import { StyleSheet, Text, View } from 'react-native';
import type { Lang } from '@belot/i18n';
import { levelProgress, type PlayerProfile } from '@belot/progression';
import { Avatar } from '../avatars';
import { Button } from '../ui/Button';
import type { Settings } from '../storage';
import { radius, theme } from '../theme';
import { Panel, ScreenShell } from './common';

/** Identity and the lifetime numbers — everything is already tracked. */
export function ProfileScreen({
  lang,
  profile,
  settings,
  onOpenShop,
  onBack,
}: {
  lang: Lang;
  profile: PlayerProfile;
  settings: Settings;
  onOpenShop: () => void;
  onBack: () => void;
}) {
  const ui = lang.s.ui;
  const p = levelProgress(profile.xp);
  const winRate =
    profile.matchesPlayed > 0
      ? `${Math.round((profile.matchesWon / profile.matchesPlayed) * 100)}%`
      : '—';

  const stats: Array<[string, string]> = [
    [ui.statMatches, `${profile.matchesWon}/${profile.matchesPlayed}`],
    [ui.statWinRate, winRate],
    [ui.statDeals, `${profile.dealsWon}/${profile.dealsPlayed}`],
    [ui.statZvanja, String(profile.zvanjaCalled)],
    [ui.statBela, String(profile.belaCalled)],
    [ui.statValat, String(profile.valats)],
    [ui.statBestDeal, String(profile.bestDealScore)],
  ];

  return (
    <ScreenShell title={ui.profile} onBack={onBack}>
      <View style={styles.identity}>
        <Avatar id={profile.selectedAvatar} size={88} />
        <Text style={styles.name}>{settings.nickname.trim() || '—'}</Text>
        <View style={styles.levelRow}>
          <Text style={styles.level}>
            {ui.level} {p.level}
          </Text>
          <View style={styles.xpTrack}>
            <View style={[styles.xpFill, { width: `${Math.round(p.fraction * 100)}%` }]} />
          </View>
        </View>
        <Button label={ui.shop} tone="plain" onPress={onOpenShop} />
      </View>

      <Panel>
        {stats.map(([label, value]) => (
          <View key={label} style={styles.statRow}>
            <Text style={styles.statLabel}>{label}</Text>
            <Text style={styles.statValue}>{value}</Text>
          </View>
        ))}
      </Panel>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  identity: { alignItems: 'center', gap: 10 },
  name: { color: theme.text, fontSize: 22, fontWeight: '800' },
  levelRow: { alignSelf: 'stretch', gap: 6, alignItems: 'center' },
  level: { color: theme.textDim, fontSize: 13 },
  xpTrack: {
    alignSelf: 'stretch',
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  xpFill: { height: 8, borderRadius: radius.pill, backgroundColor: theme.accent },

  statRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statLabel: { color: theme.textDim, fontSize: 14 },
  statValue: { color: theme.text, fontSize: 14, fontWeight: '700' },
});
