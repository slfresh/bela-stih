import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Card, Rank, Suit } from '@belot/engine';
import { PLAIN_LINE, TRUMP_LINE } from '../table/rulesCards';
import type { Lang } from '@belot/i18n';
import { PlayingCard } from '../PlayingCard';
import type { Settings } from '../storage';
import { font, ink, space, theme, type } from '../theme';
import { Panel, ScreenShell } from './common';

/** "Kako se igra": the rules as this app plays them, the cards, and the words. */
export function RulesScreen({ lang, settings, onBack }: { lang: Lang; settings: Settings; onBack: () => void }) {
  const r = lang.s.rules;
  const section = (i: number) => {
    const sec = r.sections[i];
    if (!sec) return null;
    return (
      <Panel key={sec.title} label={sec.title}>
        {sec.lines.map((line) => (
          <Text key={line} style={styles.line}>
            {line}
          </Text>
        ))}
      </Panel>
    );
  };
  return (
    <ScreenShell title={r.title} onBack={onBack} backLabel={lang.s.ui.back}>
      {section(0)}
      {section(1)}
      <Panel label={r.cardsTitle}>
        <CardLine lang={lang} settings={settings} label={r.trumpRow} suit="hearts" line={TRUMP_LINE} />
        <CardLine lang={lang} settings={settings} label={r.plainRow} suit="spades" line={PLAIN_LINE} />
        <Text style={styles.line}>{r.cardsNote}</Text>
      </Panel>
      {r.sections.slice(2).map((_, i) => section(i + 2))}
      <Panel label={r.glossaryTitle}>
        {r.glossary.map(([term, meaning]) => (
          <Text key={term} style={styles.line}>
            <Text style={styles.term}>{term}</Text>
            {` — ${meaning}`}
          </Text>
        ))}
      </Panel>
    </ScreenShell>
  );
}

/** Eight cards of one suit, strongest first, each with its points under it. */
function CardLine({
  lang,
  settings,
  label,
  suit,
  line,
}: {
  lang: Lang;
  settings: Settings;
  label: string;
  suit: Suit;
  line: readonly (readonly [Rank, number])[];
}) {
  const [w, setW] = useState(0);
  // Eight abreast in the panel's width, a small gap between: about 29 dp a
  // card on a 320 dp phone, never past 44 on a tablet.
  const cardW = w > 0 ? Math.min(44, Math.floor((w - 7 * GAP) / 8)) : 0;
  return (
    <View style={styles.cardLine}>
      <Text style={styles.rowLabel}>
        {label} · {lang.suitName(suit)}
      </Text>
      <View style={styles.cards} onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}>
        {cardW > 0 &&
          line.map(([rank, points]) => {
            const card: Card = { suit, rank };
            return (
              <View
                key={rank}
                style={[styles.cell, { width: cardW }]}
                accessible
                accessibilityLabel={`${lang.rankShort(rank)}: ${points}`}
              >
                <PlayingCard card={card} width={cardW} deckStyle={settings.deckStyle} locale={lang.id} />
                <Text style={[styles.points, points === 0 && styles.pointsNone]}>{points}</Text>
              </View>
            );
          })}
      </View>
    </View>
  );
}

const GAP = 4;

const styles = StyleSheet.create({
  line: { color: ink.hi, ...type.body },
  term: { color: theme.accent, fontFamily: font.bold },
  cardLine: { gap: space.xs, marginBottom: space.sm },
  rowLabel: { color: ink.mid, ...type.caption },
  cards: { flexDirection: 'row', gap: GAP, alignSelf: 'stretch' },
  cell: { alignItems: 'center', gap: 2 },
  points: { color: theme.accent, fontFamily: font.bold, fontSize: 13 },
  pointsNone: { color: ink.mid },
});
