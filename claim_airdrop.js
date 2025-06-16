// claim_airdrop.js - AIRDROP SYSTEM v2.0
// Script para coletar rewards de airdrop do sistema de 36 semanas

const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  ComputeBudgetProgram,
} = require("@solana/web3.js")
const { AnchorProvider, Program, Wallet, utils } = require("@coral-xyz/anchor")
const fs = require("fs")
const path = require("path")

// Receber parâmetros da linha de comando
const args = process.argv.slice(2)
const walletPath = args[0] || "/Users/dark/.config/solana/id.json"
const configPath = args[1] || "./matriz-airdrop-config.json"

// Função para carregar carteira
function loadWalletFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo de carteira não encontrado: ${filePath}`)
  }
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(filePath, "utf-8")))
  )
}

// Função para formatar valores de token
function formatTokenAmount(amount, decimals = 9) {
  if (amount === 0) return "0"
  const amountStr = amount.toString().padStart(decimals + 1, "0")
  const decimalPos = amountStr.length - decimals
  const integerPart = amountStr.substring(0, decimalPos) || "0"
  const decimalPart = amountStr.substring(decimalPos)
  return `${integerPart}.${decimalPart}`
}

// Função para calcular distribuição de uma semana específica
function getWeekDistribution(week) {
  const WEEKLY_DISTRIBUTIONS = [
    240_081,    // Semana 1: 1.1546%
    259_617,    // Semana 2: 1.2485%
    279_997,    // Semana 3: 1.3458%
    301_268,    // Semana 4: 1.4492%
    323_478,    // Semana 5: 1.5557%
    346_675,    // Semana 6: 1.6668%
    370_908,    // Semana 7: 1.7838%
    396_224,    // Semana 8: 1.9055%
    422_672,    // Semana 9: 2.0331%
    450_303,    // Semana 10: 2.1656%
    479_169,    // Semana 11: 2.3035%
    509_323,    // Semana 12: 2.4487%
    540_819,    // Semana 13: 2.5993%
    573_712,    // Semana 14: 2.7595%
    608_059,    // Semana 15: 2.9256%
    643_919,    // Semana 16: 3.0967%
    681_351,    // Semana 17: 3.2775%
    720_417,    // Semana 18: 3.4645%
    761_179,    // Semana 19: 3.6615%
    803_704,    // Semana 20: 3.8675%
    848_057,    // Semana 21: 4.0784%
    894_308,    // Semana 22: 4.3009%
    942_525,    // Semana 23: 4.5324%
    992_783,    // Semana 24: 4.7749%
    1_045_139,  // Semana 25: 5.0266%
    1_099_731,  // Semana 26: 5.3388%
    1_156_576,  // Semana 27: 5.6595%
    1_215_747,  // Semana 28: 5.9921%
    1_317_311,  // Semana 29: 6.3379%
    1_391_342,  // Semana 30: 6.6891%
    1_467_912,  // Semana 31: 7.0605%
    1_547_090,  // Semana 32: 7.4370%
    1_628_943,  // Semana 33: 7.8357%
    1_713_547,  // Semana 34: 8.2437%
    1_800_978,  // Semana 35: 8.6622%
    1_891_317,  // Semana 36: 9.0926%
  ];
  
  if (week === 0 || week > 36) {
    return 0; // Programa finalizado
  }
  return WEEKLY_DISTRIBUTIONS[week - 1];
}

// Função para criar ATA se não existir
async function ensureTokenAccount(connection, provider, userWallet, tokenMint) {
  const tokenAccount = utils.token.associatedAddress({
    mint: tokenMint,
    owner: userWallet,
  });

  console.log(`🔍 Verificando ATA do usuário: ${tokenAccount.toString()}`);

  const ataInfo = await connection.getAccountInfo(tokenAccount);
  if (!ataInfo) {
    console.log("⚠️ ATA do usuário não existe, criando...");
    
    const createATAIx = utils.token.createAssociatedTokenAccountInstruction(
      userWallet,   // payer
      tokenAccount, // ata
      userWallet,   // owner
      tokenMint     // mint
    );
    
    const tx = new Transaction().add(createATAIx);
    tx.feePayer = userWallet;
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    
    const signedTx = await provider.wallet.signTransaction(tx);
    const txid = await connection.sendRawTransaction(signedTx.serialize());
    
    await connection.confirmTransaction(txid);
    console.log(`✅ ATA do usuário criada: ${txid}`);
  } else {
    console.log("✅ ATA do usuário já existe");
  }

  return tokenAccount;
}

async function main() {
  try {
    console.log("🎁 COLETANDO REWARDS DE AIRDROP - SISTEMA v2.0 🎁");
    console.log("================================================");
    console.log("🎯 Sistema: 36 semanas progressivas de airdrop");
    console.log("💰 Modelo: Claim sob demanda de DONUT ganhos");

    // Carregar carteira
    console.log(`\nCarregando carteira de ${walletPath}...`);
    let walletKeypair;
    try {
      walletKeypair = loadWalletFromFile(walletPath)
      console.log("✅ Carteira carregada: " + walletKeypair.publicKey.toString());
    } catch (e) {
      console.error(`❌ Erro ao carregar carteira: ${e.message}`);
      return;
    }

    // Carregar IDL
    console.log("Carregando IDL...");
    const idlPath = path.resolve("./target/idl/referral_system.json");
    const idl = require(idlPath);

    // Carregar configuração
    let config = {};
    if (fs.existsSync(configPath)) {
      console.log(`Carregando configuração de ${configPath}...`);
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      console.log("✅ Configuração carregada");
      
      // Verificar versão do sistema
      if (config.systemVersion === "airdrop-v2.0") {
        console.log("🎯 Sistema de airdrop v2.0 detectado");
        console.log(`🎲 Airdrop ativo: ${config.airdropActive ? "SIM" : "NÃO"}`);
      } else {
        console.log("⚠️ Configuração pode não ser compatível com airdrop v2.0");
      }
    } else {
      console.log(`⚠️ Arquivo de configuração não encontrado: ${configPath}`);
      console.log("⚠️ Usando valores padrão...");
    }

    // Conectar à devnet
    const connection = new Connection(
      "https://weathered-quiet-theorem.solana-devnet.quiknode.pro/198997b67cb51804baeb34ed2257274aa2b2d8c0",
      "confirmed"
    );
    console.log("Conectando à Devnet");

    // Configurar endereços
    const MATRIX_PROGRAM_ID = new PublicKey(
      config.programId || "DeppEXXy7Bk91AW9hKppfZHK4qvPKLK83nGbh8pE3Goy"
    );
    const TOKEN_MINT = new PublicKey(
      config.tokenMint || "CCTG4ZmGa9Nk9NVxbd1FXBNyKjyHSapuF9aU6zgcA3xz"
    );
    const STATE_ADDRESS = new PublicKey(
      config.stateAddress || "CSrEoisxJfho5DS76h3orCHmU2Fg9uTMP2DsoHobEwj1"
    );
    const PROGRAM_TOKEN_VAULT = new PublicKey(
      config.programTokenVault || "6vcd7cv4tsqCmL1wFKe6H3ThCEgrpwfYFSiNyEWRFAp9"
    );

    // Configurar provider
    const anchorWallet = new Wallet(walletKeypair);
    const provider = new AnchorProvider(connection, anchorWallet, {
      commitment: "confirmed",
    });

    // Inicializar programa
    const program = new Program(idl, MATRIX_PROGRAM_ID, provider);

    // Verificar saldo da carteira
    const balance = await connection.getBalance(walletKeypair.publicKey);
    console.log(`💰 Saldo da carteira: ${balance / 1e9} SOL`);

    if (balance < 10_000_000) {
      console.error("❌ ERRO: Saldo insuficiente! Você precisa de pelo menos 0.01 SOL para taxas");
      return;
    }

    // Derivar PDA da conta do usuário
    console.log("\n🔍 VERIFICANDO CONTA DO USUÁRIO...");
    const [userPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_account"), walletKeypair.publicKey.toBuffer()],
      MATRIX_PROGRAM_ID
    );
    console.log(`📄 PDA da conta: ${userPDA.toString()}`);

    // Verificar se usuário está registrado
    let userInfo;
    try {
      userInfo = await program.account.userAccount.fetch(userPDA);
      if (!userInfo.isRegistered) {
        console.error("❌ ERRO: Usuário não está registrado no sistema!");
        return;
      }
    } catch (e) {
      console.error("❌ ERRO: Conta do usuário não encontrada!");
      console.error("💡 Você precisa se registrar primeiro no sistema de airdrop");
      return;
    }

    console.log("✅ Usuário registrado verificado");

    // Verificar estado do programa
    console.log("\n🔍 VERIFICANDO ESTADO DO PROGRAMA DE AIRDROP...");
    try {
      const stateInfo = await program.account.programState.fetch(STATE_ADDRESS);
      
      console.log("📊 INFORMAÇÕES DO PROGRAMA:");
      console.log(`📅 Semana atual: ${stateInfo.currentWeek}`);
      console.log(`🎲 Airdrop ativo: ${stateInfo.airdropActive ? "SIM" : "NÃO"}`);
      console.log(`📊 Matrizes esta semana: ${stateInfo.totalMatricesThisWeek}`);
      console.log(`📜 Semanas fechadas: ${stateInfo.closedWeeks.length}`);
      
      if (stateInfo.programStartTimestamp) {
        const startDate = new Date(stateInfo.programStartTimestamp.toNumber() * 1000);
        console.log(`⏰ Início do programa: ${startDate.toLocaleString()}`);
        
        const currentTime = Math.floor(Date.now() / 1000);
        const elapsedSeconds = currentTime - stateInfo.programStartTimestamp.toNumber();
        const elapsedWeeks = Math.floor(elapsedSeconds / (7 * 24 * 60 * 60));
        console.log(`⏳ Tempo decorrido: ${elapsedWeeks} semanas completas`);
      }
      
      // Mostrar distribuição da semana atual
      if (stateInfo.currentWeek > 0 && stateInfo.currentWeek <= 36) {
        const weekDistrib = getWeekDistribution(stateInfo.currentWeek);
        console.log(`💰 Distribuição semana ${stateInfo.currentWeek}: ${formatTokenAmount(weekDistrib)} DONUT`);
      }
      
      // Mostrar últimas semanas fechadas
      if (stateInfo.closedWeeks.length > 0) {
        console.log("\n📜 ÚLTIMAS SEMANAS FECHADAS:");
        const recentWeeks = stateInfo.closedWeeks.slice(-3); // Últimas 3
        recentWeeks.forEach(week => {
          console.log(`  Semana ${week.weekNumber}: ${week.totalMatrices} matrizes, ${formatTokenAmount(week.donutDistributed)} DONUT total, ${formatTokenAmount(week.donutPerMatrix)} por matriz`);
        });
      }
      
      if (!stateInfo.airdropActive) {
        console.log("🏁 PROGRAMA FINALIZADO: As 36 semanas foram completadas!");
        console.log("💡 Você ainda pode coletar rewards pendentes");
      }
    } catch (e) {
      console.error("❌ ERRO: Não foi possível verificar estado do programa:", e);
      return;
    }

    // Mostrar informações detalhadas do usuário
    console.log("\n👤 INFORMAÇÕES DETALHADAS DO USUÁRIO:");
    console.log(`📊 Matrizes completadas: ${userInfo.completedMatricesTotal}`);
    console.log(`💰 DONUT ganho total: ${formatTokenAmount(userInfo.totalDonutEarned)} DONUT`);
    console.log(`🎁 DONUT já coletado: ${formatTokenAmount(userInfo.totalDonutClaimed)} DONUT`);
    
    const available = userInfo.totalDonutEarned - userInfo.totalDonutClaimed;
    console.log(`🎁 Disponível para claim: ${formatTokenAmount(available)} DONUT`);
    console.log(`📅 Última semana processada: ${userInfo.lastProcessedWeek}`);

    // Mostrar breakdown semanal se existir
    if (userInfo.weeklyMatrices && userInfo.weeklyMatrices.length > 0) {
      console.log("\n📊 BREAKDOWN SEMANAL DE MATRIZES:");
      userInfo.weeklyMatrices.forEach((week, index) => {
        const weekDistrib = getWeekDistribution(week.weekNumber);
        console.log(`  Semana ${week.weekNumber}: ${week.matricesCompleted} matrizes (${formatTokenAmount(weekDistrib)} DONUT/matriz)`);
      });
    } else {
      console.log("\n📊 Ainda sem dados semanais de matrizes");
    }

    // Verificar se há algo para coletar
    if (available <= 0) {
      console.log("\n💡 NÃO HÁ REWARDS DISPONÍVEIS PARA CLAIM");
      console.log("🔄 Complete mais matrizes para ganhar DONUT rewards!");
      console.log("⏰ Rewards são calculados automaticamente com base nas matrizes completadas por semana");
      return;
    }

    console.log(`\n🎁 VOCÊ TEM ${formatTokenAmount(available)} DONUT DISPONÍVEL PARA CLAIM!`);
    
    // Confirmar se usuário quer prosseguir
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const proceed = await new Promise((resolve) => {
      rl.question(`\n❓ Deseja prosseguir com o claim de ${formatTokenAmount(available)} DONUT? (s/n): `, (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 's' || answer.toLowerCase() === 'sim' || answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      });
    });
    
    if (!proceed) {
      console.log("❌ Claim cancelado pelo usuário");
      return;
    }

    // Obter PDA da vault authority
    const [vaultAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_vault_authority")],
      MATRIX_PROGRAM_ID
    );

    // Garantir que ATA do usuário existe
    const userTokenAccount = await ensureTokenAccount(
      connection,
      provider,
      walletKeypair.publicKey,
      TOKEN_MINT
    );

    // Verificar saldo atual da ATA do usuário
    try {
      const currentBalance = await connection.getTokenAccountBalance(userTokenAccount);
      console.log(`💰 Saldo atual de DONUT: ${currentBalance.value.uiAmount || 0} DONUT`);
    } catch (e) {
      console.log("💰 Saldo atual de DONUT: 0 DONUT (conta nova)");
    }

    // Preparar transação de claim
    console.log("\n📤 PREPARANDO TRANSAÇÃO DE CLAIM...");

    // Configurar compute units para transação complexa
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: 800_000, // Suficiente para processamento de claim
    });

    const setPriority = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 5000,
    });

    try {
      console.log("🔧 Gerando instrução de claim...");
      
      const claimTx = await program.methods
        .claimAirdrop()
        .accounts({
          state: STATE_ADDRESS,
          user: userPDA,
          userWallet: walletKeypair.publicKey,
          userTokenAccount: userTokenAccount,
          programTokenVault: PROGRAM_TOKEN_VAULT,
          vaultAuthority: vaultAuthority,
          tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        })
        .preInstructions([modifyComputeUnits, setPriority])
        .rpc();

      console.log("✅ Transação de claim enviada: " + claimTx);
      console.log(`🔍 Link do explorador: https://explorer.solana.com/tx/${claimTx}?cluster=devnet`);

      console.log("\n⏳ Aguardando confirmação...");
      await connection.confirmTransaction(claimTx, "confirmed");
      console.log("✅ Transação confirmada!");

      // Verificar resultados
      console.log("\n🔍 VERIFICANDO RESULTADOS DO CLAIM...");

      // Verificar novo estado da conta do usuário
      const newUserInfo = await program.account.userAccount.fetch(userPDA);
      const newAvailable = newUserInfo.totalDonutEarned - newUserInfo.totalDonutClaimed;

      console.log("\n📋 RESULTADOS DO CLAIM:");
      console.log(`✅ DONUT coletado: ${formatTokenAmount(available)} DONUT`);
      console.log(`💰 Total ganho: ${formatTokenAmount(newUserInfo.totalDonutEarned)} DONUT`);
      console.log(`🎁 Total coletado: ${formatTokenAmount(newUserInfo.totalDonutClaimed)} DONUT`);
      console.log(`🎁 Ainda disponível: ${formatTokenAmount(newAvailable)} DONUT`);

      // Verificar novo saldo da ATA
      try {
        const newBalance = await connection.getTokenAccountBalance(userTokenAccount);
        console.log(`💎 Novo saldo de DONUT: ${newBalance.value.uiAmount} DONUT`);
      } catch (e) {
        console.log("⚠️ Não foi possível verificar novo saldo");
      }

      // Verificar novo saldo de SOL
      const newSolBalance = await connection.getBalance(walletKeypair.publicKey);
      console.log(`💰 Taxa paga: ${(balance - newSolBalance) / 1e9} SOL`);
      console.log(`💰 Novo saldo SOL: ${newSolBalance / 1e9} SOL`);

      console.log("\n🎉 CLAIM DE AIRDROP CONCLUÍDO COM SUCESSO! 🎉");
      console.log("💰 Seus tokens DONUT foram transferidos para sua carteira!");
      
      if (newAvailable > 0) {
        console.log(`\n💡 Você ainda tem ${formatTokenAmount(newAvailable)} DONUT disponível para claim futuro`);
        console.log("🔄 Execute este script novamente quando quiser coletar mais rewards");
      }

      console.log("\n📋 PRÓXIMOS PASSOS:");
      console.log("1. 🔄 Continue completando matrizes para ganhar mais rewards");
      console.log("2. 📊 Use get_user_airdrop_info para monitorar progresso");
      console.log("3. 📈 Use get_program_info para status geral do sistema");
      console.log("4. 💰 Execute claim_airdrop regularmente para coletar rewards");

    } catch (error) {
      console.error("\n❌ ERRO DURANTE O CLAIM:", error);

      if (error.logs) {
        console.log("\n📋 LOGS DE ERRO DETALHADOS:");
        const relevantLogs = error.logs.filter(log => 
          log.includes("Program log:") || 
          log.includes("Error") || 
          log.includes("error") ||
          log.includes("claim") ||
          log.includes("airdrop") ||
          log.includes("Nothing") ||
          log.includes("transfer")
        );

        if (relevantLogs.length > 0) {
          console.log("🎯 Logs relacionados ao claim:");
          relevantLogs.forEach((log, i) => console.log(`  ${i}: ${log}`));
        } else {
          error.logs.forEach((log, i) => console.log(`${i}: ${log}`));
        }
      }

      // Diagnóstico de problemas comuns
      console.log("\n🔍 DIAGNÓSTICO DE PROBLEMAS COMUNS:");
      console.log("1. ❓ Verifique se há rewards disponíveis para claim");
      console.log("2. ❓ Confirme que sua conta está registrada no sistema");
      console.log("3. ❓ Verifique se o programa ainda está ativo");
      console.log("4. ❓ Confirme que tem saldo suficiente para taxas");
    }

  } catch (error) {
    console.error("❌ ERRO GERAL:", error);
  }
}

main();