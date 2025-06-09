// Cliente FINAL para registrar usuário com referenciador - WSOL via Remaining Accounts
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

// Receber parâmetros da linha de comando (obrigatório: referenciador e ALT)
const args = process.argv.slice(2);
const walletPath = args[0] || './carteiras/carteira1.json';
const configPath = args[1] || './matriz-config.json';
const referrerAddressStr = args[2]; // Endereço do referenciador como string
const altAddress = args[3]; // Endereço da ALT como argumento obrigatório

// Função para mostrar detalhes completos da Address Lookup Table
async function getAddressLookupTable(connection, altAddress) {
  console.log("\n📋 OBTENDO ADDRESS LOOKUP TABLE:");
  
  try {
    const lookupTableInfo = await connection.getAddressLookupTable(new PublicKey(altAddress));
    if (!lookupTableInfo.value) {
      console.log("❌ ALT não encontrada!");
      return null;
    }
    
    const lookupTable = lookupTableInfo.value;
    console.log(`✅ ALT encontrada: ${altAddress}`);
    console.log(`🔢 Total de endereços: ${lookupTable.state.addresses.length}`);
    console.log(`🔑 Autoridade: ${lookupTable.state.authority ? lookupTable.state.authority.toString() : 'Nenhuma'}`);
    
    console.log("\n📋 LISTA COMPLETA DE ENDEREÇOS:");
    lookupTable.state.addresses.forEach((address, index) => {
      console.log(`  ${index}: ${address.toString()}`);
    });
    
    console.log("\n📋 VALIDANDO OBJETO DA LOOKUP TABLE:");
    console.log(`  Tipo: ${typeof lookupTable}`);
    console.log(`  Tem propriedade 'key': ${lookupTable.key ? "Sim" : "Não"}`);
    console.log(`  Tem propriedade 'state': ${lookupTable.state ? "Sim" : "Não"}`);
    
    return lookupTable;
  } catch (error) {
    console.error(`❌ Erro ao obter ALT: ${error}`);
    return null;
  }
}

// Função para preparar uplines para recursividade
async function prepareUplinesForRecursion(connection, program, uplinePDAs, TOKEN_MINT) {
  const remainingAccounts = [];
  const triosInfo = [];

  console.log(`\n🔄 PREPARANDO ${uplinePDAs.length} UPLINES (MAX 6) PARA RECURSIVIDADE`);

  for (let i = 0; i < Math.min(uplinePDAs.length, 6); i++) {
    const uplinePDA = uplinePDAs[i];
    console.log(`  Analisando upline ${i + 1}: ${uplinePDA.toString()}`);

    try {
      const uplineInfo = await program.account.userAccount.fetch(uplinePDA);

      if (!uplineInfo.isRegistered) {
        console.log(`  ❌ Upline não está registrado! Ignorando.`);
        continue;
      }

      let uplineWallet;

      if (uplineInfo.ownerWallet) {
        uplineWallet = uplineInfo.ownerWallet;
        console.log(`  ✅ Wallet obtida do campo owner_wallet: ${uplineWallet.toString()}`);
      }
      else if (
        uplineInfo.upline &&
        uplineInfo.upline.upline &&
        Array.isArray(uplineInfo.upline.upline) &&
        uplineInfo.upline.upline.length > 0
      ) {
        let foundEntry = null;
        for (const entry of uplineInfo.upline.upline) {
          if (entry.pda && entry.pda.equals(uplinePDA)) {
            foundEntry = entry;
            console.log(`  ✅ Entrada correspondente a este PDA encontrada na estrutura UplineEntry`);
            break;
          }
        }

        if (foundEntry) {
          uplineWallet = foundEntry.wallet;
          console.log(`  ✅ Wallet obtida da entrada correspondente: ${uplineWallet.toString()}`);
        } else {
          console.log(`  ⚠️ Entrada específica não encontrada, usando primeira entrada da estrutura`);
          uplineWallet = uplineInfo.upline.upline[0].wallet;
          console.log(`    Wallet: ${uplineWallet.toString()}`);
        }
      } else {
        console.log(`  ⚠️ Estrutura UplineEntry ausente ou incompleta (possível usuário base)`);
        continue;
      }

      const uplineTokenAccount = utils.token.associatedAddress({
        mint: TOKEN_MINT,
        owner: uplineWallet,
      });

      console.log(`  💰 ATA derivada para a wallet: ${uplineTokenAccount.toString()}`);

      const ataInfo = await connection.getAccountInfo(uplineTokenAccount);
      if (!ataInfo) {
        console.log(`  ⚠️ ATA não existe, será derivada on-chain pelo contrato`);
      } else {
        console.log(`  ✅ ATA já existe`);
      }

      triosInfo.push({
        pda: uplinePDA,
        wallet: uplineWallet,
        ata: uplineTokenAccount,
        depth: parseInt(uplineInfo.upline.depth.toString()),
      });
    } catch (e) {
      console.log(`  ❌ Erro ao analisar upline: ${e.message}`);
    }
  }

  triosInfo.sort((a, b) => b.depth - a.depth);
  
  console.log(`\n✅ PROCESSANDO TODAS AS ${triosInfo.length} UPLINES NA RECURSIVIDADE`);

  console.log(`\n📊 ORDEM DE PROCESSAMENTO DAS UPLINES (Maior profundidade → Menor):`);
  for (let i = 0; i < triosInfo.length; i++) {
    console.log(`  ${i + 1}. PDA: ${triosInfo[i].pda.toString()} (Profundidade: ${triosInfo[i].depth})`);
    console.log(`    Wallet: ${triosInfo[i].wallet.toString()}`);
    console.log(`    ATA (derivada): ${triosInfo[i].ata.toString()}`);
  }

  for (let i = 0; i < triosInfo.length; i++) {
    const trio = triosInfo[i];

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

  if (remainingAccounts.length % 3 !== 0) {
    console.error("⚠️ ALERTA: Número de contas não é múltiplo de 3. Isso indica um problema!");
  } else {
    console.log(`  ✅ Total de uplines processados: ${remainingAccounts.length / 3}`);
    console.log(`  ✅ Total de contas adicionadas: ${remainingAccounts.length}`);
    console.log(`  ✅ Confirmado: APENAS TRIOS (PDA, wallet, ATA) sendo passados!`);
  }

  return remainingAccounts;
}

async function main() {
  try {
    console.log("🚀 REGISTRANDO USUÁRIO COM WSOL VIA REMAINING ACCOUNTS 🚀");
    console.log("===========================================================");

    // Verificar argumentos obrigatórios
    if (!referrerAddressStr) {
      console.error("❌ ERRO: Endereço do referenciador não fornecido!");
      console.error("Por favor, especifique o endereço do referenciador como terceiro argumento.");
      console.error("Exemplo: node script.js /caminho/para/carteira.json ./config.json EnderecoDoReferenciador EnderecoALT");
      return;
    }
    
    if (!altAddress) {
      console.error("❌ ERRO: Endereço da ALT não fornecido!");
      console.error("Por favor, especifique o endereço da ALT como quarto argumento.");
      console.error("Exemplo: node script.js /caminho/para/carteira.json ./config.json EnderecoDoReferenciador EnderecoALT");
      return;
    }
    
    const referrerAddress = new PublicKey(referrerAddressStr);
    
    console.log(`Carregando carteira de ${walletPath}...`);
    let walletKeypair;
    try {
      const secretKeyString = fs.readFileSync(walletPath, { encoding: 'utf8' });
      walletKeypair = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(secretKeyString))
      );
    } catch (e) {
      console.error(`❌ Erro ao carregar carteira: ${e.message}`);
      return;
    }
    
    console.log("Carregando IDL...");
    const idlPath = path.resolve('./target/idl/referral_system.json');
    const idl = require(idlPath);
    
    let config = {};
    if (fs.existsSync(configPath)) {
      console.log(`Carregando configuração de ${configPath}...`);
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      console.log("Configuração carregada com sucesso");
    } else {
      console.log(`⚠️ Arquivo de configuração não encontrado em ${configPath}`);
      console.log("⚠️ Usando valores padrão para endereços...");
    }
    
    const connection = new Connection('https://weathered-quiet-theorem.solana-devnet.quiknode.pro/198997b67cb51804baeb34ed2257274aa2b2d8c0', {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000
    });
    console.log('Conectando à Devnet');
    
    // Configurar endereços importantes
    const MATRIX_PROGRAM_ID = new PublicKey(config.programId || "2wFmCLVQ8pSF2aKu43gLv2vzasUHhtmAA9HffBDXcRfF");
    const TOKEN_MINT = new PublicKey(config.tokenMint || "3dCXCZd3cbKHT7jQSLzRNJQYu1zEzaD8FHi4MWHLX4DZ");
    const STATE_ADDRESS = new PublicKey(config.stateAddress || "2UndNrTvi635pfsM5TZQr9KnMMNS29Ry6mtSCjcBFUyc");
     
    // Pool e vault addresses
    const POOL_ADDRESS = new PublicKey("BEuzx33ecm4rtgjtB2bShqGco4zMkdr6ioyzPh6vY9ot");
    
    // Vault A addresses (DONUT)
    const A_VAULT_LP = new PublicKey("BGh2tc4kagmEmVvaogdcAodVDvUxmXWivYL5kxwapm31");
    const A_VAULT_LP_MINT = new PublicKey("Bk33KwVZ8hsgr3uSb8GGNJZpAEqH488oYPvoY5W9djVP");
    const A_TOKEN_VAULT = new PublicKey("HoASBFustFYysd9aCu6M3G3kve88j22LAyTpvCNp5J65");
    
    // Vault B addresses (SOL)
    const B_VAULT = new PublicKey("FERjPVNEa7Udq8CEv68h6tPL46Tq7ieE49HrE2wea3XT");
    const B_TOKEN_VAULT = new PublicKey("HZeLxbZ9uHtSpwZC3LBr4Nubd14iHwz7bRSghRZf5VCG");
    const B_VAULT_LP_MINT = new PublicKey("BvoAjwEDhpLzs3jtu4H72j96ShKT5rvZE9RP1vgpfSM");
    const B_VAULT_LP = new PublicKey("8mNjx5Aww9DX33uFxZwqb7m2vhsavrxyzkME3hE63sT2");
    const VAULT_PROGRAM = new PublicKey("24Uqj9JCLxUeoC3hGfh5W3s9FM9uCHDS2SG3LYwBpyTi");
    
    // Chainlink addresses (Devnet)
    const CHAINLINK_PROGRAM = new PublicKey("HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny");
    const SOL_USD_FEED = new PublicKey("99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR");

    // Programas do sistema
    const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
    const SPL_TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
    const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
    const SYSVAR_RENT_PUBKEY = new PublicKey("SysvarRent111111111111111111111111111111111");
    
    const anchorWallet = new Wallet(walletKeypair);
    
    const provider = new AnchorProvider(
      connection,
      anchorWallet,
      { 
        commitment: 'confirmed',
        skipPreflight: true,
        preflightCommitment: 'processed',
        disableAutomaticAccountCreation: true
      }
    );
    
    const program = new Program(idl, MATRIX_PROGRAM_ID, provider);
    
    console.log("\n👤 CARTEIRA DO USUÁRIO: " + walletKeypair.publicKey.toString());
    console.log("👥 REFERENCIADOR: " + referrerAddress.toString());
    const balance = await connection.getBalance(walletKeypair.publicKey);
    console.log("💰 SALDO ATUAL: " + balance / 1e9 + " SOL");
    
    const FIXED_DEPOSIT_AMOUNT = 80_000_000;
    
    if (balance < FIXED_DEPOSIT_AMOUNT + 30000000) {
      console.error("❌ ERRO: Saldo insuficiente! Você precisa de pelo menos " + 
                   (FIXED_DEPOSIT_AMOUNT + 30000000) / 1e9 + " SOL");
      return;
    }
    
    console.log("\n🔍 VERIFICANDO REFERENCIADOR...");
    const [referrerAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_account"), referrerAddress.toBuffer()],
      MATRIX_PROGRAM_ID
    );
    console.log("📄 PDA DO REFERENCIADOR: " + referrerAccount.toString());
    
    let referrerInfo;
    try {
      referrerInfo = await program.account.userAccount.fetch(referrerAccount);
      if (!referrerInfo.isRegistered) {
        console.error("❌ ERRO: O referenciador não está registrado!");
        return;
      }
      
      console.log("✅ Referenciador verificado");
      console.log("🔢 Profundidade: " + referrerInfo.upline.depth.toString());
      console.log("📊 Slots preenchidos: " + referrerInfo.chain.filledSlots + "/3");
      
      if (referrerInfo.ownerWallet) {
        console.log("✅ Referenciador tem campo owner_wallet: " + referrerInfo.ownerWallet.toString());
      }
      
      const nextSlotIndex = referrerInfo.chain.filledSlots;
      if (nextSlotIndex >= 3) {
        console.log("⚠️ ATENÇÃO: A matriz do referenciador já está cheia!");
        return;
      }
      
      console.log("🎯 VOCÊ PREENCHERÁ O SLOT " + (nextSlotIndex + 1) + " DA MATRIZ");
      
      // 🎯 INFORMAÇÃO OTIMIZADA SOBRE WSOL
      console.log("\n💡 INFORMAÇÃO SOBRE USO DE WSOL (VIA REMAINING ACCOUNTS):");
      if (nextSlotIndex === 0) {
        console.log("✅ SLOT 1 (idx 0): WSOL será passada via remaining_accounts (posição 5)");
        console.log("   📍 Depósito será feito na pool usando WSOL existente");
      } else if (nextSlotIndex === 1) {
        console.log("ℹ️ SLOT 2 (idx 1): WSOL NÃO será necessária");
        console.log("   📍 SOL será usado diretamente para reserva + mint de tokens");
      } else if (nextSlotIndex === 2) {
        console.log("🔄 SLOT 3 (idx 2): WSOL pode ser usada na recursividade");
        console.log("   📍 WSOL será passada via remaining_accounts quando necessário");
      }
    } catch (e) {
      console.error("❌ Erro ao verificar referenciador:", e);
      return;
    }
    
    console.log("\n🔍 VERIFICANDO SUA CONTA...");
    const [userAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_account"), walletKeypair.publicKey.toBuffer()],
      MATRIX_PROGRAM_ID
    );
    console.log("📄 CONTA DO USUÁRIO (PDA): " + userAccount.toString());
    
    try {
      const userInfo = await program.account.userAccount.fetch(userAccount);
      if (userInfo.isRegistered) {
        console.log("⚠️ Você já está registrado no sistema!");
        return;
      }
    } catch (e) {
      console.log("✅ USUÁRIO AINDA NÃO REGISTRADO, PROSSEGUINDO COM O REGISTRO...");
    }
    
    console.log("\n🔧 OBTENDO PDAs NECESSÁRIAS...");
    
    const [tokenMintAuthority, tokenMintAuthorityBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_mint_authority")],
      MATRIX_PROGRAM_ID
    );
    console.log("🔑 TOKEN_MINT_AUTHORITY: " + tokenMintAuthority.toString());
    
    const [vaultAuthority, vaultAuthorityBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_vault_authority")],
      MATRIX_PROGRAM_ID
    );
    console.log("🔑 VAULT_AUTHORITY: " + vaultAuthority.toString());
    
    const [programSolVault, programSolVaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("program_sol_vault")],
      MATRIX_PROGRAM_ID
    );
    console.log("🔑 PROGRAM_SOL_VAULT: " + programSolVault.toString());
    
    const programTokenVault = utils.token.associatedAddress({
      mint: TOKEN_MINT,
      owner: vaultAuthority,
    });
    console.log("🔑 PROGRAM_TOKEN_VAULT (ATA): " + programTokenVault.toString());
    
    let referrerTokenAccount;
    if (referrerInfo.ownerWallet) {
      referrerTokenAccount = utils.token.associatedAddress({
        mint: TOKEN_MINT,
        owner: referrerInfo.ownerWallet,
      });
    } else {
      referrerTokenAccount = utils.token.associatedAddress({
        mint: TOKEN_MINT,
        owner: referrerAddress,
      });
    }
    console.log("🔑 REFERRER_TOKEN_ACCOUNT (ATA): " + referrerTokenAccount.toString());
    
    // 🎯 CRIAÇÃO DA CONTA WSOL QUANDO NECESSÁRIA
    let userWsolAccount = null;
    const nextSlotIndex = referrerInfo.chain.filledSlots;
    const needsWsol = nextSlotIndex === 0 || nextSlotIndex === 2; // SLOT 1 ou SLOT 3
    
    if (needsWsol) {
      console.log("\n🔧 CRIANDO CONTA WSOL (NECESSÁRIA PARA ESTE SLOT)...");
      
      userWsolAccount = utils.token.associatedAddress({
        mint: WSOL_MINT,
        owner: walletKeypair.publicKey,
      });
      
      console.log("💰 WSOL Account (ATA): " + userWsolAccount.toString());
      
      // Verificar se já existe
      const wsolAccountInfo = await connection.getAccountInfo(userWsolAccount);
      if (!wsolAccountInfo) {
        console.log("  ⚠️ Conta WSOL não existe, criando...");
        
        const createWsolATAIx = new TransactionInstruction({
          keys: [
            { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: true },
            { pubkey: userWsolAccount, isSigner: false, isWritable: true },
            { pubkey: walletKeypair.publicKey, isSigner: false, isWritable: false },
            { pubkey: WSOL_MINT, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }
          ],
          programId: ASSOCIATED_TOKEN_PROGRAM_ID,
          data: Buffer.from([])
        });
        
        const tx = new Transaction().add(createWsolATAIx);
        tx.feePayer = walletKeypair.publicKey;
        const { blockhash } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        
        const signedTx = await provider.wallet.signTransaction(tx);
        const txid = await connection.sendRawTransaction(signedTx.serialize());
        
        await connection.confirmTransaction(txid);
        console.log("  ✅ Conta WSOL criada: " + txid);
        
        // Financiar conta WSOL com SOL + rent exempt
        const rentExempt = await connection.getMinimumBalanceForRentExemption(165); // Token account size
        const totalToWrap = FIXED_DEPOSIT_AMOUNT + rentExempt;
        
        console.log("  💰 Financiando conta WSOL com " + totalToWrap / 1e9 + " SOL...");
        
        const transferToWsolIx = SystemProgram.transfer({
          fromPubkey: walletKeypair.publicKey,
          toPubkey: userWsolAccount,
          lamports: totalToWrap,
        });
        
        const syncNativeIx = new TransactionInstruction({
          keys: [{ pubkey: userWsolAccount, isSigner: false, isWritable: true }],
          programId: SPL_TOKEN_PROGRAM_ID,
          data: Buffer.from([17]) // SyncNative instruction
        });
        
        const wrapTx = new Transaction().add(transferToWsolIx, syncNativeIx);
        wrapTx.feePayer = walletKeypair.publicKey;
        const { blockhash: wrapBlockhash } = await connection.getLatestBlockhash();
        wrapTx.recentBlockhash = wrapBlockhash;
        
        const signedWrapTx = await provider.wallet.signTransaction(wrapTx);
        const wrapTxid = await connection.sendRawTransaction(signedWrapTx.serialize());
        
        await connection.confirmTransaction(wrapTxid);
        console.log("  ✅ WSOL financiada e sincronizada: " + wrapTxid);
      } else {
        console.log("  ✅ Conta WSOL já existe");
        
        // Verificar saldo e financiar se necessário
        try {
          const tokenAccountData = await connection.getTokenAccountBalance(userWsolAccount);
          const currentBalance = tokenAccountData.value.uiAmount || 0;
          const requiredBalance = FIXED_DEPOSIT_AMOUNT / 1e9;
          
          if (currentBalance < requiredBalance) {
            console.log(`  💰 Saldo insuficiente: ${currentBalance} SOL, necessário: ${requiredBalance} SOL`);
            console.log("  💰 Adicionando SOL à conta WSOL...");
            
            const transferToWsolIx = SystemProgram.transfer({
              fromPubkey: walletKeypair.publicKey,
              toPubkey: userWsolAccount,
              lamports: FIXED_DEPOSIT_AMOUNT,
            });
            
            const syncNativeIx = new TransactionInstruction({
              keys: [{ pubkey: userWsolAccount, isSigner: false, isWritable: true }],
              programId: SPL_TOKEN_PROGRAM_ID,
              data: Buffer.from([17]) // SyncNative instruction
            });
            
            const fundTx = new Transaction().add(transferToWsolIx, syncNativeIx);
            fundTx.feePayer = walletKeypair.publicKey;
            const { blockhash: fundBlockhash } = await connection.getLatestBlockhash();
            fundTx.recentBlockhash = fundBlockhash;
            
            const signedFundTx = await provider.wallet.signTransaction(fundTx);
            const fundTxid = await connection.sendRawTransaction(signedFundTx.serialize());
            
            await connection.confirmTransaction(fundTxid);
            console.log("  ✅ WSOL financiada adicional: " + fundTxid);
          } else {
            console.log(`  ✅ Saldo WSOL suficiente: ${currentBalance} SOL`);
          }
        } catch (e) {
          console.log("  ⚠️ Erro ao verificar saldo WSOL, prosseguindo...");
        }
      }
    } else {
      console.log("\n💡 WSOL NÃO É NECESSÁRIA PARA ESTE SLOT");
      console.log("   📍 SOL será usado diretamente para reserva");
    }

    console.log("\n🔧 VERIFICANDO E CRIANDO ATAS NECESSÁRIAS...");

    try {
        const vaultTokenAccountInfo = await connection.getAccountInfo(programTokenVault);
        if (!vaultTokenAccountInfo) {
          console.log("  ⚠️ ATA do vault não existe, será criada on-chain pelo programa");
        } else {
          console.log("  ✅ ATA do vault já existe");
        }
        
        const refTokenAccountInfo = await connection.getAccountInfo(referrerTokenAccount);
        if (!refTokenAccountInfo) {
          console.log("  ⚠️ ATA do referenciador não existe, criando explicitamente...");
          
          const createRefATAIx = new TransactionInstruction({
            keys: [
              { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: true },
              { pubkey: referrerTokenAccount, isSigner: false, isWritable: true },
              { pubkey: referrerAddress, isSigner: false, isWritable: false },
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
          
          await connection.confirmTransaction(txid);
          console.log("  ✅ ATA do referenciador criada: " + txid);
        } else {
          console.log("  ✅ ATA do referenciador já existe");
        }
    } catch (e) {
        console.error("  ❌ ERRO ao verificar ATAs:", e);
    }
    
    // Preparar uplines para recursividade
    let uplineAccounts = [];
    const isSlot3 = referrerInfo.chain.filledSlots === 2;
    
    if (isSlot3 && referrerInfo.upline && referrerInfo.upline.upline) {
      console.log("\n🔄 Preparando uplines para recursividade (slot 3)");
      
      try {
        const uplines = [];
        for (const entry of referrerInfo.upline.upline) {
          uplines.push(entry.pda);
        }
        
        if (uplines && uplines.length > 0) {
          console.log(`  Encontradas ${uplines.length} uplines disponíveis`);
          uplineAccounts = await prepareUplinesForRecursion(connection, program, uplines, TOKEN_MINT);
        } else {
          console.log("  Referenciador não tem uplines anteriores");
        }
      } catch (e) {
        console.log(`❌ Erro ao preparar recursividade: ${e.message}`);
      }
    }
    
    console.log("\n🔍 CARREGANDO ADDRESS LOOKUP TABLE...");
    
    const lookupTableAccount = await getAddressLookupTable(connection, altAddress);
    
    if (!lookupTableAccount) {
      console.error("❌ ERRO: Address Lookup Table não encontrada ou inválida!");
      return;
    }
    
    console.log("\n📤 PREPARANDO TRANSAÇÃO VERSIONADA COM ALT...");
    
    try {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      
      const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
        units: 1_400_000
      });
      
      const setPriority = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 5000
      });
      
      // 🎯 PREPARAÇÃO DOS REMAINING ACCOUNTS NA NOVA ORDEM
      const vaultAAccounts = [
        { pubkey: A_VAULT_LP, isWritable: true, isSigner: false },      // Posição 0
        { pubkey: A_VAULT_LP_MINT, isWritable: true, isSigner: false }, // Posição 1
        { pubkey: A_TOKEN_VAULT, isWritable: true, isSigner: false },   // Posição 2
      ];
      
      const chainlinkAccounts = [
        { pubkey: SOL_USD_FEED, isWritable: false, isSigner: false },     // Posição 3
        { pubkey: CHAINLINK_PROGRAM, isWritable: false, isSigner: false }, // Posição 4
      ];
      
      // 🎯 MONTAGEM DOS REMAINING ACCOUNTS CONFORME NOVA IMPLEMENTAÇÃO
      let allRemainingAccounts = [...vaultAAccounts, ...chainlinkAccounts];
      
      // 🎯 ADICIONAR WSOL NA POSIÇÃO 5 (WSOL_ACCOUNT_POSITION) QUANDO NECESSÁRIO
      if (needsWsol && userWsolAccount) {
        console.log(`\n💡 ADICIONANDO WSOL na posição ${allRemainingAccounts.length} dos remaining_accounts`);
        console.log(`   📍 WSOL Account: ${userWsolAccount.toString()}`);
        
        allRemainingAccounts.push({
          pubkey: userWsolAccount,
          isWritable: true,
          isSigner: false
        });
      }
      
      // 🎯 ADICIONAR UPLINES APÓS WSOL (OU NA POSIÇÃO 5 SE WSOL NÃO FOR NECESSÁRIA)
      if (uplineAccounts.length > 0) {
        console.log(`\n🔄 ADICIONANDO ${uplineAccounts.length / 3} UPLINES após posição ${allRemainingAccounts.length - 1}`);
        allRemainingAccounts = [...allRemainingAccounts, ...uplineAccounts];
      }
      
      console.log("\n📋 ESTRUTURA FINAL DOS REMAINING_ACCOUNTS:");
      console.log(`  Posição 0-2: Vault A accounts`);
      console.log(`  Posição 3-4: Chainlink accounts`);
      if (needsWsol) {
        console.log(`  Posição 5: WSOL account (${userWsolAccount?.toString() || 'N/A'})`);
        console.log(`  Posição 6+: Uplines (${uplineAccounts.length / 3} trios)`);
      } else {
        console.log(`  Posição 5+: Uplines (${uplineAccounts.length / 3} trios) - WSOL não necessária`);
      }
      console.log(`  Total: ${allRemainingAccounts.length} contas`);
      
      console.log("\n🔍 VERIFICANDO ORDEM DE REMAINING_ACCOUNTS:");
      console.log(`  Índice 3 (Feed): ${allRemainingAccounts[3].pubkey.toString()}`);
      console.log(`  Índice 4 (Programa): ${allRemainingAccounts[4].pubkey.toString()}`);
      console.log(`  Endereço esperado Feed: ${SOL_USD_FEED.toString()}`);
      console.log(`  Endereço esperado Programa: ${CHAINLINK_PROGRAM.toString()}`);
      
      if (!allRemainingAccounts[3].pubkey.equals(SOL_USD_FEED) || 
          !allRemainingAccounts[4].pubkey.equals(CHAINLINK_PROGRAM)) {
        console.error("❌ ERRO: A ordem das contas Chainlink está incorreta!");
        return;
      }
      
      // 🎯 INSTRUÇÃO OTIMIZADA - WSOL VIA REMAINING ACCOUNTS
      console.log("\n🔧 Gerando instrução OTIMIZADA (WSOL via remaining_accounts)...");
      
      const anchorIx = await program.methods
        .registerWithSolDeposit(new BN(FIXED_DEPOSIT_AMOUNT))
        .accounts({
          state: STATE_ADDRESS,
          userWallet: walletKeypair.publicKey,
          referrer: referrerAccount,
          referrerWallet: referrerAddress,
          user: userAccount,
          wsolMint: WSOL_MINT, // Mantido para referência
          pool: POOL_ADDRESS,
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

      const ixData = anchorIx.data;
      console.log(`🔍 Instrução gerada com discriminador: ${Buffer.from(ixData.slice(0, 8)).toString('hex')}`);

      const manualRegisterInstruction = new TransactionInstruction({
        keys: anchorIx.keys,
        programId: MATRIX_PROGRAM_ID,
        data: ixData
      });

      console.log("🔧 Criando instruções para transação...");
      const instructions = [
        modifyComputeUnits,
        setPriority,
        manualRegisterInstruction
      ];

      console.log("\n🔧 Criando mensagem V0 com lookup table...");
      const messageV0 = new TransactionMessage({
        payerKey: walletKeypair.publicKey,
        recentBlockhash: blockhash,
        instructions
      }).compileToV0Message([lookupTableAccount]);

      const transaction = new VersionedTransaction(messageV0);

      transaction.sign([walletKeypair]);

      console.log("✅ Transação versionada criada e assinada");
      console.log(`📊 Usando ALT com ${lookupTableAccount.state.addresses.length} endereços`);
      console.log(`⚙️ Versão da transação: V0 (Versionada)`);
      console.log(`🔄 Processando ${uplineAccounts.length / 3} uplines na recursividade`);
      
      if (needsWsol) {
        console.log("💡 WSOL: Passada via remaining_accounts (posição 5)");
      } else {
        console.log("💡 WSOL: NÃO necessária para este slot");
      }

      console.log("\n📤 ENVIANDO TRANSAÇÃO VERSIONADA...");

      const txid = await connection.sendTransaction(transaction, {
        maxRetries: 5,
        skipPreflight: true
      });
      
      console.log("✅ Transação enviada: " + txid);
      console.log(`🔍 Link para explorador: https://explorer.solana.com/tx/${txid}?cluster=devnet`);
      
      console.log("\n⏳ Aguardando confirmação...");
      const confirmation = await connection.confirmTransaction(
        {
          signature: txid,
          blockhash: blockhash,
          lastValidBlockHeight: lastValidBlockHeight,
        },
        'confirmed'
      );
      
      if (confirmation.value.err) {
        throw new Error(`Erro na confirmação da transação: ${JSON.stringify(confirmation.value.err)}`);
      }
      
      console.log("✅ Transação confirmada!");
      console.log("✅ Versão da transação: V0 (Versionada)");
      
      console.log("\n🔍 VERIFICANDO RESULTADOS...");
      
      try {
        const userInfo = await program.account.userAccount.fetch(userAccount);
        console.log("\n📋 CONFIRMAÇÃO DO REGISTRO:");
        console.log("✅ Usuário registrado: " + userInfo.isRegistered);
        console.log("🧑‍🤝‍🧑 Referenciador: " + userInfo.referrer.toString());
        console.log("🔢 Profundidade: " + userInfo.upline.depth.toString());
        console.log("📊 Slots preenchidos: " + userInfo.chain.filledSlots + "/3");
        
        if (userInfo.ownerWallet) {
          console.log("\n📋 CAMPOS DA CONTA:");
          console.log("👤 Owner Wallet: " + userInfo.ownerWallet.toString());
          
          if (userInfo.ownerWallet.equals(walletKeypair.publicKey)) {
            console.log("✅ O campo owner_wallet foi corretamente preenchido");
          } else {
            console.log("❌ ALERTA: Owner Wallet não corresponde à carteira do usuário!");
          }
        }
        
        if (userInfo.upline.upline && userInfo.upline.upline.length > 0) {
          console.log("\n📋 INFORMAÇÕES DAS UPLINES:");
          userInfo.upline.upline.forEach((entry, index) => {
            console.log(`  Upline #${index+1}:`);
            console.log(`    PDA: ${entry.pda.toString()}`);
            console.log(`    Wallet: ${entry.wallet.toString()}`);
          });
        }
        
        const newReferrerInfo = await program.account.userAccount.fetch(referrerAccount);
        console.log("\n📋 ESTADO DO REFERENCIADOR APÓS REGISTRO:");
        console.log("📊 Slots preenchidos: " + newReferrerInfo.chain.filledSlots + "/3");
        
        // 🎯 VERIFICAÇÃO ESPECÍFICA SOBRE WSOL OTIMIZADA
        console.log("\n💡 VERIFICAÇÃO DO USO OTIMIZADO DE WSOL:");
        const slotPreenchido = referrerInfo.chain.filledSlots;
        if (slotPreenchido === 0) {
          console.log("✅ SLOT 1 (idx 0): WSOL foi usada via remaining_accounts para depósito na pool");
          console.log("   📍 Posição no remaining_accounts: 5");
        } else if (slotPreenchido === 1) {
          console.log("✅ SLOT 2 (idx 1): WSOL NÃO foi usada - SOL usado diretamente para reserva");
          if (newReferrerInfo.reservedTokens > 0) {
            console.log(`💰 Tokens reservados: ${newReferrerInfo.reservedTokens / 1e9} tokens`);
          }
        } else if (slotPreenchido === 2) {
          console.log("✅ SLOT 3 (idx 2): WSOL passada via remaining_accounts para recursividade");
          console.log("   📍 Posição no remaining_accounts: 5 (antes das uplines)");
        }
        
        if (isSlot3 && uplineAccounts.length > 0) {
          console.log("\n🔄 VERIFICANDO RESULTADO DA RECURSIVIDADE:");
          
          let uplineReverseCount = 0;
          for (let i = 0; i < uplineAccounts.length; i += 3) {
            if (i >= uplineAccounts.length) break;
            
            try {
              const uplineAccount = uplineAccounts[i].pubkey;
              
              console.log(`\n  Verificando upline: ${uplineAccount.toString()}`);
              
              const uplineInfo = await program.account.userAccount.fetch(uplineAccount);
              console.log(`  Slots preenchidos: ${uplineInfo.chain.filledSlots}/3`);
              
              for (let j = 0; j < uplineInfo.chain.filledSlots; j++) {
                if (
                  uplineInfo.chain.slots[j] &&
                  uplineInfo.chain.slots[j].equals(referrerAccount)
                ) {
                  console.log(`  ✅ REFERENCIADOR ADICIONADO NO SLOT ${j + 1}!`);
                  
                  // Verificar se WSOL foi usado neste slot
                  if (j === 0) {
                    console.log(`  💡 WSOL: Usada via remaining_accounts para este slot (depósito na pool)`);
                  } else if (j === 1) {
                    console.log(`  💡 WSOL: NÃO usada para este slot (SOL direto para reserva)`);
                  }
                  
                  uplineReverseCount++;
                  break;
                }
              }
              
              if (uplineInfo.reservedSol > 0) {
                console.log(`  💰 SOL Reservado: ${uplineInfo.reservedSol / 1e9} SOL`);
              }
              
              if (uplineInfo.reservedTokens > 0) {
                console.log(`  🪙 Tokens Reservados: ${uplineInfo.reservedTokens / 1e9} tokens`);
              }
            } catch (e) {
              console.log(`  Erro ao verificar upline: ${e.message}`);
            }
          }
          
          console.log(`\n  ✅ Recursividade processou ${uplineReverseCount}/${uplineAccounts.length / 3} uplines`);
        }
        
        const newBalance = await connection.getBalance(walletKeypair.publicKey);
        console.log("\n💼 Seu novo saldo: " + newBalance / 1e9 + " SOL");
        console.log("💰 SOL gasto: " + (balance - newBalance) / 1e9 + " SOL");
        
        console.log("\n🎉 REGISTRO COM WSOL VIA REMAINING ACCOUNTS CONCLUÍDO! 🎉");
        console.log("============================================================");
        console.log("\n💡 RESUMO DA IMPLEMENTAÇÃO OTIMIZADA:");
        console.log("✅ WSOL passada via remaining_accounts apenas quando necessária");
        console.log("✅ Posição fixa no remaining_accounts (posição 5)");
        console.log("✅ SOL usado diretamente para slots que não precisam de WSOL");
        console.log("✅ Arquitetura flexível e eficiente");
        console.log("✅ Verificação rigorosa de endereços e posições");
        
        console.log("\n⚠️ IMPORTANTE: GUARDE ESTES ENDEREÇOS PARA USO FUTURO:");
        console.log("🔑 SEU ENDEREÇO: " + walletKeypair.publicKey.toString());
        console.log("🔑 SUA CONTA PDA: " + userAccount.toString());
        console.log("🔑 ADDRESS LOOKUP TABLE: " + altAddress.toString());
        if (userWsolAccount) {
          console.log("🔑 SUA CONTA WSOL: " + userWsolAccount.toString());
        }
      } catch (e) {
        console.error("❌ ERRO AO VERIFICAR RESULTADOS:", e);
      }
    } catch (error) {
      console.error("❌ ERRO AO REGISTRAR USUÁRIO:", error);
      
      if (error.logs) {
        console.log("\n📋 LOGS DE ERRO DETALHADOS:");
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
    console.error("❌ ERRO GERAL DURANTE O PROCESSO:", error);
    
    if (error.logs) {
      console.log("\n📋 LOGS DE ERRO DETALHADOS:");
      error.logs.forEach((log, i) => console.log(`${i}: ${log}`));
    }
  }
}

main();