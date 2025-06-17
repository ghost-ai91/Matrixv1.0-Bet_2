// base_user_v3_simplified.js - AIRDROP SYSTEM VERSION SIMPLIFICADO
// Script para registrar usuário base do sistema de referral com Airdrop - SEM TEMP VAULT

const { Connection, Keypair, PublicKey, SystemProgram, Transaction, ComputeBudgetProgram, TransactionInstruction } = require('@solana/web3.js');
const { AnchorProvider, Program, BN, Wallet, utils } = require('@coral-xyz/anchor');
const fs = require('fs');
const path = require('path');

// Receber parâmetros da linha de comando (opcional)
const args = process.argv.slice(2);
const walletPath = args[0] || '/Users/dark/.config/solana/id.json';
const configPath = args[1] || './matriz-airdrop-config.json';

async function main() {
  try {
    console.log("🚀 REGISTRANDO USUÁRIO BASE - SISTEMA SIMPLIFICADO v3.0 🚀");
    console.log("=============================================================");
    console.log("🎯 Versão: AIRDROP SYSTEM SIMPLIFICADO (sem temp vault)");
    console.log("🔥 Modelo: DEFLATIONARY (Swap direto + Burn)");
    
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
      
      // AIRDROP SYSTEM CHECK
      if (config.systemVersion === "airdrop-v2.0") {
        console.log("🎯 Sistema de airdrop detectado");
        console.log(`📅 Semana atual: ${config.currentWeek}`);
        console.log(`🎲 Airdrop ativo: ${config.airdropActive ? "SIM" : "NÃO"}`);
        console.log(`🔥 Sistema deflationary: ${config.hasDeflationary ? "ATIVO" : "INATIVO"}`);
      } else {
        console.log("⚠️ Configuração legada detectada - pode não ser compatível");
      }
    } else {
      console.log(`⚠️ Arquivo de configuração não encontrado em ${configPath}`);
      console.log("⚠️ Usando valores padrão para endereços...");
    }
    
    // Configuração da conexão
    const connection = new Connection('https://weathered-quiet-theorem.solana-devnet.quiknode.pro/198997b67cb51804baeb34ed2257274aa2b2d8c0', 'confirmed');
    console.log('Conectando à Devnet');
    
    // Configurar endereços importantes
    const MATRIX_PROGRAM_ID = new PublicKey(config.programId || "G6dU3Ghhg7YGkSttucjvRzErkMAgPhFHx3efZ65Embin");
    const TOKEN_MINT = new PublicKey(config.tokenMint || "CCTG4ZmGa9Nk9NVxbd1FXBNyKjyHSapuF9aU6zgcA3xz");
    const STATE_ADDRESS = new PublicKey(config.stateAddress || "5bwiCzQLtye1inAWjnUVQyfaWnaqXWJVfAP1m5RAFyp1");
    
    // PRINCIPAL VAULT (USADO PARA SWAP+BURN)
    const PROGRAM_TOKEN_VAULT = new PublicKey(config.programTokenVault || "BBJi5yNpb9oRi1ZA6SqVmQwZ8wbekuPcwUXZZNhrpCvh");
    
    // Pool e vault addresses - VERIFIED for airdrop contract
    const POOL_ADDRESS = new PublicKey("FrQ5KsAgjCe3FFg6ZENri8feDft54tgnATxyffcasuxU");
    
    // Vault A addresses (DONUT) - VERIFIED
    const A_VAULT = new PublicKey("4ndfcH16GKY76bzDkKfyVwHMoF8oY75KES2VaAhUYksN");
    const A_VAULT_LP = new PublicKey("CocstBGbeDVyTJWxbWs4docwWapVADAo1xXQSh9RfPMz");
    const A_VAULT_LP_MINT = new PublicKey("6f2FVX5UT5uBtgknc8fDj119Z7DQoLJeKRmBq7j1zsVi");
    const A_TOKEN_VAULT = new PublicKey("6m1wvYoPrwjAnbuGMqpMoodQaq4VnZXRjrzufXnPSjmj");
    
    // Vault B addresses (SOL) - VERIFIED
    const B_VAULT = new PublicKey("FERjPVNEa7Udq8CEv68h6tPL46Tq7ieE49HrE2wea3XT");
    const B_TOKEN_VAULT = new PublicKey("HZeLxbZ9uHtSpwZC3LBr4Nubd14iHwz7bRSghRZf5VCG");
    const B_VAULT_LP_MINT = new PublicKey("BvoAjwEDhpLzs3jtu4H72j96ShKT5rvZE9RP1vgpfSM");
    const B_VAULT_LP = new PublicKey("HJNs8hPTzs9i6AVFkRDDMFVEkrrUoV7H7LDZHdCWvxn7");
    const VAULT_PROGRAM = new PublicKey("24Uqj9JCLxUeoC3hGfh5W3s9FM9uCHDS2SG3LYwBpyTi");
    
    // METEORA AMM program
    const METEORA_AMM_PROGRAM = new PublicKey("Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB");
    
    // Chainlink addresses (Devnet) - VERIFIED
    const CHAINLINK_PROGRAM = new PublicKey("HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny");
    const SOL_USD_FEED = new PublicKey("99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR");
    
    // Programas do sistema
    const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
    const SPL_TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
    const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
    const SYSVAR_RENT_PUBKEY = new PublicKey("SysvarRent111111111111111111111111111111111");
    
    // Valor fixo do depósito (0.1 SOL) - validado contra Chainlink feed
    const DEPOSIT_AMOUNT = 100_000_000;
    
    // Criar wallet usando a classe Wallet do Anchor
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
    
    // AIRDROP SYSTEM: Verificar estado do programa
    console.log("\n🔍 VERIFICANDO ESTADO DO SISTEMA DE AIRDROP...");
    try {
      const stateInfo = await program.account.programState.fetch(STATE_ADDRESS);
      console.log("✅ ESTADO DO SISTEMA DE AIRDROP VERIFICADO:");
      console.log("👑 Owner: " + stateInfo.owner.toString());
      console.log("🆔 Próximo ID de upline: " + stateInfo.nextUplineId.toString());
      console.log("🆔 Próximo ID de chain: " + stateInfo.nextChainId.toString());
      
      // AIRDROP SYSTEM: Verificar campos específicos
      console.log("\n🎯 STATUS DO SISTEMA DE AIRDROP:");
      console.log("📅 Semana atual: " + stateInfo.currentWeek.toString());
      console.log("🎲 Airdrop ativo: " + (stateInfo.airdropActive ? "SIM" : "NÃO"));
      console.log("📊 Matrizes esta semana: " + stateInfo.totalMatricesThisWeek.toString());
      
      if (stateInfo.programStartTimestamp) {
        const startDate = new Date(stateInfo.programStartTimestamp.toNumber() * 1000);
        console.log("⏰ Início: " + startDate.toLocaleString());
        
        const currentTime = Math.floor(Date.now() / 1000);
        const elapsedSeconds = currentTime - stateInfo.programStartTimestamp.toNumber();
        const elapsedWeeks = Math.floor(elapsedSeconds / (7 * 24 * 60 * 60));
        console.log(`⏳ Tempo decorrido: ${elapsedWeeks} semanas`);
      }
      
      console.log("📜 Semanas já fechadas: " + stateInfo.closedWeeks.length);
      
      // Verificar se programa ainda está ativo
      if (!stateInfo.airdropActive) {
        console.log("⚠️ ATENÇÃO: Sistema de airdrop foi finalizado!");
        console.log("🏁 Programa completou as 36 semanas");
        return;
      }
      
      // Check reentrancy protection
      if (stateInfo.isLocked !== undefined) {
        console.log("🛡️ Estado do lock de reentrancy: " + (stateInfo.isLocked ? "ATIVO (ERRO!)" : "PRONTO"));
        if (stateInfo.isLocked) {
          console.error("❌ ERRO CRÍTICO: Programa está com lock ativo!");
          console.error("⚠️ Aguarde alguns segundos e tente novamente");
          return;
        }
      }
    } catch (e) {
      console.error("❌ ERRO: Estado do programa não encontrado ou inacessível!");
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
        
        // AIRDROP SYSTEM: Display airdrop info
        console.log("\n🎯 INFORMAÇÕES DO AIRDROP:");
        console.log(`📊 Matrizes completadas: ${userInfo.completedMatricesTotal.toString()}`);
        console.log(`💰 DONUT ganho: ${userInfo.totalDonutEarned.toString()}`);
        console.log(`🎁 DONUT coletado: ${userInfo.totalDonutClaimed.toString()}`);
        
        const available = userInfo.totalDonutEarned - userInfo.totalDonutClaimed;
        console.log(`🎁 Disponível para claim: ${available.toString()}`);
        console.log(`📅 Última semana processada: ${userInfo.lastProcessedWeek.toString()}`);
        
        if (userInfo.weeklyMatrices && userInfo.weeklyMatrices.length > 0) {
          console.log("\n📊 BREAKDOWN SEMANAL:");
          userInfo.weeklyMatrices.forEach((week, index) => {
            console.log(`  Semana ${week.weekNumber}: ${week.matricesCompleted} matrizes`);
          });
        }
        
        return;
      }
    } catch (e) {
      console.log("✅ Usuário ainda não registrado, prosseguindo com registro...");
    }
    
    // SIMPLIFICADO: Derivar apenas as PDAs necessárias
    console.log("\n🔧 DERIVANDO PDAs PARA SISTEMA SIMPLIFICADO...");
    
    const [vaultAuthority, vaultAuthorityBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_vault_authority")],
      MATRIX_PROGRAM_ID
    );
    console.log("🔑 VAULT_AUTHORITY: " + vaultAuthority.toString());
    console.log("🔑 VAULT_AUTHORITY_BUMP: " + vaultAuthorityBump);
    
    console.log("💰 PROGRAM_TOKEN_VAULT: " + PROGRAM_TOKEN_VAULT.toString());
    console.log("✅ Usando vault principal para swap+burn direto");
    
    // ==== ETAPA ÚNICA: EXECUTAR REGISTRO SIMPLIFICADO ====
    console.log("\n📋 EXECUTANDO REGISTRO SIMPLIFICADO (SEM TEMP VAULT)");
    
    // Preparar os remaining accounts para o sistema de airdrop
    const remainingAccounts = [
      { pubkey: POOL_ADDRESS, isWritable: false, isSigner: false },      // Index 0: Pool
      { pubkey: A_VAULT, isWritable: false, isSigner: false },          // Index 1: Vault A state
      { pubkey: A_VAULT_LP, isWritable: false, isSigner: false },       // Index 2: Vault A LP
      { pubkey: A_VAULT_LP_MINT, isWritable: false, isSigner: false },  // Index 3: Vault A LP Mint
      { pubkey: A_TOKEN_VAULT, isWritable: false, isSigner: false },    // Index 4: Token A Vault
      { pubkey: SOL_USD_FEED, isWritable: false, isSigner: false },     // Index 5: Chainlink Feed
      { pubkey: CHAINLINK_PROGRAM, isWritable: false, isSigner: false }, // Index 6: Chainlink Program
    ];
    
    console.log("\n🔍 CONFIGURANDO REMAINING_ACCOUNTS PARA SISTEMA SIMPLIFICADO:");
    console.log("  ✓ POOL_ADDRESS: " + POOL_ADDRESS.toString());
    console.log("  ✓ A_VAULT: " + A_VAULT.toString());
    console.log("  ✓ A_VAULT_LP: " + A_VAULT_LP.toString());
    console.log("  ✓ A_VAULT_LP_MINT: " + A_VAULT_LP_MINT.toString());
    console.log("  ✓ A_TOKEN_VAULT: " + A_TOKEN_VAULT.toString());
    console.log("  ✓ SOL_USD_FEED: " + SOL_USD_FEED.toString());
    console.log("  ✓ CHAINLINK_PROGRAM: " + CHAINLINK_PROGRAM.toString());
    
    // Verificação de ordem dos endereços
    if (!remainingAccounts[0].pubkey.equals(POOL_ADDRESS) ||
        !remainingAccounts[1].pubkey.equals(A_VAULT) ||
        !remainingAccounts[5].pubkey.equals(SOL_USD_FEED) || 
        !remainingAccounts[6].pubkey.equals(CHAINLINK_PROGRAM)) {
      console.error("❌ ERRO CRÍTICO: Ordem dos endereços está incorreta!");
      return;
    }
    
    console.log("✅ Validação de ordem passou - todos os endereços estão corretos");
    
    // Configurar compute units para operações complexas
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: 1_400_000, // Aumentado para sistema de airdrop
    });
    
    const setPriority = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 10000,
    });
    
    try {
      console.log("\n📤 Enviando transação de registro simplificado...");
      console.log("🎯 Aplicando swap+burn direto no vault principal...");
      
      const txid = await program.methods
        .registerWithoutReferrerSimplified(new BN(DEPOSIT_AMOUNT))
        .accounts({
          state: STATE_ADDRESS,
          owner: walletKeypair.publicKey, // Owner = usuário (multisig treasury)
          userWallet: walletKeypair.publicKey,
          user: userPDA,
          programTokenVault: PROGRAM_TOKEN_VAULT,
          vaultAuthority: vaultAuthority,
          pool: POOL_ADDRESS,
          bVault: B_VAULT,
          bTokenVault: B_TOKEN_VAULT,
          bVaultLpMint: B_VAULT_LP_MINT,
          bVaultLp: B_VAULT_LP,
          vaultProgram: VAULT_PROGRAM,
          ammProgram: METEORA_AMM_PROGRAM,
          tokenMint: TOKEN_MINT,
          tokenProgram: SPL_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .remainingAccounts(remainingAccounts)
        .preInstructions([modifyComputeUnits, setPriority])
        .rpc();
      
      console.log("✅ Transação de registro enviada: " + txid);
      console.log(`🔍 Link para explorador: https://explorer.solana.com/tx/${txid}?cluster=devnet`);
      
      console.log("\n⏳ Aguardando confirmação...");
      await connection.confirmTransaction(txid, 'confirmed');
      console.log("✅ Transação confirmada!");
      
      // Verificar se o registro foi bem-sucedido
      const userInfo = await program.account.userAccount.fetch(userPDA);
      console.log("\n📋 CONFIRMAÇÃO DE REGISTRO SIMPLIFICADO:");
      console.log("✅ Usuário registrado: " + userInfo.isRegistered);
      console.log("🆔 Upline ID: " + userInfo.upline.id.toString());
      console.log("🆔 Chain ID: " + userInfo.chain.id.toString());
      console.log("📊 Slots preenchidos: " + userInfo.chain.filledSlots + "/3");
      console.log("💰 SOL Reservado: " + userInfo.reservedSol / 1e9 + " SOL");
      
      // AIRDROP SYSTEM: Verificar campos específicos
      console.log("\n🎯 DADOS DO SISTEMA DE AIRDROP:");
      console.log("📊 Matrizes completadas: " + userInfo.completedMatricesTotal.toString());
      console.log("💰 DONUT ganho: " + userInfo.totalDonutEarned.toString());
      console.log("🎁 DONUT coletado: " + userInfo.totalDonutClaimed.toString());
      
      const available = userInfo.totalDonutEarned - userInfo.totalDonutClaimed;
      console.log("🎁 Disponível para claim: " + available.toString());
      console.log("📅 Última semana processada: " + userInfo.lastProcessedWeek.toString());
      
      // Verificar owner_wallet field
      if (userInfo.ownerWallet) {
        console.log("\n📋 VALIDAÇÃO DE CAMPOS DE SEGURANÇA:");
        console.log("👤 Owner Wallet: " + userInfo.ownerWallet.toString());
        
        if (userInfo.ownerWallet.equals(walletKeypair.publicKey)) {
          console.log("✅ Campo owner_wallet validado com segurança");
        } else {
          console.log("❌ ALERTA: Owner Wallet não corresponde!");
        }
      }
      
      // Verificar estrutura UplineEntry (usuário base não deve ter)
      if (userInfo.upline.upline && userInfo.upline.upline.length > 0) {
        console.log("\n📋 INFORMAÇÕES DAS UPLINES:");
        userInfo.upline.upline.forEach((entry, index) => {
          console.log(`  Upline #${index+1}:`);
          console.log(`    PDA: ${entry.pda.toString()}`);
          console.log(`    Wallet: ${entry.wallet.toString()}`);
        });
      } else {
        console.log("\n📋 ✅ USUÁRIO BASE VALIDADO - SEM UPLINES (CORRETO)");
      }
      
      // Verificar dados semanais
      if (userInfo.weeklyMatrices && userInfo.weeklyMatrices.length > 0) {
        console.log("\n📊 DADOS SEMANAIS:");
        userInfo.weeklyMatrices.forEach((week, index) => {
          console.log(`  Semana ${week.weekNumber}: ${week.matricesCompleted} matrizes`);
        });
      } else {
        console.log("\n📊 Ainda sem dados semanais (normal para usuário recém-registrado)");
      }
      
      // Verificar estado do programa após transação
      console.log("\n🛡️ VERIFICAÇÃO PÓS-TRANSAÇÃO:");
      try {
        const newStateInfo = await program.account.programState.fetch(STATE_ADDRESS);
        console.log("📅 Semana atual: " + newStateInfo.currentWeek.toString());
        console.log("📊 Matrizes esta semana: " + newStateInfo.totalMatricesThisWeek.toString());
        console.log("🎲 Airdrop ativo: " + (newStateInfo.airdropActive ? "SIM" : "NÃO"));
        
        if (newStateInfo.isLocked !== undefined) {
          console.log("🛡️ Estado do lock: " + (newStateInfo.isLocked ? "ATIVO (ERRO!)" : "LIBERADO"));
          if (newStateInfo.isLocked) {
            console.log("❌ ERRO: Lock não foi liberado!");
          } else {
            console.log("✅ Proteção reentrancy funcionou corretamente");
          }
        }
      } catch (e) {
        console.log("⚠️ Não foi possível verificar estado pós-transação: " + e.message);
      }
      
      // Obter novo saldo
      const newBalance = await connection.getBalance(walletKeypair.publicKey);
      console.log("\n💼 Seu novo saldo: " + newBalance / 1e9 + " SOL");
      console.log("💰 SOL gasto: " + (balance - newBalance) / 1e9 + " SOL");
      
      console.log("\n🎉 REGISTRO SIMPLIFICADO CONCLUÍDO COM SUCESSO! 🎉");
      console.log("🎯 SISTEMA DE AIRDROP ATIVO SEM TEMP VAULT!");
      console.log("=======================================================");
      console.log("\n📋 RESUMO DOS ENDEREÇOS:");
      console.log(`🏦 Usuário registrado: ${walletKeypair.publicKey.toString()}`);
      console.log(`📄 PDA da conta: ${userPDA.toString()}`);
      console.log(`💰 Vault principal usado: ${PROGRAM_TOKEN_VAULT.toString()}`);
      console.log(`💰 Valor de depósito: ${DEPOSIT_AMOUNT / 1e9} SOL`);
      
      console.log("\n🎯 PRÓXIMOS PASSOS:");
      console.log("1. 👥 Registre outros usuários com referenciador");
      console.log("2. 🔄 Complete matrizes para ganhar rewards");
      console.log("3. 🎁 Use claim_airdrop para coletar DONUT");
      console.log("4. 📊 Monitore progresso com get_user_airdrop_info");
      console.log("5. 📈 Acompanhe sistema com get_program_info");
      
      console.log("\n🔥 SISTEMA DEFLATIONARY ATIVO (SIMPLIFICADO):");
      console.log("• Swap SOL → DONUT (vault principal) → Burn (imediato)");
      console.log("• SEM vault temporário - processo direto");
      console.log("• Airdrops: Baseados em matrizes completadas");
      console.log("• Duração: 36 semanas progressivas");
      console.log("• Claims: Sob demanda via instrução dedicada");
      
      console.log("\n🛡️ ENDEREÇOS IMPORTANTES PARA REFERENCIAMENTO:");
      console.log(`🔑 Wallet para usar como referenciador: ${walletKeypair.publicKey.toString()}`);
      console.log(`📄 PDA derivado automaticamente: ${userPDA.toString()}`);
      
      console.log("\n✅ PRINCIPAIS MELHORIAS DESTA VERSÃO:");
      console.log("• ❌ Removido temp_donut_vault (simplificado)");
      console.log("• ✅ Usa apenas program_token_vault");
      console.log("• ⚡ Processo mais rápido e eficiente");
      console.log("• 🛡️ Mesmas validações de segurança");
      console.log("• 🔥 Swap+burn ainda obrigatório");
      
    } catch (error) {
      console.error("\n❌ ERRO DURANTE O REGISTRO:");
      console.error(error);
      
      if (error.logs) {
        console.log("\n📋 LOGS DE ERRO DETALHADOS:");
        const airdropLogs = error.logs.filter(log => 
          log.includes("Program log:") || 
          log.includes("Error") || 
          log.includes("error") ||
          log.includes("airdrop") ||
          log.includes("week") ||
          log.includes("matrix") ||
          log.includes("burn") ||
          log.includes("swap") ||
          log.includes("simplified") ||
          log.includes("vault")
        );
        
        if (airdropLogs.length > 0) {
          console.log("🎯 Logs relacionados ao sistema:");
          airdropLogs.forEach((log, i) => console.log(`  ${i}: ${log}`));
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

// Execução da função principal
main();