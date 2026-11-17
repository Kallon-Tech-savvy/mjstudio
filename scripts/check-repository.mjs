import { execFileSync } from 'node:child_process';

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0');
const generated = files.filter((file) =>
  /(^|\/)(node_modules|dist|coverage|playwright-report|test-results)\//.test(file),
);
if (generated.length) {
  console.error(`Remove ${generated.length} generated files from the Git index before committing.`);
  console.error(generated.slice(0, 10).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Repository check passed: dependencies and build/test output are not tracked.');
}
