import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Lang } from '@belot/i18n';
import { people, recordDate, totals, UNNAMED, type MatchRecord } from '../net/history';
import { Button } from '../ui/Button';
import { font, ink, num, radius, space, stroke, surface, team, theme, type } from '../theme';
import { Panel, ScreenShell } from './common';

/** How many matches the list shows, and how many people. */
const SHOW_MATCHES = 40;
const SHOW_PEOPLE = 12;

/**
 * "Povijest i statistika": the matches played with friends at private tables
 * and what they add up to - kept on this device only, like the series.
 */
export function HistoryScreen({
  lang,
  history,
  onBack,
  onCreateTable,
}: {
  lang: Lang;
  history: readonly MatchRecord[];
  onBack: () => void;
  /** The empty state's way in: a private table to invite friends to. */
  onCreateTable: () => void;
}) {
  const ui = lang.s.ui;
  const t = useMemo(() => totals(history), [history]);
  const who = useMemo(() => people(history).slice(0, SHOW_PEOPLE), [history]);
  const name = (n: string) => (n === UNNAMED ? ui.unnamedPlayer : n || ui.botWord);

  return (
    <ScreenShell title={ui.historyTitle} onBack={onBack} backLabel={ui.back}>
      {history.length === 0 ? (
        <Panel>
          <Text style={styles.line}>{ui.historyEmpty}</Text>
          <Button label={ui.privateTable} tone="strong" onPress={onCreateTable} />
        </Panel>
      ) : (
        <>
          <Panel label={ui.historyTotals}>
            <View style={styles.totals}>
              <Stat label={ui.histPlayed} value={String(t.played)} />
              <Stat label={ui.histWon} value={String(t.won)} tone="us" />
              <Stat label={ui.histLost} value={String(t.lost)} tone="them" />
              <Stat label={ui.histRate} value={`${t.rate}%`} />
            </View>
            {t.streak && (
              <Text style={styles.sub}>
                {t.streak.won ? ui.streakWon(t.streak.n) : ui.streakLost(t.streak.n)}
                {t.bestStreak > 1 ? ` · ${ui.bestStreak(t.bestStreak)}` : ''}
              </Text>
            )}
          </Panel>

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

          <Panel label={ui.matchesTitle}>
            {history.slice(0, SHOW_MATCHES).map((r) => (
              <View key={r.id} style={styles.match}>
                <View style={styles.matchTop}>
                  <Text style={styles.date}>{recordDate(r.at)}</Text>
                  <Text style={[styles.result, r.won ? styles.resultWon : styles.resultLost]}>
                    {r.won ? ui.resultWon : ui.resultLost}
                  </Text>
                </View>
                <View style={styles.matchMid}>
                  <Text style={styles.people} numberOfLines={2}>
                    {ui.recordPeople(name(r.partner), r.opponents.map(name))}
                  </Text>
                  <Text style={[styles.score, num]}>
                    <Text style={{ color: team.usInk }}>{r.score[0]}</Text>
                    {' : '}
                    <Text style={{ color: team.themInk }}>{r.score[1]}</Text>
                  </Text>
                </View>
                <Text style={styles.meta} numberOfLines={2}>
                  {ui.recordMeta(r.target, r.hard, r.deals, r.best)}
                </Text>
              </View>
            ))}
          </Panel>
        </>
      )}
      <Text style={styles.local}>{ui.historyLocal}</Text>
    </ScreenShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'us' | 'them' }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, num, tone === 'us' && { color: team.usInk }, tone === 'them' && { color: team.themInk }]}>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { color: ink.hi, ...type.body },
  sub: { color: ink.mid, ...type.sub, marginTop: space.xs },
  totals: { flexDirection: 'row', gap: space.sm },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: surface.sunk,
  },
  statValue: { color: ink.hi, ...type.h2 },
  statLabel: { color: ink.mid, ...type.caption },
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
  match: {
    gap: 2,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: stroke.hair,
  },
  matchTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { color: ink.mid, ...type.caption },
  result: { ...type.caption, fontFamily: font.bold },
  resultWon: { color: theme.okInk },
  resultLost: { color: theme.dangerInk },
  matchMid: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  people: { flex: 1, color: ink.hi, ...type.sub },
  score: { color: ink.hi, ...type.h3 },
  meta: { color: ink.mid, ...type.caption },
  local: { color: ink.mid, ...type.caption, textAlign: 'center' },
});
