// register_base_user_v3.js - Alinhado com o contrato atual
// Script para registrar usuário base com swap + burn

const { 
  Connection, 
  Keypair, 
  PublicKey, 
  SystemProgram, 
  Transaction, 
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL
} = require('@solana/web3.js');
const { 
  AnchorProvider, 
  Program, 
  BN, 
  Wallet 
} = require('@coral-xyz/anchor');
const { 
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  NATIVE_MINT
} = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

// Parâmetros da linha de comando
const args = process.argv.slice(2);
const walletPath = args[0] || '/Users/dark/.config/solana/id.json';
const configPath = args[1] || './matriz-airdrop-config.json';
const depositAmount = args[2] ? parseFloat(args[2]) : 0.01; // SOL amount

async function main() {
  try {
    console.log("🚀 REGISTRANDO USUÁRIO BASE - SISTEMA DE AIRDROP v3.0 🚀");
    console.log("=========================================================");
    console.log("🔥 Modelo: DEFLATIONARY (Swap + Burn)");
    console.log(`💰 Valor de depósito: ${depositAmount} SOL`);
    
    // Carregar carteira
    console.log(`\nCarregando carteira de ${walletPath}...`);
    let walletKeypair;
    try {
      const secretKeyString = fs.readFileSync(walletPath, { encoding: 'utf8' });
      walletKeypair = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(secretKeyString))
      );
      console.log("✅ Carteira carregada: " + walletKeypair.publicKey.toString());
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
      console.log("✅ Configuração carregada");
    } else {
      console.error(`❌ Arquivo de configuração não encontrado em ${configPath}`);
      console.error("Execute primeiro o script de inicialização!");
      return;
    }
    
    // Configuração da conexão
    const connection = new Connection(
      'https://api.devnet.solana.com', // Ajuste conforme necessário
      'confirmed'
    );
    console.log('Conectando à rede...');
    
    // ===== ENDEREÇOS DO PROGRAMA (DO CONTRATO) =====
    const PROGRAM_ID = new PublicKey(config.programId);
    const STATE_ADDRESS = new PublicKey(config.stateAddress);
    const TOKEN_MINT = new PublicKey(config.tokenMint);
    const WSOL_MINT = new PublicKey(config.wsolMint);
    const MULTISIG_TREASURY = new PublicKey(config.multisigTreasury);
    
    // Endereços verificados (do contrato)
    const verifiedAddresses = config.verifiedAddresses;
    const POOL_ADDRESS = new PublicKey(verifiedAddresses.poolAddress);
    const A_VAULT = new PublicKey(verifiedAddresses.aVault);
    const A_VAULT_LP = new PublicKey(verifiedAddresses.aVaultLp);
    const A_VAULT_LP_MINT = new PublicKey(verifiedAddresses.aVaultLpMint);
    const A_TOKEN_VAULT = new PublicKey(verifiedAddresses.aTokenVault);
    const B_VAULT = new PublicKey(verifiedAddresses.bVault);
    const B_VAULT_LP = new PublicKey(verifiedAddresses.bVaultLp);
    const B_TOKEN_VAULT = new PublicKey(verifiedAddresses.bTokenVault);
    const B_VAULT_LP_MINT = new PublicKey(verifiedAddresses.bVaultLpMint);
    const VAULT_PROGRAM = new PublicKey(verifiedAddresses.meteoraVaultProgram);
    const AMM_PROGRAM = new PublicKey(verifiedAddresses.meteoraAmmProgram);
    const PROTOCOL_TOKEN_B_FEE = new PublicKey(verifiedAddresses.protocolTokenBFee);
    const CHAINLINK_PROGRAM = new PublicKey(verifiedAddresses.chainlinkProgram);
    const SOL_USD_FEED = new PublicKey(verifiedAddresses.solUsdFeed);
    
    // Valor do depósito em lamports
    const DEPOSIT_AMOUNT = new BN(depositAmount * LAMPORTS_PER_SOL);
    
    // Criar wallet e provider
    const anchorWallet = new Wallet(walletKeypair);
    const provider = new AnchorProvider(
      connection, 
      anchorWallet, 
      { commitment: 'confirmed' }
    );
    
    // Inicializar o programa
    const program = new Program(idl, PROGRAM_ID, provider);
    
    // Verificar saldo
    console.log("\n👤 INFORMAÇÕES DA CARTEIRA:");
    const balance = await connection.getBalance(walletKeypair.publicKey);
    console.log("💰 Saldo: " + balance / LAMPORTS_PER_SOL + " SOL");
    
    if (balance < DEPOSIT_AMOUNT.toNumber() + 0.01 * LAMPORTS_PER_SOL) {
      console.error("❌ Saldo insuficiente!");
      console.error(`Necessário: ${(DEPOSIT_AMOUNT.toNumber() + 0.01 * LAMPORTS_PER_SOL) / LAMPORTS_PER_SOL} SOL`);
      return;
    }
    
    // Verificar estado do programa
    console.log("\n🔍 VERIFICANDO ESTADO DO PROGRAMA...");
    try {
      const stateInfo = await program.account.programState.fetch(STATE_ADDRESS);
      console.log("✅ Estado verificado");
      console.log("📅 Semana atual: " + stateInfo.currentWeek.toString());
      console.log("🎲 Airdrop ativo: " + (stateInfo.airdropActive ? "SIM" : "NÃO"));
      console.log("📊 Matrizes esta semana: " + stateInfo.totalMatricesThisWeek.toString());
      console.log("🔒 Lock status: " + (stateInfo.isLocked ? "LOCKED" : "UNLOCKED"));
      
      if (stateInfo.isLocked) {
        console.error("❌ Programa está locked! Aguarde e tente novamente.");
        return;
      }
      
      if (!stateInfo.airdropActive) {
        console.error("❌ Sistema de airdrop não está ativo!");
        return;
      }
    } catch (e) {
      console.error("❌ Erro ao verificar estado:", e);
      return;
    }
    
    // Derivar PDA da conta do usuário
    console.log("\n🔑 DERIVANDO CONTAS...");
    const [userPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_account"), walletKeypair.publicKey.toBuffer()],
      PROGRAM_ID
    );
    console.log("📄 PDA do usuário: " + userPDA.toString());
    
    // Verificar se já está registrado
    try {
      const userInfo = await program.account.userAccount.fetch(userPDA);
      if (userInfo.isRegistered) {
        console.log("\n⚠️ USUÁRIO JÁ REGISTRADO!");
        console.log("📊 Matrizes completadas: " + userInfo.completedMatricesTotal.toString());
        console.log("💰 DONUT ganho: " + userInfo.totalDonutEarned.toString());
        console.log("🎁 DONUT coletado: " + userInfo.totalDonutClaimed.toString());
        
        const available = userInfo.totalDonutEarned.sub(userInfo.totalDonutClaimed);
        console.log("💎 Disponível para claim: " + available.toString());
        return;
      }
    } catch (e) {
      console.log("✅ Usuário não registrado, prosseguindo...");
    }
    
    // Derivar contas WSOL e DONUT do usuário
    const userWsolAccount = await getAssociatedTokenAddress(
      WSOL_MINT,
      walletKeypair.publicKey
    );
    console.log("💵 Conta WSOL do usuário: " + userWsolAccount.toString());
    
    const userDonutAccount = await getAssociatedTokenAddress(
      TOKEN_MINT,
      walletKeypair.publicKey
    );
    console.log("🍩 Conta DONUT do usuário: " + userDonutAccount.toString());
    
    // Verificar se conta WSOL existe
    const wsolAccountInfo = await connection.getAccountInfo(userWsolAccount);
    const needsWsolAccount = !wsolAccountInfo;
    
    console.log("\n📋 PREPARANDO TRANSAÇÃO...");
    
    // Configurar compute units
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: 1_400_000,
    });
    
    const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 10000,
    });
    
    // Construir pré-instruções se necessário
    const preInstructions = [modifyComputeUnits, addPriorityFee];
    
    if (needsWsolAccount) {
      console.log("📝 Criando conta WSOL...");
      const createWsolAccountIx = createAssociatedTokenAccountInstruction(
        walletKeypair.publicKey,
        userWsolAccount,
        walletKeypair.publicKey,
        WSOL_MINT
      );
      preInstructions.push(createWsolAccountIx);
    }
    
    try {
      console.log("\n🚀 ENVIANDO TRANSAÇÃO DE REGISTRO...");
      console.log("💰 Depositando: " + depositAmount + " SOL");
      console.log("🔥 Processo: SOL → WSOL → Swap → DONUT → Burn");
      
      const txid = await program.methods
        .registerWithoutReferrerDeposit(DEPOSIT_AMOUNT)
        .accounts({
          state: STATE_ADDRESS,
          owner: MULTISIG_TREASURY, // owner deve ser o multisig treasury
          userWallet: walletKeypair.publicKey,
          user: userPDA,
          userWsolAccount: userWsolAccount,
          userDonutAccount: userDonutAccount,
          wsolMint: WSOL_MINT,
          // Contas Meteora
          pool: POOL_ADDRESS,
          aVault: A_VAULT,
          bVault: B_VAULT,
          aTokenVault: A_TOKEN_VAULT,
          bTokenVault: B_TOKEN_VAULT,
          aVaultLpMint: A_VAULT_LP_MINT,
          bVaultLpMint: B_VAULT_LP_MINT,
          aVaultLp: A_VAULT_LP,
          bVaultLp: B_VAULT_LP,
          protocolTokenFee: PROTOCOL_TOKEN_B_FEE,
          tokenMint: TOKEN_MINT,
          vaultProgram: VAULT_PROGRAM,
          ammProgram: AMM_PROGRAM,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: PublicKey.default, // SYSVAR_RENT
        })
        .remainingAccounts([
          { pubkey: SOL_USD_FEED, isWritable: false, isSigner: false },
          { pubkey: CHAINLINK_PROGRAM, isWritable: false, isSigner: false },
        ])
        .preInstructions(preInstructions)
        .rpc();
      
      console.log("✅ Transação enviada: " + txid);
      console.log(`🔍 Explorer: https://explorer.solana.com/tx/${txid}?cluster=devnet`);
      
      console.log("\n⏳ Aguardando confirmação...");
      await connection.confirmTransaction(txid, 'confirmed');
      console.log("✅ Transação confirmada!");
      
      // Verificar registro
      const userInfo = await program.account.userAccount.fetch(userPDA);
      console.log("\n📋 DADOS DO USUÁRIO REGISTRADO:");
      console.log("✅ Registrado: " + userInfo.isRegistered);
      console.log("🆔 Upline ID: " + userInfo.upline.id.toString());
      console.log("🆔 Chain ID: " + userInfo.chain.id.toString());
      console.log("👤 Owner Wallet: " + userInfo.ownerWallet.toString());
      console.log("📊 Slots preenchidos: " + userInfo.chain.filledSlots + "/3");
      
      // Informações do airdrop
      console.log("\n🎯 SISTEMA DE AIRDROP:");
      console.log("📊 Matrizes completadas: " + userInfo.completedMatricesTotal.toString());
      console.log("💰 DONUT ganho total: " + userInfo.totalDonutEarned.toString());
      console.log("🎁 DONUT já coletado: " + userInfo.totalDonutClaimed.toString());
      console.log("📅 Última semana processada: " + userInfo.lastProcessedWeek.toString());
      
      // Verificar saldo final
      const finalBalance = await connection.getBalance(walletKeypair.publicKey);
      console.log("\n💼 RESUMO FINANCEIRO:");
      console.log("💰 Saldo inicial: " + balance / LAMPORTS_PER_SOL + " SOL");
      console.log("💰 Saldo final: " + finalBalance / LAMPORTS_PER_SOL + " SOL");
      console.log("💸 Gasto total: " + (balance - finalBalance) / LAMPORTS_PER_SOL + " SOL");
      
      console.log("\n🎉 REGISTRO CONCLUÍDO COM SUCESSO! 🎉");
      console.log("===========================================");
      console.log("\n📋 PRÓXIMOS PASSOS:");
      console.log("1. Registre outros usuários com seu endereço como referenciador");
      console.log("2. Complete matrizes para ganhar rewards de DONUT");
      console.log("3. Use claim_airdrop quando tiver DONUT disponível");
      console.log("4. Monitore seu progresso com as funções de consulta");
      
      console.log("\n🔑 INFORMAÇÕES PARA REFERENCIAMENTO:");
      console.log("Wallet do referenciador: " + walletKeypair.publicKey.toString());
      console.log("PDA do referenciador: " + userPDA.toString());
      
    } catch (error) {
      console.error("\n❌ ERRO DURANTE O REGISTRO:");
      console.error(error);
      
      if (error.logs) {
        console.log("\n📋 LOGS DE ERRO:");
        error.logs.forEach((log, i) => {
          if (log.includes("Program log:") || 
              log.includes("Error") || 
              log.includes("error")) {
            console.log(`${i}: ${log}`);
          }
        });
      }
      
      // Análise específica de erros comuns
      if (error.toString().includes("InsufficientDeposit")) {
        console.error("\n❌ Depósito insuficiente!");
        console.error("O valor mínimo é determinado pelo feed de preço Chainlink");
        console.error("Tente aumentar o valor do depósito");
      } else if (error.toString().includes("NotAuthorized")) {
        console.error("\n❌ Não autorizado!");
        console.error("Apenas o multisig treasury pode registrar usuários base");
        console.error("Treasury esperado: " + MULTISIG_TREASURY.toString());
      } else if (error.toString().includes("ReentrancyLock")) {
        console.error("\n❌ Lock de reentrância ativo!");
        console.error("Aguarde alguns segundos e tente novamente");
      }
    }
    
  } catch (error) {
    console.error("\n❌ ERRO GERAL:");
    console.error(error);
  }
}

// Executar
main();