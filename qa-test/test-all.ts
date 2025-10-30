import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

const testFiles = [
  'balance.test.ts',
  'transfer.test.ts',
  'history.test.ts',
];

async function checkDistFolder(): Promise<boolean> {
  return existsSync(join(process.cwd(), 'dist'));
}

async function buildProject(): Promise<boolean> {
  console.log('Building project...');

  return new Promise((resolve) => {
    const buildProcess = spawn('npm', ['run', 'build'], {
      stdio: 'inherit',
      shell: true,
    });

    buildProcess.on('close', (code) => {
      if (code === 0) {
        console.log('Build successful.\n');
        resolve(true);
      } else {
        console.log('Build failed.\n');
        resolve(false);
      }
    });

    buildProcess.on('error', (error) => {
      console.error('Build error:', error);
      resolve(false);
    });
  });
}

async function runTestFile(fileName: string): Promise<TestResult> {
  const start = Date.now();
  const name = fileName.replace('.test.ts', '');
  const path = join('qa-test', fileName);

  console.log(`\nRunning ${name} test...`);

  return new Promise((resolve) => {
    const proc = spawn('node', ['--import', 'tsx', '--test', path], {
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, NODE_ENV: 'test' },
    });

    proc.on('close', (code) => {
      resolve({
        name,
        passed: code === 0,
        duration: Date.now() - start,
        error: code !== 0 ? `Exit code ${code}` : undefined,
      });
    });

    proc.on('error', (err) => {
      resolve({
        name,
        passed: false,
        duration: Date.now() - start,
        error: err.message,
      });
    });
  });
}

async function runAllTests() {
  console.log('       MNEE CLI - Tests');
  console.log('========================================\n');

  const distExists = await checkDistFolder();
  if (!distExists) {
    console.log('dist folder not found.');
    const success = await buildProject();
    if (!success) {
      console.log('Build failed. Cannot continue.');
      process.exit(1);
    }
  } else {
    console.log('dist folder found. Skipping build.\n');
  }

  const start = Date.now();
  const results: TestResult[] = [];

  for (const file of testFiles) {
    const result = await runTestFile(file);
    results.push(result);
  }

  const totalTime = ((Date.now() - start) / 1000).toFixed(2);
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log('           TEST SUMMARY');
  console.log('========================================');

  results.forEach((r) => {
    const status = r.passed ? 'PASSED' : 'FAILED';
    const duration = (r.duration / 1000).toFixed(2);
    console.log(`${r.name.padEnd(20)} ${status.padEnd(8)} ${duration}s`);
    if (r.error) {
      console.log(`  → ${r.error}`);
    }
  });

  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`Duration: ${totalTime}s`);
  console.log('========================================\n');

  if (failed > 0) {
    console.log('Some tests failed. Check logs above for details.\n');
    process.exit(1);
  } else {
    console.log('All tests passed.\n');
    process.exit(0);
  }
}

// Graceful exits
process.on('SIGINT', () => {
  console.log('\nTest run interrupted.');
  process.exit(130);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});

runAllTests().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});