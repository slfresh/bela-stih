import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import type { Seat } from '@belot/engine';
import { Table } from '@belot/table';
import { LineReader } from './input';
import {
  bold,
  cyan,
  dim,
  renderEvent,
  renderOptions,
  renderPrompt,
  renderTable,
} from './render';

/**
 * Playable terminal Bela.
 *
 * This is a real client for the shared engine, not a mock: it drives the same
 * `Table` the Expo app will, through the same hidden-hand `PublicView`. Its job
 * is to make the rules tangible long before there are any pixels, and to give
 * the vocabulary a first read-through in the language the game is played in.
 *
 *   npm run play            play a match against the bots
 *   npm run play -- --auto  watch four bots play a whole match
 */

interface Args {
  auto: boolean;
  seed: number;
  deals: number | null;
  level: 'easy' | 'medium';
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1]! : null;
  };
  const seedArg = get('--seed');
  const dealsArg = get('--deals');
  return {
    auto: argv.includes('--auto'),
    seed: seedArg === null ? (Date.now() & 0x7fffffff) : Number(seedArg),
    deals: dealsArg === null ? null : Number(dealsArg),
    level: get('--level') === 'easy' ? 'easy' : 'medium',
  };
}

const HUMAN: Seat = 0;

function banner(args: Args, humanSeat: Seat | null): string {
  return [
    '',
    bold('  BELA / BELOT  ') + dim(` — igra do 1001 · seed ${args.seed}`),
    dim(
      humanSeat === null
        ? '  Četiri bota igraju partiju.'
        : '  Vi ste na jugu; Partner je preko puta. Adut, zvanja i bela se zovu ručno.',
    ),
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const humanSeat: Seat | null = args.auto ? null : HUMAN;

  const table = new Table({
    seed: args.seed,
    botLevel: args.level,
    humanSeats: args.auto ? [] : [HUMAN],
  });

  stdout.write(banner(args, humanSeat));

  const flush = () => {
    for (const e of table.drainEvents()) {
      const line = renderEvent(e, humanSeat);
      if (line !== null) stdout.write(line + '\n');
    }
  };

  // --- watch four bots ------------------------------------------------------
  if (args.auto) {
    let dealt = 0;
    while (table.phase !== 'MATCH_OVER') {
      if (args.deals !== null && dealt >= args.deals) break;
      table.runBots();
      flush();
      dealt++;
      if (table.phase === 'DEAL_OVER') table.startNextDeal();
    }
    flush();
    stdout.write('\n');
    return;
  }

  // --- play ------------------------------------------------------------------
  const rl = createInterface({ input: stdin, output: stdout });
  const lines = new LineReader(rl);
  /** Show a prompt and take the next line; null means input ran out. */
  const ask = async (prompt: string): Promise<string | null> => {
    stdout.write(prompt);
    return lines.next();
  };

  try {
    let dealt = 0;
    while (table.phase !== 'MATCH_OVER') {
      if (args.deals !== null && dealt >= args.deals) break;

      flush();

      if (table.phase === 'DEAL_OVER') {
        dealt++;
        if (args.deals !== null && dealt >= args.deals) break;
        stdout.write('\n');
        if ((await ask(dim('  [enter] za sljedeće dijeljenje '))) === null) break;
        table.startNextDeal();
        continue;
      }

      if (!table.isHumanTurn()) {
        // Bots have nothing left to do and the deal is not over: cannot happen,
        // but failing loudly beats spinning silently.
        throw new Error(`stuck in phase ${table.phase} with no human to act`);
      }

      const view = table.view(HUMAN);
      const options = table.legal();

      stdout.write('\n' + renderTable(view, humanSeat) + '\n');
      const hint = renderPrompt(view, HUMAN);
      if (hint) stdout.write(hint + '\n');
      stdout.write(renderOptions(options) + '\n');

      const answer = await ask(cyan('  Izbor > '));
      if (answer === null) break; // stdin exhausted
      const trimmed = answer.trim();
      if (trimmed === 'q' || trimmed === 'quit') break;

      const choice = Number(trimmed);
      if (!Number.isInteger(choice) || choice < 1 || choice > options.length) {
        stdout.write(dim(`  Upišite broj 1–${options.length} (ili q za izlaz).\n`));
        continue;
      }
      table.submit(options[choice - 1]!);
    }
    flush();
    stdout.write('\n');
  } finally {
    rl.close();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
