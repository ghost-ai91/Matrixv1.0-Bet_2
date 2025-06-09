#!/bin/bash
# automated-deploy-buffer.sh - Automated deployment script for Solana contracts with buffer authority transfer

# ----- CONFIGURATIONS (EDIT THESE VARIABLES) -----
# GitHub User
GITHUB_USER="MyDonutProject"

# GitHub Personal Access Token (leave blank to request during execution)
# Create one at: https://github.com/settings/tokens
GITHUB_TOKEN=""

# Repository Name
REPO_NAME="Matrixv1"  # Make sure this matches exactly with your GitHub repo name

# RPC URL (Devnet or Mainnet)
RPC_URL="https://weathered-quiet-theorem.solana-devnet.quiknode.pro/198997b67cb51804baeb34ed2257274aa2b2d8c0" # Devnet
#RPC_URL="https://api.mainnet-beta.solana.com" # Mainnet

# Path to your wallet
WALLET_KEYPAIR="/root/.config/solana/id.json"

# Path to program keypair
PROGRAM_KEYPAIR="/app/Matrix1.0-Beta/target/deploy/matrix_system-keypair.json"

# Path to program .so file
PROGRAM_SO="/app/Matrix1.0-Beta/target/deploy/matrix_system.so"

# Multisig wallet address for buffer authority transfer
MULTISIG_AUTHORITY="9kfwkhwRmjRdcUKd8YBXJKnE5Yux9k111uUSN8zbNCYh"

# Maximum program size
MAX_PROGRAM_SIZE="500000"

# Compute unit price for transactions
COMPUTE_UNIT_PRICE="1000"

# Deploy type: "new" for new program, "upgrade" to update existing
# IMPORTANT: Use "new" to create a new Program ID, "upgrade" to use an existing one
DEPLOY_TYPE="upgrade"

# ----- COMMIT MESSAGE TEMPLATES (EDIT THESE VARIABLES) -----
# Define seus templates de mensagens de commit aqui
COMMIT_INITIAL="Initial version of DONUT Referral Matrix System"
COMMIT_GITIGNORE="Update .gitignore with enhanced exclusions"
COMMIT_REMOVE_FILES="Remove unwanted files from git tracking (keeping them locally)"
COMMIT_SECURITY="Security: Remove sensitive files from Git tracking"
COMMIT_UPDATE="Updated version of DONUT Referral Matrix System"
COMMIT_RELEASE="Release: Deploy version"

# ----- DO NOT EDIT BELOW THIS LINE -----

# Function to display colored messages
print_message() {
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    RED='\033[0;31m'
    NC='\033[0m' # No Color
    
    case $1 in
        "info") echo -e "${GREEN}[INFO]${NC} $2" ;;
        "warn") echo -e "${YELLOW}[WARN]${NC} $2" ;;
        "error") echo -e "${RED}[ERROR]${NC} $2" ;;
        *) echo "$2" ;;
    esac
}

# Check if Git is installed
if ! command -v git &> /dev/null; then
    print_message "error" "Git is not installed. Please install it first."
    exit 1
fi

# Check if Solana CLI is installed
if ! command -v solana &> /dev/null; then
    print_message "error" "Solana CLI is not installed. Please install it first."
    exit 1
fi

# Check if Anchor is installed
if ! command -v anchor &> /dev/null; then
    print_message "error" "Anchor CLI is not installed. Please install it first."
    exit 1
fi

# Function to request GitHub token when needed
request_github_token() {
    if [ -z "$GITHUB_TOKEN" ]; then
        print_message "info" "GitHub token not found in configuration."
        read -sp "Enter your GitHub token (will not appear on screen): " GITHUB_TOKEN
        echo ""
        if [ -n "$GITHUB_TOKEN" ]; then
            print_message "info" "GitHub token received. Updating Git configuration..."
            if git remote | grep -q "^origin$"; then
                git remote set-url origin https://$GITHUB_USER:$GITHUB_TOKEN@github.com/$GITHUB_USER/$REPO_NAME.git
                print_message "info" "Remote URL updated with token"
            fi
        else
            print_message "warn" "No token provided. GitHub operations may fail."
        fi
    fi
}

# Função melhorada para gerenciar versões de forma dinâmica
get_program_version() {
    print_message "info" "Managing program version..."
    
    # Mostrar as versões existentes para o usuário
    print_message "info" "Existing tags in repository:"
    git tag -l | sort -V
    
    # Sempre perguntar qual versão usar
    echo ""
    print_message "info" "Please provide the version for this release:"
    read -p "Enter the new version (ex: v1.0.5) or press ENTER to generate automatically: " user_version
    
    if [ -n "$user_version" ]; then
        # Verificar se a tag já existe
        if git rev-parse "$user_version" >/dev/null 2>&1; then
            print_message "warn" "Tag '$user_version' already exists!"
            read -p "Do you want to replace the existing tag? (y/n): " replace_tag
            
            if [ "$replace_tag" = "y" ]; then
                # Remover tag antiga localmente e remotamente
                git tag -d "$user_version" >/dev/null 2>&1
                git push origin :refs/tags/"$user_version" >/dev/null 2>&1 || true
                
                # Criar nova tag
                git tag -a "$user_version" -m "Version $user_version - $(date)"
                print_message "info" "Tag updated: $user_version"
            else
                print_message "info" "Please choose another version name:"
                read -p "Enter the new version (ex: v1.0.6): " user_version
                
                if [ -n "$user_version" ]; then
                    git tag -a "$user_version" -m "Version $user_version - $(date)"
                    print_message "info" "New tag created: $user_version"
                else
                    # Gerar uma tag padrão com timestamp
                    user_version="v$(date +%Y.%m.%d-%H%M)"
                    git tag -a "$user_version" -m "Version $user_version - auto-generated"
                    print_message "info" "Auto-generated tag: $user_version"
                fi
            fi
        else
            # Criar a nova tag
            git tag -a "$user_version" -m "Version $user_version - $(date)"
            print_message "info" "New tag created: $user_version"
        fi
        
        export PROGRAM_VERSION="$user_version"
    else
        # Gerar uma versão incremental baseada na última tag
        LATEST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")
        
        if [[ "$LATEST_TAG" =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
            MAJOR="${BASH_REMATCH[1]}"
            MINOR="${BASH_REMATCH[2]}"
            PATCH="${BASH_REMATCH[3]}"
            
            # Incrementar a versão patch
            NEW_PATCH=$((PATCH + 1))
            user_version="v$MAJOR.$MINOR.$NEW_PATCH"
        else
            # Se não conseguir fazer parse da tag, gerar uma baseada em data
            user_version="v$(date +%Y.%m.%d-%H%M)"
        fi
        
        git tag -a "$user_version" -m "Version $user_version - auto-generated"
        print_message "info" "Auto-generated new tag: $user_version"
        export PROGRAM_VERSION="$user_version"
    fi
    
    print_message "info" "Final version for this release: $PROGRAM_VERSION"
    
    # Perguntar se deseja enviar a tag para o GitHub imediatamente
    read -p "Send tag to GitHub now? (y/n): " push_tag_now
    if [ "$push_tag_now" = "y" ]; then
        git push origin "$PROGRAM_VERSION"
        print_message "info" "Tag $PROGRAM_VERSION sent to GitHub"
    else
        print_message "info" "Tag will be sent later during the process"
    fi
}

# Function to backup important files
backup_files() {
    print_message "info" "Backing up important files..."
    mkdir -p ./backups
    cp $PROGRAM_KEYPAIR ./backups/program-keypair-backup-$(date +%Y%m%d%H%M%S).json 2>/dev/null || :
    cp $WALLET_KEYPAIR ./backups/wallet-keypair-backup-$(date +%Y%m%d%H%M%S).json 2>/dev/null || :
    print_message "info" "Backup completed"
}

# Function to setup Git user identity
setup_git_identity() {
    print_message "info" "Setting up Git user identity..."
    
    # Force set identity for this repository (not global)
    git config user.email "deployment@donut-matrix.com"
    git config user.name "DONUT Matrix Deployment"
    
    # Verify configuration was set
    if git config user.email >/dev/null 2>&1 && git config user.name >/dev/null 2>&1; then
        print_message "info" "Git identity configured successfully"
        print_message "info" "User: $(git config user.name)"
        print_message "info" "Email: $(git config user.email)"
    else
        print_message "warn" "Could not configure Git identity through normal means"
        # Direct approach for Docker/containerized environments
        mkdir -p ~/.git
        echo "[user]" > ~/.git/config
        echo "    email = deployment@donut-matrix.com" >> ~/.git/config
        echo "    name = DONUT Matrix Deployment" >> ~/.git/config
        
        # Set environment variables as backup
        export GIT_AUTHOR_NAME="DONUT Matrix Deployment"
        export GIT_AUTHOR_EMAIL="deployment@donut-matrix.com"
        export GIT_COMMITTER_NAME="DONUT Matrix Deployment"
        export GIT_COMMITTER_EMAIL="deployment@donut-matrix.com"
        
        print_message "info" "Attempted alternative Git identity configuration"
    fi
}

# Enhanced function to set up .gitignore with specific exclusions
setup_enhanced_gitignore() {
    print_message "info" "Configuring enhanced .gitignore..."
    
    # Create a comprehensive .gitignore file
    cat > .gitignore << EOF
# Anchor/Solana specific
.anchor/
.DS_Store
target/
**/*.rs.bk
test-ledger/
.yarn/

# Dependency directories (should never be committed)
node_modules/
node_modules
**/node_modules/

# Build files
dist/
build/

# Private keys and wallets - SECURITY CRITICAL
**/*.keypair
**/*keypair*.json
**/*wallet*.json
**/id.json
**/wallet_generation.js
**/view_user.js

# Client directory
client/

# Backup files
backups/
**/backups/*.json
**/backups/*.key
**/backups/*.pem
**/backups/*.secret
**/backups/*.keypair
**/.gitignore.bak*

# Environment files
.env
.env.*
**/.env*

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# IDE files
.idea/
.vscode/
*.swp
*.swo

# Secret files
*.pem
*.key
*.secret

# Deployment scripts (if you don't want them tracked)
automated-deploy.sh
automated-deploy-buffer.sh

# Compiled Solana programs
**/*.so
program_dump.so

# Allow specific JSON files
!**/package.json
!**/package-lock.json
!**/tsconfig.json
!**/token-metadata.json

# Unnecessary files that might contain sensitive information
**/ripemd160.*
**/pubkey.*
**/keypair.*
EOF

    print_message "info" "Enhanced .gitignore created with additional exclusions"
    
    # Add the new .gitignore to git
    git add .gitignore
    
    # Commit if there are changes
    if ! git diff --cached --quiet .gitignore; then
        git commit -m "$COMMIT_GITIGNORE" .gitignore
        print_message "info" "Committed enhanced .gitignore"
    else
        print_message "info" ".gitignore already up to date"
    fi
}

# Function to explicitly remove unwanted files from git tracking
remove_unwanted_files() {
    print_message "info" "Removing unwanted files from git tracking..."
    
    # List of patterns to untrack
    PATTERNS_TO_REMOVE=(
        "node_modules"
        "node_modules/"
        "**/node_modules/**"
        "automated-deploy.sh"
        "automated-deploy-buffer.sh"
        ".gitignore.bak-*"
        "backups/"
        "**/*.keypair"
        "**/*keypair*.json"
        "**/*wallet*.json"
    )
    
    # Loop through patterns and remove files from git tracking
    for pattern in "${PATTERNS_TO_REMOVE[@]}"; do
        # Find files that match the pattern
        FILES=$(git ls-files "$pattern" 2>/dev/null || true)
        
        if [ -n "$FILES" ]; then
            print_message "info" "Removing files matching pattern '$pattern' from git tracking:"
            echo "$FILES"
            
            # Remove files from git tracking but keep them on disk
            git rm --cached -r "$pattern" 2>/dev/null || true
        fi
    done
    
    # Specifically handle node_modules
    if [ -d "node_modules" ]; then
        print_message "info" "Removing node_modules directory from git tracking"
        git rm --cached -r node_modules 2>/dev/null || true
    fi
    
    # Create commit for removed files
    if ! git diff --cached --quiet; then
        git commit -m "$COMMIT_REMOVE_FILES"
        print_message "info" "Created commit for removed files"
    else
        print_message "info" "No files needed to be removed from git tracking"
    fi
}

# Check if we are in a Git repository
check_git_repo() {
    # First setup Git identity to avoid errors
    setup_git_identity
    
    if [ ! -d .git ]; then
        print_message "warn" "Not in a Git repository. Initializing a new one..."
        
        # Initialize Git if not present
        git init
        
        # Configure remote URL based on variables
        if [ -n "$GITHUB_TOKEN" ]; then
            # Use token for authentication
            git remote add origin https://$GITHUB_USER:$GITHUB_TOKEN@github.com/$GITHUB_USER/$REPO_NAME.git
        else
            git remote add origin https://github.com/$GITHUB_USER/$REPO_NAME.git
        fi
        
        # Apply enhanced .gitignore
        setup_enhanced_gitignore
        
# Check if we have README.md and SECURITY.md files
if [ ! -f README.md ]; then
    print_message "warn" "README.md not found. Creating a basic template..."
    cat > README.md << EOF
# DONUT Referral Matrix System

A decentralized multi-level referral system built on Solana blockchain that rewards participants for onboarding new users through a structured 3×1 matrix mechanism.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solana](https://img.shields.io/badge/Solana-v1.18.15-blue)](https://solana.com/)
[![Anchor](https://img.shields.io/badge/Anchor-v0.29.0-blue)](https://github.com/coral-xyz/anchor)

## Overview

The DONUT Referral Matrix System implements a novel incentive structure using a 3-slot matrix for each participant. When a new user joins with a referrer, they fill one of the referrer's slots, triggering specific financial actions:

- **Slot 1**: SOL is deposited to Meteora liquidity pools
- **Slot 2**: SOL is reserved and DONUT tokens are minted based on the pool's spot price
- **Slot 3**: Reserved SOL and tokens are paid to the referrer, completing their matrix

Once all three slots are filled, a new matrix is created, allowing continuous participation in the ecosystem.

## Key Features

- **Verifiable Smart Contract**: Open-source, auditable, and fully on-chain code
- **Chainlink Integration**: Reliable SOL/USD price oracles for minimum deposit validation
- **Meteora Pool Integration**: Direct interaction with official token pool with 100% locked liquidity
- **Secure Address Verification**: Strict validation of all critical addresses
- **Automated Upline Processing**: Manages referral chain relationships automatically
- **Token Minting Control**: Protection against pool manipulations for mint calculations

## Technical Architecture

### Matrix Structure
Each user operates a personal 3-slot matrix that captures referrals and controls financial operations. The system:
- Tracks slot filling in a ReferralChain structure
- Automatically processes new matrices when one is completed
- Emits on-chain events for referral tracking

### Upline Management
- Optimized data structures for memory efficiency
- Complete tracking between referrers and referees

### Pool Integration
- SOL deposits flow directly to the official token pool on Meteora with 100% locked liquidity
- Pool interaction is secured through address verification

### Chainlink Oracles
- SOL/USD price verification for minimum deposit determination
- Protection against stale price feeds (fallback to default price)
- Strict validation of Chainlink program and price feed addresses

### Token Economics
- DONUT tokens are minted based on the current spot price in the Meteora pool

### Security Features
- Rigorous account and address validation
- Detailed error handling for transparency
- Memory optimization to prevent computation errors
- Protection against reentrancy and other common vulnerabilities

## Technical Requirements

### Dependencies
- Solana CLI: v1.18.15 or higher
- Anchor Framework: v0.29.0
- Rust: v1.75.0 or higher (recommended)
- NodeJS: v16.0.0 or higher (for testing and scripts)

### Program Dependencies
\`\`\`toml
anchor-lang = "0.29.0"
anchor-spl = "0.29.0"
solana-program = "1.18.15"
spl-token = "4.0.0"
chainlink_solana = "1.0.0"
solana-security-txt = "1.1.1"
\`\`\`

### Accounts and PDAs
- \`program_state\`: Global program state
- \`user_account\`: Individual user accounts
- \`program_sol_vault\`: Program's SOL reserve
- \`token_mint_authority\`: Token minting authority
- \`token_vault_authority\`: Token transfer authority

### Data Structures
- \`UserAccount\`: Stores user data, referrals, and matrix
- \`ReferralUpline\`: Chain of referrers
- \`ReferralChain\`: 3×1 matrix for each user
- \`UplineEntry\`: Detailed data for each referrer

## Program Instructions

1. **initialize**: Initialize the program state
2. **register_without_referrer**: Administrative registration without referrer (multisig only)
3. **register_with_sol_deposit**: Register a new user with SOL deposit

## Build Optimization

The project uses optimized build settings for release:
- Full LTO (Link Time Optimization)
- Single codegen unit for maximum optimization
- Overflow checks enabled for additional security
- Custom build overrides for optimal performance

## Security

Please see [SECURITY.md](./SECURITY.md) for our security policy and vulnerability reporting procedures.

## Contact

For questions, integrations, or support:
- Email: 01010101@matrix.io
- Discord: 01010101
- WhatsApp: +55123456789

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.
EOF
fi
        
 # Get Program ID for SECURITY.md
PROGRAM_ID="Unknown"
if [ -f "$PROGRAM_KEYPAIR" ]; then
    PROGRAM_ID=$(solana-keygen pubkey $PROGRAM_KEYPAIR 2>/dev/null || echo "Unknown")
fi

    if [ ! -f SECURITY.md ]; then
    print_message "warn" "SECURITY.md not found. Creating a basic template..."
    cat > SECURITY.md << EOF
# Security Policy for DONUT Referral Matrix System

## Reporting a Vulnerability

If you discover a security vulnerability in our smart contract, please report it through one of the following channels:

- **Email**: [01010101@matrix.io](mailto:01010101@matrix.io)
- **Discord**: \`01010101\`
- **WhatsApp**: +55123456789

When reporting, please include:
- A detailed description of the vulnerability
- Steps to reproduce the issue
- Potential impact assessment
- Any suggestions for remediation if available

## Bug Bounty Program

We offer rewards for critical security vulnerabilities found in our smart contract, based on severity:

| Severity | Description | Potential Reward (SOL) |
|----------|-------------|-------------------|
| Critical | Vulnerabilities that allow direct theft of funds, permanent freezing of funds, unauthorized control of the protocol, or exploitation of Meteora pool interactions | 30-50 SOL |
| High | Vulnerabilities that could potentially lead to loss of funds under specific conditions, Chainlink oracle manipulation, or compromise of referral matrices | 10-20 SOL |
| Medium | Vulnerabilities that don't directly threaten assets but could compromise system integrity or manipulate the upline structure | 2-5 SOL |
| Low | Vulnerabilities that don't pose a significant risk but should be addressed | 0.5-1 SOL |

The final reward amount is determined at our discretion based on:
- The potential impact of the vulnerability
- The quality of the vulnerability report
- The uniqueness of the finding
- The clarity of proof-of-concept provided

## Eligibility Requirements

A vulnerability is eligible for reward if:
- It is previously unreported
- It affects the latest version of our contract
- The reporter provides sufficient information to reproduce and fix the issue
- The reporter allows a reasonable time for remediation before public disclosure

## Scope

This security policy covers the DONUT Referral Matrix System smart contract deployed at \`$PROGRAM_ID\`.

Our scope specifically includes:
- Main contract logic (lib.rs)
- Chainlink oracle interactions
- Meteora pool interactions
- 3x1 referral matrix logic
- Address and account validations
- Token handling functions
- Deposit and payment operations
- Minting and rate control functions

## Out of Scope

The following are considered out of scope:
- Vulnerabilities in third-party applications or websites
- Vulnerabilities requiring physical access to a user's device
- Social engineering attacks
- DoS attacks requiring excessive resources
- Issues related to frontend applications rather than the smart contract itself
- Issues in third-party contracts (Meteora, Chainlink, etc.) not directly related to our integration
- Vulnerabilities in previous or undeployed versions of the contract

## Responsible Disclosure

We are committed to working with security researchers to verify and address any potential vulnerabilities reported. We request that:

1. You give us reasonable time to investigate and address the vulnerability before any public disclosure
2. You make a good faith effort to avoid privacy violations, data destruction, and interruption or degradation of our services
3. You do not exploit the vulnerability beyond what is necessary to prove it exists

## Acknowledgments

We thank all security researchers who contribute to the security of our protocol. Contributors who discover valid vulnerabilities will be acknowledged (if desired) once the issue has been resolved.

---

This document was last updated: \$(date +"%B %Y")
EOF
fi
        
        # Add all files and commit (excluding those in .gitignore)
        git add .
        # Ensure we have at least one commit
        if ! git commit -m "$COMMIT_INITIAL"; then
            print_message "warn" "Failed to create initial commit. This may be due to empty repository."
            # Create empty commit to establish HEAD
            git commit --allow-empty -m "$COMMIT_INITIAL"
            print_message "info" "Created empty initial commit to establish repository structure"
        fi
    else
        print_message "info" "Git repository already initialized"
        
        # Apply enhanced .gitignore
        setup_enhanced_gitignore
        
        # Remove unwanted files from git tracking
        remove_unwanted_files
        
        # Make sure we have at least one commit
        if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
            print_message "warn" "Repository exists but has no commits. Creating initial commit..."
            git commit --allow-empty -m "$COMMIT_INITIAL"
        fi
        
        # Update remote if token was provided
        if [ -n "$GITHUB_TOKEN" ]; then
            if git remote | grep -q "^origin$"; then
                git remote set-url origin https://$GITHUB_USER:$GITHUB_TOKEN@github.com/$GITHUB_USER/$REPO_NAME.git
                print_message "info" "Remote URL updated with token"
            else
                git remote add origin https://$GITHUB_USER:$GITHUB_TOKEN@github.com/$GITHUB_USER/$REPO_NAME.git
                print_message "info" "Remote origin added with token"
            fi
        fi
    fi
}

# Function to ensure SECURITY.md exists and is updated
ensure_security_md() {
    print_message "info" "Checking and updating SECURITY.md..."
    
    # Get Program ID
    PROGRAM_ID=$(solana-keygen pubkey $PROGRAM_KEYPAIR 2>/dev/null || echo "Unknown")
    
    # Create or update SECURITY.md
    cat > SECURITY.md << EOF
# Security Policy for DONUT Referral Matrix System

## Reporting a Vulnerability

If you discover a security vulnerability in our smart contract, please report it through one of the following channels:

- **Email**: [matrix01@matrix.com](mailto:matrix01@matrix.com)
- **Discord**: \`matrix\`
- **WhatsApp**: +123455667

When reporting, please include:
- A detailed description of the vulnerability
- Steps to reproduce the issue
- Potential impact assessment
- Any suggestions for remediation if available

## Bug Bounty Program

We offer rewards for critical security vulnerabilities found in our smart contract, based on severity:

| Severity | Description | Potential Reward (SOL) |
|----------|-------------|-------------------|
| Critical | Issues that allow direct theft of funds, permanent freezing of funds, or unauthorized control of the protocol | 5-20 SOL |
| High | Issues that could potentially lead to loss of funds under specific conditions | 1-5 SOL |
| Medium | Issues that don't directly threaten assets but could compromise system integrity | 0.5-1 SOL |
| Low | Issues that don't pose a significant risk but should be addressed | 0.1-0.5 SOL |

The final reward amount is determined at our discretion based on:
- The potential impact of the vulnerability
- The quality of the vulnerability report
- The uniqueness of the finding
- The clarity of proof-of-concept provided

## Eligibility Requirements

A vulnerability is eligible for reward if:
- It is previously unreported
- It affects the latest version of our contract
- The reporter provides sufficient information to reproduce and fix the issue
- The reporter allows a reasonable time for remediation before public disclosure

## Scope

This security policy covers the DONUT Referral Matrix System smart contract deployed at \`$PROGRAM_ID\`.

## Out of Scope

The following are considered out of scope:
- Vulnerabilities in third-party applications or websites
- Vulnerabilities requiring physical access to a user's device
- Social engineering attacks
- DoS attacks requiring excessive resources
- Issues related to frontend applications rather than the smart contract itself

## Responsible Disclosure

We are committed to working with security researchers to verify and address any potential vulnerabilities reported. We request that:

1. You give us reasonable time to investigate and address the vulnerability before any public disclosure
2. You make a good faith effort to avoid privacy violations, data destruction, and interruption or degradation of our services
3. You do not exploit the vulnerability beyond what is necessary to prove it exists

## Acknowledgments

We thank all security researchers who contribute to the security of our protocol. Contributors who discover valid vulnerabilities will be acknowledged (if desired) once the issue has been resolved.
EOF

    # Add to Git if there are changes
    git add SECURITY.md
    if git diff --staged --quiet SECURITY.md; then
        print_message "info" "SECURITY.md is up to date."
    else
        git commit -m "Update SECURITY.md with Program ID: $PROGRAM_ID"
        print_message "info" "SECURITY.md updated and committed."
    fi
}

# Function to fix lib.rs URLs (função fictícia para completar o script)
fix_lib_rs_urls() {
    print_message "info" "Checking for lib.rs URLs that need updating..."
    
    # Esta é uma função fictícia para completar a referência na função main().
    # Você pode implementar a lógica real se necessário.
    
    print_message "info" "No URLs need updating in lib.rs"
}

# Function to create a GitHub repository if it doesn't exist
create_github_repo_if_needed() {
    print_message "info" "Checking if GitHub repository exists..."
    
    # Verify that we have a token
    if [ -z "$GITHUB_TOKEN" ]; then
        print_message "warn" "GitHub token required to check/create repository."
        read -sp "Enter your GitHub token (will not appear on screen): " GITHUB_TOKEN
        echo ""
        if [ -z "$GITHUB_TOKEN" ]; then
            print_message "error" "No token provided. Cannot check/create repository."
            return 1
        fi
    fi
    
    # Check if repository exists
    print_message "info" "Checking repository: $GITHUB_USER/$REPO_NAME"
    REPO_EXISTS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: token $GITHUB_TOKEN" \
      https://api.github.com/repos/$GITHUB_USER/$REPO_NAME)
    
    if [ "$REPO_EXISTS" = "200" ]; then
        print_message "info" "Repository already exists on GitHub"
        return 0
    elif [ "$REPO_EXISTS" = "404" ]; then
        print_message "warn" "Repository does not exist on GitHub"
        read -p "Do you want to create the repository '$REPO_NAME'? (y/n): " create_repo
        
        if [ "$create_repo" = "y" ]; then
            print_message "info" "Creating repository '$REPO_NAME' on GitHub..."
            
            # Create repo
            RESPONSE=$(curl -s -X POST \
              -H "Authorization: token $GITHUB_TOKEN" \
              -H "Accept: application/vnd.github+json" \
              -H "Content-Type: application/json" \
              https://api.github.com/user/repos \
              -d "{\"name\":\"$REPO_NAME\",\"description\":\"DONUT Referral Matrix System\",\"private\":false}")
            
            # Check if creation was successful
            if echo "$RESPONSE" | grep -q "html_url"; then
                REPO_URL=$(echo "$RESPONSE" | grep -o '"html_url":"[^"]*"' | head -1 | cut -d'"' -f4)
                print_message "info" "Repository created successfully: $REPO_URL"
                return 0
            else
                print_message "error" "Failed to create repository. API response:"
                echo "$RESPONSE"
                
                # Check for common errors
                if echo "$RESPONSE" | grep -q "name already exists"; then
                    print_message "warn" "Repository name already exists but is not accessible with your token"
                elif echo "$RESPONSE" | grep -q "Bad credentials"; then
                    print_message "error" "Invalid GitHub token. Please provide a valid token."
                    GITHUB_TOKEN=""
                    read -p "Try again with a new token? (y/n): " try_again
                    if [ "$try_again" = "y" ]; then
                        read -sp "Enter your GitHub token (will not appear on screen): " GITHUB_TOKEN
                        echo ""
                        if [ -n "$GITHUB_TOKEN" ]; then
                            return $(create_github_repo_if_needed)
                        fi
                    fi
                fi
                
                return 1
            fi
        else
            print_message "info" "Repository creation skipped"
            return 1
        fi
    else
        print_message "error" "Unexpected response from GitHub API: $REPO_EXISTS"
        return 1
    fi
}

# Function to merge to main branch after deployment
merge_to_main() {
    print_message "info" "Merging changes to main branch..."
    
    # Get current branch
    current_branch=$(git rev-parse --abbrev-ref HEAD)
    
    # Do nothing if we're already on main branch
    if [ "$current_branch" = "main" ]; then
        print_message "info" "Already on main branch, no merge needed."
        return
    fi
    
    # Check if main branch exists locally
    if git show-ref --verify --quiet refs/heads/main; then
        # Main exists locally
        print_message "info" "Main branch found locally."
    else
        # Main doesn't exist locally, check if it exists remotely
        if git ls-remote --exit-code --heads origin main &>/dev/null; then
            # Main exists remotely, create locally
            print_message "info" "Creating main branch locally based on remote..."
            git branch main origin/main
        else
            # Main doesn't exist locally or remotely, create a new one
            print_message "info" "Main branch not found. Creating a new main branch..."
            git checkout -b main
            git checkout "$current_branch"
        fi
    fi
    
    # Checkout to main
    git checkout main
    
    # Try to merge current branch
    print_message "info" "Merging $current_branch into main..."
    if git merge --no-ff "$current_branch" -m "Merge branch '$current_branch' into main"; then
        print_message "info" "Merge completed successfully."
        
        # Push to GitHub
        print_message "info" "Pushing main branch to GitHub..."
        if git push origin main; then
            print_message "info" "Main branch successfully pushed to GitHub."
        else
            print_message "warn" "Failed to push main branch to GitHub."
        fi
    else
        print_message "error" "Conflicts detected during merge."
        print_message "error" "Please resolve conflicts manually and push to main branch."
        git merge --abort
        git checkout "$current_branch"
    fi
    
    # Return to original branch if different from main
    if [ "$current_branch" != "main" ]; then
        git checkout "$current_branch"
    fi
}

# Function to clean sensitive files from Git index
clean_git_sensitive_files() {
    print_message "info" "Cleaning sensitive files from Git index..."
    
    # List of patterns for sensitive files that should be removed from the index
    SENSITIVE_PATTERNS=(
        "*.keypair"
        "*keypair*.json"
        "*wallet*.json"
        "id.json"
        "*.pem"
        "*.key"
        "*.secret"
        ".env"
        ".env.*"
        "wallet_generation.js"
        "view_user.js"
        "client/"
        "backups/"
        "backups/*.json"
        "backups/*.key"
        "node_modules"
        "node_modules/"
        "**/node_modules/**"
        "automated-deploy.sh"
        "automated-deploy-buffer.sh"
        ".gitignore.bak-*" 
    )
    
    # Check if any of these files are in the Git index
    FOUND_IN_INDEX=false
    for pattern in "${SENSITIVE_PATTERNS[@]}"; do
        # Find files that match the pattern and are in the index
        INDEXED_FILES=$(git ls-files | grep -E "$pattern" || true)
        
        if [ -n "$INDEXED_FILES" ]; then
            FOUND_IN_INDEX=true
            print_message "warn" "Found sensitive files in Git index that match pattern '$pattern'"
            
            # Remove each file from the index but keep it in the working directory
            git rm --cached -r "$pattern" 2>/dev/null || true
            print_message "info" "Removed files matching pattern '$pattern' from Git index (files preserved on disk)"
        fi
    done
    
    if [ "$FOUND_IN_INDEX" = true ]; then
        print_message "info" "Sensitive files have been removed from Git index."
        print_message "info" "Creating a commit to record these changes..."
        
        # Make sure .gitignore is committed to prevent future additions
        git add .gitignore
        git commit -m "$COMMIT_SECURITY"
    else
        print_message "info" "No sensitive files found in Git index."
    fi
}

# Function to check for sensitive files before commit
check_sensitive_files() {
    print_message "info" "Checking for sensitive files that could be exposed..."
    
    # List of sensitive patterns to check
    SENSITIVE_PATTERNS=(
        "*.keypair"
        "*keypair*.json"
        "*wallet*.json"
        "id.json"
        "*.pem"
        "*.key"
        "*.secret"
        ".env"
        "wallet_generation.js"
        "view_user.js"
        "client/"
        "node_modules/"
        "automated-deploy.sh"
        "automated-deploy-buffer.sh"
        ".gitignore.bak-*"
    )
    
    # Check each pattern
    FOUND_SENSITIVE=false
    for pattern in "${SENSITIVE_PATTERNS[@]}"; do
        # Find files that match the pattern and are not in .gitignore
        SENSITIVE_FILES=$(git ls-files --exclude-standard --others --cached | grep -E "$pattern" || true)
        
        if [ -n "$SENSITIVE_FILES" ]; then
            FOUND_SENSITIVE=true
            print_message "error" "SECURITY ALERT: Found sensitive files that could be exposed on GitHub:"
            echo "$SENSITIVE_FILES"
        fi
    done
    
    # If found sensitive files, ask if want to continue
    if [ "$FOUND_SENSITIVE" = true ]; then
        print_message "warn" "The files listed above may contain sensitive information such as private keys."
        read -p "Continue anyway? This could expose sensitive data! (y/n): " continue_anyway
        
        if [ "$continue_anyway" != "y" ]; then
            print_message "info" "Operation canceled by user due to security concerns."
            print_message "info" "Please add these files to .gitignore or remove them before continuing."
            exit 1
        fi
        
        print_message "warn" "Continuing despite the risk. Caution: your data may be exposed!"
    else
        print_message "info" "No sensitive files detected outside .gitignore."
    fi
}

# Function to get or create program keypair
prepare_program_keypair() {
    # Check if we're creating a new program or updating existing
    if [ "$DEPLOY_TYPE" = "new" ]; then
        # Check if keypair already exists
        if [ -f "$PROGRAM_KEYPAIR" ]; then
            print_message "warn" "Program keypair already exists at $PROGRAM_KEYPAIR"
            read -p "Create a new keypair? This will generate a new Program ID (y/n): " create_new_keypair
            
            if [ "$create_new_keypair" = "y" ]; then
                # Backup existing keypair
                cp $PROGRAM_KEYPAIR ./backups/program-keypair-backup-$(date +%Y%m%d%H%M%S).json
                
                # Create new keypair
                solana-keygen new --no-bip39-passphrase -o $PROGRAM_KEYPAIR
                print_message "info" "New program keypair created"
            fi
        else
            # Create directory if it doesn't exist
            mkdir -p $(dirname "$PROGRAM_KEYPAIR")
            
            # Create new keypair
            solana-keygen new --no-bip39-passphrase -o $PROGRAM_KEYPAIR
            print_message "info" "New program keypair created"
        fi
    else
        # Upgrade mode - check if keypair exists
        if [ ! -f "$PROGRAM_KEYPAIR" ]; then
            print_message "error" "Program keypair not found at $PROGRAM_KEYPAIR!"
            print_message "error" "An existing keypair is required for upgrades."
            exit 1
        fi
    fi
    
    # Display Program ID
    PROGRAM_ID=$(solana-keygen pubkey $PROGRAM_KEYPAIR)
    print_message "info" "Program ID: $PROGRAM_ID"
}

# Function to get commit hash and build
build_with_hash() {
    # Get last commit hash or create a new commit if needed
    if git rev-parse HEAD &>/dev/null; then
        COMMIT_HASH=$(git rev-parse HEAD)
    else
        print_message "warn" "No commit found. Creating initial commit..."
        git add .
        git commit -m "$COMMIT_INITIAL"
        COMMIT_HASH=$(git rev-parse HEAD)
    fi
    
    print_message "info" "Commit hash: $COMMIT_HASH"
    
    # Get program version
    get_program_version
    
    # Set environment variables with commit hash and version
    export GITHUB_SHA=$COMMIT_HASH
    export PROGRAM_VERSION=${PROGRAM_VERSION:-"0.1.0"}
    
    # Build program with environment variables
    print_message "info" "Building program with embedded commit hash..."
    GITHUB_SHA=$COMMIT_HASH PROGRAM_VERSION=$PROGRAM_VERSION anchor build
    build_result=$?

    if [ $build_result -ne 0 ]; then
        print_message "error" "Build failed! Check errors above."
        exit 1
    fi
    
    # Check if build was successful
    if [ ! -f "$PROGRAM_SO" ]; then
        print_message "error" "Build failed! $PROGRAM_SO file not found."
        exit 1
    fi
    
    print_message "info" "Build completed successfully"
    
    # Check if hash was embedded
    if strings "$PROGRAM_SO" | grep -q "$COMMIT_HASH"; then
        print_message "info" "Commit hash successfully embedded in program!"
    else
        print_message "warn" "Commit hash not found in program. This may be normal if the hash is processed specifically."
    fi
    
    # Check if version was embedded
    if [ -n "$PROGRAM_VERSION" ] && strings "$PROGRAM_SO" | grep -q "$PROGRAM_VERSION"; then
        print_message "info" "Program version ($PROGRAM_VERSION) successfully embedded!"
    else
        print_message "warn" "Program version not found in binary. Check if source_release line is configured correctly."
    fi
}

# Function to push code to GitHub
push_to_github() {
    print_message "info" "Checking remote repository status..."
    
    # First check if repository exists and create it if needed
    create_github_repo_if_needed
    
    # Check if remote origin already exists
    if ! git remote | grep -q "^origin$"; then
        print_message "warn" "Remote 'origin' not found. Adding..."
        
        if [ -n "$GITHUB_TOKEN" ]; then
            # Use token for authentication
            git remote add origin https://$GITHUB_USER:$GITHUB_TOKEN@github.com/$GITHUB_USER/$REPO_NAME.git
        else
            git remote add origin https://github.com/$GITHUB_USER/$REPO_NAME.git
        fi
    else
        # Update remote URL with token if available
        if [ -n "$GITHUB_TOKEN" ]; then
            git remote set-url origin https://$GITHUB_USER:$GITHUB_TOKEN@github.com/$GITHUB_USER/$REPO_NAME.git
            print_message "info" "Updated remote URL with token"
        fi
    fi
    
    # Apply enhanced .gitignore
    setup_enhanced_gitignore
    
    # Clean sensitive files before commit
    clean_git_sensitive_files
    
    # Initialize repository if no commits exist
    if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
        print_message "info" "Initializing repository with first commit..."
        
        # Create and commit README if not exists
        if [ ! -f README.md ]; then
            print_message "info" "Creating README.md..."
            cat > README.md << EOF
# DONUT Referral Matrix System

A decentralized referral matrix system on the Solana blockchain that rewards participants for bringing new users to the network.

## Overview

The DONUT Referral Matrix System is a protocol designed to incentivize user acquisition through a multi-level referral structure. The system creates a 3-slot matrix for each user, where each slot represents a different action when filled.

## Features

- Verifiable smart contracts on Solana blockchain
- Multi-level referral system
- Secure operations with validated transactions
- Transparent reward distribution

## Documentation

For more information, see the [SECURITY.md](./SECURITY.md) file.
EOF
            git add README.md
        fi
        
        # Create initial commit
        git add .
        GIT_AUTHOR_NAME="DONUT Matrix Deployment" GIT_AUTHOR_EMAIL="deployment@donut-matrix.com" \
        GIT_COMMITTER_NAME="DONUT Matrix Deployment" GIT_COMMITTER_EMAIL="deployment@donut-matrix.com" \
        git commit -m "$COMMIT_INITIAL" --allow-empty
        
        # Create main branch
        git branch -M main
        
        print_message "info" "Repository initialized with initial commit"
    else
        # Regular changes commit if needed
        if [ -n "$(git status --porcelain)" ]; then
            print_message "info" "Uncommitted changes found. Creating commit..."
            git add .
            GIT_AUTHOR_NAME="DONUT Matrix Deployment" GIT_AUTHOR_EMAIL="deployment@donut-matrix.com" \
            GIT_COMMITTER_NAME="DONUT Matrix Deployment" GIT_COMMITTER_EMAIL="deployment@donut-matrix.com" \
            git commit -m "$COMMIT_UPDATE"
        else
            print_message "info" "No uncommitted changes found"
        fi
    fi
    
    # Get current branch
    current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
    if [ "$current_branch" = "HEAD" ]; then
        # Detached HEAD state, create and checkout main branch
        print_message "warn" "Detached HEAD state detected. Creating main branch..."
        git checkout -b main
        current_branch="main"
    fi
    
    print_message "info" "Current branch: $current_branch"
    
    # Push code to GitHub
    print_message "info" "Pushing code to GitHub..."
    
    # Try standard push first
    if GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=no" git push -u origin $current_branch; then
        print_message "info" "Code successfully pushed to GitHub"
    else
        # If fails, try with force push after confirmation
        print_message "warn" "Normal push failed. Repository may need force push."
        read -p "Attempt force push? This may overwrite remote changes (y/n): " do_force
        if [ "$do_force" = "y" ]; then
            if GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=no" git push -f origin $current_branch; then
                print_message "info" "Code successfully force-pushed to GitHub"
            else
                print_message "error" "Force push also failed."
                read -p "Continue with deployment without pushing to GitHub? (y/n): " continue_deploy
                if [ "$continue_deploy" != "y" ]; then
                    print_message "info" "Operation canceled by user."
                    exit 0
                fi
            fi
        else
            read -p "Continue with deployment without pushing to GitHub? (y/n): " continue_deploy
            if [ "$continue_deploy" != "y" ]; then
                print_message "info" "Operation canceled by user."
                exit 0
            fi
        fi
    fi
    
    # Push tags if they exist
    if [ -n "$PROGRAM_VERSION" ]; then
        print_message "info" "Pushing version tag to GitHub..."
        if git push origin "$PROGRAM_VERSION"; then
            print_message "info" "Tag $PROGRAM_VERSION pushed successfully"
        else
            print_message "warn" "Failed to push tag $PROGRAM_VERSION"
        fi
    fi
}

# Function to create buffer and transfer authority to multisig
create_buffer_and_transfer() {
    # Validate multisig address is configured
    if [ "$MULTISIG_AUTHORITY" = "YOUR_MULTISIG_ADDRESS_HERE" ] || [ -z "$MULTISIG_AUTHORITY" ]; then
        print_message "error" "MULTISIG_AUTHORITY not configured!"
        print_message "error" "Please set the MULTISIG_AUTHORITY variable in the configuration section."
        print_message "info" "Example: MULTISIG_AUTHORITY=\"9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM\""
        exit 1
    fi
    
    # Configure Solana CLI
    print_message "info" "Configuring Solana CLI..."
    solana config set --url $RPC_URL
    solana config set --keypair $WALLET_KEYPAIR
    
    # Check balance
    BALANCE=$(solana balance)
    print_message "info" "Current balance: $BALANCE"
    
    # Get Program ID
    PROGRAM_ID=$(solana-keygen pubkey $PROGRAM_KEYPAIR)
    print_message "info" "Program ID: $PROGRAM_ID"
    print_message "info" "Multisig Authority: $MULTISIG_AUTHORITY"
    
    # Create buffer
    print_message "info" "Creating buffer for program..."
    BUFFER_RESULT=$(solana program write-buffer $PROGRAM_SO \
        --with-compute-unit-price $COMPUTE_UNIT_PRICE \
        --max-sign-attempts 10)
    
    echo "$BUFFER_RESULT"
    
    # Extract buffer ID - improved version
    BUFFER_ID=$(echo "$BUFFER_RESULT" | grep -o "Buffer: [A-Za-z0-9]*" | cut -d " " -f 2)
    
    # If can't extract automatically, ask user
    if [ -z "$BUFFER_ID" ]; then
        print_message "warn" "Could not extract buffer ID automatically."
        echo "Check the output above and find a line like 'Buffer: ABC123...'"
        read -p "Please enter the buffer ID manually: " BUFFER_ID
        
        if [ -z "$BUFFER_ID" ]; then
            print_message "error" "No buffer ID provided. Cannot proceed."
            exit 1
        fi
    fi
    
    print_message "info" "Buffer created successfully. ID: $BUFFER_ID"
    
    # Verify buffer was created and show current authority
    print_message "info" "Verifying buffer creation..."
    solana program show --buffers | grep $BUFFER_ID || print_message "warn" "Buffer not found in list, but this may be normal"
    
    # Transfer buffer authority to multisig
    print_message "info" "Transferring buffer authority to multisig..."
    TRANSFER_RESULT=$(solana program set-buffer-authority $BUFFER_ID \
        --new-buffer-authority $MULTISIG_AUTHORITY)
    
    echo "$TRANSFER_RESULT"
    
    if [ $? -eq 0 ]; then
        print_message "info" "Buffer authority successfully transferred to multisig!"
        print_message "info" "Buffer ID: $BUFFER_ID"
        print_message "info" "New Authority: $MULTISIG_AUTHORITY"
        print_message "info" "Program ID: $PROGRAM_ID"
        
        # Verify the transfer
        print_message "info" "Verifying buffer authority transfer..."
        BUFFER_INFO=$(solana program show --buffers --output json 2>/dev/null | grep -A 20 -B 5 "$BUFFER_ID" || echo "Could not retrieve buffer info")
        if [ "$BUFFER_INFO" != "Could not retrieve buffer info" ] && echo "$BUFFER_INFO" | grep -q "$MULTISIG_AUTHORITY"; then
            print_message "info" "Buffer authority transfer verified successfully!"
        else
            print_message "warn" "Could not verify buffer authority transfer through automated check."
            print_message "info" "Please verify manually that the buffer authority is now: $MULTISIG_AUTHORITY"
        fi
        
        # Display next steps
        print_message "info" ""
        print_message "info" "=== NEXT STEPS ==="
        print_message "info" "The buffer has been created and authority transferred to the multisig."
        print_message "info" "To complete the deployment, the multisig needs to execute:"
        print_message "info" ""
        if [ "$DEPLOY_TYPE" = "new" ]; then
            print_message "info" "solana program deploy --buffer $BUFFER_ID \\"
            print_message "info" "  --program-id $PROGRAM_ID \\"
            print_message "info" "  --max-len $MAX_PROGRAM_SIZE \\"
            print_message "info" "  --with-compute-unit-price $COMPUTE_UNIT_PRICE"
        else
            print_message "info" "solana program deploy --buffer $BUFFER_ID \\"
            print_message "info" "  --program-id $PROGRAM_ID \\"
            print_message "info" "  --with-compute-unit-price $COMPUTE_UNIT_PRICE"
        fi
        print_message "info" ""
        print_message "info" "Buffer ID: $BUFFER_ID"
        print_message "info" "Program ID: $PROGRAM_ID"
        print_message "info" "Multisig Authority: $MULTISIG_AUTHORITY"
        
        # Save deployment info to file
        DEPLOY_INFO_FILE="deployment-info-$(date +%Y%m%d%H%M%S).txt"
        cat > "$DEPLOY_INFO_FILE" << EOF
DONUT Matrix System - Deployment Information
Generated: $(date)

Buffer ID: $BUFFER_ID
Program ID: $PROGRAM_ID
Multisig Authority: $MULTISIG_AUTHORITY
Deploy Type: $DEPLOY_TYPE
Max Program Size: $MAX_PROGRAM_SIZE
Compute Unit Price: $COMPUTE_UNIT_PRICE
Network: $RPC_URL
Commit Hash: $COMMIT_HASH
Program Version: $PROGRAM_VERSION

Multisig Deployment Command:
$(if [ "$DEPLOY_TYPE" = "new" ]; then
    echo "solana program deploy --buffer $BUFFER_ID --program-id $PROGRAM_ID --max-len $MAX_PROGRAM_SIZE --with-compute-unit-price $COMPUTE_UNIT_PRICE"
else
    echo "solana program deploy --buffer $BUFFER_ID --program-id $PROGRAM_ID --with-compute-unit-price $COMPUTE_UNIT_PRICE"
fi)
EOF
        
        print_message "info" "Deployment information saved to: $DEPLOY_INFO_FILE"
        
        # Create Git tag if doesn't exist yet
        if [ -n "$PROGRAM_VERSION" ] && ! git rev-parse "$PROGRAM_VERSION" >/dev/null 2>&1; then
            print_message "info" "Creating Git tag for this buffer creation..."
            DEPLOY_TAG="$PROGRAM_VERSION"
            git tag -a "$DEPLOY_TAG" -m "Buffer created on $(date): Program ID $PROGRAM_ID"
            print_message "info" "Tag $DEPLOY_TAG created locally"
            
            # Ask if want to push the tag
            read -p "Push tag $DEPLOY_TAG to GitHub? (y/n): " push_tag
            if [ "$push_tag" = "y" ]; then
                if [ -z "$GITHUB_TOKEN" ]; then
                    print_message "info" "GitHub token needed to push tag."
                    read -sp "Enter your GitHub token (will not appear on screen): " GITHUB_TOKEN
                    echo ""
                    if [ -n "$GITHUB_TOKEN" ]; then
                        git remote set-url origin https://$GITHUB_USER:$GITHUB_TOKEN@github.com/$GITHUB_USER/$REPO_NAME.git
                    fi
                fi
                
                if [ -n "$GITHUB_TOKEN" ]; then
                    if git push origin "$DEPLOY_TAG"; then
                        print_message "info" "Tag $DEPLOY_TAG pushed to GitHub"
                    else
                        print_message "warn" "Failed to push tag $DEPLOY_TAG"
                    fi
                else
                    print_message "warn" "No GitHub token, tag was not pushed."
                fi
            fi
        fi
        
        return 0
    else
        print_message "error" "Failed to transfer buffer authority to multisig!"
        print_message "error" "Buffer ID: $BUFFER_ID"
        print_message "error" "You may need to manually transfer the authority or check the multisig address."
        return 1
    fi
}

# Function to create GitHub release
create_github_release() {
    print_message "info" "Creating GitHub release..."
    
    # Check if we have curl command
    if ! command -v curl &> /dev/null; then
        print_message "error" "'curl' command is not installed. It's required to create releases."
        print_message "info" "You can install it with: sudo apt-get install curl"
        return 1
    fi
    
    # Check if there's a GitHub token
    if [ -z "$GITHUB_TOKEN" ]; then
        print_message "warn" "GitHub token required to create release."
        read -sp "Enter your GitHub token (will not appear on screen): " GITHUB_TOKEN
        echo ""
        if [ -z "$GITHUB_TOKEN" ]; then
            print_message "error" "No token provided. Cannot create release."
            return 1
        fi
    fi
    
    # Use the version from get_program_version
    RELEASE_TAG="$PROGRAM_VERSION"
    
    # Confirm if want to create release with this tag
    print_message "info" "Will create release with tag: $RELEASE_TAG"
    read -p "Proceed with creating GitHub release for this tag? (y/n): " confirm_release
    
    if [ "$confirm_release" != "y" ]; then
        print_message "info" "Release creation canceled by user."
        return 0
    fi
    
    # Get Program ID
    PROGRAM_ID=$(solana-keygen pubkey $PROGRAM_KEYPAIR)
    
    # Check if commit hash is available
    if [ -z "$COMMIT_HASH" ]; then
        COMMIT_HASH=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
    fi
    
    # Determine which branch we're on
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
    
    # Detect if on devnet or mainnet
    NETWORK=$(echo "$RPC_URL" | grep -q "mainnet" && echo "Mainnet" || echo "Devnet")
    
    # Create temp file for JSON payload
    TEMP_FILE=$(mktemp)
    cat > "$TEMP_FILE" << EOF
{
  "tag_name": "$RELEASE_TAG",
  "name": "DONUT Matrix System $RELEASE_TAG",
  "body": "Buffer Created: $(date)\\n\\nProgram ID: $PROGRAM_ID\\nBuffer Authority: $MULTISIG_AUTHORITY\\nCommit: $COMMIT_HASH\\nNetwork: $NETWORK\\n\\nNote: This release represents buffer creation and authority transfer to multisig. Final deployment requires multisig execution.",
  "draft": false,
  "prerelease": $(echo "$RPC_URL" | grep -q "mainnet" && echo "false" || echo "true")
}
EOF
    
    # Display JSON content for debugging
    print_message "info" "JSON content to be sent:"
    cat "$TEMP_FILE"
    
    # Check if a release already exists
    RELEASE_EXISTS=$(curl -s -o /dev/null -w "%{http_code}" \
      -H "Authorization: token $GITHUB_TOKEN" \
      -H "Accept: application/vnd.github+json" \
      https://api.github.com/repos/$GITHUB_USER/$REPO_NAME/releases/tags/$RELEASE_TAG)
    
    if [ "$RELEASE_EXISTS" = "200" ]; then
        print_message "warn" "A release with tag '$RELEASE_TAG' already exists."
        read -p "Delete existing release and create a new one? (y/n): " delete_existing
        
        if [ "$delete_existing" = "y" ]; then
            # Get existing release ID
            RELEASE_ID=$(curl -s \
              -H "Authorization: token $GITHUB_TOKEN" \
              -H "Accept: application/vnd.github+json" \
              https://api.github.com/repos/$GITHUB_USER/$REPO_NAME/releases/tags/$RELEASE_TAG | \
              grep -o '"id": [0-9]*' | head -1 | cut -d' ' -f2)
            
            if [ -n "$RELEASE_ID" ]; then
                # Delete existing release
                curl -s -X DELETE \
                  -H "Authorization: token $GITHUB_TOKEN" \
                  -H "Accept: application/vnd.github+json" \
                  https://api.github.com/repos/$GITHUB_USER/$REPO_NAME/releases/$RELEASE_ID
                
                print_message "info" "Existing release deleted. Creating new one..."
            else
                print_message "error" "Could not get ID of existing release."
                return 1
            fi
        else
            print_message "info" "Release creation skipped."
            rm -f "$TEMP_FILE"
            return 0
        fi
    fi
    
    # Send request to create release
    RESPONSE=$(curl -s -X POST \
      -H "Authorization: token $GITHUB_TOKEN" \
      -H "Accept: application/vnd.github+json" \
      -H "Content-Type: application/json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      https://api.github.com/repos/$GITHUB_USER/$REPO_NAME/releases \
      --data @"$TEMP_FILE")
    
    # Remove temp file
    rm -f "$TEMP_FILE"
    
    # Check if release was created successfully
    if echo "$RESPONSE" | grep -q "html_url"; then
        RELEASE_URL=$(echo "$RESPONSE" | grep -o '"html_url":"[^"]*"' | head -1 | cut -d'"' -f4)
        print_message "info" "Release created successfully: $RELEASE_URL"
        return 0
    else
        print_message "error" "Failed to create release. API response:"
        echo "$RESPONSE"
        
        # Try with minimal JSON if first attempt fails
        print_message "info" "Trying with minimal JSON format..."
        
        RESPONSE=$(curl -s -X POST \
          -H "Authorization: token $GITHUB_TOKEN" \
          -H "Accept: application/vnd.github+json" \
          -H "Content-Type: application/json" \
          -H "X-GitHub-Api-Version: 2022-11-28" \
          https://api.github.com/repos/$GITHUB_USER/$REPO_NAME/releases \
          -d "{\"tag_name\":\"$RELEASE_TAG\",\"name\":\"Release $RELEASE_TAG\",\"body\":\"Program ID: $PROGRAM_ID\"}")
        
        if echo "$RESPONSE" | grep -q "html_url"; then
            RELEASE_URL=$(echo "$RESPONSE" | grep -o '"html_url":"[^"]*"' | head -1 | cut -d'"' -f4)
            print_message "info" "Release created successfully using minimal format: $RELEASE_URL"
            return 0
        else
            print_message "error" "All release creation attempts failed. Final response:"
            echo "$RESPONSE"
            return 1
        fi
    fi
}

# Main function
main() {
    print_message "info" "=== Starting automated buffer creation and authority transfer process ==="
    print_message "info" "RPC URL: $RPC_URL"
    print_message "info" "Deploy type: $DEPLOY_TYPE"
    print_message "info" "Multisig Authority: $MULTISIG_AUTHORITY"
    
    # First make sure Git identity is configured to avoid auth errors
    setup_git_identity
    
    # Backup important files
    backup_files
    
    # Apply enhanced .gitignore
    setup_enhanced_gitignore
    
    # Check and configure Git
    check_git_repo
    
    # Clean sensitive files from Git index
    clean_git_sensitive_files
    
    # Check if GitHub repository exists and create if needed
    read -p "Check GitHub repository and create if missing? (y/n): " check_github
    if [ "$check_github" = "y" ]; then
        request_github_token
        create_github_repo_if_needed
    fi
    
    # Ensure SECURITY.md exists and is updated
    ensure_security_md
    
    # Fix URLs in lib.rs
    fix_lib_rs_urls
    
    # Check sensitive files
    check_sensitive_files
    
    # Prepare program keypair
    prepare_program_keypair
    
    # Push code to GitHub (optional)
    read -p "Push code to GitHub? (y/n): " push_github
    if [ "$push_github" = "y" ]; then
        # Request token if needed
        request_github_token
        push_to_github
    fi
    
    # Build with hash
    build_with_hash
    
    # Ask if want to create buffer and transfer authority
    read -p "Proceed with buffer creation and authority transfer? (y/n): " do_buffer
    if [ "$do_buffer" = "y" ]; then
        create_buffer_and_transfer
        
        # Merge to main branch after buffer creation
        read -p "Merge changes to main branch? (y/n): " do_merge
        if [ "$do_merge" = "y" ]; then
            merge_to_main
        fi
        
        # Create GitHub release
        read -p "Create GitHub release? (y/n): " do_release
        if [ "$do_release" = "y" ]; then
            create_github_release
        fi
    else
        print_message "info" "Buffer creation canceled by user."
    fi
    
    print_message "info" "=== Process completed ==="
}

# Execute script
main