import ora from 'ora';
import chalk from 'chalk';
import boxen from 'boxen';
import figlet from 'figlet';
import gradientString from 'gradient-string';
import cliProgress from 'cli-progress';
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
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
    wallet: '💰',
    key: '🔑',
    lock: '🔒',
    unlock: '🔓',
    money: '💵',
    send: '↗',
    receive: '↙',
    time: '⏱️',
    check: '✓',
    cross: '✗',
    arrow: '→',
    dot: '•',
    star: '⭐',
    sparkle: '✨',
    rocket: '🚀',
    shield: '🛡️',
    diamond: '💎',
};
export const createSpinner = (text) => {
    return ora({
        text,
        spinner: {
            interval: 80,
            frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
        },
        color: 'cyan',
    });
};
export const showBanner = async () => {
    return new Promise((resolve) => {
        figlet.text('MNEE CLI', {
            font: 'ANSI Shadow',
            horizontalLayout: 'default',
            verticalLayout: 'default',
        }, (err, data) => {
            if (!err && data) {
                // Add padding at the top
                console.log('\n');
                // MNEE brand colors - yellowish orange gradient
                const gradient = gradientString(['#FFA500', '#FFD700', '#FFC107', '#FF8C00']);
                console.log(gradient.multiline(data));
                console.log(colors.muted('  Everything you need to manage your MNEE USD tokens ') + icons.sparkle + '\n');
            }
            resolve();
        });
    });
};
export const showBox = (content, title, type = 'info') => {
    const borderColors = {
        success: '#52C41A',
        error: '#F5222D',
        warning: '#FAAD14',
        info: '#4A90E2',
    };
    const boxOptions = {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: borderColors[type],
        title: title ? ` ${title} ` : undefined,
        titleAlignment: 'center',
    };
    console.log(boxen(content, boxOptions));
};
export const createProgressBar = (title, total) => {
    const bar = new cliProgress.SingleBar({
        format: `${colors.primary(title)} ${colors.highlight('{bar}')} {percentage}% | {value}/{total} | ${colors.muted('{duration_formatted}')}`,
        barCompleteChar: '█',
        barIncompleteChar: '░',
        hideCursor: true,
    }, cliProgress.Presets.shades_classic);
    bar.start(total, 0);
    return bar;
};
export const formatAddress = (address) => {
    return address; // Don't truncate addresses
};
export const formatAmount = (amount) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    // Format with up to 5 decimal places, removing trailing zeros
    const formatted = num.toFixed(5).replace(/\.?0+$/, '');
    // Use bold white for better readability on both dark and light terminals
    return chalk.bold.white(`$${formatted} MNEE`);
};
export const formatLink = (url, text) => {
    // Use OSC 8 hyperlink escape sequence for clickable links in supporting terminals
    // Format: \x1b]8;;URL\x07TEXT\x1b]8;;\x07
    const displayText = text || url;
    const clickableLink = `\x1b]8;;${url}\x07${chalk.cyan.underline(displayText)}\x1b]8;;\x07`;
    // Fallback for terminals that don't support OSC 8
    // They will just see the underlined cyan text
    return clickableLink;
};
export const formatTransaction = (type, amount, address) => {
    const icon = type === 'send' ? icons.send : icons.receive;
    const color = type === 'send' ? colors.error : colors.success;
    return `${icon} ${color(type.toUpperCase())} ${formatAmount(amount)} ${colors.muted(type === 'send' ? 'to' : 'from')} ${colors.muted(formatAddress(address))}`;
};
export const showWelcome = async () => {
    await showBanner();
    const content = [
        `${icons.rocket} ${colors.highlight('Welcome to MNEE CLI!')}`,
        '',
        `${icons.wallet} Manage wallets with ease`,
        `${icons.money} Transfer tokens instantly`,
        `${icons.shield} Secure key management`,
        `${icons.diamond} Built for the future of money`,
        '',
        colors.muted('─────────────────────────────'),
        '',
        `${colors.primary('Quick Start:')}`,
        `${colors.cyan('mnee create')}  ${colors.muted('→ New wallet')}`,
        `${colors.cyan('mnee list')}    ${colors.muted('→ Your wallets')}`,
        `${colors.cyan('mnee --help')} ${colors.muted('→ All commands')}`,
    ].join('\n');
    console.log(boxen(content, {
        padding: 1,
        margin: 1,
        borderStyle: 'double',
        borderColor: 'yellow',
        textAlignment: 'center',
        width: 52,
    }));
};
export const animateSuccess = (message) => {
    const frames = ['🎯', '🎉', '✨', '🎊', '🌟', '⭐', '✅'];
    let i = 0;
    const interval = setInterval(() => {
        process.stdout.write(`\r${frames[i]} ${colors.success(message)}`);
        i = (i + 1) % frames.length;
    }, 100);
    setTimeout(() => {
        clearInterval(interval);
        process.stdout.write(`\r${icons.success} ${colors.success(message)}\n`);
    }, 1000);
};
export const startTransactionAnimation = () => {
    const frames = [
        '📡 Broadcasting ',
        '📡 Broadcasting ▶',
        '📡 Broadcasting ▶▶',
        '📡 Broadcasting ▶▶▶',
        '📡 Broadcasting ▶▶▶▶',
        '📡 Broadcasting ▶▶▶▶▶',
    ];
    let i = 0;
    const interval = setInterval(() => {
        process.stdout.write(`\r${colors.primary(frames[i])}`);
        i = (i + 1) % frames.length;
    }, 200);
    return {
        stop: (showComplete = false) => {
            clearInterval(interval);
            process.stdout.write('\r' + ' '.repeat(50) + '\r');
            if (showComplete) {
                process.stdout.write(`\r${colors.success('✅ ▶▶▶▶▶▶ Complete!')}`);
                setTimeout(() => {
                    process.stdout.write('\r' + ' '.repeat(50) + '\r');
                }, 1000);
            }
        },
    };
};
export const showAirdropAnimation = async (showComplete = false) => {
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
        stop: (showComplete = false) => {
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
export const table = (data, columns) => {
    // Calculate the actual display width, accounting for ANSI color codes
    const stripAnsi = (str) => {
        return str.replace(/\x1b\[[0-9;]*m/g, '');
    };
    const getDisplayLength = (str) => {
        return stripAnsi(str).length;
    };
    // Calculate max widths based on actual display width
    const maxWidths = columns.map((col) => {
        const headerWidth = getDisplayLength(col);
        const dataWidths = data.map((row) => getDisplayLength(String(row[col] || '')));
        return Math.max(headerWidth, ...dataWidths);
    });
    // Pad string to a specific display width, accounting for ANSI codes
    const padToWidth = (str, width) => {
        const actualLength = getDisplayLength(str);
        const padding = width - actualLength;
        return str + ' '.repeat(Math.max(0, padding));
    };
    // Build and print header
    const header = columns.map((col, i) => padToWidth(colors.highlight(col), maxWidths[i])).join(' │ ');
    console.log(header);
    // Build and print separator
    const separator = maxWidths.map((w) => '─'.repeat(w)).join('─┼─');
    console.log(colors.muted(separator));
    // Build and print data rows
    data.forEach((row) => {
        const rowStr = columns.map((col, i) => padToWidth(String(row[col] || ''), maxWidths[i])).join(' │ ');
        console.log(rowStr);
    });
};
