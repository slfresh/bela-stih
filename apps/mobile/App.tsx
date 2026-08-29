import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Linking } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Lang } from '@belot/i18n';
import type { PlayerProfile } from '@belot/progression';
import { HomeScreen, type Launch } from './src/HomeScreen';
import { DeckGallery } from './src/DeckGallery';
import { OfflineGame } from './src/OfflineGame';
import { OnlineGame } from './src/net/OnlineGame';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { ShopScreen } from './src/screens/ShopScreen';
import {
  loadProfile,
  loadSettings,
  saveProfile,
  saveSettings,
  type Settings,
} from './src/storage';
import { preloadSfx, setSoundEnabled } from './src/audio';
import { setCosmetics } from './src/cosmetics';

/** The menu stack, one level deep: home, or one of its satellite screens. */
type MenuScreen = 'home' | 'shop' | 'settings' | 'profile';

/**
 * A handful of screens and no router: the menu (home plus shop / settings /
 * profile), a local game, or a networked one. A stack navigator would be more
 * machinery than these transitions justify.
 */
export default function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [profile, setProfile] = useState<PlayerProfile>(loadProfile);
  const [launch, setLaunch] = useState<Launch | null>(null);
  const [menu, setMenu] = useState<MenuScreen>('home');
  const lang = useMemo(() => new Lang(settings.locale), [settings.locale]);

  // Warm the sound bank once, so even the session's first effect is audible.
  useEffect(() => preloadSfx(), []);

  // Invite links (https://belastih.com/join/CODE or belastih://join/CODE)
  // drop the player straight into the friend's table. A link never interrupts
  // a game in progress — mid-match it is simply ignored.
  const launchRef = useRef(launch);
  launchRef.current = launch;
  useEffect(() => {
    const joinFrom = (url: string | null) => {
      const code = url?.match(/(?:^|\/)join\/([A-Za-z0-9_-]{1,24})\/?$/)?.[1];
      if (code && launchRef.current === null) {
        setMenu('home');
        setLaunch({ mode: 'join', code });
      }
    };
    void Linking.getInitialURL().then(joinFrom).catch(() => {});
    const sub = Linking.addEventListener('url', (e) => joinFrom(e.url));
    return () => sub.remove();
  }, []);

  setSoundEnabled(settings.sound);
  setCosmetics(profile);

  const updateProfile = useCallback((p: PlayerProfile) => {
    saveProfile(p);
    setProfile(p);
  }, []);

  const updateSettings = useCallback((s: Settings) => {
    saveSettings(s);
    setSettings(s);
  }, []);

  // Games keep their own profile copy while playing, so re-read it on the way
  // out to pick up whatever XP and coins were earned.
  const exitToHome = useCallback(() => {
    setLaunch(null);
    setProfile(loadProfile());
  }, []);

  // Back out of a game (or a menu screen) rather than out of the app. Without
  // this, Android's back button drops straight to whatever was behind and
  // takes the deal in progress with it — and people press back constantly.
  useEffect(() => {
    if (launch === null && menu === 'home') return; // at the root, let back close the app
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (launch !== null) exitToHome();
      else setMenu('home');
      return true; // handled
    });
    return () => sub.remove();
  }, [launch, menu, exitToHome]);

  const toHome = useCallback(() => setMenu('home'), []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {launch === null ? (
        menu === 'shop' ? (
          <ShopScreen
            lang={lang}
            profile={profile}
            onProfileChange={updateProfile}
            onBack={toHome}
          />
        ) : menu === 'settings' ? (
          <SettingsScreen
            lang={lang}
            settings={settings}
            onSettingsChange={updateSettings}
            onProfileChange={updateProfile}
            onBack={toHome}
          />
        ) : menu === 'profile' ? (
          <ProfileScreen
            lang={lang}
            profile={profile}
            settings={settings}
            onOpenShop={() => setMenu('shop')}
            onBack={toHome}
          />
        ) : (
          <HomeScreen
            lang={lang}
            profile={profile}
            settings={settings}
            onProfileChange={updateProfile}
            onSettingsChange={updateSettings}
            onLaunch={setLaunch}
            onOpenShop={() => setMenu('shop')}
            onOpenSettings={() => setMenu('settings')}
            onOpenProfile={() => setMenu('profile')}
          />
        )
      ) : launch.mode === 'gallery' ? (
        <DeckGallery onExit={exitToHome} />
      ) : launch.mode === 'offline' ? (
        <OfflineGame settings={settings} onExit={exitToHome} />
      ) : (
        <OnlineGame
          settings={settings}
          mode={launch.mode}
          joinCode={launch.mode === 'join' ? launch.code : undefined}
          onExit={exitToHome}
        />
      )}
    </SafeAreaProvider>
  );
}
