import keytar from "keytar";

export interface SingleLineLogger {
  start: (message: string) => void;
  update: (message: string) => void;
  done: (message: string) => void;
}

export const singleLineLogger: SingleLineLogger = (() => {
  let spinnerInterval: NodeJS.Timeout | null = null;
  const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let frameIndex = 0;
  let currentMessage = ""; // Store the latest message

  const render = () => {
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    process.stdout.write(`${spinnerFrames[frameIndex]} ${currentMessage}`);
    frameIndex = (frameIndex + 1) % spinnerFrames.length;
  };

  return {
    start: (message: string) => {
      currentMessage = message;
      if (spinnerInterval) clearInterval(spinnerInterval);
      spinnerInterval = setInterval(render, 100);
    },
    update: (message: string) => {
      currentMessage = message;
    },
    done: (message: string) => {
      if (spinnerInterval) {
        clearInterval(spinnerInterval);
        spinnerInterval = null;
      }
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      console.log(message);
    },
  };
})();


export type WalletEnvironment = 'production' | 'sandbox';
export type WalletInfo = {
  address: string;
  environment: WalletEnvironment;
  name: string;
  isActive: boolean;
};

export const SERVICE_NAME = "mnee-cli";
export const WALLETS_KEY = "wallets";
export const ACTIVE_WALLET_KEY = "activeWallet";

export const getAllWallets = async (): Promise<WalletInfo[]> => {
  const walletsJson = await keytar.getPassword(SERVICE_NAME, WALLETS_KEY);
  return walletsJson ? JSON.parse(walletsJson) : [];
};

export const saveWallets = async (wallets: WalletInfo[]): Promise<void> => {
  await keytar.setPassword(SERVICE_NAME, WALLETS_KEY, JSON.stringify(wallets));
};

export const getActiveWallet = async (): Promise<WalletInfo | null> => {
  const activeWalletJson = await keytar.getPassword(SERVICE_NAME, ACTIVE_WALLET_KEY);
  return activeWalletJson ? JSON.parse(activeWalletJson) : null;
};

export const setActiveWallet = async (wallet: WalletInfo): Promise<void> => {
  await keytar.setPassword(SERVICE_NAME, ACTIVE_WALLET_KEY, JSON.stringify(wallet));
};
