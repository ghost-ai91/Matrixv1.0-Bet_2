// get_user_info.js - AIRDROP SYSTEM v2.0
// Script para verificar informações detalhadas do usuário no sistema de airdrop

const {
  Connection,
  Keypair,
  PublicKey,
} = require("@solana/web3.js")
const { AnchorProvider, Program, Wallet } = require("@coral-xyz/anchor")
const fs = require("fs")
const path = require("path")

// Receber parâmetros da linha de comando
const args = process.argv.slice(2)
const walletPath = args[0] || "/Users/dark/.config/solana/id.json"
const configPath = args[1] || "./matriz-airdrop-config.json"
const targetUserAddress = args[2] // Endereço de usuário específico (opcional)

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

// Função para calcular distribuição semanal
function getWeekDistribution(week) {
  const WEEKLY_DISTRIBUTIONS = [
    240_081, 259_617, 279_997, 301_268, 323_478, 346_675, 370_908, 396_224,
    422_672, 450_303, 479_169, 509_323, 540_819, 573_712, 608_059, 643_919,
    681_351, 720_417, 761_179, 803_704, 848_057, 894_308, 942_525, 992_783,
    1_045_139, 1_099_731, 1_156_576, 1_215_747, 1_317_311, 1_391_342,
    1_467_912, 1_547_090, 1_628_943, 1_713_547, 1_800_978, 1_891_317
  ];
  
  if (week === 0 || week > 36) return 0;
  return WEEKLY_DISTRIBUTIONS[week - 1];
}

// Função para obter informações detalhadas de um usuário
async function getUserDetailedInfo(program, userAddress, programId) {
  console.log(`\n🔍 Analisando usuário: ${userAddress.toString()}`);
  
  // Derivar PDA da conta do usuário
  const [userPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_account"), userAddress.toBuffer()],
    programId
  );
  
  console.log(`📄 PDA da conta: ${userPDA.toString()}`);
  
  try {
    const userInfo = await program.account.userAccount.fetch(userPDA);
    
    if (!userInfo.isRegistered) {
      console.log("❌ Usuário não está registrado no sistema");
      return null;
    }
    
    return { userInfo, userPDA, userAddress };
  } catch (e) {
    console.log("❌ Conta do usuário não encontrada");
    return null;
  }
}

async function main() {
  try {
    console.log("👤 INFORMAÇÕES DETALHADAS DO USUÁRIO - SISTEMA v2.0 👤");
    console.log("=====================================================");
    console.log("🎯 Análise completa de dados de airdrop e matriz");

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
    const STATE_ADDRESS = new PublicKey(
      config.stateAddress || "CSrEoisxJfho5DS76h3orCHmU2Fg9uTMP2DsoHobEwj1"
    );

    // Configurar provider
    const anchorWallet = new Wallet(walletKeypair);
    const provider = new AnchorProvider(connection, anchorWallet, {
      commitment: "confirmed",
    });

    // Inicializar programa
    const program = new Program(idl, MATRIX_PROGRAM_ID, provider);

    // Determinar qual usuário analisar
    let targetAddress;
    if (targetUserAddress) {
      try {
        targetAddress = new PublicKey(targetUserAddress);
        console.log(`🎯 Analisando usuário especificado: ${targetAddress.toString()}`);
      } catch (e) {
        console.error("❌ Endereço de usuário inválido fornecido");
        return;
      }
    } else {
      targetAddress = walletKeypair.publicKey;
      console.log(`🎯 Analisando usuário da carteira: ${targetAddress.toString()}`);
    }

    // Obter informações do usuário
    const userData = await getUserDetailedInfo(program, targetAddress, MATRIX_PROGRAM_ID);
    
    if (!userData) {
      console.log("❌ Não foi possível obter informações do usuário");
      return;
    }

    const { userInfo, userPDA, userAddress } = userData;

    // === INFORMAÇÕES BÁSICAS ===
    console.log("\n" + "=".repeat(60));
    console.log("👤 INFORMAÇÕES BÁSICAS");
    console.log("=".repeat(60));
    
    console.log(`✅ Status: Usuário registrado`);
    console.log(`👤 Endereço: ${userAddress.toString()}`);
    console.log(`📄 PDA: ${userPDA.toString()}`);
    console.log(`👤 Owner Wallet: ${userInfo.ownerWallet.toString()}`);
    console.log(`🔢 Upline ID: ${userInfo.upline.id}`);
    console.log(`📊 Depth: ${userInfo.upline.depth}`);
    console.log(`🆔 Chain ID: ${userInfo.chain.id}`);
    console.log(`📊 Slots Preenchidos: ${userInfo.chain.filledSlots}/3`);

    // Verificar referenciador
    if (userInfo.referrer) {
      console.log(`👥 Referenciador: ${userInfo.referrer.toString()}`);
      
      // Tentar obter informações do referenciador
      try {
        const referrerData = await getUserDetailedInfo(program, userInfo.referrer, MATRIX_PROGRAM_ID);
        if (referrerData) {
          console.log(`   └─ Matrizes do referenciador: ${referrerData.userInfo.completedMatricesTotal}`);
          console.log(`   └─ DONUT ganho pelo referenciador: ${formatTokenAmount(referrerData.userInfo.totalDonutEarned)}`);
        }
      } catch (e) {
        console.log(`   └─ Não foi possível obter dados do referenciador`);
      }
    } else {
      console.log(`👥 Referenciador: USUÁRIO BASE (sem referenciador)`);
    }

    // === INFORMAÇÕES DA MATRIZ ===
    console.log("\n" + "=".repeat(60));
    console.log("🎯 INFORMAÇÕES DA MATRIZ");
    console.log("=".repeat(60));
    
    console.log(`📊 Slots da Matriz:`);
    for (let i = 0; i < 3; i++) {
      if (userInfo.chain.slots[i]) {
        console.log(`   Slot ${i + 1}: ${userInfo.chain.slots[i].toString()}`);
        
        // Tentar obter informações do slot
        try {
          const slotData = await getUserDetailedInfo(program, userInfo.chain.slots[i], MATRIX_PROGRAM_ID);
          if (slotData) {
            console.log(`      └─ Matrizes: ${slotData.userInfo.completedMatricesTotal}`);
            con
else.log(`      └─ DONUT: ${formatTokenAmount(slotData.userInfo.totalDonutEarned)}`);
          }
        } catch (e) {
          console.log(`      └─ Dados não disponíveis`);
        }
      } else {
        console.log(`   Slot ${i + 1}: VAZIO`);
      }
    }

    // Estrutura de upline
    if (userInfo.upline.upline.length > 0) {
      console.log(`\n👥 Estrutura de Upline (${userInfo.upline.upline.length} níveis):`);
      userInfo.upline.upline.forEach((entry, index) => {
        console.log(`   Nível ${index + 1}:`);
        console.log(`      PDA: ${entry.pda.toString()}`);
        console.log(`      Wallet: ${entry.wallet.toString()}`);
      });
    } else {
      console.log(`\n👥 Estrutura de Upline: USUÁRIO BASE (sem uplines)`);
    }

    // === INFORMAÇÕES FINANCEIRAS ===
    console.log("\n" + "=".repeat(60));
    console.log("💰 INFORMAÇÕES FINANCEIRAS");
    console.log("=".repeat(60));
    
    console.log(`💰 SOL Reservado: ${userInfo.reservedSol / 1e9} SOL`);
    console.log(`🪙 Tokens Reservados (legado): ${formatTokenAmount(userInfo.reservedTokens)} tokens`);

    // === INFORMAÇÕES DO AIRDROP ===
    console.log("\n" + "=".repeat(60));
    console.log("🎁 INFORMAÇÕES DO SISTEMA DE AIRDROP");
    console.log("=".repeat(60));
    
    console.log(`📊 Matrizes Completadas (Total): ${userInfo.completedMatricesTotal}`);
    console.log(`💎 DONUT Ganho (Total): ${formatTokenAmount(userInfo.totalDonutEarned)} DONUT`);
    console.log(`🎁 DONUT Coletado: ${formatTokenAmount(userInfo.totalDonutClaimed)} DONUT`);
    
    const available = userInfo.totalDonutEarned - userInfo.totalDonutClaimed;
    console.log(`🎁 Disponível para Claim: ${formatTokenAmount(available)} DONUT`);
    console.log(`📅 Última Semana Processada: ${userInfo.lastProcessedWeek}`);

    // === BREAKDOWN SEMANAL ===
    if (userInfo.weeklyMatrices && userInfo.weeklyMatrices.length > 0) {
      console.log("\n" + "=".repeat(60));
      console.log("📊 BREAKDOWN SEMANAL DE MATRIZES");
      console.log("=".repeat(60));
      
      console.log("Semana | Matrizes | Distrib/Matriz | DONUT Potencial");
      console.log("-".repeat(55));
      
      let totalPotentialEarnings = 0;
      
      userInfo.weeklyMatrices.forEach(week => {
        const weekDistribution = getWeekDistribution(week.weekNumber);
        const potentialEarnings = week.matricesCompleted * weekDistribution;
        totalPotentialEarnings += potentialEarnings;
        
        console.log(
          `${week.weekNumber.toString().padStart(6)} | ` +
          `${week.matricesCompleted.toString().padStart(8)} | ` +
          `${formatTokenAmount(weekDistribution).padStart(14)} | ` +
          `${formatTokenAmount(potentialEarnings).padStart(15)}`
        );
      });
      
      console.log("-".repeat(55));
      console.log(`Total: ${userInfo.completedMatricesTotal} matrizes, ${formatTokenAmount(totalPotentialEarnings)} DONUT potencial`);
      
      // Comparar com DONUT realmente ganho
      if (userInfo.totalDonutEarned > 0) {
        const efficiency = (userInfo.totalDonutEarned / totalPotentialEarnings) * 100;
        console.log(`Eficiência: ${efficiency.toFixed(2)}% (ganho real vs potencial)`);
      }
    } else {
      console.log("\n📊 Ainda sem dados semanais de matrizes");
    }

    // === ANÁLISE DE PERFORMANCE ===
    console.log("\n" + "=".repeat(60));
    console.log("📈 ANÁLISE DE PERFORMANCE");
    console.log("=".repeat(60));
    
    if (userInfo.completedMatricesTotal > 0) {
      const avgDonutPerMatrix = userInfo.totalDonutEarned / userInfo.completedMatricesTotal;
      console.log(`🏆 Média de DONUT por Matriz: ${formatTokenAmount(avgDonutPerMatrix)} DONUT`);
      
      // Calcular ROI aproximado (assumindo ~0.08 SOL por registro)
      const estimatedInvestment = userInfo.completedMatricesTotal * 0.08; // SOL aproximado
      console.log(`💸 Investimento Estimado: ~${estimatedInvestment.toFixed(2)} SOL`);
      
      if (available > 0) {
        console.log(`💰 DONUT Disponível: ${formatTokenAmount(available)} DONUT`);
        console.log(`📊 Status: Rewards prontos para claim!`);
      } else {
        console.log(`📊 Status: Todos os rewards foram coletados`);
      }
    } else {
      console.log(`📊 Ainda sem matrizes completadas`);
      console.log(`💡 Complete matrizes para começar a ganhar DONUT rewards`);
    }

    // === RECOMENDAÇÕES ===
    console.log("\n" + "=".repeat(60));
    console.log("💡 RECOMENDAÇÕES E PRÓXIMOS PASSOS");
    console.log("=".repeat(60));
    
    if (available > 0) {
      console.log(`🎁 AÇÃO RECOMENDADA: Você tem ${formatTokenAmount(available)} DONUT disponível!`);
      console.log(`   → Execute: node claim_airdrop.js`);
    }
    
    if (userInfo.chain.filledSlots < 3) {
      console.log(`👥 CRESCIMENTO: Sua matriz tem ${3 - userInfo.chain.filledSlots} slot(s) vazio(s)`);
      console.log(`   → Convide mais usuários para preencher sua matriz`);
    } else {
      console.log(`✅ MATRIZ COMPLETA: Todos os 3 slots estão preenchidos!`);
    }
    
    if (userInfo.completedMatricesTotal === 0) {
      console.log(`🚀 PRIMEIROS PASSOS: Convide 3 usuários para completar sua primeira matriz`);
    } else {
      console.log(`📈 EXPANSÃO: Continue convidando usuários para completar mais matrizes`);
    }
    
    console.log(`📊 MONITORAMENTO: Execute este script regularmente para acompanhar progresso`);
    console.log(`📊 INFO GERAL: Execute get_program_info.js para ver status do programa`);

    // === INFORMAÇÕES DE CONTATO DOS UPLINES (se existir) ===
    if (userInfo.upline.upline.length > 0) {
      console.log("\n" + "=".repeat(60));
      console.log("🔗 REDE DE UPLINES");
      console.log("=".repeat(60));
      
      console.log("Sua rede de uplines (do mais próximo ao mais distante):");
      for (let i = 0; i < userInfo.upline.upline.length; i++) {
        const entry = userInfo.upline.upline[i];
        console.log(`   ${i + 1}. Wallet: ${entry.wallet.toString()}`);
        console.log(`      PDA: ${entry.pda.toString()}`);
        
        // Verificar se podemos obter mais informações
        try {
          const uplineData = await getUserDetailedInfo(program, entry.wallet, MATRIX_PROGRAM_ID);
          if (uplineData) {
            console.log(`      Matrizes: ${uplineData.userInfo.completedMatricesTotal}`);
            console.log(`      DONUT ganho: ${formatTokenAmount(uplineData.userInfo.totalDonutEarned)}`);
          }
        } catch (e) {
          console.log(`      (Informações não disponíveis)`);
        }
      }
    }

    console.log("\n🎉 Análise de usuário concluída!");
    console.log("🔄 Execute novamente para ver atualizações em tempo real");

  } catch (error) {