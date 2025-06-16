// get_program_info.js - AIRDROP SYSTEM v2.0
// Script para verificar informações gerais do programa de airdrop

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

// Função para calcular porcentagem
function calculatePercentage(week) {
  const distribution = getWeekDistribution(week);
  return (distribution / 20_800_000 * 100).toFixed(4); // 20.8M é o total
}

async function main() {
  try {
    console.log("📊 INFORMAÇÕES DO PROGRAMA DE AIRDROP - SISTEMA v2.0 📊");
    console.log("======================================================");
    console.log("🎯 Monitoramento completo do sistema de 36 semanas");

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

    // Verificar estado do programa
    console.log("\n🔍 COLETANDO INFORMAÇÕES DO PROGRAMA...");
    
    let stateInfo;
    try {
      stateInfo = await program.account.programState.fetch(STATE_ADDRESS);
    } catch (e) {
      console.error("❌ ERRO: Não foi possível acessar estado do programa:", e);
      return;
    }

    // === INFORMAÇÕES GERAIS ===
    console.log("\n" + "=".repeat(60));
    console.log("📊 INFORMAÇÕES GERAIS DO PROGRAMA");
    console.log("=".repeat(60));
    
    console.log(`👑 Owner: ${stateInfo.owner.toString()}`);
    console.log(`🏦 Multisig Treasury: ${stateInfo.multisigTreasury.toString()}`);
    console.log(`🆔 Próximo Upline ID: ${stateInfo.nextUplineId}`);
    console.log(`🆔 Próximo Chain ID: ${stateInfo.nextChainId}`);
    
    // Proteção reentrancy
    if (stateInfo.isLocked !== undefined) {
      console.log(`🛡️ Estado do Lock: ${stateInfo.isLocked ? "🔒 ATIVO (transação em andamento)" : "🔓 LIBERADO"}`);
      
      if (stateInfo.isLocked) {
        console.log("⚠️ ATENÇÃO: Programa está com lock ativo - há uma transação em processamento");
      }
    }

    // === INFORMAÇÕES DO AIRDROP ===
    console.log("\n" + "=".repeat(60));
    console.log("🎯 INFORMAÇÕES DO SISTEMA DE AIRDROP");
    console.log("=".repeat(60));
    
    console.log(`📅 Semana Atual: ${stateInfo.currentWeek}/36`);
    console.log(`🎲 Status do Airdrop: ${stateInfo.airdropActive ? "🟢 ATIVO" : "🔴 FINALIZADO"}`);
    console.log(`📊 Matrizes desta Semana: ${stateInfo.totalMatricesThisWeek}`);
    console.log(`📜 Semanas Fechadas: ${stateInfo.closedWeeks.length}/36`);

    // Informações temporais
    if (stateInfo.programStartTimestamp) {
      const startDate = new Date(stateInfo.programStartTimestamp.toNumber() * 1000);
      console.log(`⏰ Início do Programa: ${startDate.toLocaleString()}`);
      
      const currentTime = Math.floor(Date.now() / 1000);
      const elapsedSeconds = currentTime - stateInfo.programStartTimestamp.toNumber();
      const elapsedDays = Math.floor(elapsedSeconds / (24 * 60 * 60));
      const elapsedWeeks = Math.floor(elapsedSeconds / (7 * 24 * 60 * 60));
      const remainingWeeks = Math.max(0, 36 - elapsedWeeks);
      
      console.log(`⏳ Tempo Decorrido: ${elapsedDays} dias (${elapsedWeeks} semanas)`);
      console.log(`⏰ Semanas Restantes: ${remainingWeeks} semanas`);
      
      if (remainingWeeks > 0) {
        const estimatedEndDate = new Date((stateInfo.programStartTimestamp.toNumber() + (36 * 7 * 24 * 60 * 60)) * 1000);
        console.log(`🏁 Fim Estimado: ${estimatedEndDate.toLocaleString()}`);
      } else {
        console.log(`🏁 Programa Concluído: ${stateInfo.airdropActive ? "Aguardando finalização" : "Finalizado"}`);
      }
    }

    // === DISTRIBUIÇÃO DA SEMANA ATUAL ===
    if (stateInfo.currentWeek > 0 && stateInfo.currentWeek <= 36) {
      console.log("\n" + "=".repeat(60));
      console.log("💰 DISTRIBUIÇÃO DA SEMANA ATUAL");
      console.log("=".repeat(60));
      
      const currentDistribution = getWeekDistribution(stateInfo.currentWeek);
      const currentPercentage = calculatePercentage(stateInfo.currentWeek);
      
      console.log(`📅 Semana ${stateInfo.currentWeek}:`);
      console.log(`💎 Distribuição Total: ${formatTokenAmount(currentDistribution)} DONUT`);
      console.log(`📊 Porcentagem do Supply: ${currentPercentage}%`);
      
      if (stateInfo.totalMatricesThisWeek > 0) {
        const donutPerMatrix = Math.floor(currentDistribution / stateInfo.totalMatricesThisWeek);
        console.log(`🏆 DONUT por Matriz: ${formatTokenAmount(donutPerMatrix)} DONUT`);
        console.log(`📊 ${stateInfo.totalMatricesThisWeek} matrizes completadas esta semana`);
      } else {
        console.log(`🏆 DONUT por Matriz: ${formatTokenAmount(currentDistribution)} DONUT (estimativa - nenhuma matriz ainda)`);
        console.log(`📊 Nenhuma matriz completada esta semana ainda`);
      }
    }

    // === HISTÓRICO DE SEMANAS FECHADAS ===
    if (stateInfo.closedWeeks.length > 0) {
      console.log("\n" + "=".repeat(60));
      console.log("📜 HISTÓRICO DE SEMANAS FECHADAS");
      console.log("=".repeat(60));
      
      const recentWeeks = stateInfo.closedWeeks.slice(-10); // Últimas 10 semanas
      let totalDistributed = 0;
      let totalMatrices = 0;
      
      console.log("Semana | Matrizes | Total DONUT    | DONUT/Matriz   | Fechamento");
      console.log("-".repeat(75));
      
      recentWeeks.forEach(week => {
        totalDistributed += week.donutDistributed;
        totalMatrices += week.totalMatrices;
        
        const closeDate = new Date(week.weekEndTimestamp.toNumber() * 1000);
        console.log(
          `${week.weekNumber.toString().padStart(6)} | ` +
          `${week.totalMatrices.toString().padStart(8)} | ` +
          `${formatTokenAmount(week.donutDistributed).padStart(14)} | ` +
          `${formatTokenAmount(week.donutPerMatrix).padStart(14)} | ` +
          `${closeDate.toLocaleDateString()}`
        );
      });
      
      console.log("-".repeat(75));
      console.log(`Total: ${totalMatrices} matrizes, ${formatTokenAmount(totalDistributed)} DONUT distribuído`);
      
      if (totalMatrices > 0) {
        const avgDonutPerMatrix = totalDistributed / totalMatrices;
        console.log(`Média: ${formatTokenAmount(avgDonutPerMatrix)} DONUT por matriz`);
      }
    }

    // === PROJEÇÕES E ESTATÍSTICAS ===
    console.log("\n" + "=".repeat(60));
    console.log("📈 PROJEÇÕES E ESTATÍSTICAS");
    console.log("=".repeat(60));
    
    // Total que será distribuído
    const totalToDistribute = getWeekDistribution(1) * 36; // Aproximação simples
    let actualTotal = 0;
    for (let week = 1; week <= 36; week++) {
      actualTotal += getWeekDistribution(week);
    }
    
    console.log(`💎 Total a Distribuir: ${formatTokenAmount(actualTotal)} DONUT`);
    console.log(`📊 Porcentagem do Supply Total: ${(actualTotal / 20_800_000 * 100).toFixed(2)}%`);
    
    // Já distribuído
    let alreadyDistributed = 0;
    stateInfo.closedWeeks.forEach(week => {
      alreadyDistributed += week.donutDistributed;
    });
    
    if (alreadyDistributed > 0) {
      console.log(`✅ Já Distribuído: ${formatTokenAmount(alreadyDistributed)} DONUT`);
      console.log(`📊 Progresso: ${(alreadyDistributed / actualTotal * 100).toFixed(2)}%`);
      
      const remaining = actualTotal - alreadyDistributed;
      console.log(`⏳ Restante a Distribuir: ${formatTokenAmount(remaining)} DONUT`);
    }

    // === PRÓXIMAS SEMANAS ===
    if (stateInfo.airdropActive && stateInfo.currentWeek <= 36) {
      console.log("\n" + "=".repeat(60));
      console.log("🔮 PRÓXIMAS SEMANAS");
      console.log("=".repeat(60));
      
      const nextWeeks = Math.min(5, 36 - stateInfo.currentWeek + 1);
      console.log("Semana | Distribuição   | % Supply");
      console.log("-".repeat(35));
      
      for (let i = 0; i < nextWeeks; i++) {
        const week = stateInfo.currentWeek + i;
        if (week <= 36) {
          const distribution = getWeekDistribution(week);
          const percentage = calculatePercentage(week);
          const isCurrent = week === stateInfo.currentWeek;
          
          console.log(
            `${week.toString().padStart(6)}${isCurrent ? '*' : ' '} | ` +
            `${formatTokenAmount(distribution).padStart(14)} | ` +
            `${percentage.padStart(8)}%`
          );
        }
      }
      console.log("* = semana atual");
    }

    // === RESUMO EXECUTIVO ===
    console.log("\n" + "=".repeat(60));
    console.log("📋 RESUMO EXECUTIVO");
    console.log("=".repeat(60));
    
    console.log(`🎯 Status: ${stateInfo.airdropActive ? "Sistema ativo e operacional" : "Programa finalizado"}`);
    console.log(`📅 Progresso: Semana ${stateInfo.currentWeek}/36 (${((stateInfo.currentWeek / 36) * 100).toFixed(1)}%)`);
    console.log(`📊 Atividade: ${stateInfo.totalMatricesThisWeek} matrizes esta semana`);
    console.log(`📜 Histórico: ${stateInfo.closedWeeks.length} semanas processadas`);
    
    if (stateInfo.closedWeeks.length > 0) {
      const totalMatricesAllTime = stateInfo.closedWeeks.reduce((sum, week) => sum + week.totalMatrices, 0);
      const avgMatricesPerWeek = totalMatricesAllTime / stateInfo.closedWeeks.length;
      console.log(`📈 Média: ${avgMatricesPerWeek.toFixed(1)} matrizes por semana`);
    }

    // Informações de reentrancy se necessário
    if (stateInfo.isLocked) {
      console.log("\n⚠️ ATENÇÃO: Sistema está processando uma transação complexa");
      console.log("⏳ Aguarde alguns segundos antes de executar operações");
    }

    console.log("\n🎉 Consulta de informações concluída!");
    console.log("🔄 Execute este script regularmente para monitorar o programa");

  } catch (error) {
    console.error("❌ ERRO GERAL:", error);
    
    if (error.logs) {
      console.log("\n📋 LOGS DE ERRO:");
      error.logs.forEach((log, i) => console.log(`${i}: ${log}`));
    }
  }
}

main();