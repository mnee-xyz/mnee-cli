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

To install MNEE CLI globally using npm, run the following command:

```sh
npm install -g mnee-cli
```

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
