// No control byte in any tracked text file. Twice a regex in a test held a
// literal backspace (0x08) where `\b` was meant, and the guard could never
// fail: a patch script had turned the escape into the byte it names. Tabs
// and line ends are the only control bytes a source file may hold.
//
//   node scripts/check-control-bytes.mjs        # exit 1 and list the offenders
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const TEXT = /\.(ts|tsx|mjs|cjs|js|json|md|html|css|sh|py|yml|yaml|txt|webmanifest)$/;
// -z: a path with a non-ASCII character is otherwise printed quoted and octal-escaped, and then skipped unread.
const files = execSync('git ls-files -z', { encoding: 'utf8' }).split('\0').filter((f) => TEXT.test(f));
const bad = [];
for (const file of files) {
  const buf = readFileSync(file);
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) {
      const line = buf.subarray(0, i).toString('utf8').split('\n').length;
      bad.push(`${file}:${line}: byte 0x${b.toString(16).padStart(2, '0')}`);
      break;
    }
  }
}
if (bad.length) {
  console.error('!! control bytes in tracked text files:\n' + bad.join('\n'));
  process.exit(1);
}
console.log(`ok: ${files.length} text files, no control bytes`);
