# MNEE CLI - Current Scope Document

## Purpose

This document summarizes the current capabilities and scope of the MNEE CLI, a command-line interface tool designed for interacting with MNEE USD (BSV-20 stablecoin) on the Bitcoin SV blockchain. This documentation is designed to align stakeholders on the existing functionality before proceeding to future enhancements, integrations, and development roadmap planning.

**Objective:**

Provide a user-friendly command-line interface that enables individuals to manage self-custody wallets and seamlessly interact with MNEE USD functionality — supporting wallet creation, balance queries, transfers, transaction history, and secure key management without requiring deep blockchain knowledge.

⚠ **Important:** The CLI is currently in active development (v1.1.0) and relies on the MNEE TypeScript SDK (v2.0.0) for core blockchain operations. While functional, it should be considered for personal and development use until comprehensive testing and security auditing are completed.

---

## What Is the MNEE CLI?

The MNEE CLI is a comprehensive command-line application that provides a self-custody wallet solution for MNEE USD stablecoin operations. It abstracts the complexity of BSV-20 token interactions while providing secure local key storage and management capabilities.

✅ **Self-custody wallet** — Complete control over private keys with local encrypted storage  
✅ **Multi-wallet support** — Create, manage, and switch between multiple named wallets  
✅ **Dual environment support** — Seamless switching between production and sandbox environments  
✅ **Secure key management** — AES-256-CBC encryption with password protection using system keychain  
✅ **Transaction history caching** — Local caching with fresh fetch capabilities for improved performance  
✅ **Legacy wallet migration** — Automatic migration from older wallet formats  

---

## Core Capabilities

**Wallet Management**
- Create new wallets with secure random key generation
- Import existing wallets using WIF (Wallet Import Format) private keys
- Multiple wallet support with named identification
- Active wallet switching and management
- Secure wallet deletion with password confirmation
- Wallet renaming functionality

**Security & Key Storage**
- AES-256-CBC encryption for private key storage
- System keychain integration via `keytar` library
- Password-protected wallet operations
- Secure private key export functionality
- Legacy wallet migration with security validation

**Balance Operations**
- Real-time balance queries for active wallet
- Environment-specific balance checking (production/sandbox)
- Integration with MNEE SDK for accurate UTXO-based calculations

**Transaction Operations**
- Single-recipient transfers with amount specification
- Password-protected transaction signing
- Environment-aware transaction processing
- Transaction ID reporting for successful transfers

**History & Analytics**
- Paginated transaction history retrieval
- Local caching system for improved performance
- Fresh history fetching with cache clearing
- Unconfirmed transaction filtering
- Automatic cache management with wallet-specific storage

---

## Technical Architecture

**Command-Line Interface** → Built with Commander.js for robust CLI argument parsing and command structure

**Secure Key Storage** → Integration with system keychain via `keytar` for encrypted private key storage

**MNEE SDK Integration** → Leverages MNEE TypeScript SDK (v2.0.0) for all blockchain operations

**Multi-Environment Support** → Production and sandbox environment configuration with automatic endpoint switching

**Local Caching System** → File-based transaction history caching in user home directory (`~/.mnee-cli/cache/`)

**Encryption Layer** → AES-256-CBC encryption with SHA-256 password hashing for private key protection

**BSV SDK Integration** → Uses `@bsv/sdk` (v1.3.28) for Bitcoin SV private key and address operations

---

## Current CLI Interface

```bash
# Core wallet commands
mnee create                    # Create a new wallet
mnee import                    # Import wallet from WIF private key
mnee delete <walletName>       # Delete a wallet
mnee list                      # List and switch between wallets
mnee rename <old> <new>        # Rename a wallet

# Wallet operations
mnee address                   # Display active wallet address
mnee balance                   # Check MNEE balance
mnee transfer                  # Transfer MNEE to another address
mnee export                    # Export private key in WIF format

# Transaction history
mnee history                   # View transaction history
mnee history --unconfirmed     # Show unconfirmed transactions
mnee history --fresh           # Clear cache and fetch fresh history
```

**Interactive Features:**
- Environment selection (production/sandbox) during wallet creation
- Password confirmation for security operations
- Wallet switching interface with address truncation
- Transfer confirmation with amount and recipient validation
- Private key export with security warnings

---

## Integration Patterns

**Development Workflow** → Local development with sandbox environment for testing before production use

**Self-Custody Management** → Complete user control over private keys with secure local storage

**Multi-Wallet Operations** → Support for multiple wallets per user with easy switching capabilities

**Secure Operations** → Password-protected sensitive operations (transfers, exports, deletions)

**Performance Optimization** → Local caching for transaction history to reduce API calls and improve response times

---

## Current Limitations & Considerations

❌ **Single-Signature Only** — Currently supports single-signature transactions only (no multi-sig capabilities)  
❌ **Limited Error Handling** — Basic error responses; enhanced error categorization and recovery guidance needed  
❌ **No Batch Transfers** — Single recipient transfers only; no multi-recipient transaction support  
❌ **Basic Transaction Validation** — Limited pre-flight validation before transaction submission  
❌ **No Address Book** — No contact/address management system for frequently used addresses  
❌ **Limited Analytics** — Basic transaction history display; no advanced reporting or analytics features  
❌ **No Hardware Wallet Support** — Software-only key management; no hardware wallet integration  

---

## Technical Dependencies

**Core Dependencies:**
- `mnee` (v2.0.0) - MNEE TypeScript SDK for blockchain operations
- `@bsv/sdk` (v1.3.28) - Bitcoin SV SDK for cryptographic operations
- `commander` (v13.1.0) - CLI framework and argument parsing
- `inquirer` (v12.4.2) - Interactive command-line prompts
- `keytar` (v7.9.0) - System keychain integration for secure storage
- `axios` (v1.8.1) - HTTP client for API communications
- `js-1sat-ord` (v0.1.80) - Ordinal inscription handling

**Environment Requirements:**
- Node.js with ES modules support (ES2020 target)
- TypeScript compilation support
- System keychain access (macOS Keychain, Windows Credential Store, Linux Secret Service)
- Network connectivity for blockchain operations

**External Services:**
- MNEE Cosigner API (production/sandbox environments)
- MNEE Proxy API for UTXO and configuration data
- Gorilla Pool API for transaction broadcasting

---

## Current Business Model Support

**Individual Users** → Self-custody wallet solution for personal MNEE USD management

**Developers** → Command-line tool for development and testing workflows with sandbox environment

**Power Users** → Advanced features like multiple wallets, history caching, and secure key management

**Educational Use** → Learning tool for understanding BSV-20 token operations and self-custody principles

---

## Security & Compliance Features

**Local Key Storage** → Private keys never leave the user's device; stored encrypted in system keychain

**Password Protection** → All sensitive operations require password authentication

**Secure Encryption** → AES-256-CBC encryption with SHA-256 password hashing

**Environment Isolation** → Separate production and sandbox environments prevent accidental mainnet operations

**Audit Trail** → Transaction history tracking with local caching for record keeping

**Secure Export** → Private key export with explicit user confirmation and security warnings

---

## Current Status & Next Steps

✅ **Core Functionality Complete** — All primary CLI operations implemented and functional  
✅ **Multi-Wallet Support** — Complete wallet management system with secure storage  
✅ **Environment Support** — Production and sandbox environments operational  
✅ **NPM Distribution** — Package available via npm for global installation  
✅ **Legacy Migration** — Automatic migration from older wallet formats  

**Pending Items:**
🔄 **Enhanced Error Handling** — Improved error messages and recovery guidance  
🔄 **Input Validation** — Enhanced validation for addresses, amounts, and wallet names  
🔄 **Performance Optimization** — Caching improvements and API call optimization  

**Future Considerations:**
📋 **Multi-Recipient Transfers** — Support for batch transfers to multiple addresses  
📋 **Address Book Management** — Contact system for frequently used addresses  
📋 **Hardware Wallet Integration** — Support for hardware wallet devices  
📋 **Advanced Analytics** — Enhanced transaction reporting and analytics  
📋 **Configuration Management** — User-configurable settings and preferences  
📋 **Backup & Recovery** — Wallet backup and recovery mechanisms  
📋 **Multi-Signature Support** — Enterprise-grade multi-signature capabilities  

---

## Installation & Usage Examples

**Global Installation:**
```bash
npm install -g mnee-cli
```

**Basic Wallet Creation:**
```bash
mnee create
# Interactive prompts for environment, wallet name, and password
```

**Balance Check:**
```bash
mnee balance
# Displays current MNEE balance for active wallet
```

**Transfer Operation:**
```bash
mnee transfer
# Interactive prompts for amount, recipient, and password
```

**History Management:**
```bash
mnee history                    # Cached history
mnee history --fresh           # Fresh fetch from blockchain
mnee history --unconfirmed     # Include unconfirmed transactions
```

**Wallet Management:**
```bash
mnee list                      # List all wallets and switch active
mnee import                    # Import from WIF private key
mnee export                    # Export WIF private key (with warnings)
```

---

## API Surface (via MNEE SDK Integration)

The CLI leverages the MNEE TypeScript SDK for all blockchain operations:

```typescript
// Core operations used by CLI
interface MneeSDKUsage {
  // Balance operations
  balance(address: string): Promise<MNEEBalance>;
  
  // Transfer operations
  transfer(request: SendMNEE[], wif: string): Promise<TransferResponse>;
  
  // History operations
  recentTxHistory(address: string, fromScore?: number, limit?: number): Promise<TxHistoryResponse>;
}
```

**CLI-Specific Enhancements:**
- Wallet management layer with secure key storage
- Interactive command-line interface with user prompts
- Local caching system for improved performance
- Multi-environment configuration management
- Password-protected operations with encryption

---

This scope document reflects the current state of the MNEE CLI as a functional, self-custody wallet solution with comprehensive wallet management capabilities, secure key storage, and integration with the MNEE ecosystem for BSV-20 stablecoin operations. 