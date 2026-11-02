import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Lang } from '@belot/i18n';
import { chipBalance, gameStats, isoDay, refillChips, type PlayerProfile } from '@belot/progression';
import { people, totals, type MatchRecord } from '../net/history';
import { seriesNames } from '../net/series';
import type { SeriesBook } from '../storage';
import { Button } from '../ui/Button';
import { StatTile } from '../ui/StatTile';
import { font, ink, num, space, stroke, team, type } from '../theme';
import { Panel, ScreenShell } from './common';

/** How many groups of four, and how many people, the page lists. */
const SHOW_GROUPS = 12;
const SHOW_PEOPLE = 12;

/**
 * "Statistika": what the evenings with friends add up to, kept on this
 * device only. The table shows only the sitting in progress (its own
 * "Partije 2 : 1"); the long count between the same four people, across
 * evenings, lives here - with the totals, the people, and the lifetime
 * numbers from the profile. The match-by-match list is the history screen's.
 *
 * Bela's numbers sit under a heading of their own and the other games under
 * theirs: "All matches" and "No numbers yet" are Bela's, and read as every
 * game's once a player had an Osmice round on the panel just below.
 */
export function StatsScreen({
  lang,
  history,
  series,
  profile,
  onBack,
  onOpenHistory,
}: {
  lang: Lang;
  history: readonly MatchRecord[];
  /** The series book (storage.ts): every group of four this player has sat with. */
  series: SeriesBook;
  profile: PlayerProfile;
  onBack: () => void;
  /** The match list, one tap away. */
  onOpenHistory: () => void;
}) {
  const ui = lang.s.ui;
  const t = useMemo(() => totals(history), [history]);
  const who = useMemo(() => people(history).slice(0, SHOW_PEOPLE), [history]);
  // The groups with the most matches first; a tie goes to the one leading by more.
  const groups = useMemo(
    () =>
      Object.entries(series)
        .map(([key, e]) => ({ key, e, names: seriesNames(key, e) }))
        .sort((a, b) => b.e.us + b.e.them - (a.e.us + a.e.them) || b.e.us - b.e.them - (a.e.us - a.e.them))
        .slice(0, SHOW_GROUPS),
    [series],
  );
  const lifetimeRate = profile.matchesPlayed > 0 ? `${Math.round((profile.matchesWon / profile.matchesPlayed) * 100)}%` : '—';

  const g = lang.games;
  // As a casino table would seat them today: the daily top-up is in it (App
  // saves it on the way to the menus; this only keeps the first frame right).
  const chips = chipBalance(refillChips(profile, isoDay(new Date())).profile);

  return (
    <ScreenShell title={ui.statsTitle} onBack={onBack} backLabel={ui.back}>
      <Text style={styles.section} accessibilityRole="header">
        {g.belaSection}
      </Text>
      {history.length === 0 && groups.length === 0 ? (
        <Panel>
          <Text style={styles.line}>{ui.statsEmpty}</Text>
        </Panel>
      ) : (
        <>
          <Panel label={ui.historyTotals}>
            <View style={styles.row}>
              <StatTile label={ui.histPlayed} value={String(t.played)} />
              <StatTile label={ui.histWon} value={String(t.won)} tone="us" />
              <StatTile label={ui.histLost} value={String(t.lost)} tone="them" />
              <StatTile label={ui.histRate} value={`${t.rate}%`} />
            </View>
            {t.streak && (
              <Text style={styles.sub}>
                {t.streak.won ? ui.streakWon(t.streak.n) : ui.streakLost(t.streak.n)}
                {t.bestStreak > 1 ? ` · ${ui.bestStreak(t.bestStreak)}` : ''}
              </Text>
            )}
          </Panel>

          {/* The long count: us against them, the same four across evenings. */}
          <Panel label={ui.statsHeadToHead}>
            {groups.length === 0 ? (
              <Text style={styles.sub}>{ui.statsNoSeries}</Text>
            ) : (
              groups.map(({ key, e, names }) => (
                <View key={key} style={styles.group}>
                  <Text style={styles.groupNames} numberOfLines={2}>
                    {ui.statsVs(names.us[1], names.them[0], names.them[1])}
                  </Text>
                  <Text style={[styles.groupScore, num]} accessibilityLabel={`${ui.seriesScore} ${e.us} : ${e.them}`}>
                    <Text style={{ color: team.usInk }}>{e.us}</Text>
                    {' : '}
                    <Text style={{ color: team.themInk }}>{e.them}</Text>
                  </Text>
                </View>
              ))
            )}
          </Panel>

          {who.length > 0 && (
            <Panel label={ui.peopleTitle}>
              {who.map((p) => (
                <View key={p.name} style={styles.person}>
                  <Text style={styles.personName} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <View style={styles.personLines}>
                    {p.withPlayed > 0 && <Text style={styles.withLine}>{ui.withLine(p.withPlayed, p.withWon)}</Text>}
                    {p.againstPlayed > 0 && (
                      <Text style={styles.againstLine}>{ui.againstLine(p.againstPlayed, p.againstWon)}</Text>
                    )}
                  </View>
                </View>
              ))}
            </Panel>
          )}
        </>
      )}

      {/* Every match, bots included: the profile's lifetime count. */}
      <Panel label={ui.statsOverall}>
        <View style={styles.row}>
          <StatTile label={ui.histPlayed} value={String(profile.matchesPlayed)} />
          <StatTile label={ui.histWon} value={String(profile.matchesWon)} tone="us" />
          <StatTile label={ui.histRate} value={lifetimeRate} />
        </View>
      </Panel>

      {/* The games beyond Bela, each in its own panel with the same tiles as
          Bela's: rounds and matches won of those played. The casino tables
          record theirs as they play; a game never played says so. */}
      <Text style={styles.section} accessibilityRole="header">
        {g.statsHeading}
      </Text>
      {(['osmice', 'holdem', 'blackjack', 'baccarat'] as const).map((game) => {
        const st = gameStats(profile, game);
        const name = game === 'osmice' ? lang.osmice.name : game === 'holdem' ? lang.holdem.name : game === 'blackjack' ? lang.blackjack.name : lang.baccarat.name;
        return (
          <Panel key={game} label={name}>
            {st.roundsPlayed === 0 && st.matchesPlayed === 0 ? (
              <Text style={styles.empty}>{g.notPlayed}</Text>
            ) : (
              <View style={styles.row}>
                <StatTile label={g.statRounds} value={`${st.roundsWon} / ${st.roundsPlayed}`} />
                <StatTile label={g.statMatches} value={`${st.matchesWon} / ${st.matchesPlayed}`} />
              </View>
            )}
          </Panel>
        );
      })}
      <Panel label={lang.casino.heading}>
        <Text style={[styles.line, num]}>{lang.casino.balance(chips)}</Text>
      </Panel>

      <Button label={ui.historyOpen} tone="plain" onPress={onOpenHistory} />
      <Text style={styles.local}>{ui.historyLocal}</Text>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  section: { color: ink.hi, ...type.h2, marginTop: space.sm },
  empty: { color: ink.mid, ...type.sub },
  line: { color: ink.hi, ...type.body },
  sub: { color: ink.mid, ...type.sub, marginTop: space.xs },
  row: { flexDirection: 'row', gap: space.sm },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: stroke.hair,
  },
  groupNames: { flex: 1, color: ink.hi, ...type.sub },
  groupScore: { color: ink.hi, ...type.h3 },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.xs + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: stroke.hair,
  },
  personName: { flex: 1, color: ink.hi, ...type.body, fontFamily: font.medium },
  personLines: { alignItems: 'flex-end' },
  withLine: { color: team.usInk, ...type.sub },
  againstLine: { color: team.themInk, ...type.sub },
  local: { color: ink.mid, ...type.caption, textAlign: 'center' },
});
