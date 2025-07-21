# MNEE CLI

MNEE CLI is a command-line interface tool designed for interacting with MNEE USD.

## Features

- Self custody wallet
- Securely store keys
- User friendly
- Support for multiple wallets
- Production and sandbox environments
- Transaction history tracking

## Installation

### Windows & macOS

```sh
npm install -g mnee-cli
```

### Linux

First install required system dependencies:

**Ubuntu/Debian:**
```sh
sudo apt-get install libsecret-1-dev
npm install -g mnee-cli
```

**Fedora/RHEL:**
```sh
sudo dnf install libsecret-devel
npm install -g mnee-cli
```

**Arch Linux:**
```sh
sudo pacman -S libsecret
npm install -g mnee-cli
```

**Note:** Linux systems require `libsecret` for secure credential storage. A desktop environment with a keyring service (like GNOME Keyring) should be running.

## Usage

After installing, you can use the `mnee` command in your terminal:

```sh
mnee
```

## Commands

### Wallet Management
- `mnee create`: Create a new wallet
- `mnee address`: Get your wallet address
- `mnee balance`: Check your MNEE balance
- `mnee transfer`: Transfer MNEE to another address
- `mnee export`: Decrypt and retrieve your private key in WIF format
- `mnee delete <walletName>`: Delete a wallet
- `mnee list`: List all your wallets and optionally switch to a different wallet
- `mnee rename <oldName> <newName>`: Rename a wallet
- `mnee import`: Import an existing wallet using a WIF private key
- `mnee history`: View transaction history
  - `-u, --unconfirmed`: Show unconfirmed transactions
  - `-f, --fresh`: Clear cache and fetch fresh history from the beginning

### Authentication & Developer Portal
- `mnee login`: Authenticate with MNEE Developer Portal
- `mnee logout`: Sign out from MNEE Developer Portal
- `mnee whoami`: Show current authenticated user information
- `mnee faucet`: Request sandbox tokens (requires authentication)
  - `-a, --address <address>`: Deposit address (defaults to active wallet)
  - Note: Only available in sandbox mode

## Contributing

Contributions are welcome! Please fork the repository and submit a pull request.

## License

This project is licensed under the ISC License.
