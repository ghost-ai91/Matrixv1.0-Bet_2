// Script to register user with referrer using Chainlink Oracle and Address Lookup Table
// UPDATED VERSION - Compatible with the corrected library
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

// Function to prepare uplines for recursion - MODIFIED to process ALL uplines
async function prepareUplinesForRecursion(connection, program, uplinePDAs, TOKEN_MINT) {
  const remainingAccounts = [];
  const triosInfo = [];

  console.log(`\n🔄 PREPARING ${uplinePDAs.length} UPLINES (MAX 6) FOR RECURSION`);

  // First, collect information about the uplines
  for (let i = 0; i < Math.min(uplinePDAs.length, 6); i++) {
    const uplinePDA = uplinePDAs[i];
    console.log(`  Analyzing upline ${i + 1}: ${uplinePDA.toString()}`);

    try {
      // Check upline account
      const uplineInfo = await program.account.userAccount.fetch(uplinePDA);

      if (!uplineInfo.isRegistered) {
        console.log(`  ❌ Upline is not registered! Ignoring.`);
        continue;
      }

      // Determine upline wallet
      let uplineWallet;

      // Use directly the owner_wallet field (UPDATED for corrected library)
      if (uplineInfo.ownerWallet) {
        uplineWallet = uplineInfo.ownerWallet;
        console.log(`  ✅ Wallet obtained from owner_wallet field: ${uplineWallet.toString()}`);
      }
      // Fallback to UplineEntry structure if owner_wallet doesn't exist
      else if (
        uplineInfo.upline &&
        uplineInfo.upline.upline &&
        Array.isArray(uplineInfo.upline.upline) &&
        uplineInfo.upline.upline.length > 0
      ) {
        // Look for the entry corresponding to this specific upline
        let foundEntry = null;
        for (const entry of uplineInfo.upline.upline) {
          if (entry.pda && entry.pda.equals(uplinePDA)) {
            foundEntry = entry;
            console.log(`  ✅ Corresponding entry to this PDA found in UplineEntry structure`);
            break;
          }
        }

        if (foundEntry) {
          // Use correct entry data
          uplineWallet = foundEntry.wallet;
          console.log(`  ✅ Wallet obtained from corresponding entry: ${uplineWallet.toString()}`);
        } else {
          // If corresponding entry not found, use first entry
          console.log(`  ⚠️ Specific entry not found, using first entry in structure`);
          uplineWallet = uplineInfo.upline.upline[0].wallet;
          console.log(`    Wallet: ${uplineWallet.toString()}`);
        }
      } else {
        // Fallback to other methods if previous options fail
        console.log(`  ⚠️ UplineEntry structure absent or incomplete (possible base user)`);
        continue;
      }

      // Derive ATA for the token
      const uplineTokenAccount = utils.token.associatedAddress({
        mint: TOKEN_MINT,
        owner: uplineWallet,
      });

      console.log(`  💰 ATA derived for wallet: ${uplineTokenAccount.toString()}`);

      // Check if ATA exists and create if necessary
      const ataInfo = await connection.getAccountInfo(uplineTokenAccount);
      if (!ataInfo) {
        console.log(`  ⚠️ ATA doesn't exist, will be derived on-chain by contract`);
      } else {
        console.log(`  ✅ ATA already exists`);
      }

      // Store information for sorting - TRIO: PDA, wallet, ATA
      triosInfo.push({
        pda: uplinePDA,
        wallet: uplineWallet,
        ata: uplineTokenAccount,
        depth: parseInt(uplineInfo.upline.depth.toString()),
      });
    } catch (e) {
      console.log(`  ❌ Error analyzing upline: ${e.message}`);
    }
  }

  // IMPORTANT: Sort trios by DESCENDING depth (higher to lower)
  triosInfo.sort((a, b) => b.depth - a.depth);
  
  // MODIFICATION: Use all collected uplines without limitation
  console.log(`\n✅ PROCESSING ALL ${triosInfo.length} UPLINES IN RECURSION`);

  console.log(`\n📊 UPLINE PROCESSING ORDER (Higher depth → Lower):`);
  for (let i = 0; i < triosInfo.length; i++) {
    console.log(`  ${i + 1}. PDA: ${triosInfo[i].pda.toString()} (Depth: ${triosInfo[i].depth})`);
    console.log(`    Wallet: ${triosInfo[i].wallet.toString()}`);
    console.log(`    ATA (derived): ${triosInfo[i].ata.toString()}`);
  }

  // Build remainingAccounts array with ALL trios
  for (let i = 0; i < triosInfo.length; i++) {
    const trio = triosInfo[i];

    // 1. Add account PDA
    remainingAccounts.push({
      pubkey: trio.pda,
      isWritable: true,
      isSigner: false,
    });

    // 2. Add wallet
    remainingAccounts.push({
      pubkey: trio.wallet,
      isWritable: true,
      isSigner: false,
    });

    // 3. Add ATA
    remainingAccounts.push({
      pubkey: trio.ata,
      isWritable: true,
      isSigner: false,
    });
  }

  // Extra verification to ensure we only have trios
  if (remainingAccounts.length % 3 !== 0) {
    console.error("⚠️ ALERT: Number of accounts is not multiple of 3. This indicates a problem!");
  } else {
    console.log(`  ✅ Total uplines processed: ${remainingAccounts.length / 3}`);
    console.log(`  ✅ Total accounts added: ${remainingAccounts.length}`);
    console.log(`  ✅ Confirmed: ONLY TRIOS (PDA, wallet, ATA) being passed!`);
  }

  return remainingAccounts;
}

async function main() {
  try {
    console.log("🚀 REGISTERING USER WITH REFERRER, CHAINLINK ORACLE AND ALT 🚀");
    console.log("================================================================");

    // Check mandatory arguments
    if (!referrerAddressStr) {
      console.error("❌ ERROR: Referrer address not provided!");
      console.error("Please specify the referrer address as third argument.");
      console.error("Example: node referv4.js /path/to/wallet.json ./matriz-config.json ReferrerAddress ALTAddress");
      return;
    }
    
    if (!altAddress) {
      console.error("❌ ERROR: ALT address not provided!");
      console.error("Please specify the ALT address as fourth argument.");
      console.error("Example: node referv4.js /path/to/wallet.json ./matriz-config.json ReferrerAddress ALTAddress");
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
    const MATRIX_PROGRAM_ID = new PublicKey(config.programId || "4CxdTPK3Hxq2FJNBdAT44HK6rgMrBqSdbBMbudzGkSvt");
    const TOKEN_MINT = new PublicKey(config.tokenMint || "GNagERgSB6k6oLxpZ6kHyqaJqzS4zeJwqhhP1mTZRDTL");
    const STATE_ADDRESS = new PublicKey(config.stateAddress || "AaZukNFM4D6Rn2iByQFLHtfbiacsh58XEm3yzbzvdeL");
     
    // Pool and vault addresses
    const POOL_ADDRESS = new PublicKey("FrQ5KsAgjCe3FFg6ZENri8feDft54tgnATxyffcasuxU");
    
    // Vault A addresses (DONUT) - UPDATED with corrected addresses from the library
    const A_VAULT = new PublicKey("4ndfcH16GKY76bzDkKfyVwHMoF8oY75KES2VaAhUYksN"); // ← ADICIONADO
    const A_VAULT_LP = new PublicKey("CocstBGbeDVyTJWxbWs4docwWapVADAo1xXQSh9RfPMz");
    const A_VAULT_LP_MINT = new PublicKey("6f2FVX5UT5uBtgknc8fDj119Z7DQoLJeKRmBq7j1zsVi");
    const A_TOKEN_VAULT = new PublicKey("6m1wvYoPrwjAnbuGMqpMoodQaq4VnZXRjrzufXnPSjmj");
    
    // Vault B addresses (SOL) - UPDATED with corrected addresses from the library
    const B_VAULT = new PublicKey("FERjPVNEa7Udq8CEv68h6tPL46Tq7ieE49HrE2wea3XT");
    const B_TOKEN_VAULT = new PublicKey("HZeLxbZ9uHtSpwZC3LBr4Nubd14iHwz7bRSghRZf5VCG");
    const B_VAULT_LP_MINT = new PublicKey("BvoAjwEDhpLzs3jtu4H72j96ShKT5rvZE9RP1vgpfSM");
    const B_VAULT_LP = new PublicKey("HJNs8hPTzs9i6AVFkRDDMFVEkrrUoV7H7LDZHdCWvxn7");
    const VAULT_PROGRAM = new PublicKey("24Uqj9JCLxUeoC3hGfh5W3s9FM9uCHDS2SG3LYwBpyTi");
    
    // Chainlink addresses (Devnet) - UPDATED with corrected addresses from the library
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
        skipPreflight: true,      // Add this option
        preflightCommitment: 'processed', // Add this option
        disableAutomaticAccountCreation: true // If this option exists in Anchor (check documentation)
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
      
      // Check owner_wallet field - UPDATED for corrected library
      if (referrerInfo.ownerWallet) {
        console.log("✅ Referrer has owner_wallet field: " + referrerInfo.ownerWallet.toString());
      }
      
      // Warn about the slot to be filled
      const nextSlotIndex = referrerInfo.chain.filledSlots;
      if (nextSlotIndex >= 3) {
        console.log("⚠️ ATTENTION: Referrer's matrix is already full!");
        return;
      }
      
      console.log("🎯 YOU WILL FILL SLOT " + (nextSlotIndex + 1) + " OF THE MATRIX");
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
    
    // Derive ATA for token vault
    const programTokenVault = utils.token.associatedAddress({
      mint: TOKEN_MINT,
      owner: vaultAuthority,
    });
    console.log("🔑 PROGRAM_TOKEN_VAULT (ATA): " + programTokenVault.toString());
    
    // Derive ATA for referrer - UPDATED for corrected library
    let referrerTokenAccount;
    if (referrerInfo.ownerWallet) {
      // Use owner_wallet field to derive ATA
      referrerTokenAccount = utils.token.associatedAddress({
        mint: TOKEN_MINT,
        owner: referrerInfo.ownerWallet,
      });
    } else {
      // Fallback to direct referrer address
      referrerTokenAccount = utils.token.associatedAddress({
        mint: TOKEN_MINT,
        owner: referrerAddress,
      });
    }
    console.log("🔑 REFERRER_TOKEN_ACCOUNT (ATA): " + referrerTokenAccount.toString());
    
    // Derive ATA for new user (for WSOL)
    const userWsolAccount = utils.token.associatedAddress({
      mint: WSOL_MINT,
      owner: walletKeypair.publicKey,
    });
    console.log("🔑 USER_WSOL_ACCOUNT (ATA): " + userWsolAccount.toString());

    // IMPORTANT: Check and create necessary ATAs before proceeding
    console.log("\n🔧 CHECKING AND CREATING NECESSARY ATAS...");

    // Check ATAs
    try {
        // Check vault ATA
        const vaultTokenAccountInfo = await connection.getAccountInfo(programTokenVault);
        if (!vaultTokenAccountInfo) {
          console.log("  ⚠️ Vault ATA doesn't exist, will be created on-chain by program");
        } else {
          console.log("  ✅ Vault ATA already exists");
        }
        
        // Check referrer ATA
        const refTokenAccountInfo = await connection.getAccountInfo(referrerTokenAccount);
        if (!refTokenAccountInfo) {
          console.log("  ⚠️ Referrer ATA doesn't exist, creating explicitly...");
          
          // Create ATA for referrer
          const createRefATAIx = new TransactionInstruction({
            keys: [
              { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: true },
              { pubkey: referrerTokenAccount, isSigner: false, isWritable: true },
              { pubkey: referrerInfo.ownerWallet || referrerAddress, isSigner: false, isWritable: false }, // UPDATED
              { pubkey: TOKEN_MINT, isSigner: false, isWritable: false },
              { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
              { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
              { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }
            ],
            programId: ASSOCIATED_TOKEN_PROGRAM_ID,
            data: Buffer.from([])
          });
          
          const tx = new Transaction().add(createRefATAIx);
          tx.feePayer = walletKeypair.publicKey;
          const { blockhash } = await connection.getLatestBlockhash();
          tx.recentBlockhash = blockhash;
          
          const signedTx = await provider.wallet.signTransaction(tx);
          const txid = await connection.sendRawTransaction(signedTx.serialize());
          
          // Wait for transaction confirmation
          await connection.confirmTransaction(txid);
          console.log("  ✅ Referrer ATA created: " + txid);
        } else {
          console.log("  ✅ Referrer ATA already exists");
        }
    } catch (e) {
        console.error("  ❌ ERROR checking ATAs:", e);
    }
    
    // 4. Prepare uplines for recursion (if necessary)
    let uplineAccounts = [];
    const isSlot3 = referrerInfo.chain.filledSlots === 2;
    
    if (isSlot3 && referrerInfo.upline && referrerInfo.upline.upline) {
      console.log("\n🔄 Preparing uplines for recursion (slot 3)");
      
      try {
        const uplines = [];
        // Extract PDAs from UplineEntry structure
        for (const entry of referrerInfo.upline.upline) {
          uplines.push(entry.pda);
        }
        
        if (uplines && uplines.length > 0) {
          console.log(`  Found ${uplines.length} available uplines`);
          // Process uplines using adapted function
          uplineAccounts = await prepareUplinesForRecursion(connection, program, uplines, TOKEN_MINT);
        } else {
          console.log("  Referrer has no previous uplines");
        }
      } catch (e) {
        console.log(`❌ Error preparing recursion: ${e.message}`);
      }
    }
    
    // 5. Load Address Lookup Table (CORRECTED METHOD)
    console.log("\n🔍 LOADING ADDRESS LOOKUP TABLE...");
    
    // Get ALT directly from API using correct method
    const lookupTableAccount = await getAddressLookupTable(connection, altAddress);
    
    if (!lookupTableAccount) {
      console.error("❌ ERROR: Address Lookup Table not found or invalid!");
      return;
    }
    
    // 6. EXECUTE REGISTRATION WITH VERSIONED TRANSACTION
    console.log("\n📤 PREPARING VERSIONED TRANSACTION WITH ALT...");
    
    try {
      // Get recent blockhash for transaction
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      
      // Instruction to increase compute unit limit
      const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
        units: 1_400_000 // Increase to 1.4 million to ensure processing of all uplines
      });
      
      // Also add priority instruction
      const setPriority = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 5000 // Increase transaction priority
      });
      
      // Configure Vault A and Chainlink accounts for remaining_accounts
      const vaultAAccounts = [
        { pubkey: A_VAULT_LP, isWritable: true, isSigner: false },
        { pubkey: A_VAULT_LP_MINT, isWritable: true, isSigner: false },
        { pubkey: A_TOKEN_VAULT, isWritable: true, isSigner: false },
      ];
      
      const chainlinkAccounts = [
        { pubkey: SOL_USD_FEED, isWritable: false, isSigner: false },      // Feed at position 3
        { pubkey: CHAINLINK_PROGRAM, isWritable: false, isSigner: false }, // Program at position 4
      ];
      
      // Combine Vault A and Chainlink accounts with uplines for complete remaining_accounts
      const allRemainingAccounts = [...vaultAAccounts, ...chainlinkAccounts, ...uplineAccounts];
      
      // Check if indices 3 and 4 have correct addresses
      console.log("\n🔍 CHECKING REMAINING_ACCOUNTS ORDER:");
      console.log(`  Index 3 (Feed): ${allRemainingAccounts[3].pubkey.toString()}`);
      console.log(`  Index 4 (Program): ${allRemainingAccounts[4].pubkey.toString()}`);
      console.log(`  Expected Feed address: ${SOL_USD_FEED.toString()}`);
      console.log(`  Expected Program address: ${CHAINLINK_PROGRAM.toString()}`);
      
      if (!allRemainingAccounts[3].pubkey.equals(SOL_USD_FEED) || 
          !allRemainingAccounts[4].pubkey.equals(CHAINLINK_PROGRAM)) {
        console.error("❌ ERROR: Chainlink accounts order is incorrect!");
        return;
      }
      
      // Generate instruction with Anchor just to get correct format
      console.log("\n🔧 Generating instruction with Anchor...");
      const anchorIx = await program.methods
        .registerWithSolDeposit(new BN(FIXED_DEPOSIT_AMOUNT))
        .accounts({
          state: STATE_ADDRESS,
          userWallet: walletKeypair.publicKey,
          referrer: referrerAccount,
          referrerWallet: referrerInfo.ownerWallet || referrerAddress, // UPDATED for corrected library
          user: userAccount,
          userWsolAccount: userWsolAccount,
          wsolMint: WSOL_MINT,
          pool: POOL_ADDRESS,
          aVault: A_VAULT, // ← ADICIONADO: Esta era a linha que faltava!
          bVault: B_VAULT,
          bTokenVault: B_TOKEN_VAULT,
          bVaultLpMint: B_VAULT_LP_MINT,
          bVaultLp: B_VAULT_LP,
          vaultProgram: VAULT_PROGRAM,
          programSolVault: programSolVault,
          tokenMint: TOKEN_MINT,
          programTokenVault: programTokenVault,
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

      // Extract instruction data to use in our manual instruction
      const ixData = anchorIx.data;
      console.log(`🔍 Instruction generated with discriminator: ${Buffer.from(ixData.slice(0, 8)).toString('hex')}`);

      // Create new manual instruction with same data
      const manualRegisterInstruction = new TransactionInstruction({
        keys: anchorIx.keys,
        programId: MATRIX_PROGRAM_ID,
        data: ixData
      });

      // Create instruction array
      console.log("🔧 Creating instructions for transaction...");
      const instructions = [
        modifyComputeUnits,
        setPriority,
        manualRegisterInstruction
      ];

      // Create v0 message with lookup table
      console.log("\n🔧 Creating V0 message with lookup table...");
      const messageV0 = new TransactionMessage({
        payerKey: walletKeypair.publicKey,
        recentBlockhash: blockhash,
        instructions
      }).compileToV0Message([lookupTableAccount]);

      // Create versioned transaction
      const transaction = new VersionedTransaction(messageV0);

      // Sign transaction with payer
      transaction.sign([walletKeypair]);

      console.log("✅ Manual versioned transaction created and signed");
      console.log(`📊 Using ALT with ${lookupTableAccount.state.addresses.length} addresses`);
      console.log(`⚙️ Transaction version: V0 (Manual Versioned)`);
      console.log(`🔄 Processing ${uplineAccounts.length / 3} uplines in recursion`);

      // Send versioned transaction
      console.log("\n📤 SENDING MANUAL VERSIONED TRANSACTION...");

      // Send transaction with retry and without preflight
      const txid = await connection.sendTransaction(transaction, {
        maxRetries: 5,
        skipPreflight: true
      });
      
      console.log("✅ Transaction sent: " + txid);
      console.log(`🔍 Explorer link: https://explorer.solana.com/tx/${txid}?cluster=devnet`);
      
      console.log("\n⏳ Waiting for confirmation...");
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
      
      console.log("✅ Transaction confirmed!");
      console.log("✅ Transaction version: V0 (Versioned)");
      
      // 7. Check results
      console.log("\n🔍 CHECKING RESULTS...");
      
      try {
        // Check user account state
        const userInfo = await program.account.userAccount.fetch(userAccount);
        console.log("\n📋 REGISTRATION CONFIRMATION:");
        console.log("✅ User registered: " + userInfo.isRegistered);
        console.log("🧑‍🤝‍🧑 Referrer: " + userInfo.referrer.toString());
        console.log("🔢 Depth: " + userInfo.upline.depth.toString());
        console.log("📊 Filled slots: " + userInfo.chain.filledSlots + "/3");
        
        // Check owner_wallet field - UPDATED for corrected library
        if (userInfo.ownerWallet) {
          console.log("\n📋 ACCOUNT FIELDS:");
          console.log("👤 Owner Wallet: " + userInfo.ownerWallet.toString());
          
          if (userInfo.ownerWallet.equals(walletKeypair.publicKey)) {
            console.log("✅ The owner_wallet field was correctly filled");
          } else {
            console.log("❌ ALERT: Owner Wallet doesn't match user's wallet!");
          }
        }
        
        // Display UplineEntry structure information
        if (userInfo.upline.upline && userInfo.upline.upline.length > 0) {
          console.log("\n📋 UPLINE INFORMATION:");
          userInfo.upline.upline.forEach((entry, index) => {
            console.log(`  Upline #${index+1}:`);
            console.log(`    PDA: ${entry.pda.toString()}`);
            console.log(`    Wallet: ${entry.wallet.toString()}`);
          });
        }
        
        // Check referrer state after registration
        const newReferrerInfo = await program.account.userAccount.fetch(referrerAccount);
        console.log("\n📋 REFERRER STATE AFTER REGISTRATION:");
        console.log("📊 Filled slots: " + newReferrerInfo.chain.filledSlots + "/3");
        
        // Check reserved tokens (if we're in slot 2)
        if (
          referrerInfo.chain.filledSlots === 1 &&
          newReferrerInfo.reservedTokens > 0
        ) {
          console.log(`💰 Reserved tokens: ${newReferrerInfo.reservedTokens / 1e9} tokens`);
        }
        
        // If was in slot 3, check recursion processing
        if (isSlot3 && uplineAccounts.length > 0) {
          console.log("\n🔄 CHECKING RECURSION RESULT:");
          
          let uplineReverseCount = 0;
          for (let i = 0; i < uplineAccounts.length; i += 3) {
            if (i >= uplineAccounts.length) break;
            
            try {
              const uplineAccount = uplineAccounts[i].pubkey;
              
              console.log(`\n  Checking upline: ${uplineAccount.toString()}`);
              
              const uplineInfo = await program.account.userAccount.fetch(uplineAccount);
              console.log(`  Filled slots: ${uplineInfo.chain.filledSlots}/3`);
              
              // Check if referrer was added to upline's matrix
              for (let j = 0; j < uplineInfo.chain.filledSlots; j++) {
                if (
                  uplineInfo.chain.slots[j] &&
                  uplineInfo.chain.slots[j].equals(referrerAccount)
                ) {
                  console.log(`  ✅ REFERRER ADDED TO SLOT ${j + 1}!`);
                  uplineReverseCount++;
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
          
          console.log(`\n  ✅ Recursion processed ${uplineReverseCount}/${uplineAccounts.length / 3} uplines`);
        }
        
        // Get and show new balance
        const newBalance = await connection.getBalance(walletKeypair.publicKey);
        console.log("\n💼 Your new balance: " + newBalance / 1e9 + " SOL");
        console.log("💰 SOL spent: " + (balance - newBalance) / 1e9 + " SOL");
        
        console.log("\n🎉 REGISTRATION WITH REFERRER AND ALT COMPLETED SUCCESSFULLY! 🎉");
        console.log("===========================================================");
        console.log("\n⚠️ IMPORTANT: SAVE THESE ADDRESSES FOR FUTURE USE:");
        console.log("🔑 YOUR ADDRESS: " + walletKeypair.publicKey.toString());
        console.log("🔑 YOUR ACCOUNT PDA: " + userAccount.toString());
        console.log("🔑 ADDRESS LOOKUP TABLE: " + altAddress.toString());
      } catch (e) {
        console.error("❌ ERROR CHECKING RESULTS:", e);
      }
    } catch (error) {
      console.error("❌ ERROR REGISTERING USER:", error);
      
      if (error.logs) {
        console.log("\n📋 DETAILED ERROR LOGS:");
        const relevantLogs = error.logs.filter(log => 
          log.includes("Program log:") || 
          log.includes("Error") || 
          log.includes("error")
        );
        
        if (relevantLogs.length > 0) {
          relevantLogs.forEach((log, i) => console.log(`  ${i}: ${log}`));
        } else {
          error.logs.forEach((log, i) => console.log(`  ${i}: ${log}`));
        }
      }
    }
  } catch (error) {
    console.error("❌ GENERAL ERROR DURING PROCESS:", error);
    
    if (error.logs) {
      console.log("\n📋 DETAILED ERROR LOGS:");
      error.logs.forEach((log, i) => console.log(`${i}: ${log}`));
    }
  }
}

main();