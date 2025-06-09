// Script para registrar usuário base do sistema de referral com Chainlink
const { Connection, Keypair, PublicKey, SystemProgram, Transaction, ComputeBudgetProgram, TransactionInstruction } = require('@solana/web3.js');
const { AnchorProvider, Program, BN, Wallet, utils } = require('@coral-xyz/anchor');
const fs = require('fs');
const path = require('path');

// Receber parâmetros da linha de comando (opcional)
const args = process.argv.slice(2);
const walletPath = args[0] || './carteiras/carteira4.json';
const configPath = args[1] || './matriz-config.json';

async function main() {
  try {
    console.log("🚀 REGISTRANDO USUÁRIO BASE COM CHAINLINK ORACLE 🚀");
    console.log("=======================================================");
    
    // Carregar carteira
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
    
    // Carregar IDL
    console.log("Carregando IDL...");
    const idlPath = path.resolve('./target/idl/referral_system.json');
    const idl = require(idlPath);
    
    // Carregar configuração (se disponível)
    let config = {};
    if (fs.existsSync(configPath)) {
      console.log(`Carregando configuração de ${configPath}...`);
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      console.log("Configuração carregada com sucesso");
    } else {
      console.log(`⚠️ Arquivo de configuração não encontrado em ${configPath}`);
      console.log("⚠️ Usando valores padrão para endereços...");
    }
    
    // Configuração da conexão (devnet para o programa)
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    console.log('Conectando à Devnet');
    
    // Configurar endereços importantes
    const MATRIX_PROGRAM_ID = new PublicKey(config.programId || "4CxdTPK3Hxq2FJNBdAT44HK6rgMrBqSdbBMbudzGkSvt");
    const TOKEN_MINT = new PublicKey(config.tokenMint || "GNagERgSB6k6oLxpZ6kHyqaJqzS4zeJwqhhP1mTZRDTL");
    const STATE_ADDRESS = new PublicKey(config.stateAddress || "AaZukNFM4D6Rn2iByQFLHtfbiacsh58XEm3yzbzvdeL");
    
    // Pool e vault addresses
    const POOL_ADDRESS = new PublicKey("FrQ5KsAgjCe3FFg6ZENri8feDft54tgnATxyffcasuxU");
    
    // Vault A addresses (DONUT)
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
    
    // Programas do sistema
    const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
    const SPL_TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
    const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
    const SYSVAR_RENT_PUBKEY = new PublicKey("SysvarRent111111111111111111111111111111111");
    
    // Criar wallet usando a classe Wallet do Anchor
    const anchorWallet = new Wallet(walletKeypair);
    
    // Configurar o provider com o objeto Wallet do Anchor
    const provider = new AnchorProvider(
      connection, 
      anchorWallet, 
      { commitment: 'confirmed' }
    );
    
    // Inicializar o programa
    const program = new Program(idl, MATRIX_PROGRAM_ID, provider);
    
    // Verificar saldo da carteira
    console.log("\n👤 CARTEIRA DO USUÁRIO: " + walletKeypair.publicKey.toString());
    const balance = await connection.getBalance(walletKeypair.publicKey);
    console.log("💰 SALDO ATUAL: " + balance / 1e9 + " SOL");
    
    // Valor fixo do depósito (0.1 SOL)
    const FIXED_DEPOSIT_AMOUNT = 100_000_000;
    
    if (balance < FIXED_DEPOSIT_AMOUNT + 30000000) {
      console.error("❌ ERRO: Saldo insuficiente! Você precisa de pelo menos " + 
                   (FIXED_DEPOSIT_AMOUNT + 30000000) / 1e9 + " SOL");
      return;
    }
    
    // Verificar estado do programa
    console.log("\n🔍 VERIFICANDO ESTADO DO PROGRAMA...");
    try {
      const stateInfo = await program.account.programState.fetch(STATE_ADDRESS);
      console.log("✅ ESTADO DO PROGRAMA VERIFICADO:");
      console.log("👑 Owner: " + stateInfo.owner.toString());
      console.log("🆔 Próximo ID de upline: " + stateInfo.nextUplineId.toString());
      console.log("🆔 Próximo ID de chain: " + stateInfo.nextChainId.toString());
    } catch (e) {
      console.error("❌ ERRO: Estado do programa não encontrado ou inacessível!");
      console.error(e);
      return;
    }
    
    // Verificar mint do token
    console.log("\n🔍 VERIFICANDO MINT DO TOKEN...");
    try {
      const mintInfo = await connection.getAccountInfo(TOKEN_MINT);
      if (!mintInfo) {
        console.error("❌ ERRO: A mint do token não existe!");
        return;
      }
      console.log("✅ Mint do token verificada");
    } catch (e) {
      console.error("❌ ERRO ao verificar mint do token:", e);
      return;
    }
    
    // Derivar PDA da conta do usuário
    console.log("\n🔍 DERIVANDO PDA DA CONTA DO USUÁRIO...");
    const [userAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_account"), walletKeypair.publicKey.toBuffer()],
      MATRIX_PROGRAM_ID
    );
    console.log("📄 CONTA DO USUÁRIO (PDA): " + userAccount.toString());
    
    // Verificar se o usuário já está registrado
    try {
      const userInfo = await program.account.userAccount.fetch(userAccount);
      if (userInfo.isRegistered) {
        console.log("⚠️ USUÁRIO JÁ ESTÁ REGISTRADO!");
        console.log("🆔 Upline ID: " + userInfo.upline.id.toString());
        console.log("🆔 Chain ID: " + userInfo.chain.id.toString());
        console.log("📊 Slots preenchidos: " + userInfo.chain.filledSlots + "/3");
        
        if (userInfo.ownerWallet) {
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
        
        console.log("\n🎯 SCRIPT CONCLUÍDO: USUÁRIO JÁ REGISTRADO.");
        return;
      }
    } catch (e) {
      console.log("✅ USUÁRIO AINDA NÃO REGISTRADO, PROSSEGUINDO COM O REGISTRO...");
    }
    
    // Derivar e verificar PDAs importantes
    console.log("\n🔍 DERIVANDO PDAS NECESSÁRIAS...");
    
    // PDA para vault authority
    const [vaultAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_vault_authority")],
      MATRIX_PROGRAM_ID
    );
    console.log("🔑 VAULT_AUTHORITY: " + vaultAuthority.toString());
    
    // PDA para token_mint_authority
    const [tokenMintAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_mint_authority")],
      MATRIX_PROGRAM_ID
    );
    console.log("🔑 TOKEN_MINT_AUTHORITY: " + tokenMintAuthority.toString());
    
    // Calcular ATA do programa
    const programTokenVault = utils.token.associatedAddress({
      mint: TOKEN_MINT,
      owner: vaultAuthority
    });
    console.log("🔑 PROGRAM_TOKEN_VAULT (ATA): " + programTokenVault.toString());
    
    // Verificar e criar ATA do vault se necessário
    console.log("\n🔧 VERIFICANDO E CRIANDO ATAS NECESSÁRIAS...");
    try {
      const vaultTokenAccountInfo = await connection.getAccountInfo(programTokenVault);
      if (!vaultTokenAccountInfo) {
        console.log("  ⚠️ ATA do vault não existe, criando...");
        
        // Criar ATA para o vault
        const createATAIx = new TransactionInstruction({
          keys: [
            { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: true },
            { pubkey: programTokenVault, isSigner: false, isWritable: true },
            { pubkey: vaultAuthority, isSigner: false, isWritable: false },
            { pubkey: TOKEN_MINT, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }
          ],
          programId: ASSOCIATED_TOKEN_PROGRAM_ID,
          data: Buffer.from([])
        });
        
        const tx = new Transaction().add(createATAIx);
        tx.feePayer = walletKeypair.publicKey;
        const { blockhash } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        
        const signedTx = await provider.wallet.signTransaction(tx);
        const txid = await connection.sendRawTransaction(signedTx.serialize());
        
        // Aguardar a confirmação da transação
        await connection.confirmTransaction(txid);
        console.log("  ✅ ATA do vault criada: " + txid);
      } else {
        console.log("  ✅ ATA do vault já existe");
      }
    } catch (e) {
      console.error("  ❌ ERRO ao verificar/criar ATA do vault:", e);
    }
    
    // Criar e inicializar conta WSOL
    console.log("\n🔧 CRIANDO E INICIALIZANDO CONTA WSOL...");
    const tokenKeypair = Keypair.generate();
    console.log("🔑 Nova keypair para token WSOL: " + tokenKeypair.publicKey.toString());
    
    // Calcular espaço necessário e aluguel
    const rent = await connection.getMinimumBalanceForRentExemption(165);
    const totalAmount = rent + FIXED_DEPOSIT_AMOUNT;
    console.log(`  💰 Aluguel necessário: ${rent / 1e9} SOL`);
    console.log(`  💰 Depósito: ${FIXED_DEPOSIT_AMOUNT / 1e9} SOL`);
    console.log(`  💰 Total: ${totalAmount / 1e9} SOL`);
    
    // Criar Transaction para setup da conta WSOL
    const setupWsolTx = new Transaction();
    
    // Etapa 1: Criar a conta
    setupWsolTx.add(
      SystemProgram.createAccount({
        fromPubkey: walletKeypair.publicKey,
        newAccountPubkey: tokenKeypair.publicKey,
        lamports: totalAmount,
        space: 165,
        programId: SPL_TOKEN_PROGRAM_ID
      })
    );
    
    // Etapa 2: Inicializar a conta como token
    setupWsolTx.add(
      new TransactionInstruction({
        keys: [
          { pubkey: tokenKeypair.publicKey, isSigner: false, isWritable: true },
          { pubkey: WSOL_MINT, isSigner: false, isWritable: false },
          { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: false },
          { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }
        ],
        programId: SPL_TOKEN_PROGRAM_ID,
        data: Buffer.from([1, ...walletKeypair.publicKey.toBytes()])
      })
    );
    
    // Etapa 3: Sincronizar WSOL
    setupWsolTx.add(
      new TransactionInstruction({
        keys: [{ pubkey: tokenKeypair.publicKey, isSigner: false, isWritable: true }],
        programId: SPL_TOKEN_PROGRAM_ID,
        data: Buffer.from([17]) // SyncNative instruction code
      })
    );
    
    // Assinar e enviar a transação
    setupWsolTx.feePayer = walletKeypair.publicKey;
    const { blockhash } = await connection.getLatestBlockhash();
    setupWsolTx.recentBlockhash = blockhash;
    
    // Aqui a carteira assina primeiro
    setupWsolTx.sign(walletKeypair, tokenKeypair);
    
    // Enviar transação assinada
    const setupTxId = await connection.sendRawTransaction(setupWsolTx.serialize());
    console.log("✅ Transação enviada: " + setupTxId);
    
    // Confirmar transação
    await connection.confirmTransaction(setupTxId, 'confirmed');
    console.log("✅ Conta WSOL criada e inicializada: " + setupTxId);
    
    // Verificar o saldo da conta WSOL
    try {
      const tokenBalance = await connection.getTokenAccountBalance(tokenKeypair.publicKey);
      console.log("💰 Saldo da conta WSOL: " + tokenBalance.value.uiAmount + " SOL");
    } catch (e) {
      console.log("⚠️ Não foi possível verificar o saldo WSOL:", e.message);
    }
    
    // Registrar o usuário base usando a conta WSOL criada manualmente
    console.log("\n📥 ENVIANDO TRANSAÇÃO DE REGISTRO DO USUÁRIO BASE...");
    
    try {
      // Aumentar o limite de compute units
      const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
        units: 1_000_000 // Aumentar para 1 milhão para garantir
      });
      
      // Adicionar também uma instrução de prioridade
      const setPriority = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 5000 // Aumentar prioridade da transação
      });
      
      console.log("\n🔍 INCLUINDO REMAINING_ACCOUNTS PARA VAULT A E CHAINLINK...");
      console.log("  ✓ A_VAULT_LP: " + A_VAULT_LP.toString());
      console.log("  ✓ A_VAULT_LP_MINT: " + A_VAULT_LP_MINT.toString());
      console.log("  ✓ A_TOKEN_VAULT: " + A_TOKEN_VAULT.toString());
      console.log("  ✓ SOL_USD_FEED: " + SOL_USD_FEED.toString());
      console.log("  ✓ CHAINLINK_PROGRAM: " + CHAINLINK_PROGRAM.toString());
      
      // Verificar índices 4 e 5 explicitamente
      const remainingAccounts = [
        {pubkey: A_VAULT_LP, isWritable: true, isSigner: false},
        {pubkey: A_VAULT_LP_MINT, isWritable: true, isSigner: false},
        {pubkey: A_TOKEN_VAULT, isWritable: true, isSigner: false},
        {pubkey: SOL_USD_FEED, isWritable: false, isSigner: false},
        {pubkey: CHAINLINK_PROGRAM, isWritable: false, isSigner: false},
      ];
      
      console.log(`  Índice 4 (Feed): ${remainingAccounts[4].pubkey.toString()}`);
      console.log(`  Índice 5 (Programa): ${remainingAccounts[5].pubkey.toString()}`);
      
      const txid = await program.methods
        .registerWithoutReferrer(new BN(FIXED_DEPOSIT_AMOUNT))
        .accounts({
          state: STATE_ADDRESS,
          userWallet: walletKeypair.publicKey,
          user: userAccount,
          pool: POOL_ADDRESS,
          userSourceToken: tokenKeypair.publicKey,
          bVault: B_VAULT,
          bTokenVault: B_TOKEN_VAULT,
          bVaultLpMint: B_VAULT_LP_MINT,
          bVaultLp: B_VAULT_LP,
          vaultProgram: VAULT_PROGRAM,
          tokenMint: TOKEN_MINT,
          tokenProgram: SPL_TOKEN_PROGRAM_ID,
          systemProgram: SYSTEM_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .remainingAccounts(remainingAccounts)
        .preInstructions([modifyComputeUnits, setPriority])
        .rpc();
      
      console.log("✅ Transação enviada: " + txid);
      console.log(`🔍 Link para explorador: https://explorer.solana.com/tx/${txid}?cluster=devnet`);
      
      console.log("\n⏳ Aguardando confirmação...");
      await connection.confirmTransaction(txid, 'confirmed');
      console.log("✅ Transação confirmada!");
      
      // Verificar se o registro foi bem-sucedido
      const userInfo = await program.account.userAccount.fetch(userAccount);
      console.log("\n📋 CONFIRMAÇÃO DO REGISTRO:");
      console.log("✅ Usuário registrado: " + userInfo.isRegistered);
      console.log("🆔 Upline ID: " + userInfo.upline.id.toString());
      console.log("🆔 Chain ID: " + userInfo.chain.id.toString());
      console.log("📊 Slots preenchidos: " + userInfo.chain.filledSlots + "/3");
      console.log("💰 SOL Reservado: " + userInfo.reservedSol / 1e9 + " SOL");
      console.log("🪙 Tokens Reservados: " + (userInfo.reservedTokens ? userInfo.reservedTokens / 1e9 : 0) + " tokens");
      
      // Verificar o campo owner_wallet
      if (userInfo.ownerWallet) {
        console.log("\n📋 CAMPOS DA CONTA:");
        console.log("👤 Owner Wallet: " + userInfo.ownerWallet.toString());
        
        if (userInfo.ownerWallet.equals(walletKeypair.publicKey)) {
          console.log("✅ O campo owner_wallet foi corretamente preenchido");
        } else {
          console.log("❌ ALERTA: Owner Wallet não corresponde à carteira do usuário!");
        }
      }
      
      // Exibir informações da estrutura UplineEntry
      if (userInfo.upline.upline && userInfo.upline.upline.length > 0) {
        console.log("\n📋 INFORMAÇÕES DAS UPLINES (ESTRUTURA OTIMIZADA):");
        userInfo.upline.upline.forEach((entry, index) => {
          console.log(`  Upline #${index+1}:`);
          console.log(`    PDA: ${entry.pda.toString()}`);
          console.log(`    Wallet: ${entry.wallet.toString()}`);
        });
      } else {
        console.log("\n📋 ⚠️ USUÁRIO BASE SEM ESTRUTURA UPLINEENTRY (VERIFICAR!)");
      }
      
      console.log("\n🎉 REGISTRO CONCLUÍDO COM SUCESSO! 🎉");
      console.log("===============================");
      console.log("\n⚠️ IMPORTANTE: GUARDE ESTES ENDEREÇOS PARA USO FUTURO:");
      console.log("🔑 ENDEREÇO DO PROGRAMA DE MATRIZ: " + MATRIX_PROGRAM_ID.toString());
      console.log("🔑 ENDEREÇO DO TOKEN: " + TOKEN_MINT.toString());
      console.log("🔑 ENDEREÇO DO ESTADO: " + STATE_ADDRESS.toString());
      console.log("🔑 ENDEREÇO DO USUÁRIO BASE: " + walletKeypair.publicKey.toString());
      console.log("🔑 PDA DA CONTA DO USUÁRIO: " + userAccount.toString());
      
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