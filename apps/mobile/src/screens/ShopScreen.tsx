import { StyleSheet, Text, View } from 'react-native';
import { PressScale } from '../ui/PressScale';
import type { Lang } from '@belot/i18n';
import {
  canBuy,
  buy,
  isOwned,
  levelFromXp,
  selectCosmetic,
  selectedId,
  COSMETICS,
  type Cosmetic,
  type PlayerProfile,
} from '@belot/progression';
import { Avatar } from '../avatars';
import { FELTS } from '../cosmetics';
import { CardBackFace } from '../deck';
import { playSfx } from '../audio';
import { pattern } from '../haptics';
import { radius, theme } from '../theme';
import { Panel, ScreenShell } from './common';

/**
 * The only coin sink: cosmetics. Deliberately no bundles, no timers, no
 * "offers" — a fixed catalogue with visible prices keeps the coins reading as
 * a reward, not a wallet.
 */
export function ShopScreen({
  lang,
  profile,
  onProfileChange,
  onBack,
}: {
  lang: Lang;
  profile: PlayerProfile;
  onProfileChange: (p: PlayerProfile) => void;
  onBack: () => void;
}) {
  const ui = lang.s.ui;
  const level = levelFromXp(profile.xp);

  const act = (c: Cosmetic) => {
    if (isOwned(profile, c)) {
      if (selectedId(profile, c.kind) !== c.id) {
        playSfx('tap');
        onProfileChange(selectCosmetic(profile, c));
      }
    } else if (canBuy(profile, c)) {
      playSfx('purchase');
      pattern('purchase');
      onProfileChange(buy(profile, c));
    }
  };

  const section = (kind: Cosmetic['kind'], label: string) => {
    const items = COSMETICS.filter((c) => c.kind === kind);
    return (
      <Panel label={label}>
        <View style={styles.grid}>
          {items.map((c) => {
            const owned = isOwned(profile, c);
            const selected = owned && selectedId(profile, c.kind) === c.id;
            const affordable = canBuy(profile, c);
            const locked = !owned && level < c.requiredLevel;
            return (
              <PressScale
                key={c.id}
                onPress={() => act(c)}
                disabled={selected || (!owned && !affordable)}
                style={[styles.item, selected && styles.itemSelected]}
                sound={null}
                scaleTo={0.98}
              >
                <View style={styles.preview}>
                  {kind === 'cardBack' ? (
                    <CardBackFace width={38} variant={c.id} />
                  ) : kind === 'felt' ? (
                    <View
                      style={[
                        styles.feltSwatch,
                        {
                          backgroundColor: FELTS[c.id]?.felt ?? theme.felt,
                          borderColor: FELTS[c.id]?.rim ?? theme.wood,
                        },
                      ]}
                    />
                  ) : (
                    <Avatar id={c.id} size={46} />
                  )}
                </View>
                <Text style={styles.itemName} numberOfLines={1}>
                  {ui.cosmeticName(c.id)}
                </Text>
                {selected ? (
                  <Text style={styles.selected}>{ui.selected}</Text>
                ) : owned ? (
                  <Text style={styles.select}>{ui.select}</Text>
                ) : locked ? (
                  <Text style={styles.locked}>
                    {c.price} ● · {ui.needsLevel(c.requiredLevel)}
                  </Text>
                ) : (
                  <Text style={[styles.price, !affordable && styles.locked]}>
                    {c.price} ●
                  </Text>
                )}
              </PressScale>
            );
          })}
        </View>
      </Panel>
    );
  };

  return (
    <ScreenShell title={ui.shop} onBack={onBack}>
      <View style={styles.walletRow}>
        <Text style={styles.wallet}>{profile.coins} ●</Text>
        <Text style={styles.walletHint}>{ui.coinsDisclaimer}</Text>
      </View>
      {section('avatar', ui.sectionAvatars)}
      {section('cardBack', ui.sectionCardBacks)}
      {section('felt', ui.sectionFelts)}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  walletRow: { alignItems: 'center', gap: 4 },
  wallet: { color: theme.accent, fontSize: 24, fontWeight: '800' },
  walletHint: { color: theme.textDim, fontSize: 11, textAlign: 'center' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  item: {
    width: '30.5%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: theme.line,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 6,
  },
  itemSelected: { borderColor: theme.accent },
  preview: { height: 56, justifyContent: 'center' },
  feltSwatch: { width: 46, height: 46, borderRadius: 23, borderWidth: 5 },
  itemName: { color: theme.text, fontSize: 12, fontWeight: '600' },
  price: { color: theme.accent, fontSize: 12, fontWeight: '700' },
  select: { color: theme.text, fontSize: 12, fontWeight: '700' },
  selected: { color: theme.accent, fontSize: 12, fontWeight: '800' },
  locked: { color: theme.textDim, fontSize: 12 },
});
