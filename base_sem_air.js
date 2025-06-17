// Script para registrar usuário base - UPDATED VERSION WITH SOL->DONUT SWAP
const { 
  Connection, 
  Keypair, 
  PublicKey, 
  SystemProgram, 
  Transaction, 
  ComputeBudgetProgram, 
  TransactionInstruction 
} = require('@solana/web3.js');
const { AnchorProvider, Program, BN, Wallet } = require('@coral-xyz/anchor');
const fs = require('fs');
const path = require('path');

// Receber parâmetros da linha de comando
const args = process.argv.slice(2);
const walletPath = args[0] || './carteiras/carteira1.json';
const configPath = args[1] || './matriz-config.json';

async function main() {
  try {
    console.log("🚀 REGISTRANDO USUÁRIO BASE - VERSÃO SIMPLIFICADA COM SWAP 🚀");
    console.log("==============================================================");
    console.log("🔧 Funcionalidades: Swap SOL->DONUT (sem mint, sem WSOL)");
    
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
    
    // Carregar configuração
    let config = {};
    if (fs.existsSync(configPath)) {
      console.log(`Carregando configuração de ${configPath}...`);
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      console.log("✅ Configuração carregada com sucesso");
      
      if (config.contractVersion === "simplified-no-mint-v1.0") {
        console.log("🔧 Configuração simplificada detectada");
        console.log(`🔧 Swap Functionality: ${config.features?.hasSwapFunctionality ? "ATIVA" : "INATIVA"}`);
        console.log(`🔧 Token Mint: ${config.features?.hasTokenMint ? "ATIVA" : "REMOVIDA"}`);
        console.log(`🔧 WSOL Handling: ${config.features?.hasWSolHandling ? "ATIVA" : "REMOVIDA"}`);
      }
    } else {
      console.log(`⚠️ Arquivo de configuração não encontrado em ${configPath}`);
      console.log("⚠️ Usando valores padrão...");
    }
    
    // Configuração da conexão
    const connection = new Connection(
      'https://weathered-quiet-theorem.solana-devnet.quiknode.pro/198997b67cb51804baeb34ed2257274aa2b2d8c0', 
      'confirmed'
    );
    console.log('Conectando à Devnet');
    
    // Configurar endereços importantes
    const MATRIX_PROGRAM_ID = new PublicKey(config.programId || "G6dU3Ghhg7YGkSttucjvRzErkMAgPhFHx3efZ65Embin");
    const TOKEN_MINT = new PublicKey(config.tokenMint || "CCTG4ZmGa9Nk9NVxbd1FXBNyKjyHSapuF9aU6zgcA3xz");
    const STATE_ADDRESS = new PublicKey(config.stateAddress || "EEKMuvvoUvW3P61k95ZTTKavikVorWAn9b7Dgkshe6My");
    
    // Swap-related addresses
    const POOL_ADDRESS = new PublicKey(config.poolAddress || "FrQ5KsAgjCe3FFg6ZENri8feDft54tgnATxyffcasuxU");
    const TOKEN_A_VAULT = new PublicKey(config.tokenAVault || "4ndfcH16GKY76bzDkKfyVwHMoF8oY75KES2VaAhUYksN"); // DONUT
    const TOKEN_B_VAULT = new PublicKey(config.tokenBVault || "FERjPVNEa7Udq8CEv68h6tPL46Tq7ieE49HrE2wea3XT"); // SOL
    const METEORA_SWAP_PROGRAM = new PublicKey(config.meteoraSwapProgram || "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB");
    
    // Chainlink addresses
    const CHAINLINK_PROGRAM = new PublicKey("HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny");
    const SOL_USD_FEED = new PublicKey("99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR");
    
    // Program IDs
    const SPL_TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
    const SYSVAR_RENT_PUBKEY = new PublicKey("SysvarRent111111111111111111111111111111111");
    
    // Valor do depósito (0.1 SOL) - será validado pelo Chainlink
    const DEPOSIT_AMOUNT = 100_000_000;
    
    // Criar wallet Anchor
    const anchorWallet = new Wallet(walletKeypair);
    
    // Configurar o provider
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
      
      // Verificar proteção reentrancy
      if (stateInfo.isLocked !== undefined) {
        console.log("🛡️ Estado do lock: " + (stateInfo.isLocked ? "ATIVO (ERRO!)" : "PRONTO"));
        if (stateInfo.isLocked) {
          console.error("❌ ERRO: Programa está com lock ativo!");
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
    
    // Verificar se já está registrado
    try {
      const userInfo = await program.account.userAccount.fetch(userPDA);
      if (userInfo.isRegistered) {
        console.log("⚠️ USUÁRIO JÁ ESTÁ REGISTRADO!");
        console.log(`🆔 Upline ID: ${userInfo.upline.id.toString()}`);
        console.log(`🆔 Chain ID: ${userInfo.chain.id.toString()}`);
        console.log(`📊 Slots preenchidos: ${userInfo.chain.filledSlots}/3`);
        console.log(`💰 SOL Reservado: ${userInfo.reservedSol / 1e9} SOL`);
        return;
      }
    } catch (e) {
      console.log("✅ Usuário ainda não registrado, prosseguindo...");
    }
    
    // Criar ATA para DONUT tokens (para receber do swap)
    console.log("\n📋 CRIANDO ATA PARA TOKENS DONUT...");
    
    // Calcular endereço ATA
    const [userDonutATA] = PublicKey.findProgramAddressSync(
      [
        walletKeypair.publicKey.toBuffer(),
        SPL_TOKEN_PROGRAM_ID.toBuffer(),
        TOKEN_MINT.toBuffer(),
      ],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    console.log(`🪙 ATA DONUT do usuário: ${userDonutATA.toString()}`);
    
    // Verificar se ATA já existe
    let needsAtaCreation = false;
    try {
      const ataInfo = await connection.getAccountInfo(userDonutATA);
      if (!ataInfo) {
        needsAtaCreation = true;
        console.log("📝 ATA DONUT precisa ser criada");
      } else {
        console.log("✅ ATA DONUT já existe");
      }
    } catch (e) {
      needsAtaCreation = true;
    }
    
    // Configurar compute units para transação complexa
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: 800_000,
    });
    
    const setPriority = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 5000,
    });
    
    try {
      console.log("\n📤 Enviando transação de registro com swap...");
      console.log("🔄 Operação: SOL -> DONUT via Meteora");
      
      // Preparar remaining accounts para Chainlink
      const remainingAccounts = [
        { pubkey: CHAINLINK_PROGRAM, isWritable: false, isSigner: false },
        { pubkey: SOL_USD_FEED, isWritable: false, isSigner: false },
      ];
      
      console.log("\n🔍 CONFIGURANDO CONTAS:");
      console.log("  ✓ Pool: " + POOL_ADDRESS.toString());
      console.log("  ✓ Token A Vault (DONUT): " + TOKEN_A_VAULT.toString());
      console.log("  ✓ Token B Vault (SOL): " + TOKEN_B_VAULT.toString());
      console.log("  ✓ Swap Program: " + METEORA_SWAP_PROGRAM.toString());
      console.log("  ✓ User DONUT ATA: " + userDonutATA.toString());
      console.log("  ✓ Chainlink Program: " + CHAINLINK_PROGRAM.toString());
      console.log("  ✓ SOL/USD Feed: " + SOL_USD_FEED.toString());
      
      let txid;
      
      if (needsAtaCreation) {
        // Usar registerWithoutReferrerSwap que cria ATA automaticamente
        txid = await program.methods
          .registerWithoutReferrer(new BN(DEPOSIT_AMOUNT))
          .accounts({
            state: STATE_ADDRESS,
            owner: walletKeypair.publicKey,
            userWallet: walletKeypair.publicKey,
            user: userPDA,
            userDonutAccount: userDonutATA,
            tokenMint: TOKEN_MINT,
            pool: POOL_ADDRESS,
            tokenAVault: TOKEN_A_VAULT,
            tokenBVault: TOKEN_B_VAULT,
            swapProgram: METEORA_SWAP_PROGRAM,
            tokenProgram: SPL_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .remainingAccounts(remainingAccounts)
          .preInstructions([modifyComputeUnits, setPriority])
          .rpc();
      } else {
        // ATA já existe, pode usar contas existentes
        txid = await program.methods
          .registerWithoutReferrer(new BN(DEPOSIT_AMOUNT))
          .accounts({
            state: STATE_ADDRESS,
            owner: walletKeypair.publicKey,
            userWallet: walletKeypair.publicKey,
            user: userPDA,
            userDonutAccount: userDonutATA,
            tokenMint: TOKEN_MINT,
            pool: POOL_ADDRESS,
            tokenAVault: TOKEN_A_VAULT,
            tokenBVault: TOKEN_B_VAULT,
            swapProgram: METEORA_SWAP_PROGRAM,
            tokenProgram: SPL_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .remainingAccounts(remainingAccounts)
          .preInstructions([modifyComputeUnits, setPriority])
          .rpc();
      }
      
      console.log("✅ Transação enviada: " + txid);
      console.log(`🔍 Link: https://explorer.solana.com/tx/${txid}?cluster=devnet`);
      
      console.log("\n⏳ Aguardando confirmação...");
      await connection.confirmTransaction(txid, 'confirmed');
      console.log("✅ Transação confirmada!");
      
      // Verificar resultado do registro
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
      
      // Verificar saldo de DONUT recebido
      try {
        const donutBalance = await connection.getTokenAccountBalance(userDonutATA);
        console.log(`🪙 DONUT recebidos: ${donutBalance.value.uiAmount || 0} DONUT`);
      } catch (e) {
        console.log("⚠️ Não foi possível verificar saldo de DONUT: " + e.message);
      }
      
      // Verificar estado do programa após transação
      console.log("\n🛡️ VERIFICAÇÃO PÓS-TRANSAÇÃO:");
      try {
        const newStateInfo = await program.account.programState.fetch(STATE_ADDRESS);
        if (newStateInfo.isLocked !== undefined) {
          console.log("🛡️ Lock após transação: " + (newStateInfo.isLocked ? "ATIVO (ERRO!)" : "LIBERADO"));
          if (!newStateInfo.isLocked) {
            console.log("✅ Proteção reentrancy funcionou corretamente");
          }
        }
      } catch (e) {
        console.log("⚠️ Não foi possível verificar estado: " + e.message);
      }
      
      console.log("\n🎉 REGISTRO COM SWAP CONCLUÍDO COM SUCESSO! 🎉");
      console.log("==============================================");
      console.log("\n📋 RESUMO:");
      console.log(`🏦 Usuário: ${walletKeypair.publicKey.toString()}`);
      console.log(`📄 PDA: ${userPDA.toString()}`);
      console.log(`🪙 ATA DONUT: ${userDonutATA.toString()}`);
      console.log(`💰 Depósito: ${DEPOSIT_AMOUNT / 1e9} SOL`);
      console.log(`🔄 Operação: Swap SOL->DONUT via Meteora`);
      
    } catch (error) {
      console.error("\n❌ ERRO DURANTE O REGISTRO:");
      console.error(error);
      
      if (error.logs) {
        console.log("\n📋 LOGS DE ERRO:");
        const relevantLogs = error.logs.filter(log => 
          log.includes("Program log:") || 
          log.includes("Error") || 
          log.includes("swap") ||
          log.includes("insufficient") ||
          log.includes("failed")
        );
        
        if (relevantLogs.length > 0) {
          console.log("🔍 Logs relevantes:");
          relevantLogs.forEach((log, i) => console.log(`  ${i}: ${log}`));
        }
        
        console.log("\n📋 Todos os logs:");
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

// Execução
main();