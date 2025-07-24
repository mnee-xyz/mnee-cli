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

**Note:** Linux systems are not officially supported at this time due to keychain dependencies. However, users may be able to get it working with the following steps:

#### Possible Solutions for Linux Users:

1. **Desktop Environment with Keyring Service**
   
   The CLI requires a desktop environment with a keyring service (like GNOME Keyring or KDE Wallet) for secure credential storage.

   **Ubuntu/Debian:**
   ```sh
   sudo apt-get install libsecret-1-dev gnome-keyring
   npm install -g mnee-cli
   ```

   **Fedora/RHEL:**
   ```sh
   sudo dnf install libsecret-devel gnome-keyring
   npm install -g mnee-cli
   ```

   **Arch Linux:**
   ```sh
   sudo pacman -S libsecret gnome-keyring
   npm install -g mnee-cli
   ```

2. **For Headless/Server Environments**
   
   If running on a server without a desktop environment, you may need to:
   - Set up D-Bus: `dbus-launch`
   - Initialize a keyring daemon manually
   - Consider using a Docker container with a desktop environment

3. **Alternative Approach**
   
   Consider running the CLI on Windows or macOS where it is fully supported, or use WSL2 on Windows with a desktop environment configured.

**Important:** Even with these workarounds, you may encounter issues with credential storage on Linux systems. Full Linux support may be added in future versions.

## Usage

After installing, you can use the `mnee` command in your terminal:

```sh
mnee
```

## Commands

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

## Contributing

Contributions are welcome! Please fork the repository and submit a pull request.

## License

This project is licensed under the ISC License.
