import { useEffect, useMemo, useRef, useState } from 'react';
import { room } from './cosmetics';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lang } from '@belot/i18n';
import {
  canClaimDaily,
  chipBalance,
  claimDaily,
  claimQuest,
  isoDay,
  isQuestComplete,
  levelProgress,
  previewDaily,
  refillChips,
  type PlayerProfile,
} from '@belot/progression';
import { AnchorMap, Anchor, AnchorHost } from './anim/AnchorRegistry';
import { EffectsOverlay } from './anim/EffectsOverlay';
import { anchorId, FxBus } from './anim/FxBus';
import { useMotionPolicy } from './anim/useMotionPolicy';
import { Avatar } from './avatars';
import { Button } from './ui/Button';
import { Check, Coin, Crown, Gear, Robot } from './ui/icons';
import { Panel } from './ui/Panel';
import { TableHero } from './home/TableHero';
import { MoreGames, type OtherGame } from './home/MoreGames';
import { RulesSheet } from './games/RulesSheet';
import type { NetHow } from './games/useNetSession';
import { Wordmark } from './home/Wordmark';
import { PressScale } from './ui/PressScale';
import type { Settings } from './storage';
import { coinDingTimers, coinsLandedMs } from './anim/lifetimes';
import { pattern } from './haptics';
import { useLaggedNumber } from './ui/useLaggedNumber';

/** Coins a claim sends flying to the wallet. */
const BONUS_COINS = 8;
const QUEST_COINS = 6;
import { font, ink, radius, space, stroke, surface, theme, type } from './theme';

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
  | { mode: 'gallery' }
  /** One of the games beyond Bela, against the bots. */
  | { mode: 'game'; game: OtherGame; players: number }
  /** One of the games beyond Bela, online (a table joined by code learns its game from the room). */
  | { mode: 'online'; game: OtherGame | null; how: NetHow };

export function HomeScreen({
  lang,
  profile,
  settings,
  onProfileChange,
  onSettingsChange: _onSettingsChange,
  onLaunch,
  onOpenShop,
  onOpenSettings,
  onOpenProfile,
  onOpenRules,
  onOpenHistory,
  onOpenStats,
  rulesFor,
  onOpenGameRules,
  onCloseGameRules,
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
  /** "Kako se igra". */
  onOpenRules: () => void;
  /** The matches with friends, match by match. */
  onOpenHistory: () => void;
  /** ...and what they add up to. */
  onOpenStats: () => void;
  /**
   * How to play one of the other games, as a sheet over the home screen.
   * App holds which one is open, so Back (Android's, or the browser's) knows
   * the home screen is not the root while it is: it closes the sheet instead
   * of leaving the app.
   */
  rulesFor: OtherGame | null;
  onOpenGameRules: (game: OtherGame) => void;
  onCloseGameRules: () => void;
}) {
  const ui = lang.s.ui;
  const [code, setCode] = useState('');
  const anchors = useMemo(() => new AnchorMap(), []);
  const fxBus = useMemo(() => new FxBus(), []);

  const today = isoDay(new Date());
  const claimable = canClaimDaily(profile, today);
  const level = levelProgress(profile.xp);
  // The wallet changes when the last coin of THIS claim lands on it: a quest
  // sends fewer coins than the bonus.
  const [flying, setFlying] = useState<number>(BONUS_COINS);
  const coins = useLaggedNumber(profile.coins, coinsLandedMs(flying));
  // Reduce-motion (the setting, or the phone's own switch under 'system'): no arc.
  const motion = useMotionPolicy(settings.motion);

  // Every pressable clicks and gives for itself now (PressScale / Button).
  // The chips as a casino table would seat them today: the daily top-up is
  // in it, so a player who went broke yesterday is not shown 0 when the very
  // next table gives them the floor. Worked out, not saved: App saves it.
  const chips = chipBalance(refillChips(profile, today).profile);
  const go = (l: Launch) => onLaunch(l);

  // Scrolling moves the anchors without any layout changing, so ask them to
  // re-measure at the one moment it matters: just before the coins fly. This
  // used to be a re-render of the whole lobby on every scroll event instead.
  //
  // Measure BEFORE applying the claim: the claim unmounts the very button the
  // coins fly from, and on the web a measure lands a task later — after that
  // commit — so measuring afterwards read a detached node as (0, 0) and the
  // coins set off from the corner of the window.
  const claim = (fromKey: string, count: number, apply: () => void) => {
    pattern('claim');
    void anchors.refresh().then(() => {
      const from = anchors.centre(fromKey);
      const to = anchors.centre(anchorId.wallet);
      setFlying(count);
      apply();
      // No arc under reduce-motion — the wallet still waits and the coins
      // still ding, as at the table. One ding per coin as it lands; the
      // timers die with the screen.
      if (from && to && motion !== 'reduced') fxBus.emit({ kind: 'coins', from, to, count });
      dingTimers.current.push(...coinDingTimers(count, 0));
    });
  };
  const dingTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => dingTimers.current.forEach(clearTimeout), []);

  const collect = () => {
    const r = claimDaily(profile, today);
    if (r.coins > 0) claim('bonus', BONUS_COINS, () => onProfileChange(r.profile));
  };

  const collectQuest = (index: number) => {
    const r = claimQuest(profile, index);
    if (r.coins > 0) claim(`quest:${index}`, QUEST_COINS, () => onProfileChange(r.profile));
  };

  return (
    <AnchorHost map={anchors}>
      <SafeAreaView style={[styles.safe, { backgroundColor: room().page }]}>
        <View style={styles.fill}>
          {/* iOS: a tap on Enter while the keyboard is up must press it, not
              only dismiss the keyboard; and the code field scrolls clear of
              the keyboard instead of hiding under it. Both are no-ops elsewhere. */}
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            {/* identity header */}
            <View style={styles.headerRow}>
              <PressScale
                onPress={onOpenProfile}
                style={[styles.identity, styles.identityFlex]}
                hitSlop={6}
                scaleTo={0.98}
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
              </PressScale>

              <PressScale onPress={onOpenShop} hitSlop={6} accessibilityLabel={ui.walletLabel(coins)}>
                <Anchor id={anchorId.wallet}>
                  <View style={styles.coinChip}>
                    <Text style={styles.coinText}>{coins}</Text>
                    <Coin size={13} />
                  </View>
                </Anchor>
              </PressScale>
              <PressScale onPress={onOpenSettings} hitSlop={6} accessibilityLabel={ui.settings} style={styles.gear}>
                <Gear size={22} />
              </PressScale>
            </View>

            {/* the brand — a long press opens the deck gallery: review harness and easter egg */}
            <View style={styles.brand}>
              <Wordmark height={40} onLongPress={() => onLaunch({ mode: 'gallery' })} />
              <Text style={styles.sub}>{lang.s.gameToTarget(1001)}</Text>
            </View>

            {/* the table: online quick play */}
            <TableHero
              avatar={profile.selectedAvatar}
              day={today}
              label={ui.play}
              room={room()}
              onPress={() => go({ mode: 'quick' })}
            />
            {/* The big word never said it goes online, to strangers: the two
                tiles under it say what they are, and now so does it. */}
            <Text style={[styles.hint, styles.heroSub]}>{ui.playOnlineSub}</Text>

            {/* the two other ways in */}
            <View style={styles.modeRow}>
              <ModeTile
                icon={<Robot size={22} colour={ink.hi} />}
                title={ui.playBots}
                sub={ui.modeBotsSub}
                onPress={() => go({ mode: 'offline' })}
              />
              <ModeTile
                icon={<Crown size={22} />}
                title={ui.privateTable}
                sub={ui.modePrivateSub}
                onPress={() => go({ mode: 'create' })}
              />
            </View>

            {/* A friend's code, right under the two ways in: it used to sit at
                the very bottom, below the fold on a phone, and friends told to
                "type the code" scrolled past the daily bonus looking for it. */}
            <Panel label={ui.joinByCode}>
              <View style={styles.joinRow}>
                <TextInput
                  value={code}
                  onChangeText={setCode}
                  placeholder={ui.tableCode}
                  placeholderTextColor={ink.mid}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  style={styles.input}
                  accessibilityLabel={ui.joinByCode}
                />
                <Button
                  label={ui.enter}
                  tone={code.trim() ? 'strong' : 'plain'}
                  style={styles.noShrink}
                  onPress={() => code.trim() && go({ mode: 'join', code: code.trim() })}
                />
              </View>
            </Panel>

            {/* the retention loop, in one place: today's bonus, today's quests */}
            <Panel label={ui.daily}>
              <View style={styles.bonusRow}>
                <View style={styles.bonusText}>
                  <View style={styles.bonusTitleRow}>
                    <Text style={styles.bonusTitle} numberOfLines={1}>
                      {claimable
                        ? ui.dailyBonus(previewDaily(profile, today).coins)
                        : ui.bonusClaimed}
                    </Text>
                    {claimable && <Coin size={15} />}
                  </View>
                  <Text style={styles.hint} numberOfLines={1}>
                    {claimable && previewDaily(profile, today).streakDays > 1
                      ? ui.streakDays(profile.streakDays)
                      : claimable
                        ? ui.startStreak
                        : ui.streakDays(profile.streakDays)}
                  </Text>
                </View>
                {claimable ? (
                  <Anchor id="bonus">
                    <Button label={ui.claim} tone="strong" sound={null} onPress={collect} />
                  </Anchor>
                ) : (
                  <View style={styles.claimed}>
                    <Check />
                  </View>
                )}
              </View>
              {profile.quests.length > 0 && <View style={styles.rule} />}
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
                    <View style={styles.claimed}>
                      <Check />
                    </View>
                  ) : isQuestComplete(q) ? (
                    <Anchor id={`quest:${i}`}>
                      <Button
                        label={`+${q.reward}`}
                        icon={<Coin size={12} />}
                        tone="strong"
                        sound={null}
                        onPress={() => collectQuest(i)}
                      />
                    </Anchor>
                  ) : (
                    <View style={styles.reward}>
                      <Text style={styles.questReward}>+{q.reward}</Text>
                      <Coin size={12} />
                    </View>
                  )}
                </View>
              ))}
            </Panel>

            {/* The other tables in the room: the games beyond Bela. */}
            <MoreGames
              lang={lang}
              chips={chips}
              onPlay={(game, players) => go({ mode: 'game', game, players })}
              onOnline={(game, how) => go({ mode: 'online', game, how })}
              onRules={onOpenGameRules}
            />

            {/* For whoever has never played bela, or plays it differently at
                home; the evenings with friends, match by match; and what they
                add up to. */}
            <View style={styles.modeRow}>
              <View style={styles.fill}>
                <Button label={lang.s.rules.title} tone="plain" onPress={onOpenRules} />
              </View>
              <View style={styles.fill}>
                <Button label={ui.historyOpen} tone="plain" onPress={onOpenHistory} />
              </View>
              <View style={styles.fill}>
                <Button label={ui.statsOpen} tone="plain" onPress={onOpenStats} />
              </View>
            </View>

            <Text style={styles.disclaimer}>{ui.coinsDisclaimer}</Text>
          </ScrollView>

          <EffectsOverlay bus={fxBus} />
          {rulesFor ? <RulesSheet lang={lang} game={rulesFor} onClose={onCloseGameRules} /> : null}
        </View>
      </SafeAreaView>
    </AnchorHost>
  );
}

/** One of the two ways in that is not the table itself: an icon, a title, a line under it. */
function ModeTile({
  icon,
  title,
  sub,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <PressScale onPress={onPress} style={styles.tile} scaleTo={0.98}>
      <View style={styles.tileIcon}>{icon}</View>
      <View style={styles.tileText}>
        {/* Two lines each: side by side on a 360 dp phone the tile's text
            column is ~90 dp, and "Igraj protiv botova" was clipped to
            "Igraj proti…" on the first screen of the app. */}
        <Text style={styles.tileTitle} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.tileSub} numberOfLines={2}>
          {sub}
        </Text>
      </View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.feltDeep },
  fill: { flex: 1 },
  scroll: { padding: space.xl, gap: space.lg, paddingBottom: 40 },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 2 },
  // The name gets the room the row actually has: it was being squeezed into its
  // own text width and truncated to two letters while half the row sat empty.
  identityFlex: { flex: 1, minWidth: 0 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1, minWidth: 0 },
  identityText: { flexShrink: 1, minWidth: 0 },
  headerName: { color: ink.hi, ...type.body, fontFamily: font.bold },
  headerLevel: { color: ink.mid, ...type.caption },
  coinChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    backgroundColor: surface.sunk,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.accent,
    paddingHorizontal: space.md,
    paddingVertical: 6,
  },
  coinText: { color: theme.accent, ...type.sub, fontFamily: font.bold },
  gear: { padding: space.xs },

  brand: { alignItems: 'center', gap: 2 },
  sub: { color: ink.mid, ...type.sub },

  // Both tiles take the taller one's height, so the row stays a pair.
  modeRow: { flexDirection: 'row', gap: space.sm + 2, alignItems: 'stretch' },
  tile: {
    flex: 1,
    // A column, not a row: side by side on a 360 dp phone a row left the
    // text ~90 dp and clipped both tiles' own titles. Stacked, the words get
    // the tile's full width and no locale has to be abbreviated.
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: space.sm,
    backgroundColor: surface.panel,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: stroke.hair,
    padding: space.md,
    minWidth: 0,
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: surface.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileText: { alignSelf: 'stretch', minWidth: 0, gap: 1 },
  tileTitle: { color: ink.hi, ...type.sub, fontFamily: font.bold },
  tileSub: { color: ink.mid, ...type.caption },

  bonusRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 2, minHeight: 44 },
  bonusText: { flex: 1, minWidth: 0, gap: 2 },
  bonusTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 1 },
  bonusTitle: { color: theme.accent, ...type.h3, fontFamily: font.bold, flexShrink: 1 },
  hint: { color: ink.mid, ...type.caption },
  heroSub: { textAlign: 'center', marginTop: -space.xs },
  // As tall as the claim button it replaces, so a claim moves nothing below it.
  claimed: { width: 44, height: 40, alignItems: 'center', justifyContent: 'center' },
  rule: { height: 1, backgroundColor: stroke.hair, marginVertical: space.xs },

  joinRow: { flexDirection: 'row', gap: space.sm + 2, alignItems: 'center' },
  // minWidth 0 lets the field give way inside its row: on the web it kept its
  // own width (about 245 px) and pushed Enter past the panel's edge on a
  // 360 px phone, and off the screen at 320.
  input: {
    flex: 1,
    minWidth: 0,
    color: ink.hi,
    backgroundColor: surface.chip,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg - 2,
    paddingVertical: space.sm + 2,
    ...type.body,
  },

  noShrink: { flexShrink: 0 },

  questRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 2, minHeight: 40 },
  questLeft: { flex: 1, gap: 5 },
  questText: { color: ink.hi, ...type.sub },
  questDone: { color: theme.okInk, fontFamily: font.bold },
  questTrack: {
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: surface.chip,
    overflow: 'hidden',
  },
  questFill: { height: 5, borderRadius: radius.pill, backgroundColor: theme.accent },
  reward: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  questReward: { color: theme.accent, ...type.sub },

  disclaimer: { color: ink.mid, ...type.caption, textAlign: 'center', marginTop: space.sm },
});
