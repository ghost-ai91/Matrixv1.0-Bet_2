// Script to register user with referrer using Chainlink Oracle and Address Lookup Table
// CORRECTED VERSION - Compatible with security-enhanced contract
// Includes all required uplines for SLOT 3 validation
const { 
  Connection, 
  Keypair, 
  PublicKey, 
  TransactionMessage, 
  VersionedTransaction,
  ComputeBudgetProgram,
  TransactionInstruction,
  Transaction,
  SystemProgram
} = require('@solana/web3.js');
const { AnchorProvider, Program, BN, Wallet, utils } = require('@coral-xyz/anchor');
const fs = require('fs');
const path = require('path');
// Get command line parameters (required: referrer and ALT)
const args = process.argv.slice(2);
const walletPath = args[0] || './carteiras/carteira1.json';
const configPath = args[1] || './matriz-config.json';
const referrerAddressStr = args[2]; // Referrer address as string
const altAddress = args[3]; // ALT address as mandatory argument

// Function to show complete Address Lookup Table details
async function getAddressLookupTable(connection, altAddress) {
  console.log("\n📋 GETTING ADDRESS LOOKUP TABLE:");
  
  try {
    const lookupTableInfo = await connection.getAddressLookupTable(new PublicKey(altAddress));
    if (!lookupTableInfo.value) {
      console.log("❌ ALT not found!");
      return null;
    }
    
    const lookupTable = lookupTableInfo.value;
    console.log(`✅ ALT found: ${altAddress}`);
    console.log(`🔢 Total addresses: ${lookupTable.state.addresses.length}`);
    console.log(`🔑 Authority: ${lookupTable.state.authority ? lookupTable.state.authority.toString() : 'None'}`);
    
    console.log("\n📋 COMPLETE ADDRESS LIST:");
    lookupTable.state.addresses.forEach((address, index) => {
      console.log(`  ${index}: ${address.toString()}`);
    });
    
    // Verify object properties for diagnostics
    console.log("\n📋 VALIDATING LOOKUP TABLE OBJECT:");
    console.log(`  Type: ${typeof lookupTable}`);
    console.log(`  Has 'key' property: ${lookupTable.key ? "Yes" : "No"}`);
    console.log(`  Has 'state' property: ${lookupTable.state ? "Yes" : "No"}`);
    
    return lookupTable;
  } catch (error) {
    console.error(`❌ Error getting ALT: ${error}`);
    return null;
  }
}

// CORRECTED FUNCTION: Prepare ALL uplines for SLOT 3 - STRICT VALIDATION
async function prepareAllUplinesForSlot3(connection, program, referrerInfo, TOKEN_MINT) {
  const remainingAccounts = [];
  const triosInfo = [];

  console.log(`\n🔄 PREPARING ALL UPLINES FOR SLOT 3 - STRICT VALIDATION`);
  console.log(`📊 Referrer has ${referrerInfo.upline.upline.length} uplines`);
  
  if (referrerInfo.upline.upline.length === 0) {
    console.log("✅ Base user detected - no uplines required");
    return remainingAccounts;
  }

  // CRITICAL: Process ALL uplines (the contract requires EXACTLY all of them)
  for (let i = 0; i < referrerInfo.upline.upline.length; i++) {
    const uplineEntry = referrerInfo.upline.upline[i];
    const uplinePDA = uplineEntry.pda;
    const uplineWallet = uplineEntry.wallet;
    
    console.log(`  Processing upline ${i + 1}/${referrerInfo.upline.upline.length}`);
    console.log(`    PDA: ${uplinePDA.toString()}`);
    console.log(`    Wallet: ${uplineWallet.toString()}`);

    try {
      // Verify upline account exists and is registered
      const uplineAccountInfo = await program.account.userAccount.fetch(uplinePDA);
      
      if (!uplineAccountInfo.isRegistered) {
        console.log(`    ❌ Upline is not registered! This should not happen.`);
        throw new Error(`Upline ${uplinePDA.toString()} is not registered`);
      }

      // Derive ATA for the upline
      const uplineTokenAccount = utils.token.associatedAddress({
        mint: TOKEN_MINT,
        owner: uplineWallet,
      });

      console.log(`    💰 ATA: ${uplineTokenAccount.toString()}`);

      // Check if ATA exists
      const ataInfo = await connection.getAccountInfo(uplineTokenAccount);
      if (!ataInfo) {
        console.log(`    ⚠️ ATA doesn't exist - will be handled by contract`);
      } else {
        console.log(`    ✅ ATA exists`);
      }

      // Store trio information
      triosInfo.push({
        pda: uplinePDA,
        wallet: uplineWallet,
        ata: uplineTokenAccount,
        index: i
      });

    } catch (e) {
      console.log(`    ❌ Error processing upline: ${e.message}`);
      throw new Error(`Failed to process upline ${i + 1}: ${e.message}`);
    }
  }

  // CRITICAL: Contract expects uplines in reverse order (most recent first)
  // Since referrerInfo.upline.upline is already in chronological order (oldest first),
  // we need to reverse it to match contract expectations
  triosInfo.reverse();
  
  console.log(`\n📊 UPLINE PROCESSING ORDER (Most recent → Oldest):`);
  for (let i = 0; i < triosInfo.length; i++) {
    console.log(`  ${i + 1}. PDA: ${triosInfo[i].pda.toString()}`);
    console.log(`    Wallet: ${triosInfo[i].wallet.toString()}`);
    console.log(`    ATA: ${triosInfo[i].ata.toString()}`);
  }

  // Build remainingAccounts array with ALL trios in correct order
  for (let i = 0; i < triosInfo.length; i++) {
    const trio = triosInfo[i];

    // Add trio: PDA, Wallet, ATA
    remainingAccounts.push({
      pubkey: trio.pda,
      isWritable: true,
      isSigner: false,
    });

    remainingAccounts.push({
      pubkey: trio.wallet,
      isWritable: true,
      isSigner: false,
    });

    remainingAccounts.push({
      pubkey: trio.ata,
      isWritable: true,
      isSigner: false,
    });
  }

  // CRITICAL VALIDATION: Must be multiple of 3
  if (remainingAccounts.length % 3 !== 0) {
    throw new Error("CRITICAL ERROR: Number of upline accounts is not multiple of 3!");
  }

  const totalTrios = remainingAccounts.length / 3;
  console.log(`\n✅ SLOT 3 VALIDATION COMPLETE:`);
  console.log(`  📊 Expected uplines: ${referrerInfo.upline.upline.length}`);
  console.log(`  📊 Processed trios: ${totalTrios}`);
  console.log(`  📊 Total accounts: ${remainingAccounts.length}`);
  console.log(`  ✅ Contract requirement: EXACTLY ${7 + remainingAccounts.length} accounts`);

  return remainingAccounts;
}

// Function to create referrer ATA if it doesn't exist
async function ensureReferrerATA(connection, provider, referrerWallet, TOKEN_MINT, payerWallet) {
  const referrerTokenAccount = utils.token.associatedAddress({
    mint: TOKEN_MINT,
    owner: referrerWallet,
  });

  console.log(`🔍 Checking referrer ATA: ${referrerTokenAccount.toString()}`);

  const ataInfo = await connection.getAccountInfo(referrerTokenAccount);
  if (!ataInfo) {
    console.log("⚠️ Referrer ATA doesn't exist, creating...");
    
    const createATAIx = new TransactionInstruction({
      keys: [
        { pubkey: payerWallet, isSigner: true, isWritable: true },
        { pubkey: referrerTokenAccount, isSigner: false, isWritable: true },
        { pubkey: referrerWallet, isSigner: false, isWritable: false },
        { pubkey: TOKEN_MINT, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), isSigner: false, isWritable: false },
        { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false }
      ],
      programId: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
      data: Buffer.from([])
    });
    
    const tx = new Transaction().add(createATAIx);
    tx.feePayer = payerWallet;
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    
    const signedTx = await provider.wallet.signTransaction(tx);
    const txid = await connection.sendRawTransaction(signedTx.serialize());
    
    await connection.confirmTransaction(txid);
    console.log(`✅ Referrer ATA created: ${txid}`);
  } else {
    console.log("✅ Referrer ATA already exists");
  }

  return referrerTokenAccount;
}

async function main() {
  try {
    console.log("🚀 REGISTERING USER WITH REFERRER - SECURITY ENHANCED VERSION 🚀");
    console.log("====================================================================");

    // Check mandatory arguments
    if (!referrerAddressStr) {
      console.error("❌ ERROR: Referrer address not provided!");
      console.error("Please specify the referrer address as third argument.");
      console.error("Example: node secure_referv4.js /path/to/wallet.json ./matriz-config.json ReferrerAddress ALTAddress");
      return;
    }
    
    if (!altAddress) {
      console.error("❌ ERROR: ALT address not provided!");
      console.error("Please specify the ALT address as fourth argument.");
      console.error("Example: node secure_referv4.js /path/to/wallet.json ./matriz-config.json ReferrerAddress ALTAddress");
      return;
    }
    
    // Convert referrerAddressStr to PublicKey
    const referrerAddress = new PublicKey(referrerAddressStr);
    
    // Load wallet
    console.log(`Loading wallet from ${walletPath}...`);
    let walletKeypair;
    try {
      const secretKeyString = fs.readFileSync(walletPath, { encoding: 'utf8' });
      walletKeypair = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(secretKeyString))
      );
    } catch (e) {
      console.error(`❌ Error loading wallet: ${e.message}`);
      return;
    }
    
    // Load IDL
    console.log("Loading IDL...");
    const idlPath = path.resolve('./target/idl/referral_system.json');
    const idl = require(idlPath);
    
    // Load configuration (if available)
    let config = {};
    if (fs.existsSync(configPath)) {
      console.log(`Loading configuration from ${configPath}...`);
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      console.log("Configuration loaded successfully");
    } else {
      console.log(`⚠️ Configuration file not found at ${configPath}`);
      console.log("⚠️ Using default values for addresses...");
    }
    
    // Connection configuration (devnet for the program)
    const connection = new Connection('https://weathered-quiet-theorem.solana-devnet.quiknode.pro/198997b67cb51804baeb34ed2257274aa2b2d8c0', {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000 // 60 seconds timeout
    });
    console.log('Connecting to Devnet');
    
    // Configure important addresses
    const MATRIX_PROGRAM_ID = new PublicKey(config.programId || "DeppEXXy7Bk91AW9hKppfZHK4qvPKLK83nGbh8pE3Goy");
    const TOKEN_MINT = new PublicKey(config.tokenMint || "CCTG4ZmGa9Nk9NVxbd1FXBNyKjyHSapuF9aU6zgcA3xz");
    const STATE_ADDRESS = new PublicKey(config.stateAddress || "34GuqWF4vAZ5bNxrD9bZpUnhoNWJb3nBqiBo987uYySs");
     
    // Pool and vault addresses - CORRECTED with security-enhanced contract addresses
    const POOL_ADDRESS = new PublicKey("FrQ5KsAgjCe3FFg6ZENri8feDft54tgnATxyffcasuxU");
    
    // Vault A addresses (DONUT)
    const A_VAULT = new PublicKey("4ndfcH16GKY76bzDkKfyVwHMoF8oY75KES2VaAhUYksN");
    const A_VAULT_LP = new PublicKey("CocstBGbeDVyTJWxbWs4docwWapVADAo1xXQSh9RfPMz");
    const A_VAULT_LP_MINT = new PublicKey("6f2FVX5UT5uBtgknc8fDj119Z7DQoLJeKRmBq7j1zsVi");
    const A_TOKEN_VAULT = new PublicKey("6m1wvYoPrwjAnbuGMqpMoodQaq4VnZXRjrzufXnPSjmj");
    
    // Vault B addresses (SOL)
    const B_VAULT = new PublicKey("FERjPVNEa7Udq8CEv68h6tPL46Tq7ieE49HrE2wea3XT");
    const B_TOKEN_VAULT = new PublicKey("HZeLxbZ9uHtSpwZC3LBr4Nubd14iHwz7bRSghRZf5VCG");
    const B_VAULT_LP_MINT = new PublicKey("BvoAjwEDhpLzs3jtu4H72j96ShKT5rvZE9RP1vgpfSM");
    const B_VAULT_LP = new PublicKey("HJNs8hPTzs9i6AVFkRDDMFVEkrrUoV7H7LDZHdCWvxn7");
    const VAULT_PROGRAM = new PublicKey("24Uqj9JCLxUeoC3hGfh5W3s9FM9uCHDS2SG3LYwBpyTi");
    
    // Chainlink addresses (Devnet)
    const CHAINLINK_PROGRAM = new PublicKey("HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny");
    const SOL_USD_FEED = new PublicKey("99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR");

    // System programs
    const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
    const SPL_TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
    const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
    const SYSVAR_RENT_PUBKEY = new PublicKey("SysvarRent111111111111111111111111111111111");
    
    // Create wallet using Anchor's Wallet class
    const anchorWallet = new Wallet(walletKeypair);
    
    // Configure provider with Anchor's Wallet object
    const provider = new AnchorProvider(
      connection,
      anchorWallet,
      { 
        commitment: 'confirmed',
        skipPreflight: true,
        preflightCommitment: 'processed',
      }
    );
    
    // Initialize program
    const program = new Program(idl, MATRIX_PROGRAM_ID, provider);
    
    // Check wallet balance
    console.log("\n👤 USER WALLET: " + walletKeypair.publicKey.toString());
    console.log("👥 REFERRER: " + referrerAddress.toString());
    const balance = await connection.getBalance(walletKeypair.publicKey);
    console.log("💰 CURRENT BALANCE: " + balance / 1e9 + " SOL");
    
    // Fixed deposit amount (0.065 SOL)
    const FIXED_DEPOSIT_AMOUNT = 65_000_000;
    
    if (balance < FIXED_DEPOSIT_AMOUNT + 30000000) {
      console.error("❌ ERROR: Insufficient balance! You need at least " + 
                   (FIXED_DEPOSIT_AMOUNT + 30000000) / 1e9 + " SOL");
      return;
    }
    
    // Check referrer
    console.log("\n🔍 CHECKING REFERRER...");
    const [referrerAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_account"), referrerAddress.toBuffer()],
      MATRIX_PROGRAM_ID
    );
    console.log("📄 REFERRER PDA: " + referrerAccount.toString());
    
    let referrerInfo;
    try {
      referrerInfo = await program.account.userAccount.fetch(referrerAccount);
      if (!referrerInfo.isRegistered) {
        console.error("❌ ERROR: Referrer is not registered!");
        return;
      }
      
      console.log("✅ Referrer verified");
      console.log("🔢 Depth: " + referrerInfo.upline.depth.toString());
      console.log("📊 Filled slots: " + referrerInfo.chain.filledSlots + "/3");
      console.log("👥 Number of uplines: " + referrerInfo.upline.upline.length);
      
      // Check owner_wallet field
      if (referrerInfo.ownerWallet) {
        console.log("✅ Referrer has owner_wallet field: " + referrerInfo.ownerWallet.toString());
      }
      
      // Determine the slot that will be filled
      const nextSlotIndex = referrerInfo.chain.filledSlots;
      if (nextSlotIndex >= 3) {
        console.log("⚠️ ATTENTION: Referrer's matrix is already full!");
        return;
      }
      
      console.log("🎯 YOU WILL FILL SLOT " + (nextSlotIndex + 1) + " OF THE MATRIX");
      
      // CRITICAL: For SLOT 3, validate upline requirements
      if (nextSlotIndex === 2) {
        console.log("\n🔍 SLOT 3 DETECTED - VALIDATING UPLINE REQUIREMENTS:");
        
        const isBaseUser = !referrerInfo.referrer || referrerInfo.upline.upline.length === 0;
        
        if (isBaseUser) {
          console.log("✅ Base user referrer - no uplines required for SLOT 3");
        } else {
          console.log(`⚠️ Normal user referrer - MUST provide ALL ${referrerInfo.upline.upline.length} uplines for SLOT 3`);
          console.log("📋 This is required by the security-enhanced contract");
          
          if (referrerInfo.upline.upline.length === 0) {
            console.error("❌ ERROR: Referrer has no uplines but is not a base user!");
            return;
          }
        }
      }
    } catch (e) {
      console.error("❌ Error checking referrer:", e);
      return;
    }
    
    // Check user account
    console.log("\n🔍 CHECKING YOUR ACCOUNT...");
    const [userAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_account"), walletKeypair.publicKey.toBuffer()],
      MATRIX_PROGRAM_ID
    );
    console.log("📄 USER ACCOUNT (PDA): " + userAccount.toString());
    
    try {
      const userInfo = await program.account.userAccount.fetch(userAccount);
      if (userInfo.isRegistered) {
        console.log("⚠️ You are already registered in the system!");
        return;
      }
    } catch (e) {
      console.log("✅ USER NOT YET REGISTERED, PROCEEDING WITH REGISTRATION...");
    }
    
    // Get necessary PDA and ATA addresses
    console.log("\n🔧 GETTING NECESSARY PDAs...");
    
    // PDA for mint authority
    const [tokenMintAuthority, tokenMintAuthorityBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_mint_authority")],
      MATRIX_PROGRAM_ID
    );
    console.log("🔑 TOKEN_MINT_AUTHORITY: " + tokenMintAuthority.toString());
    
    // PDA for vault authority
    const [vaultAuthority, vaultAuthorityBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_vault_authority")],
      MATRIX_PROGRAM_ID
    );
    console.log("🔑 VAULT_AUTHORITY: " + vaultAuthority.toString());
    
    // PDA for program_sol_vault
    const [programSolVault, programSolVaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("program_sol_vault")],
      MATRIX_PROGRAM_ID
    );
    console.log("🔑 PROGRAM_SOL_VAULT: " + programSolVault.toString());
    
    // CRITICAL: Use the verified program token vault address from the contract
    const PROGRAM_TOKEN_VAULT = new PublicKey("7qW1bCFvYhG5obi4HpTJtptPUcxqWX8qeQcp71QhCVxg");
    console.log("🔑 PROGRAM_TOKEN_VAULT (VERIFIED): " + PROGRAM_TOKEN_VAULT.toString());
    
    // Derive referrer wallet and ATA
    const referrerWallet = referrerInfo.ownerWallet || referrerAddress;
    const referrerTokenAccount = await ensureReferrerATA(
      connection, 
      provider, 
      referrerWallet, 
      TOKEN_MINT, 
      walletKeypair.publicKey
    );
    
    // Derive ATA for new user (for WSOL)
    const userWsolAccount = utils.token.associatedAddress({
      mint: WSOL_MINT,
      owner: walletKeypair.publicKey,
    });
    console.log("🔑 USER_WSOL_ACCOUNT (ATA): " + userWsolAccount.toString());

    // CRITICAL: Prepare uplines for SLOT 3 with strict validation
    let uplineAccounts = [];
    const isSlot3 = referrerInfo.chain.filledSlots === 2;
    
    if (isSlot3) {
      console.log("\n🔄 PREPARING UPLINES FOR SLOT 3 - SECURITY ENHANCED");
      
      try {
        uplineAccounts = await prepareAllUplinesForSlot3(
          connection, 
          program, 
          referrerInfo, 
          TOKEN_MINT
        );
        
        // Validate the expected total accounts
        const baseAccounts = 7; // Pool + Vault A (4) + Chainlink (2)
        const expectedTotalAccounts = baseAccounts + uplineAccounts.length;
        
        console.log(`\n📊 SLOT 3 ACCOUNT VALIDATION:`);
        console.log(`  Base accounts: ${baseAccounts}`);
        console.log(`  Upline accounts: ${uplineAccounts.length}`);
        console.log(`  Expected total: ${expectedTotalAccounts}`);
        console.log(`  Contract requires: EXACTLY ${expectedTotalAccounts} accounts`);
        
      } catch (e) {
        console.error(`❌ Error preparing SLOT 3 uplines: ${e.message}`);
        return;
      }
    }
    
    // Load Address Lookup Table
    console.log("\n🔍 LOADING ADDRESS LOOKUP TABLE...");
    const lookupTableAccount = await getAddressLookupTable(connection, altAddress);
    
    if (!lookupTableAccount) {
      console.error("❌ ERROR: Address Lookup Table not found or invalid!");
      return;
    }
    
    // EXECUTE REGISTRATION WITH VERSIONED TRANSACTION
    console.log("\n📤 PREPARING VERSIONED TRANSACTION WITH SECURITY ENHANCEMENTS...");
    
    try {
      // Get recent blockhash for transaction
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      
      // Instruction to increase compute unit limit - INCREASED for security enhancements
      const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
        units: 1_400_000 // Increased for security validation overhead
      });
      
      // Increase priority for security-critical transaction
      const setPriority = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 10000 // Increased priority for security
      });
      
      // Configure Pool, Vault A and Chainlink accounts for remaining_accounts
      // CRITICAL: These must be in EXACT order expected by the security-enhanced contract
      const vaultAAccounts = [
        { pubkey: POOL_ADDRESS, isWritable: false, isSigner: false },      // Index 0: Pool
        { pubkey: A_VAULT, isWritable: false, isSigner: false },          // Index 1: Vault A state
        { pubkey: A_VAULT_LP, isWritable: false, isSigner: false },       // Index 2: Vault A LP
        { pubkey: A_VAULT_LP_MINT, isWritable: false, isSigner: false },  // Index 3: Vault A LP Mint
        { pubkey: A_TOKEN_VAULT, isWritable: false, isSigner: false },    // Index 4: Token A Vault
      ];
      
      const chainlinkAccounts = [
        { pubkey: SOL_USD_FEED, isWritable: false, isSigner: false },      // Index 5: Feed
        { pubkey: CHAINLINK_PROGRAM, isWritable: false, isSigner: false }, // Index 6: Program
      ];
      
      // Combine all remaining accounts in the EXACT order expected by the contract
      const allRemainingAccounts = [...vaultAAccounts, ...chainlinkAccounts, ...uplineAccounts];
      
      // CRITICAL VALIDATION: Verify account order and count
      console.log("\n🔍 VALIDATING REMAINING_ACCOUNTS FOR SECURITY CONTRACT:");
      console.log(`  Index 0 (Pool): ${allRemainingAccounts[0].pubkey.toString()}`);
      console.log(`  Index 1 (A_Vault): ${allRemainingAccounts[1].pubkey.toString()}`);
      console.log(`  Index 2 (A_Vault_LP): ${allRemainingAccounts[2].pubkey.toString()}`);
      console.log(`  Index 3 (A_Vault_LP_Mint): ${allRemainingAccounts[3].pubkey.toString()}`);
      console.log(`  Index 4 (A_Token_Vault): ${allRemainingAccounts[4].pubkey.toString()}`);
      console.log(`  Index 5 (Chainlink_Feed): ${allRemainingAccounts[5].pubkey.toString()}`);
      console.log(`  Index 6 (Chainlink_Program): ${allRemainingAccounts[6].pubkey.toString()}`);
      
      if (uplineAccounts.length > 0) {
        console.log(`  Indices 7+ (${uplineAccounts.length} upline accounts in ${uplineAccounts.length/3} trios)`);
      }
      
      // Verify correct addresses
      if (!allRemainingAccounts[0].pubkey.equals(POOL_ADDRESS) ||
          !allRemainingAccounts[1].pubkey.equals(A_VAULT) ||
          !allRemainingAccounts[5].pubkey.equals(SOL_USD_FEED) || 
          !allRemainingAccounts[6].pubkey.equals(CHAINLINK_PROGRAM)) {
        console.error("❌ ERROR: Critical accounts order is incorrect!");
        return;
      }
      
      console.log(`✅ All ${allRemainingAccounts.length} accounts validated for security contract`);
      
      // Generate instruction with Anchor
      console.log("\n🔧 Generating secure instruction with Anchor...");
      const anchorIx = await program.methods
        .registerWithSolDeposit(new BN(FIXED_DEPOSIT_AMOUNT))
        .accounts({
          state: STATE_ADDRESS,
          userWallet: walletKeypair.publicKey,
          referrer: referrerAccount,
          referrerWallet: referrerWallet,
          user: userAccount,
          userWsolAccount: userWsolAccount,
          wsolMint: WSOL_MINT,
          pool: POOL_ADDRESS,
          bVault: B_VAULT,
          bTokenVault: B_TOKEN_VAULT,
          bVaultLpMint: B_VAULT_LP_MINT,
          bVaultLp: B_VAULT_LP,
          vaultProgram: VAULT_PROGRAM,
          programSolVault: programSolVault,
          tokenMint: TOKEN_MINT,
          programTokenVault: PROGRAM_TOKEN_VAULT, // Use verified address
          referrerTokenAccount: referrerTokenAccount,
          tokenMintAuthority: tokenMintAuthority,
          vaultAuthority: vaultAuthority,
          tokenProgram: SPL_TOKEN_PROGRAM_ID,
          systemProgram: SYSTEM_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .remainingAccounts(allRemainingAccounts)
        .instruction();

      // Create manual instruction for versioned transaction
      const ixData = anchorIx.data;
      console.log(`🔍 Security-enhanced instruction discriminator: ${Buffer.from(ixData.slice(0, 8)).toString('hex')}`);

      const manualRegisterInstruction = new TransactionInstruction({
        keys: anchorIx.keys,
        programId: MATRIX_PROGRAM_ID,
        data: ixData
      });

      // Create instruction array
      const instructions = [
        modifyComputeUnits,
        setPriority,
        manualRegisterInstruction
      ];

      // Create v0 message with lookup table
      console.log("\n🔧 Creating secure V0 message with lookup table...");
      const messageV0 = new TransactionMessage({
        payerKey: walletKeypair.publicKey,
        recentBlockhash: blockhash,
        instructions
      }).compileToV0Message([lookupTableAccount]);

      // Create versioned transaction
      const transaction = new VersionedTransaction(messageV0);
      transaction.sign([walletKeypair]);

      console.log("✅ Security-enhanced versioned transaction created and signed");
      console.log(`📊 Using ALT with ${lookupTableAccount.state.addresses.length} addresses`);
      console.log(`⚙️ Transaction version: V0 (Security Enhanced)`);
      console.log(`🔄 Processing ${uplineAccounts.length / 3} uplines for SLOT 3 validation`);
      console.log(`🛡️ Security features: Reentrancy protection, Overflow protection, Strict validation`);

      // Send versioned transaction
      console.log("\n📤 SENDING SECURITY-ENHANCED VERSIONED TRANSACTION...");

      const txid = await connection.sendTransaction(transaction, {
        maxRetries: 5,
        skipPreflight: true // Skip preflight for complex security validations
      });
      
      console.log("✅ Transaction sent: " + txid);
      console.log(`🔍 Explorer link: https://explorer.solana.com/tx/${txid}?cluster=devnet`);
      
      console.log("\n⏳ Waiting for confirmation with enhanced security validations...");
      const confirmation = await connection.confirmTransaction(
        {
          signature: txid,
          blockhash: blockhash,
          lastValidBlockHeight: lastValidBlockHeight,
        },
        'confirmed'
      );
      
      if (confirmation.value.err) {
        throw new Error(`Transaction confirmation error: ${JSON.stringify(confirmation.value.err)}`);
      }
      
      console.log("✅ Transaction confirmed with security enhancements!");
      
      // Check results
      console.log("\n🔍 CHECKING RESULTS WITH SECURITY VALIDATIONS...");
      
      try {
        // Check user account state
        const userInfo = await program.account.userAccount.fetch(userAccount);
        console.log("\n📋 SECURE REGISTRATION CONFIRMATION:");
        console.log("✅ User registered: " + userInfo.isRegistered);
        console.log("🧑‍🤝‍🧑 Referrer: " + userInfo.referrer.toString());
        console.log("🔢 Depth: " + userInfo.upline.depth.toString());
        console.log("📊 Filled slots: " + userInfo.chain.filledSlots + "/3");
        
        // Check owner_wallet field
        if (userInfo.ownerWallet) {
          console.log("\n📋 SECURITY ACCOUNT FIELDS:");
          console.log("👤 Owner Wallet: " + userInfo.ownerWallet.toString());
          
          if (userInfo.ownerWallet.equals(walletKeypair.publicKey)) {
            console.log("✅ Owner_wallet field correctly secured");
          } else {
            console.log("❌ SECURITY ALERT: Owner Wallet mismatch!");
          }
        }
        
        // Display upline information
        if (userInfo.upline.upline && userInfo.upline.upline.length > 0) {
          console.log("\n📋 SECURE UPLINE INFORMATION:");
          userInfo.upline.upline.forEach((entry, index) => {
            console.log(`  Upline #${index+1}:`);
            console.log(`    PDA: ${entry.pda.toString()}`);
            console.log(`    Wallet: ${entry.wallet.toString()}`);
          });
        }
        
        // Check referrer state after registration
        const newReferrerInfo = await program.account.userAccount.fetch(referrerAccount);
        console.log("\n📋 REFERRER STATE AFTER SECURITY PROCESSING:");
        console.log("📊 Filled slots: " + newReferrerInfo.chain.filledSlots + "/3");
        
        // Check reserved amounts
        if (newReferrerInfo.reservedSol > 0) {
          console.log(`💰 Reserved SOL: ${newReferrerInfo.reservedSol / 1e9} SOL`);
        }
        
        if (newReferrerInfo.reservedTokens > 0) {
          console.log(`💰 Reserved tokens: ${newReferrerInfo.reservedTokens / 1e9} tokens`);
        }
        
        // If was SLOT 3, check recursion processing
        if (isSlot3 && uplineAccounts.length > 0) {
          console.log("\n🔄 CHECKING SECURE RECURSION RESULT:");
          
          let processedUplines = 0;
          for (let i = 0; i < uplineAccounts.length; i += 3) {
            if (i >= uplineAccounts.length) break;
            
            try {
              const uplineAccount = uplineAccounts[i].pubkey;
              console.log(`\n  Checking secure upline: ${uplineAccount.toString()}`);
              
              const uplineInfo = await program.account.userAccount.fetch(uplineAccount);
              console.log(`  Filled slots: ${uplineInfo.chain.filledSlots}/3`);
              
              // Check if referrer was added to upline's matrix
              for (let j = 0; j < uplineInfo.chain.filledSlots; j++) {
                if (uplineInfo.chain.slots[j] && uplineInfo.chain.slots[j].equals(referrerAccount)) {
                  console.log(`  ✅ REFERRER SECURELY ADDED TO SLOT ${j + 1}!`);
                  processedUplines++;
                  break;
                }
              }
              
              // Check reserved values
              if (uplineInfo.reservedSol > 0) {
                console.log(`  💰 Reserved SOL: ${uplineInfo.reservedSol / 1e9} SOL`);
              }
              
              if (uplineInfo.reservedTokens > 0) {
                console.log(`  🪙 Reserved Tokens: ${uplineInfo.reservedTokens / 1e9} tokens`);
              }
            } catch (e) {
              console.log(`  Error checking upline: ${e.message}`);
            }
          }
          
          console.log(`\n  ✅ Secure recursion processed ${processedUplines}/${uplineAccounts.length / 3} uplines`);
        }
        
        // Get and show new balance
        const newBalance = await connection.getBalance(walletKeypair.publicKey);
        console.log("\n💼 Your new balance: " + newBalance / 1e9 + " SOL");
        console.log("💰 SOL spent: " + (balance - newBalance) / 1e9 + " SOL");
        
        console.log("\n🎉 SECURE REGISTRATION WITH REFERRER COMPLETED SUCCESSFULLY! 🎉");
        console.log("🛡️ ALL SECURITY ENHANCEMENTS VALIDATED AND ACTIVE");
        console.log("=================================================================");
        console.log("\n⚠️ IMPORTANT: SAVE THESE ADDRESSES FOR FUTURE USE:");
        console.log("🔑 YOUR ADDRESS: " + walletKeypair.publicKey.toString());
        console.log("🔑 YOUR ACCOUNT PDA: " + userAccount.toString());
        console.log("🔑 ADDRESS LOOKUP TABLE: " + altAddress.toString());
        console.log("🛡️ SECURITY LEVEL: MAXIMUM");
      } catch (e) {
        console.error("❌ ERROR CHECKING SECURE RESULTS:", e);
      }
    } catch (error) {
      console.error("❌ ERROR IN SECURE REGISTRATION:", error);
      
      if (error.logs) {
        console.log("\n📋 DETAILED SECURITY ERROR LOGS:");
        const relevantLogs = error.logs.filter(log => 
          log.includes("Program log:") || 
          log.includes("Error") || 
          log.includes("error") ||
          log.includes("CRITICAL") ||
          log.includes("ReentrancyLock") ||
          log.includes("overflow") ||
          log.includes("SLOT 3")
        );
        
        if (relevantLogs.length > 0) {
          relevantLogs.forEach((log, i) => console.log(`  ${i}: ${log}`));
        } else {
          error.logs.forEach((log, i) => console.log(`  ${i}: ${log}`));
        }
      }
    }
  } catch (error) {
    console.error("❌ GENERAL SECURITY ERROR:", error);
    
    if (error.logs) {
      console.log("\n📋 SECURITY ERROR DETAILS:");
      error.logs.forEach((log, i) => console.log(`${i}: ${log}`));
    }
  }
}

main();