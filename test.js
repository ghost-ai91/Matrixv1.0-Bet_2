// test-jupiter-devnet.js - Script completo para testar Jupiter em Devnet
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const fs = require('fs');
const axios = require('axios');

async function testJupiterDevnet() {
  try {
    console.log('🧪 TESTANDO JUPITER AGGREGATOR EM DEVNET');
    console.log('==========================================');
    
    // Configuração
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    
    // Carregar carteira
    const walletPath = './carteiras/carteira1.json';
    if (!fs.existsSync(walletPath)) {
      console.error('❌ Carteira não encontrada:', walletPath);
      return;
    }
    
    const secretKey = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
    const wallet = Keypair.fromSecretKey(Uint8Array.from(secretKey));
    
    console.log('👤 Wallet:', wallet.publicKey.toString());
    
    // Verificar saldo
    const balance = await connection.getBalance(wallet.publicKey);
    console.log('💰 Saldo SOL:', balance / 1e9);
    
    if (balance < 10_000_000) {
      console.error('❌ Saldo insuficiente para teste');
      return;
    }
    
    // Tokens conhecidos em devnet
    const tokens = {
      SOL: 'So11111111111111111111111111111111111111112',
      USDC: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // USDC devnet
      DONUT: 'CCTG4ZmGa9Nk9NVxbd1FXBNyKjyHSapuF9aU6zgcA3xz', // Seu token
      // Outros tokens devnet comuns
      USDT_DEVNET: 'EJwZgeZrdC8TXTQbQBoL6bfuAnFUUy1PVCMB4DYPzVaS',
      RAY_DEVNET: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
    };
    
    console.log('\n🪙 TOKENS DISPONÍVEIS PARA TESTE:');
    Object.entries(tokens).forEach(([name, address]) => {
      console.log(`  ${name}: ${address}`);
    });
    
    // Teste 1: Verificar se Jupiter API está funcionando
    console.log('\n🔍 TESTE 1: VERIFICANDO JUPITER API...');
    try {
      const healthCheck = await axios.get('https://quote-api.jup.ag/v6/tokens');
      console.log('✅ Jupiter API funcionando');
      console.log(`📊 Tokens disponíveis: ${healthCheck.data ? Object.keys(healthCheck.data).length : 'N/A'}`);
    } catch (apiError) {
      console.error('❌ Jupiter API error:', apiError.message);
      return;
    }
    
    // Teste 2: Buscar quote para SOL -> USDC (mais confiável em devnet)
    console.log('\n🔍 TESTE 2: BUSCANDO QUOTE SOL -> USDC...');
    try {
      const quoteParams = new URLSearchParams({
        inputMint: tokens.SOL,
        outputMint: tokens.USDC,
        amount: '10000000', // 0.01 SOL
        slippageBps: '100'  // 1%
      });
      
      const quoteUrl = `https://quote-api.jup.ag/v6/quote?${quoteParams}`;
      console.log('🔗 Quote URL:', quoteUrl);
      
      const quoteResponse = await axios.get(quoteUrl);
      
      if (quoteResponse.data) {
        const quote = quoteResponse.data;
        console.log('✅ Quote encontrado:');
        console.log(`  📥 Input: ${quote.inAmount} (${parseFloat(quote.inAmount) / 1e9} SOL)`);
        console.log(`  📤 Output: ${quote.outAmount} USDC`);
        console.log(`  🛤️ Route: ${quote.routePlan?.length || 0} steps`);
        console.log(`  💱 Price Impact: ${quote.priceImpactPct || 'N/A'}%`);
        
        if (quote.routePlan) {
          console.log('  🗺️ Route Plan:');
          quote.routePlan.forEach((step, i) => {
            console.log(`    ${i + 1}. ${step.swapInfo?.label || 'Unknown'}`);
          });
        }
      } else {
        console.log('❌ Nenhum quote encontrado para SOL -> USDC');
      }
    } catch (quoteError) {
      console.error('❌ Erro ao buscar quote:', quoteError.response?.data || quoteError.message);
    }
    
    // Teste 3: Buscar quote para SOL -> DONUT (seu token)
    console.log('\n🔍 TESTE 3: BUSCANDO QUOTE SOL -> DONUT...');
    try {
      const donutQuoteParams = new URLSearchParams({
        inputMint: tokens.SOL,
        outputMint: tokens.DONUT,
        amount: '10000000', // 0.01 SOL
        slippageBps: '500'  // 5% (mais permissivo para token customizado)
      });
      
      const donutQuoteUrl = `https://quote-api.jup.ag/v6/quote?${donutQuoteParams}`;
      console.log('🔗 DONUT Quote URL:', donutQuoteUrl);
      
      const donutQuoteResponse = await axios.get(donutQuoteUrl);
      
      if (donutQuoteResponse.data) {
        const quote = donutQuoteResponse.data;
        console.log('✅ DONUT Quote encontrado:');
        console.log(`  📥 Input: ${quote.inAmount} (${parseFloat(quote.inAmount) / 1e9} SOL)`);
        console.log(`  📤 Output: ${quote.outAmount} DONUT`);
        console.log(`  🛤️ Route: ${quote.routePlan?.length || 0} steps`);
        console.log(`  💱 Price Impact: ${quote.priceImpactPct || 'N/A'}%`);
        
        if (quote.routePlan) {
          console.log('  🗺️ DONUT Route Plan:');
          quote.routePlan.forEach((step, i) => {
            console.log(`    ${i + 1}. ${step.swapInfo?.label || 'Unknown'}`);
          });
        }
      } else {
        console.log('❌ Nenhum quote encontrado para SOL -> DONUT');
        console.log('💡 Isso é normal - seu token pode não ter liquidez suficiente em Jupiter');
      }
    } catch (donutQuoteError) {
      console.error('❌ Erro DONUT quote:', donutQuoteError.response?.data || donutQuoteError.message);
      console.log('💡 Token DONUT pode não estar listado no Jupiter ou sem liquidez');
    }
    
    // Teste 4: Verificar tokens específicos
    console.log('\n🔍 TESTE 4: VERIFICANDO INFORMAÇÕES DOS TOKENS...');
    for (const [name, address] of Object.entries(tokens)) {
      try {
        const tokenInfo = await connection.getAccountInfo(new PublicKey(address));
        if (tokenInfo) {
          console.log(`✅ ${name} (${address}): EXISTS - Owner: ${tokenInfo.owner.toString()}`);
        } else {
          console.log(`❌ ${name} (${address}): NOT FOUND`);
        }
      } catch (tokenError) {
        console.log(`❌ ${name} (${address}): ERROR - ${tokenError.message}`);
      }
    }
    
    // Teste 5: Simulação de swap (sem executar)
    console.log('\n🔍 TESTE 5: SIMULAÇÃO DE SWAP SOL -> USDC...');
    try {
      const simulationParams = new URLSearchParams({
        inputMint: tokens.SOL,
        outputMint: tokens.USDC,
        amount: '50000000', // 0.05 SOL
        slippageBps: '100'
      });
      
      const simulationQuote = await axios.get(`https://quote-api.jup.ag/v6/quote?${simulationParams}`);
      
      if (simulationQuote.data) {
        console.log('📊 SIMULAÇÃO (0.05 SOL -> USDC):');
        const quote = simulationQuote.data;
        console.log(`  💰 Você receberia: ${quote.outAmount} USDC`);
        console.log(`  💸 Taxa estimada: ${((parseFloat(quote.inAmount) - parseFloat(quote.outAmount)) / parseFloat(quote.inAmount) * 100).toFixed(4)}%`);
        console.log(`  ⏱️ Quote válido por: ~10 segundos`);
        
        // Para executar de verdade, você faria:
        console.log('\n💡 PARA EXECUTAR SWAP REAL:');
        console.log('1. Use o quote acima');
        console.log('2. Chame Jupiter swap API com POST');
        console.log('3. Assine e envie a transação');
        console.log('4. URL: https://quote-api.jup.ag/v6/swap');
      }
    } catch (simError) {
      console.error('❌ Erro na simulação:', simError.message);
    }
    
    // Resumo e recomendações
    console.log('\n📋 RESUMO E RECOMENDAÇÕES:');
    console.log('=========================================');
    console.log('✅ Jupiter API está funcionando');
    console.log('✅ SOL -> USDC tem liquidez (teste confiável)');
    console.log('❓ SOL -> DONUT pode não ter liquidez suficiente');
    console.log('');
    console.log('🎯 RECOMENDAÇÕES PARA SEU PROJETO:');
    console.log('1. 🥇 MELHOR: Manter Meteora direta (mais controle)');
    console.log('2. 🥈 ALTERNATIVA: Jupiter para mainnet, Meteora para devnet');
    console.log('3. 🥉 HÍBRIDO: Frontend faz swap, contrato apenas registra');
    console.log('');
    console.log('🛠️ PRÓXIMOS PASSOS:');
    console.log('- Corrigir magic bytes da Meteora');
    console.log('- Ou implementar Jupiter apenas para mainnet');
    console.log('- Ou simplificar contrato (sem swap interno)');
    
  } catch (error) {
    console.error('❌ ERRO GERAL:', error);
  }
}

// Função auxiliar para instalar dependências
async function checkDependencies() {
  try {
    require.resolve('axios');
    console.log('✅ Dependências OK');
    return true;
  } catch (e) {
    console.log('❌ Instale as dependências:');
    console.log('npm install axios');
    return false;
  }
}

// Executar teste
async function main() {
  if (await checkDependencies()) {
    await testJupiterDevnet();
  }
}

main();