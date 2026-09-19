import { Component, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { font, radius, theme } from '../theme';

/**
 * The screen a render error lands on.
 *
 * Without this a thrown render anywhere in the tree left the app on a blank
 * page with no branding and no way back — in production, silently. This is a
 * class component on purpose: error boundaries are the one thing hooks cannot
 * express.
 *
 * Deliberately self-contained (no shared Button, no i18n import): the whole
 * point is to still render when something below it could not.
 */
export class ErrorBoundary extends Component<
  {
    children: ReactNode;
    title: string;
    body: string;
    action: string;
    /** Called after the boundary resets; the app returns to the home screen. */
    onReset: () => void;
    /**
     * Which screen is behind the boundary. When it changes — the hardware
     * back button leaving a game, say — the panel gives way to the new
     * screen instead of sitting over it.
     */
    resetKey: string;
  },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  componentDidCatch(error: Error) {
    if (__DEV__) console.error('[bela] render error', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.root}>
        <Text style={styles.mark}>
          Bela <Text style={styles.markAccent}>Štih</Text>
        </Text>
        <Text style={styles.title}>{this.props.title}</Text>
        <Text style={styles.body}>{this.props.body}</Text>
        <Pressable
          onPress={() => {
            this.setState({ error: null });
            this.props.onReset();
          }}
          style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.btnText}>{this.props.action}</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.feltDeep,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 10,
  },
  mark: { color: theme.text, fontSize: 30, fontFamily: font.bold, marginBottom: 14 },
  markAccent: { color: theme.accent },
  title: { color: theme.text, fontSize: 18, fontFamily: font.bold, textAlign: 'center' },
  body: { color: theme.textDim, fontSize: 14, textAlign: 'center', maxWidth: 320 },
  btn: {
    marginTop: 14,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: radius.pill,
    backgroundColor: theme.wood,
    borderWidth: 1,
    borderColor: theme.accent,
  },
  pressed: { opacity: 0.7, transform: [{ translateY: 2 }] },
  btnText: { color: theme.text, fontSize: 15, fontFamily: font.bold },
});
