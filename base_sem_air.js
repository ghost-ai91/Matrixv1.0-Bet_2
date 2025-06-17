// Script para registrar usuário base com Chainlink - Versão SEM MINT e COM SWAP
const { Connection, Keypair, PublicKey, SystemProgram, Transaction, ComputeBudgetProgram, TransactionInstruction } = require('@solana/web3.js');
const { AnchorProvider, Program, BN, Wallet } = require('@coral-xyz/anchor');
const fs = require('fs');
const path = require('path');

// Receber parâmetros da linha de comando (opcional)
const args = process.argv.slice(2);
const walletPath = args[0] || './carteiras/carteira1.json';
const configPath = args[1] || './matriz-config.json';

async function main() {
  try {
    console.log("🚀 REGISTRANDO USUÁRIO BASE (SEM MINT - COM SWAP) 🚀");
    console.log("=========================================================");
    console.log("🔄 Versão: Swap Only (Sem sistema de mint)");
    
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
      console.log("✅ Configuração carregada com sucesso");
      
      if (config.version === "no-mint-swap-only") {
        console.log("🔄 Configuração sem mint detectada");
        console.log(`🛡️ Proteção Reentrancy: ${config.hasReentrancyProtection ? "ATIVA" : "INATIVA"}`);
      }
    } else {
      console.log(`⚠️ Arquivo de configuração não encontrado em ${configPath}`);
      console.log("⚠️ Usando valores padrão para endereços...");
    }
    
    // Configuração da conexão (devnet para o programa)
    const connection = new Connection('https://weathered-quiet-theorem.solana-devnet.quiknode.pro/198997b67cb51804baeb34ed2257274aa2b2d8c0', 'confirmed');
    console.log('Conectando à Devnet');
    
    // Configurar endereços importantes
    const MATRIX_PROGRAM_ID = new PublicKey(config.programId || "G6dU3Ghhg7YGkSttucjvRzErkMAgPhFHx3efZ65Embin");
    const STATE_ADDRESS = new PublicKey(config.stateAddress || "FfBSmwqALJHFtHMa5jxn6DEeKR5jNddibAo84tokSbFS");
    
    // Pool address para swap
    const POOL_ADDRESS = new PublicKey("FrQ5KsAgjCe3FFg6ZENri8feDft54tgnATxyffcasuxU");
    
    // Pool e swap addresses
    const POOL_AUTHORITY = new PublicKey("EGGBbZc7GKvGX4uBcaUYkHanKZPhKDJNqBj8s7RYJCNq");
    const POOL_TOKEN_A_VAULT = new PublicKey("6m1wvYoPrwjAnbuGMqpMoodQaq4VnZXRjrzufXnPSjmj"); // DONUT vault
    const POOL_TOKEN_B_VAULT = new PublicKey("HZeLxbZ9uHtSpwZC3LBr4Nubd14iHwz7bRSghRZf5VCG"); // WSOL vault
    const POOL_TOKEN_A_FEES = new PublicKey("CocstBGbeDVyTJWxbWs4docwWapVADAo1xXQSh9RfPMz");
    const POOL_PROGRAM = new PublicKey("LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo");
    
    // Chainlink addresses (Devnet)
    const CHAINLINK_PROGRAM = new PublicKey("HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny");
    const SOL_USD_FEED = new PublicKey("99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR");
    
    // Programas do sistema
    const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
    const SPL_TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
    const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
    const SYSVAR_RENT_PUBKEY = new PublicKey("SysvarRent111111111111111111111111111111111");
    
    // Token mint DONUT
    const TOKEN_MINT = new PublicKey("CCTG4ZmGa9Nk9NVxbd1FXBNyKjyHSapuF9aU6zgcA3xz");
    
    // Valor fixo do depósito (0.1 SOL)
    const DEPOSIT_AMOUNT = 100_000_000;
    
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
    
    if (balance < DEPOSIT_AMOUNT + 30000000) {
      console.error("❌ ERRO: Saldo insuficiente! Você precisa de pelo menos " + 
                   (DEPOSIT_AMOUNT + 30000000) / 1e9 + " SOL");
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
      
      // Verificar is_locked
      if (stateInfo.isLocked !== undefined) {
        console.log("🛡️ Estado do lock de reentrancy: " + (stateInfo.isLocked ? "ATIVO (ERRO!)" : "PRONTO"));
        if (stateInfo.isLocked) {
          console.error("❌ ERRO CRÍTICO: Programa está com lock ativo!");
          return;
        }
      }
    } catch (e) {
      console.error("❌ ERRO: Estado do programa não encontrado!");
      console.error(e);
      return;
    }
    
    // Derivar PDA da conta do usuário
    console.log("\n🔍 DERIVANDO PDA DA CONTA DO USUÁRIO...");
    const [userPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_account"), walletKeypair.publicKey.toBuffer()],
      MATRIX_PROGRAM_ID
    );
    console.log(`📄 PDA da conta do usuário: ${userPDA.toString()}`);
    
    // Verificar se a conta já existe
    try {
      const userInfo = await program.account.userAccount.fetch(userPDA);
      if (userInfo.isRegistered) {
        console.log("⚠️ USUÁRIO JÁ ESTÁ REGISTRADO!");
        console.log(`🆔 Upline ID: ${userInfo.upline.id.toString()}`);
        console.log(`🆔 Chain ID: ${userInfo.chain.id.toString()}`);
        console.log(`📊 Slots preenchidos: ${userInfo.chain.filledSlots}/3`);
        return;
      }
    } catch (e) {
      console.log("✅ Usuário ainda não registrado, prosseguindo...");
    }
    
    // Derivar ATA do usuário para DONUT tokens
    console.log("\n🔍 DERIVANDO ATA PARA TOKENS DONUT...");
    const [userTokenAccount] = PublicKey.findProgramAddressSync(
      [
        walletKeypair.publicKey.toBuffer(),
        SPL_TOKEN_PROGRAM_ID.toBuffer(),
        TOKEN_MINT.toBuffer(),
      ],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    console.log(`🪙 ATA do usuário para DONUT: ${userTokenAccount.toString()}`);
    
    // Verificar se ATA existe
    let ataExists = false;
    try {
      const ataInfo = await connection.getAccountInfo(userTokenAccount);
      if (ataInfo && ataInfo.owner.equals(SPL_TOKEN_PROGRAM_ID)) {
        ataExists = true;
        console.log("✅ ATA já existe");
        
        // Verificar saldo
        const tokenBalance = await connection.getTokenAccountBalance(userTokenAccount);
        console.log(`💰 Saldo atual de DONUT: ${tokenBalance.value.uiAmount || 0}`);
      }
    } catch (e) {
      console.log("ℹ️ ATA ainda não existe, será criada durante o swap");
    }
    
    // Gerar nova keypair para a conta WSOL temporária
    const tokenKeypair = Keypair.generate();
    const tokenAddress = tokenKeypair.publicKey.toString();
    console.log(`🔑 Nova keypair para conta WSOL gerada: ${tokenAddress}`);
    
    // ==== ETAPA 1: CRIAR CONTA WSOL TEMPORÁRIA ====
    console.log("\n📋 ETAPA 1: CRIAR E FINANCIAR CONTA WSOL TEMPORÁRIA");
    
    // Calcular espaço necessário e aluguel
    const tokenAccountSpace = 165;
    const rent = await connection.getMinimumBalanceForRentExemption(tokenAccountSpace);
    const totalAmount = rent + DEPOSIT_AMOUNT;
    
    console.log(`💰 Aluguel para conta WSOL: ${rent / 1e9} SOL`);
    console.log(`💰 Depósito para swap: ${DEPOSIT_AMOUNT / 1e9} SOL`);
    console.log(`💰 Total a ser transferido: ${totalAmount / 1e9} SOL`);
    console.log(`🔄 Valor será usado para swap WSOL -> DONUT`);
    
    // Criar Transaction para setup da conta WSOL
    const createWsolTx = new Transaction();
    
    // Etapa 1: Criar a conta token
    createWsolTx.add(
      SystemProgram.createAccount({
        fromPubkey: walletKeypair.publicKey,
        newAccountPubkey: tokenKeypair.publicKey,
        lamports: totalAmount,
        space: tokenAccountSpace,
        programId: SPL_TOKEN_PROGRAM_ID,
      })
    );
    
    // Etapa 2: Inicializar a conta como token WSOL
    createWsolTx.add(
      new TransactionInstruction({
        keys: [
          { pubkey: tokenKeypair.publicKey, isSigner: false, isWritable: true },
          { pubkey: WSOL_MINT, isSigner: false, isWritable: false },
          { pubkey: walletKeypair.publicKey, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        ],
        programId: SPL_TOKEN_PROGRAM_ID,
        data: Buffer.from([1, ...walletKeypair.publicKey.toBuffer()]),
      })
    );
    
    // Etapa 3: Sincronizar WSOL
    createWsolTx.add(
      new TransactionInstruction({
        keys: [{ pubkey: tokenKeypair.publicKey, isSigner: false, isWritable: true }],
        programId: SPL_TOKEN_PROGRAM_ID,
        data: Buffer.from([17]), // SyncNative
      })
    );
    
    // Configurar a transação
    createWsolTx.feePayer = walletKeypair.publicKey;
    const blockhash = await connection.getLatestBlockhash();
    createWsolTx.recentBlockhash = blockhash.blockhash;
    
    // Assinar a transação
    createWsolTx.sign(walletKeypair, tokenKeypair);
    
    console.log("📤 Enviando transação para criar conta WSOL...");
    const createTxId = await connection.sendRawTransaction(createWsolTx.serialize());
    console.log(`✅ Transação enviada: ${createTxId}`);
    console.log(`🔍 Link para explorador: https://explorer.solana.com/tx/${createTxId}?cluster=devnet`);
    
    // Aguardar confirmação
    await connection.confirmTransaction({
      signature: createTxId,
      blockhash: blockhash.blockhash,
      lastValidBlockHeight: blockhash.lastValidBlockHeight,
    });
    console.log("✅ Conta WSOL criada e financiada!");
    
    // Verificar saldo da conta WSOL
    try {
      const tokenBalance = await connection.getTokenAccountBalance(tokenKeypair.publicKey);
      console.log(`💰 Saldo da conta WSOL: ${tokenBalance.value.uiAmount} SOL`);
    } catch (e) {
      console.log(`⚠️ Não foi possível verificar o saldo WSOL: ${e.message}`);
    }
    
    // ==== ETAPA 2: EXECUTAR REGISTRO COM SWAP ====
    console.log("\n📋 ETAPA 2: EXECUTAR REGISTRO DO USUÁRIO BASE COM SWAP");
    
    // Preparar os remaining accounts para Chainlink
    const remainingAccounts = [
      { pubkey: SOL_USD_FEED, isWritable: false, isSigner: false },
      { pubkey: CHAINLINK_PROGRAM, isWritable: false, isSigner: false },
    ];
    
    console.log("\n🔍 CONFIGURANDO REMAINING_ACCOUNTS:");
    console.log("  ✓ SOL_USD_FEED: " + SOL_USD_FEED.toString());
    console.log("  ✓ CHAINLINK_PROGRAM: " + CHAINLINK_PROGRAM.toString());
    
    // Increase compute units
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: 800_000,
    });
    
    // Set priority
    const setPriority = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 5000,
    });
    
    try {
      console.log("\n📤 Enviando transação de registro com swap...");
      console.log("🔄 O depósito será automaticamente trocado por DONUT...");
      
      const txid = await program.methods
        .registerWithoutReferrer(new BN(DEPOSIT_AMOUNT))
        .accounts({
          state: STATE_ADDRESS,
          owner: walletKeypair.publicKey,
          userWallet: walletKeypair.publicKey,
          user: userPDA,
          userWsolAccount: tokenKeypair.publicKey,
          userTokenAccount: userTokenAccount,
          wsolMint: WSOL_MINT,
          pool: POOL_ADDRESS,
          poolAuthority: POOL_AUTHORITY,
          poolTokenAVault: POOL_TOKEN_A_VAULT,
          poolTokenBVault: POOL_TOKEN_B_VAULT,
          poolTokenAFees: POOL_TOKEN_A_FEES,
          poolProgram: POOL_PROGRAM,
          tokenProgram: SPL_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .remainingAccounts(remainingAccounts)
        .preInstructions([modifyComputeUnits, setPriority])
        .rpc();
      
      console.log("✅ Transação de registro com swap enviada: " + txid);
      console.log(`🔍 Link para explorador: https://explorer.solana.com/tx/${txid}?cluster=devnet`);
      
      console.log("\n⏳ Aguardando confirmação...");
      await connection.confirmTransaction(txid, 'confirmed');
      console.log("✅ Transação confirmada!");
      
      // Verificar se o registro foi bem-sucedido
      const userInfo = await program.account.userAccount.fetch(userPDA);
      console.log("\n📋 CONFIRMAÇÃO DE REGISTRO:");
      console.log("✅ Usuário registrado: " + userInfo.isRegistered);
      console.log("🆔 Upline ID: " + userInfo.upline.id.toString());
      console.log("🆔 Chain ID: " + userInfo.chain.id.toString());
      console.log("📊 Slots preenchidos: " + userInfo.chain.filledSlots + "/3");
      console.log("💰 SOL Reservado: " + userInfo.reservedSol / 1e9 + " SOL");
      
      if (userInfo.ownerWallet) {
        console.log("👤 Owner Wallet: " + userInfo.ownerWallet.toString());
      }
      
      // Verificar saldo de DONUT após swap
      try {
        const donutBalance = await connection.getTokenAccountBalance(userTokenAccount);
        console.log("\n💎 SALDO DE DONUT APÓS SWAP: " + (donutBalance.value.uiAmount || 0) + " DONUT");
        console.log("🔄 Swap WSOL -> DONUT executado com sucesso!");
      } catch (e) {
        console.log("⚠️ Não foi possível verificar saldo de DONUT: " + e.message);
      }
      
      // Verificar se usuário base não tem uplines
      if (userInfo.upline.upline && userInfo.upline.upline.length > 0) {
        console.log("\n⚠️ AVISO: Usuário base tem uplines (não deveria)");
      } else {
        console.log("\n✅ USUÁRIO BASE VALIDADO - SEM UPLINES (CORRETO)");
      }
      
      console.log("\n🎉 REGISTRO COM SWAP CONCLUÍDO COM SUCESSO! 🎉");
      console.log("================================================");
      console.log("\n📋 RESUMO:");
      console.log(`🏦 Usuário registrado: ${walletKeypair.publicKey.toString()}`);
      console.log(`📄 PDA da conta: ${userPDA.toString()}`);
      console.log(`💰 Valor usado para swap: ${DEPOSIT_AMOUNT / 1e9} SOL`);
      console.log(`🔄 Swap executado: WSOL -> DONUT`);
      console.log(`🪙 ATA para DONUT: ${userTokenAccount.toString()}`);
      
    } catch (error) {
      console.error("\n❌ ERRO DURANTE O REGISTRO:");
      console.error(error);
      
      if (error.logs) {
        console.log("\n📋 LOGS DE ERRO:");
        error.logs.forEach((log, i) => console.log(`${i}: ${log}`));
      }
    }
    
  } catch (error) {
    console.error("\n❌ ERRO DURANTE A EXECUÇÃO:");
    console.error(error);
    
    if (error.logs) {
      console.log("\n📋 LOGS DE ERRO:");
      error.logs.forEach((log, i) => console.log(`${i}: ${log}`));
    }
  }
}

// Execução da função principal
main();