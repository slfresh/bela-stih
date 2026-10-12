import { StyleSheet, Text, View } from 'react-native';
import type { Lang } from '@belot/i18n';
import { recordDate, recordMode, UNNAMED, type MatchRecord } from '../net/history';
import { modeName } from '../playMode';
import { Button } from '../ui/Button';
import { font, ink, num, space, stroke, team, theme, type } from '../theme';
import { Panel, ScreenShell } from './common';

/** How many matches the list shows. */
const SHOW_MATCHES = 40;

/**
 * "Povijest": the matches played with friends at private tables, newest
 * first, match by match - kept on this device only, like the series. What
 * they add up to (the totals, the long count between the same four, the
 * people) is the statistics screen's.
 */
export function HistoryScreen({
  lang,
  history,
  onBack,
  onCreateTable,
  onOpenStats,
}: {
  lang: Lang;
  history: readonly MatchRecord[];
  onBack: () => void;
  /** The empty state's way in: a private table to invite friends to. */
  onCreateTable: () => void;
  /** The statistics, one tap away. */
  onOpenStats: () => void;
}) {
  const ui = lang.s.ui;
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
          <Button label={ui.statsOpen} tone="plain" onPress={onOpenStats} />
          <Panel label={ui.matchesTitle}>
            {history.slice(0, SHOW_MATCHES).map((r) => (
              <View key={r.id} style={styles.match}>
                <View style={styles.matchTop}>
                  <Text style={styles.date}>{recordDate(r.at)}</Text>
                  <Text style={[styles.result, r.won ? styles.resultWon : styles.resultLost]}>
                    {r.won ? ui.resultWon : ui.resultLost}
                    {r.double ? ` · ${ui.doubleTag}` : ''}
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
                  {ui.recordMeta(r.target, modeName(lang, recordMode(r)), r.deals, r.best)}
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

const styles = StyleSheet.create({
  line: { color: ink.hi, ...type.body },
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
