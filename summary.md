# MNEE CLI - QA Testing Walkthrough

## Project Overview

**MNEE CLI** is a command-line interface tool for managing MNEE USD stablecoin on the Bitcoin SV blockchain. It provides a self-custody wallet solution with secure local key storage, multi-wallet support, and both production and sandbox environments.

**Version:** 1.1.5  
**Target Users:** Individual users, developers, power users  
**Key Technologies:** TypeScript, Node.js, BSV SDK, Commander.js  

---

## Installation & Setup for Testing

### Prerequisites
- Node.js (ES2020+ support required)
- npm package manager
- System keychain access (macOS Keychain, Windows Credential Store, Linux Secret Service)
- Network connectivity for blockchain operations

### Installation Commands
```bash
# Global installation
npm install -g mnee-cli

# Verify installation
mnee

# Development installation (for testing local builds)
npm run build  # Creates mnee-cli-1.1.5.tgz as example
npm i -g file:./mnee-cli-1.1.5.tgz
```

---

## Core Commands & Test Scenarios

### 1. Wallet Creation (`mnee create`)

**Primary Function:** Creates a new wallet with secure key generation

**Test Scenarios:**
- ✅ **Happy Path:** Successfully create wallet in sandbox environment
- ✅ **Happy Path:** Successfully create wallet in production environment
- ⚠️ **Edge Case:** Attempt to create wallet with duplicate name
- ⚠️ **Edge Case:** Create wallet with special characters in name
- ⚠️ **Edge Case:** Create wallet with very long name (>50 characters)
- ❌ **Error Case:** Create wallet without network connectivity
- ❌ **Error Case:** Create wallet with invalid environment selection

**Interactive Prompts to Test:**
1. Environment selection (Production/Sandbox)
2. Wallet name input
3. Password creation and confirmation
4. Password strength validation

**Expected Outputs:**
- Wallet creation confirmation
- Generated wallet address display
- Secure storage of encrypted private key

### 2. Wallet Import (`mnee import`)

**Primary Function:** Import existing wallet using WIF (Wallet Import Format) private key

**Test Scenarios:**
- ✅ **Happy Path:** Import valid WIF private key
- ⚠️ **Edge Case:** Import WIF for wallet with existing name
- ❌ **Error Case:** Import invalid WIF format
- ❌ **Error Case:** Import empty or malformed private key

**Interactive Prompts to Test:**
1. Environment selection
2. Wallet name input
3. WIF private key input (hidden)
4. Password creation for new wallet

### 3. Address Display (`mnee address`)

**Primary Function:** Display the address of the currently active wallet

**Test Scenarios:**
- ✅ **Happy Path:** Display address with active wallet
- ❌ **Error Case:** Display address with no active wallet
- ✅ **Happy Path:** Display address after switching wallets

**Expected Output:** BSV address format (e.g., 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa)

### 4. Balance Check (`mnee balance`)

**Primary Function:** Check MNEE balance for active wallet

**Test Scenarios:**
- ✅ **Happy Path:** Check balance with sufficient funds
- ✅ **Happy Path:** Check balance with zero funds
- ❌ **Error Case:** Check balance with no active wallet
- ❌ **Error Case:** Check balance without network connectivity
- ⚠️ **Edge Case:** Check balance during network timeout

**Expected Output:** MNEE balance in decimal format

### 5. Transfer (`mnee transfer`)

**Primary Function:** Transfer MNEE to another address

**Test Scenarios:**
- ✅ **Happy Path:** Transfer valid amount to valid address
- ✅ **Happy Path:** Transfer minimum amount (0.01 MNEE)
- ⚠️ **Edge Case:** Transfer with insufficient balance
- ❌ **Error Case:** Transfer to invalid address format
- ❌ **Error Case:** Transfer negative amount
- ❌ **Error Case:** Transfer zero amount
- ❌ **Error Case:** Transfer without password authentication

**Interactive Prompts to Test:**
1. Recipient address input and validation
2. Amount input and validation
3. Password authentication
4. Transfer confirmation

**Expected Outputs:**
- Transaction ID upon successful transfer
- Error messages for invalid inputs
- Balance update after transfer

### 6. Transaction History (`mnee history`)

**Primary Function:** View transaction history with caching support

**Test Scenarios:**
- ✅ **Happy Path:** View cached transaction history
- ✅ **Happy Path:** View fresh history with `--fresh` flag
- ✅ **Happy Path:** View unconfirmed transactions with `--unconfirmed` flag
- ⚠️ **Edge Case:** View history with no transactions
- ❌ **Error Case:** View history without network (fresh mode)

**Command Variations:**
```bash
mnee history                    # Cached history
mnee history --fresh           # Fresh fetch from blockchain
mnee history --unconfirmed     # Include unconfirmed transactions
mnee history -f -u             # Combined flags
```

**Expected Outputs:**
- Paginated transaction list
- Transaction IDs, amounts, dates
- Cache status indicators

### 7. Private Key Export (`mnee export`)

**Primary Function:** Export private key in WIF format (high security operation)

**Test Scenarios:**
- ✅ **Happy Path:** Export private key with correct password
- ❌ **Error Case:** Export with incorrect password
- ❌ **Error Case:** Export with no active wallet

**Security Validations:**
- Password authentication required
- Security warnings displayed
- WIF format validation

### 8. Wallet Deletion (`mnee delete <walletName>`)

**Primary Function:** Permanently delete a wallet (irreversible operation)

**Test Scenarios:**
- ✅ **Happy Path:** Delete existing wallet with confirmation
- ⚠️ **Edge Case:** Delete currently active wallet
- ❌ **Error Case:** Delete non-existent wallet
- ❌ **Error Case:** Delete without confirmation

**Security Validations:**
- Wallet existence verification
- Deletion confirmation prompt
- Secure cleanup of stored keys

### 9. Wallet Listing (`mnee list`)

**Primary Function:** List all wallets and switch active wallet

**Test Scenarios:**
- ✅ **Happy Path:** List wallets with multiple wallets
- ✅ **Happy Path:** Switch to different wallet
- ⚠️ **Edge Case:** List wallets with single wallet
- ⚠️ **Edge Case:** List wallets with no wallets

**Interactive Features:**
- Wallet selection interface
- Address truncation display
- Active wallet indication

### 10. Wallet Renaming (`mnee rename <oldName> <newName>`)

**Primary Function:** Rename an existing wallet

**Test Scenarios:**
- ✅ **Happy Path:** Rename existing wallet to unique name
- ❌ **Error Case:** Rename to existing wallet name
- ❌ **Error Case:** Rename non-existent wallet
- ⚠️ **Edge Case:** Rename with special characters

---

## Password Protection Requirements

### Commands Requiring Password Authentication

The following commands **MUST** require password authentication for security:

#### 🔐 **High Security Commands (Always Password Protected)**

**`mnee transfer`**
- **Why:** Transfers funds from wallet
- **When:** Before transaction signing and broadcasting
- **Test:** Verify transaction fails without correct password
- **Expected:** Password prompt before any transfer operation

**`mnee export`**
- **Why:** Exports private key in WIF format
- **When:** Before displaying private key
- **Test:** Verify export fails without correct password
- **Expected:** Password prompt with security warnings

**`mnee delete <walletName>`**
- **Why:** Permanently deletes wallet and keys
- **When:** Before wallet deletion confirmation
- **Test:** Verify deletion fails without correct password
- **Expected:** Password prompt after deletion confirmation

#### 🔓 **Wallet Creation Commands (Password for New Wallet)**

**`mnee create`**
- **Why:** Sets password for new wallet encryption
- **When:** During wallet creation process
- **Test:** Verify strong password requirements
- **Expected:** Password creation and confirmation prompts

**`mnee import`**
- **Why:** Sets password for imported wallet encryption
- **When:** During wallet import process
- **Test:** Verify password is required for wallet encryption
- **Expected:** Password creation prompts after WIF input

#### ✅ **Read-Only Commands (No Password Required)**

**`mnee address`** - Displays wallet address (read-only)
**`mnee balance`** - Shows wallet balance (read-only)
**`mnee history`** - Views transaction history (read-only)
**`mnee list`** - Lists wallets and switches active wallet (read-only)
**`mnee rename`** - Renames wallet (metadata only, no key access)

### Password Security Testing

#### **Password Strength Requirements**
- ✅ Test minimum password length requirements
- ✅ Test password complexity validation
- ❌ Test weak password rejection
- ✅ Test password confirmation matching

#### **Password Authentication Testing**
- ✅ Test correct password acceptance
- ❌ Test incorrect password rejection
- ❌ Test empty password rejection
- ⚠️ Test password retry limits (if implemented)

#### **Password Storage Testing**
- ✅ Verify passwords are not stored in plain text
- ✅ Confirm password is only used for encryption/decryption
- ❌ Verify password cannot be recovered (only reset by reimport)

### Security Validation Checklist

- [ ] **Transfer operations require password before signing**
- [ ] **Private key export requires password and shows warnings**
- [ ] **Wallet deletion requires password after confirmation**
- [ ] **New wallet creation enforces password requirements**
- [ ] **Wallet import requires password for encryption**
- [ ] **Read-only operations never prompt for password**
- [ ] **Incorrect passwords are properly rejected**
- [ ] **Password prompts are secure (hidden input)**

---

## Environment Testing

### Sandbox Environment
**Purpose:** Testing and development  
**Test Focus:**
- All commands function without affecting production funds
- Environment isolation verification
- Safe testing of error scenarios

### Production Environment
**Purpose:** Real MNEE transactions  
**Test Focus:**
- Real balance and transfer operations
- Security validations in live environment
- Performance under real network conditions

---

## Security Testing

### Key Storage Security
- ✅ Verify encrypted storage in system keychain
- ✅ Confirm password protection for sensitive operations
- ✅ Test password strength requirements
- ❌ Attempt unauthorized key access

### Transaction Security
- ✅ Password authentication for transfers
- ✅ Amount and address validation
- ✅ Transaction confirmation prompts
- ❌ Attempt transaction without authentication

### Environment Isolation
- ✅ Verify sandbox transactions don't affect production
- ✅ Confirm environment switching works correctly
- ⚠️ Test mixed environment scenarios

---

## Performance Testing

### Caching System
- ✅ Test transaction history caching performance
- ✅ Verify cache invalidation with `--fresh` flag
- ✅ Test cache behavior with multiple wallets

### Network Operations
- ⚠️ Test timeout handling during network delays
- ⚠️ Test behavior with intermittent connectivity
- ❌ Test offline mode limitations

---

## Error Handling Testing

### Network Errors
- ❌ No internet connection
- ❌ API service unavailable
- ⚠️ Slow network responses
- ⚠️ Partial data retrieval

### User Input Errors
- ❌ Invalid wallet names
- ❌ Malformed addresses
- ❌ Invalid amounts
- ❌ Wrong passwords

### System Errors
- ❌ Keychain access denied
- ❌ Insufficient disk space
- ❌ Permission errors

---

## Multi-Wallet Testing

### Wallet Management
- ✅ Create multiple wallets
- ✅ Switch between wallets
- ✅ Verify wallet isolation
- ✅ Test wallet-specific caching

### Cross-Wallet Operations
- ✅ Transfer between own wallets
- ✅ Verify balance separation
- ✅ Test history isolation

---

## Data Validation Testing

### Address Validation
- ✅ Valid BSV address formats
- ❌ Invalid address formats
- ❌ Empty addresses
- ❌ Addresses from other networks

### Amount Validation
- ✅ Valid decimal amounts
- ✅ Minimum transferable amounts
- ❌ Negative amounts
- ❌ Non-numeric inputs
- ❌ Amounts exceeding balance

### Wallet Name Validation
- ✅ Alphanumeric names
- ⚠️ Special characters
- ❌ Empty names
- ❌ Extremely long names

---

## Integration Testing

### MNEE SDK Integration
- ✅ Balance retrieval accuracy
- ✅ Transaction broadcasting
- ✅ History synchronization

### System Keychain Integration
- ✅ macOS Keychain (macOS)
- ✅ Windows Credential Store (Windows)
- ✅ Linux Secret Service (Linux)

### External API Integration
- ✅ MNEE Cosigner API
- ✅ MNEE Proxy API
- ✅ Gorilla Pool API

---

## Regression Testing Checklist

### Core Functionality
- [ ] Wallet creation and import
- [ ] Balance and transfer operations
- [ ] Transaction history
- [ ] Multi-wallet management

### Security Features
- [ ] Password protection
- [ ] Key encryption
- [ ] Environment isolation

### Performance Features
- [ ] Caching system
- [ ] Network timeout handling
- [ ] Error recovery

---

## Known Limitations (Test Accordingly)

❌ **Single-Signature Only** - No multi-signature support  
❌ **No Batch Transfers** - Single recipient only  
❌ **Limited Error Handling** - Basic error messages  
❌ **No Address Book** - No contact management  
❌ **No Hardware Wallet Support** - Software keys only  

---

## Test Data Requirements

### Test Wallets
- Sandbox environment wallets with test funds
- Production environment wallets (minimal funds for testing)
- Invalid WIF keys for error testing

### Test Addresses
- Valid BSV addresses for transfer testing
- Invalid address formats for validation testing
- Own wallet addresses for self-transfer testing

### Test Amounts
- Valid amounts within balance limits
- Edge case amounts (minimum, maximum)
- Invalid amounts for error testing

---

## Reporting & Documentation

### Test Results Documentation
- Command execution results
- Error message accuracy
- Performance metrics
- Security validation results

### Bug Reporting Format
- Command executed
- Expected behavior
- Actual behavior
- Environment details
- Reproduction steps

---

## Final QA Sign-off Criteria

✅ **All core commands execute successfully**  
✅ **Security measures function correctly**  
✅ **Error handling provides clear feedback**  
✅ **Multi-wallet operations work reliably**  
✅ **Environment isolation is maintained**  
✅ **Performance meets acceptable standards**  
✅ **Integration with external services is stable**  

---

*This walkthrough covers the complete testing scope for MNEE CLI v1.1.5. All test scenarios should be executed in both sandbox and production environments where applicable, with emphasis on security and data integrity validation.* 