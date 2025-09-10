import ora from 'ora';
import chalk from 'chalk';
import boxen from 'boxen';
import figlet from 'figlet';
import gradientString from 'gradient-string';
import cliProgress from 'cli-progress';
import figures from 'figures';
import cliSpinners from 'cli-spinners';

// Check if we should use colors (respects NO_COLOR env variable and terminal capabilities)
// This helps ensure the CLI works well in various terminal environments
const shouldUseColor = !process.env.NO_COLOR && process.stdout.isTTY;

// Use colors that work well on both dark and light terminals
export const colors = {
  primary: chalk.cyan, // Works well on both backgrounds
  success: chalk.green, // Universal success color
  error: chalk.red, // Universal error color
  warning: chalk.yellow, // Caution - may need to be bold on dark terminals
  info: chalk.magenta, // Changed from blue to magenta for better visibility without overusing cyan
  muted: chalk.gray, // Subtle on both
  highlight: chalk.cyan.bold, // Emphasis
  amount: chalk.white.bold, // Changed from yellow to white for better readability
  cyan: chalk.cyan,
  bold: chalk.bold,
};

export const icons = {
  success: figures.tick,
  error: figures.lineCross,
  warning: figures.warning,
  info: figures.info,
  wallet: '💰',
  pointer: figures.pointer,
  key: '🔑',
  lock: '🔒',
  unlock: '🔓',
  money: '💵',
  send: figures.arrowUp,
  receive: figures.arrowDown,
  time: '⏱️',
  check: figures.tick,
  cross: figures.lineCross,
  arrow: figures.arrowRight,
  arrowright: figures.arrowRight,
  dot: figures.bullet,
  star: figures.star
};

export const createSpinner = (text: string) => {
  return ora({
    text: `${colors.primary(text)}`,
    spinner: cliSpinners.line,
    color: 'cyan',
  });
};

export const showBanner = async () => {
  return new Promise<void>((resolve) => {
    figlet.text(
      'MNEE CLI',
      {
        font: 'ANSI Shadow',
        horizontalLayout: 'default',
        verticalLayout: 'default',
      },
      (err: any, data: string) => {
        if (!err && data) {
          // Add padding at the top
          console.log('\n');
          // MNEE brand colors - yellowish orange gradient
          const gradient = gradientString(['#FFA500', '#FFD700', '#FFC107', '#FF8C00']);
          console.log(gradient.multiline(data));
          console.log(colors.muted('  Everything you need to manage your MNEE USD tokens ') + '\n');
        }
        resolve();
      },
    );
  });
};

export const showBox = (content: string, title?: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
  const borderColors = {
    success: '#52C41A',
    error: '#F5222D',
    warning: '#FAAD14',
    info: '#4A90E2',
  };

  const boxOptions: import('boxen').Options = {
    padding: 1,
    margin: 1,
    borderStyle: 'round',
    borderColor: borderColors[type],
    title: title ? ` ${title} ` : undefined,
    titleAlignment: 'center',
  };

  console.log(boxen(content, boxOptions));
};

export const createProgressBar = (title: string, total: number) => {
  const bar = new cliProgress.SingleBar(
    {
      format: `${colors.primary(title)} ${colors.highlight('{bar}')} {percentage}% | {value}/{total} | ${colors.muted(
        '{duration_formatted}',
      )}`,
      barCompleteChar: '█',
      barIncompleteChar: '░',
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic,
  );

  bar.start(total, 0);
  return bar;
};

export const formatAddress = (address: string): string => {
  return address; // Don't truncate addresses
};

export const formatAmount = (amount: number | string): string => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  // Format with up to 5 decimal places, removing trailing zeros
  const formatted = num.toFixed(5).replace(/\.?0+$/, '');
  // Use bold white for better readability on both dark and light terminals
  return chalk.bold.white(`$${formatted} MNEE`);
};

export const formatLink = (url: string, text?: string): string => {
  // Use OSC 8 hyperlink escape sequence for clickable links in supporting terminals
  // Format: \x1b]8;;URL\x07TEXT\x1b]8;;\x07
  const displayText = text || url;
  const clickableLink = `\x1b]8;;${url}\x07${chalk.cyan.underline(displayText)}\x1b]8;;\x07`;

  // Fallback for terminals that don't support OSC 8
  // They will just see the underlined cyan text
  return clickableLink;
};

export const formatTransaction = (type: 'send' | 'receive', amount: string, address: string): string => {
  const icon = type === 'send' ? icons.send : icons.receive;
  const color = type === 'send' ? colors.error : colors.success;
  return `${icon} ${color(type.toUpperCase())} ${formatAmount(amount)} ${colors.muted(
    type === 'send' ? 'to' : 'from',
  )} ${colors.muted(formatAddress(address))}`;
};

export const showWelcome = async () => {
  await showBanner();
  const quickStartCommands = [
    { cmd: 'mnee create', desc: 'Create a new wallet' },
    { cmd: 'mnee list', desc: 'Show all your wallets' },
    { cmd: 'mnee send', desc: 'Transfer tokens' },
    { cmd: 'mnee --help', desc: 'Show all commands' },
  ];

  const maxCmdLength = Math.max(...quickStartCommands.map((x) => x.cmd.length));

  const commandLines = quickStartCommands
    .map(
      (item) =>
        `${colors.cyan(item.cmd.padEnd(maxCmdLength))} ${colors.muted(`${icons.arrow} ${item.desc}`)}`
    )
    .join('\n');

  const content = [
    `${colors.cyan.bold('Welcome to MNEE CLI')}`,
    '',
    `${icons.pointer} Manage wallets with ease`,
    `${icons.pointer} Transfer tokens instantly`,
    `${icons.pointer} Secure key management`,
    `${icons.pointer} Built for the future of money`,
    '',
    colors.muted('─────────────────────────────'),
    '',
    `${colors.primary.bold('Quick Start:')}`,
    commandLines,
  ].join('\n');

  console.log(
    boxen(content, {
      padding: 1,
      margin: 1,
      borderStyle: 'double',
      borderColor: 'yellow',
      textAlignment: 'left',
      width: 50,
    }),
  );
};

export const animateSuccess = (message: string) => {
  setTimeout(() => {
    process.stdout.write(`\r${icons.success} ${colors.success(message)}\n`);
  }, 1000);
};

export const startTransactionAnimation = () => {
  const frames = ['Broadcasting ▶', 'Broadcasting ▶▶', 'Broadcasting ▶▶▶'];
  let i = 0;
  const interval = setInterval(() => {
    process.stdout.write(`\r${colors.primary(frames[i])}`);
    i = (i + 1) % frames.length;
  }, 250);

  return {
    stop: (showComplete: boolean = false) => {
      clearInterval(interval);
      process.stdout.write('\r' + ' '.repeat(50) + '\r');
      if (showComplete) {
        process.stdout.write(`\r${colors.success(`${icons.success} Broadcast Complete`)}\n`);
      }
    },
  };
};

export const showAirdropAnimation = async (showComplete: boolean = false) => {
  const frames = [
    '🪂 Requesting airdrop',
    '🪂 Requesting airdrop ▶',
    '🪂 Requesting airdrop ▶▶',
    '🪂 Requesting airdrop ▶▶▶',
    '🪂 Requesting airdrop ▶▶▶▶',
    '🪂 Requesting airdrop ▶▶▶▶▶',
  ];

  if (showComplete) {
    frames.push('✅ ▶▶▶▶▶▶ Airdrop complete!');
  }

  for (const frame of frames) {
    process.stdout.write(`\r${colors.primary(frame)}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  process.stdout.write('\r' + ' '.repeat(50) + '\r');
};

export const startAirdropAnimation = () => {
  const frames = [
    '🪂 Requesting airdrop...',
    '🪂 ▶ Requesting airdrop...',
    '🪂 ▶▶ Requesting airdrop...',
    '🪂 ▶▶▶ Requesting airdrop...',
    '🪂 ▶▶▶▶ Requesting airdrop...',
    '🪂 ▶▶▶▶▶ Requesting airdrop...',
  ];

  let i = 0;
  const interval = setInterval(() => {
    process.stdout.write(`\r${colors.primary(frames[i])}`);
    i = (i + 1) % frames.length;
  }, 200);

  return {
    stop: (showComplete: boolean = false) => {
      clearInterval(interval);
      process.stdout.write('\r' + ' '.repeat(50) + '\r');
      if (showComplete) {
        process.stdout.write(`\r${colors.success('✅ ▶▶▶▶▶▶ Airdrop complete!')}`);
        setTimeout(() => {
          process.stdout.write('\r' + ' '.repeat(50) + '\r');
        }, 1000);
      }
    },
  };
};

export const table = (data: any[], columns: string[]) => {
  const stripAnsi = (str: string): string =>
    str.replace(/\x1b\[[0-9;]*m/g, '');

  const getDisplayLength = (str: string): number =>
    stripAnsi(str).length;

  const maxWidths = columns.map((col) => {
    const headerWidth = getDisplayLength(col);
    const dataWidths = data.map((row) => getDisplayLength(String(row[col] || '')));
    return Math.max(headerWidth, ...dataWidths);
  });

  const padToWidth = (str: string, width: number): string => {
    const actualLength = getDisplayLength(str);
    const padding = width - actualLength;
    return str + ' '.repeat(Math.max(0, padding));
  };

  const header = columns
    .map((col, i) => colors.bold.cyan(padToWidth(col, maxWidths[i])))
    .join(' │ ');

  const separator = maxWidths.map((w) => '─'.repeat(w)).join('─┼─');

  console.log(header);
  console.log(colors.muted(separator));

  data.forEach((row) => {
    const rowStr = columns
      .map((col, i) => padToWidth(String(row[col] || ''), maxWidths[i]))
      .join(' │ ');
    console.log(rowStr);
  });
};
