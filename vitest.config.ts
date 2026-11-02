import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@belot/shared-types': r('./packages/shared-types/src/index.ts'),
      '@belot/engine': r('./packages/engine/src/index.ts'),
      '@belot/bots': r('./packages/bots/src/index.ts'),
      '@belot/table': r('./packages/table/src/index.ts'),
      '@belot/i18n': r('./packages/i18n/src/index.ts'),
      '@belot/progression': r('./packages/progression/src/index.ts'),
      '@belot/game-core': r('./packages/game-core/src/index.ts'),
      '@belot/games-bela': r('./packages/games/bela/src/index.ts'),
      '@belot/games-osmice': r('./packages/games/osmice/src/index.ts'),
      '@belot/cards': r('./packages/cards/src/index.ts'),
      '@belot/games-baccarat': r('./packages/games/baccarat/src/index.ts'),
      '@belot/games-blackjack': r('./packages/games/blackjack/src/index.ts'),
      '@belot/games-holdem': r('./packages/games/holdem/src/index.ts'),
    },
  },
  test: {
    include: ['packages/**/test/**/*.test.ts', 'apps/mobile/test/**/*.test.ts'],
    environment: 'node',
  },
});
