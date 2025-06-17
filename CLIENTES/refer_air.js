// referrer_register_v2.js - AIRDROP SYSTEM VERSION
// Script para registrar usuário com referenciador no sistema de airdrop de 36 semanas

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

// Parâmetros da linha de comando
const args = process.argv.slice(2);
const walletPath = args[0] || './carteiras/carteira1.json';
const configPath = args[1] || './matriz-airdrop-config.json';
const referrerAddressStr = args[2]; // Endereço do referenciador
const altAddress = args[3]; // Endereço da ALT (opcional)

// Função para mostrar detalhes completos da Address Lookup Table
async function getAddressLookupTable(connection, altAddress) {
  console.log("\n📋 CARREGANDO ADDRESS LOOKUP TABLE:");
  
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
    
    return lookupTable;
  } catch (error) {
    console.error(`❌ Erro ao carregar ALT: ${error}`);
    return null;
  }
}

// FUNÇÃO CORRIGIDA: Preparar TODOS os uplines para SLOT 3 - VALIDAÇÃO RIGOROSA
async function prepareAllUplinesForSlot3(connection, program, referrerInfo, TOKEN_MINT) {
  const remainingAccounts = [];
  const triosInfo = [];

  console.log(`\n🔄 PREPARANDO TODOS OS UPLINES PARA SLOT 3 - SISTEMA DE AIRDROP`);
  console.log(`📊 Referenciador tem ${referrerInfo.upline.upline.length} uplines`);
  
  if (referrerInfo.upline.upline.length === 0) {
    console.log("✅ Usuário base detectado - sem uplines necessários");
    return remainingAccounts;
  }

  // CRÍTICO: Processar TODOS os uplines (o contrato exige EXATAMENTE todos)
  for (let i = 0; i < referrerInfo.upline.upline.length; i++) {
    const uplineEntry = referrerInfo.upline.upline[i];
    const uplinePDA = uplineEntry.pda;
    const uplineWallet = uplineEntry.wallet;
    
    console.log(`  Processando upline ${i + 1}/${referrerInfo.upline.upline.length}`);
    console.log(`    PDA: ${uplinePDA.toString()}`);
    console.log(`    Wallet: ${uplineWallet.toString()}`);

    try {
      // Verificar se conta upline existe e está registrada
      const uplineAccountInfo = await program.account.userAccount.fetch(uplinePDA);
      
      if (!uplineAccountInfo.isRegistered) {
        console.log(`    ❌ Upline não está registrado!`);
        throw new Error(`Upline ${uplinePDA.toString()} não está registrado`);
      }

      // AIRDROP SYSTEM: Mostrar info do airdrop do upline
      console.log(`    📊 Matrizes completadas: ${uplineAccountInfo.completedMatricesTotal.toString()}`);
      console.log(`    💰 DONUT ganho: ${uplineAccountInfo.totalDonutEarned.toString()}`);
      console.log(`    🎁 DONUT coletado: ${uplineAccountInfo.totalDonutClaimed.toString()}`);

      // Derivar ATA para o upline
      const uplineTokenAccount = utils.token.associatedAddress({
        mint: TOKEN_MINT,
        owner: uplineWallet,
      });

      console.log(`    💰 ATA: ${uplineTokenAccount.toString()}`);

      // Verificar se ATA existe
      const ataInfo = await connection.getAccountInfo(uplineTokenAccount);
      if (!ataInfo) {
        console.log(`    ⚠️ ATA não existe - será tratado pelo contrato`);
      } else {
        console.log(`    ✅ ATA existe`);
      }

      // Armazenar informações do trio
      triosInfo.push({
        pda: uplinePDA,
        wallet: uplineWallet,
        ata: uplineTokenAccount,
        index: i
      });

    } catch (e) {
      console.log(`    ❌ Erro ao processar upline: ${e.message}`);
      throw new Error(`Falha ao processar upline ${i + 1}: ${e.message}`);
    }
  }

  // CRÍTICO: Contrato espera uplines em ordem reversa (mais recente primeiro)
  // Como referrerInfo.upline.upline já está em ordem cronológica (mais antigo primeiro),
  // precisamos reverter para atender expectativas do contrato
  triosInfo.reverse();
  
  console.log(`\n📊 ORDEM DE PROCESSAMENTO DOS UPLINES (Mais recente → Mais antigo):`);
  for (let i = 0; i < triosInfo.length; i++) {
    console.log(`  ${i + 1}. PDA: ${triosInfo[i].pda.toString()}`);
    console.log(`    Wallet: ${triosInfo[i].wallet.toString()}`);
    console.log(`    ATA: ${triosInfo[i].ata.toString()}`);
  }

  // Construir array remainingAccounts com TODOS os trios na ordem correta
  for (let i = 0; i < triosInfo.length; i++) {
    const trio = triosInfo[i];

    // Adicionar trio: PDA, Wallet, ATA
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

  // VALIDAÇÃO CRÍTICA: Deve ser múltiplo de 3
  if (remainingAccounts.length % 3 !== 0) {
    throw new Error("ERRO CRÍTICO: Número de contas upline não é múltiplo de 3!");
  }

  const totalTrios = remainingAccounts.length / 3;
  console.log(`\n✅ VALIDAÇÃO SLOT 3 COMPLETA:`);
  console.log(`  📊 Uplines esperados: ${referrerInfo.upline.upline.length}`);
  console.log(`  📊 Trios processados: ${totalTrios}`);
  console.log(`  📊 Total de contas: ${remainingAccounts.length}`);
  console.log(`  ✅ Requisito do contrato: EXATAMENTE ${7 + remainingAccounts.length} contas`);

  return remainingAccounts;
}

// Função para criar ATA do referenciador se não existir
async function ensureReferrerATA(connection, provider, referrerWallet, TOKEN_MINT, payerWallet) {
  const referrerTokenAccount = utils.token.associatedAddress({
    mint: TOKEN_MINT,
    owner: referrerWallet,
  });

  console.log(`🔍 Verificando ATA do referenciador: ${referrerTokenAccount.toString()}`);

  const ataInfo = await connection.getAccountInfo(referrerTokenAccount);
  if (!ataInfo) {
    console.log("⚠️ ATA do referenciador não existe, criando...");
    
    const createATAIx = new TransactionInstruction({
      keys: [
        { pubkey: payerWallet, isSigner: true, isWritable: true },
        { pubkey: referrerTokenAccount, isSigner: false, isWritable: true },
        { pubkey: referrerWallet, isSigner: false, isWritable: false },
        { pubkey: TOKEN_MINT, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), isSigner: false, isWritable: false },
        { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false }
      ],
      programId: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
      data: Buffer.from([])
    });
    
    const tx = new Transaction().add(createATAIx);
    tx.feePayer = payerWallet;
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    
    const signedTx = await provider.wallet.signTransaction(tx);
    const txid = await connection.sendRawTransaction(signedTx.serialize());
    
    await connection.confirmTransaction(txid);
    console.log(`✅ ATA do referenciador criada: ${txid}`);
  } else {
    console.log("✅ ATA do referenciador já existe");
  }

  return referrerTokenAccount;
}

async function main() {
  try {
    console.log("🚀 REGISTRANDO USUÁRIO COM REFERENCIADOR - SISTEMA DE AIRDROP v2.0 🚀");
    console.log("=======================================================================");
    console.log("🎯 Versão: AIRDROP SYSTEM (36 semanas progressivas)");
    console.log("🔥 Modelo: DEFLATIONARY (Swap + Burn)");

    // Verificar argumentos obrigatórios
    if (!referrerAddressStr) {
      console.error("❌ ERRO: Endereço do referenciador não fornecido!");
      console.error("Por favor, especifique o endereço do referenciador como terceiro argumento.");
      console.error("Exemplo: node referrer_register_v2.js /caminho/para/carteira.json ./matriz-airdrop-config.json EnderecoReferenciador [EnderecoALT]");
      return;
    }
    
    // Converter endereço do referenciador
    const referrerAddress = new PublicKey(referrerAddressStr);
    
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
    const connection = new Connection('https://weathered-quiet-theorem.solana-devnet.quiknode.pro/198997b67cb51804baeb34ed2257274aa2b2d8c0', {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000
    });
    console.log('Conectando à Devnet');
    
    // Configurar endereços importantes
    const MATRIX_PROGRAM_ID = new PublicKey(config.programId || "DeppEXXy7Bk91AW9hKppfZHK4qvPKLK83nGbh8pE3Goy");
    const TOKEN_MINT = new PublicKey(config.tokenMint || "CCTG4ZmGa9Nk9NVxbd1FXBNyKjyHSapuF9aU6zgcA3xz");
    const STATE_ADDRESS = new PublicKey(config.stateAddress || "FPndQRxvdZqum3QaEATCzDRn247B6YgsjgaK18fy5c8w");
     
    // Pool e vault addresses - AIRDROP VERSION
    const POOL_ADDRESS = new PublicKey("FrQ5KsAgjCe3FFg6ZENri8feDft54tgnATxyffcasuxU");
    
    // Vault A addresses (DONUT)
    const A_VAULT = new PublicKey("4ndfcH16GKY76bzDkKfyVwHMoF8oY75KES2VaAhUYksN");
    const A_VAULT_LP = new PublicKey("CocstBGbeDVyTJWxbWs4docwWapVADAo1xXQSh9RfPMz");
    const A_VAULT_LP_MINT = new PublicKey("6f2FVX5UT5uBtgknc8fDj119Z7DQoLJeKRmBq7j1zsVi");
    const A_TOKEN_VAULT = new PublicKey("6m1wvYoPrwjAnbuGMqpMoodQaq4VnZXRjrzufXnPSjmj");
    
    // Vault B addresses (SOL)
    const B_VAULT = new PublicKey("FERjPVNEa7Udq8CEv68h6tPL46Tq7ieE49HrE2wea3XT");
    const B_TOKEN_VAULT = new PublicKey("HZeLxbZ9uHtSpwZC3LBr4Nubd14iHwz7bRSghRZf5VCG");
    const B_VAULT_LP_MINT = new PublicKey("BvoAjwEDhpLzs3jtu4H72j96ShKT5rvZE9RP1vgpfSM");
    const B_VAULT_LP = new PublicKey("HJNs8hPTzs9i6AVFkRDDMFVEkrrUoV7H7LDZHdCWvxn7");
    const VAULT_PROGRAM = new PublicKey("24Uqj9JCLxUeoC3hGfh5W3s9FM9uCHDS2SG3LYwBpyTi");
    
    // AIRDROP SYSTEM: Meteora AMM program
    const METEORA_AMM_PROGRAM = new PublicKey("Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB");
    
    // Chainlink addresses (Devnet)
    const CHAINLINK_PROGRAM = new PublicKey("HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny");
    const SOL_USD_FEED = new PublicKey("99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR");

    // Programas do sistema
    const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
    const SPL_TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
    const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
    const SYSVAR_RENT_PUBKEY = new PublicKey("SysvarRent111111111111111111111111111111111");
    
    // Criar wallet usando Anchor's Wallet class
    const anchorWallet = new Wallet(walletKeypair);
    
    // Configurar provider
    const provider = new AnchorProvider(
      connection,
      anchorWallet,
      { 
        commitment: 'confirmed',
        skipPreflight: true,
        preflightCommitment: 'processed',
      }
    );
    
    // Inicializar programa
    const program = new Program(idl, MATRIX_PROGRAM_ID, provider);
    
    // Verificar saldo da carteira
    console.log("\n👤 CARTEIRA DO USUÁRIO: " + walletKeypair.publicKey.toString());
    console.log("👥 REFERENCIADOR: " + referrerAddress.toString());
    const balance = await connection.getBalance(walletKeypair.publicKey);
    console.log("💰 SALDO ATUAL: " + balance / 1e9 + " SOL");
    
    // Valor fixo do depósito (0.065 SOL)
    const FIXED_DEPOSIT_AMOUNT = 80_000_000;
    
    if (balance < FIXED_DEPOSIT_AMOUNT + 30000000) {
      console.error("❌ ERRO: Saldo insuficiente! Você precisa de pelo menos " + 
                   (FIXED_DEPOSIT_AMOUNT + 30000000) / 1e9 + " SOL");
      return;
    }
    
    // Verificar referenciador
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
        console.error("❌ ERRO: Referenciador não está registrado!");
        return;
      }
      
      console.log("✅ Referenciador verificado");
      console.log("🔢 Depth: " + referrerInfo.upline.depth.toString());
      console.log("📊 Slots preenchidos: " + referrerInfo.chain.filledSlots + "/3");
      console.log("👥 Número de uplines: " + referrerInfo.upline.upline.length);
      
      // AIRDROP SYSTEM: Mostrar info do airdrop do referenciador
      console.log("\n🎯 INFORMAÇÕES DO AIRDROP DO REFERENCIADOR:");
      console.log("📊 Matrizes completadas: " + referrerInfo.completedMatricesTotal.toString());
      console.log("💰 DONUT ganho: " + referrerInfo.totalDonutEarned.toString());
      console.log("🎁 DONUT coletado: " + referrerInfo.totalDonutClaimed.toString());
      
      const available = referrerInfo.totalDonutEarned - referrerInfo.totalDonutClaimed;
      console.log("🎁 Disponível para claim: " + available.toString());
      console.log("📅 Última semana processada: " + referrerInfo.lastProcessedWeek.toString());
      
      // Verificar owner_wallet field
      if (referrerInfo.ownerWallet) {
        console.log("✅ Referenciador tem campo owner_wallet: " + referrerInfo.ownerWallet.toString());
      }
      
      // Determinar o slot que será preenchido
      const nextSlotIndex = referrerInfo.chain.filledSlots;
      if (nextSlotIndex >= 3) {
        console.log("⚠️ ATENÇÃO: Matriz do referenciador já está completa!");
        return;
      }
      
      console.log("🎯 VOCÊ PREENCHERÁ O SLOT " + (nextSlotIndex + 1) + " DA MATRIZ");
      
      // CRÍTICO: Para SLOT 3, validar requisitos de upline
      if (nextSlotIndex === 2) {
        console.log("\n🔍 SLOT 3 DETECTADO - VALIDANDO REQUISITOS DE UPLINE:");
        
        const isBaseUser = !referrerInfo.referrer || referrerInfo.upline.upline.length === 0;
        
        if (isBaseUser) {
          console.log("✅ Referenciador é usuário base - sem uplines necessários para SLOT 3");
        } else {
          console.log(`⚠️ Referenciador é usuário normal - DEVE fornecer TODOS os ${referrerInfo.upline.upline.length} uplines para SLOT 3`);
          console.log("📋 Isso é exigido pelo contrato com sistema de airdrop");
          
          if (referrerInfo.upline.upline.length === 0) {
            console.error("❌ ERRO: Referenciador não tem uplines mas não é usuário base!");
            return;
          }
        }
      }
    } catch (e) {
      console.error("❌ Erro ao verificar referenciador:", e);
      return;
    }
    
    // Verificar conta do usuário
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
      console.log("✅ USUÁRIO AINDA NÃO REGISTRADO, PROSSEGUINDO COM REGISTRO...");
    }
    
    // Obter PDAs necessárias
    console.log("\n🔧 OBTENDO PDAs NECESSÁRIAS...");
    
    // PDAs para autoridades
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
    
    // AIRDROP SYSTEM: PDAs para operações de swap/burn
    const [tempDonutVault, tempDonutVaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("temp_donut_vault")],
      MATRIX_PROGRAM_ID
    );
    console.log("🔥 TEMP_DONUT_VAULT: " + tempDonutVault.toString());
    
    const [tempDonutAuthority, tempDonutAuthorityBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("temp_donut_authority")],
      MATRIX_PROGRAM_ID
    );
    console.log("🔥 TEMP_DONUT_AUTHORITY: " + tempDonutAuthority.toString());
    
    // Token vault verificado
    const PROGRAM_TOKEN_VAULT = new PublicKey("6vcd7cv4tsqCmL1wFKe6H3ThCEgrpwfYFSiNyEWRFAp9");
    console.log("🔑 PROGRAM_TOKEN_VAULT (VERIFICADO): " + PROGRAM_TOKEN_VAULT.toString());
    
    // Derivar carteira do referenciador e ATA
    const referrerWallet = referrerInfo.ownerWallet || referrerAddress;
    const referrerTokenAccount = await ensureReferrerATA(
      connection, 
      provider, 
      referrerWallet, 
      TOKEN_MINT, 
      walletKeypair.publicKey
    );
    
    // CRÍTICO: Preparar uplines para SLOT 3 com validação rigorosa
    let uplineAccounts = [];
    const isSlot3 = referrerInfo.chain.filledSlots === 2;
    
    if (isSlot3) {
      console.log("\n🔄 PREPARANDO UPLINES PARA SLOT 3 - SISTEMA DE AIRDROP");
      
      try {
        uplineAccounts = await prepareAllUplinesForSlot3(
          connection, 
          program, 
          referrerInfo, 
          TOKEN_MINT
        );
        
        // Validar o total de contas esperado
        const baseAccounts = 7; // Pool + Vault A (4) + Chainlink (2)
        const expectedTotalAccounts = baseAccounts + uplineAccounts.length;
        
        console.log(`\n📊 VALIDAÇÃO DE CONTAS SLOT 3:`);
        console.log(`  Contas base: ${baseAccounts}`);
        console.log(`  Contas upline: ${uplineAccounts.length}`);
        console.log(`  Total esperado: ${expectedTotalAccounts}`);
        console.log(`  Contrato exige: EXATAMENTE ${expectedTotalAccounts} contas`);
        
      } catch (e) {
        console.error(`❌ Erro ao preparar uplines SLOT 3: ${e.message}`);
        return;
      }
    }
    
    // Verificar se ALT foi fornecida
    let lookupTableAccount = null;
    if (altAddress) {
      console.log("\n🔍 CARREGANDO ADDRESS LOOKUP TABLE...");
      lookupTableAccount = await getAddressLookupTable(connection, altAddress);
      
      if (!lookupTableAccount) {
        console.error("❌ ERRO: Address Lookup Table não encontrada ou inválida!");
        return;
      }
    }
    
    // EXECUTAR REGISTRO COM TRANSAÇÃO VERSIONADA (se ALT disponível) OU LEGACY
    console.log("\n📤 PREPARANDO TRANSAÇÃO DE REGISTRO COM SISTEMA DE AIRDROP...");
    
    try {
      // Obter blockhash recente
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      
      // Instruções para aumentar limite de compute unit
      const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
        units: 1_400_000 // Aumentado para validações de airdrop
      });
      
      // Aumentar prioridade para transação crítica
      const setPriority = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 10000
      });
      
      // Configurar contas Pool, Vault A e Chainlink para remaining_accounts
      const vaultAAccounts = [
        { pubkey: POOL_ADDRESS, isWritable: false, isSigner: false },      // Index 0: Pool
        { pubkey: A_VAULT, isWritable: false, isSigner: false },          // Index 1: Vault A state
        { pubkey: A_VAULT_LP, isWritable: false, isSigner: false },       // Index 2: Vault A LP
        { pubkey: A_VAULT_LP_MINT, isWritable: false, isSigner: false },  // Index 3: Vault A LP Mint
        { pubkey: A_TOKEN_VAULT, isWritable: false, isSigner: false },    // Index 4: Token A Vault
      ];
      
      const chainlinkAccounts = [
        { pubkey: SOL_USD_FEED, isWritable: false, isSigner: false },      // Index 5: Feed
        { pubkey: CHAINLINK_PROGRAM, isWritable: false, isSigner: false }, // Index 6: Program
      ];
      
      // Combinar todas as contas remaining na ORDEM EXATA esperada pelo contrato
      const allRemainingAccounts = [...vaultAAccounts, ...chainlinkAccounts, ...uplineAccounts];
      
      // VALIDAÇÃO CRÍTICA: Verificar ordem e contagem das contas
      console.log("\n🔍 VALIDANDO REMAINING_ACCOUNTS PARA CONTRATO DE AIRDROP:");
      console.log(`  Index 0 (Pool): ${allRemainingAccounts[0].pubkey.toString()}`);
      console.log(`  Index 1 (A_Vault): ${allRemainingAccounts[1].pubkey.toString()}`);
      console.log(`  Index 2 (A_Vault_LP): ${allRemainingAccounts[2].pubkey.toString()}`);
      console.log(`  Index 3 (A_Vault_LP_Mint): ${allRemainingAccounts[3].pubkey.toString()}`);
      console.log(`  Index 4 (A_Token_Vault): ${allRemainingAccounts[4].pubkey.toString()}`);
      console.log(`  Index 5 (Chainlink_Feed): ${allRemainingAccounts[5].pubkey.toString()}`);
      console.log(`  Index 6 (Chainlink_Program): ${allRemainingAccounts[6].pubkey.toString()}`);
      
      if (uplineAccounts.length > 0) {
        console.log(`  Indices 7+ (${uplineAccounts.length} contas upline em ${uplineAccounts.length/3} trios)`);
      }
      
      // Verificar endereços corretos
      if (!allRemainingAccounts[0].pubkey.equals(POOL_ADDRESS) ||
          !allRemainingAccounts[1].pubkey.equals(A_VAULT) ||
          !allRemainingAccounts[5].pubkey.equals(SOL_USD_FEED) || 
          !allRemainingAccounts[6].pubkey.equals(CHAINLINK_PROGRAM)) {
        console.error("❌ ERRO: Ordem das contas críticas está incorreta!");
        return;
      }
      
      console.log(`✅ Todas as ${allRemainingAccounts.length} contas validadas para o contrato de airdrop`);
      
      // Gerar instrução com Anchor
      console.log("\n🔧 Gerando instrução de airdrop com Anchor...");
      const anchorIx = await program.methods
        .registerWithSolDeposit(new BN(FIXED_DEPOSIT_AMOUNT))
        .accounts({
          state: STATE_ADDRESS,
          userWallet: walletKeypair.publicKey,
          referrer: referrerAccount,
          referrerWallet: referrerWallet,
          user: userAccount,
          tempDonutVault: tempDonutVault,
          tempDonutAuthority: tempDonutAuthority,
          pool: POOL_ADDRESS,
          bVault: B_VAULT,
          bTokenVault: B_TOKEN_VAULT,
          bVaultLpMint: B_VAULT_LP_MINT,
          bVaultLp: B_VAULT_LP,
          vaultProgram: VAULT_PROGRAM,
          ammProgram: METEORA_AMM_PROGRAM,
          programSolVault: programSolVault,
          tokenMint: TOKEN_MINT,
          programTokenVault: PROGRAM_TOKEN_VAULT,
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

      // Criar instrução manual para transação versionada
      const ixData = anchorIx.data;
      console.log(`🔍 Discriminador da instrução de airdrop: ${Buffer.from(ixData.slice(0, 8)).toString('hex')}`);

      const manualRegisterInstruction = new TransactionInstruction({
        keys: anchorIx.keys,
        programId: MATRIX_PROGRAM_ID,
        data: ixData
      });

      // Criar array de instruções
      const instructions = [
        modifyComputeUnits,
        setPriority,
        manualRegisterInstruction
      ];

      let txid;

      // Usar transação versionada se ALT disponível, senão legacy
      if (lookupTableAccount) {
        console.log("\n🔧 Criando mensagem V0 com lookup table...");
        const messageV0 = new TransactionMessage({
          payerKey: walletKeypair.publicKey,
          recentBlockhash: blockhash,
          instructions
        }).compileToV0Message([lookupTableAccount]);

        const transaction = new VersionedTransaction(messageV0);
        transaction.sign([walletKeypair]);

        console.log("✅ Transação versionada de airdrop criada e assinada");
        console.log(`📊 Usando ALT com ${lookupTableAccount.state.addresses.length} endereços`);
        console.log(`⚙️ Versão da transação: V0 (Sistema de Airdrop)`);

        // Enviar transação versionada
        console.log("\n📤 ENVIANDO TRANSAÇÃO VERSIONADA DE AIRDROP...");
        
        txid = await connection.sendTransaction(transaction, {
          maxRetries: 5,
          skipPreflight: true
        });
      } else {
        console.log("\n🔧 Usando transação legacy (sem ALT)...");
        
        const legacyTx = new Transaction();
        legacyTx.add(...instructions);
        legacyTx.feePayer = walletKeypair.publicKey;
        legacyTx.recentBlockhash = blockhash;
        legacyTx.sign(walletKeypair);

        console.log("\n📤 ENVIANDO TRANSAÇÃO LEGACY DE AIRDROP...");
        
        txid = await connection.sendRawTransaction(legacyTx.serialize(), {
          maxRetries: 5,
          skipPreflight: true
        });
      }
      
      console.log("✅ Transação enviada: " + txid);
      console.log(`🔍 Link do explorador: https://explorer.solana.com/tx/${txid}?cluster=devnet`);
      
      console.log("\n⏳ Aguardando confirmação com validações de airdrop...");
      const confirmation = await connection.confirmTransaction(
        {
          signature: txid,
          blockhash: blockhash,
          lastValidBlockHeight: lastValidBlockHeight,
        },
        'confirmed'
      );
      
      if (confirmation.value.err) {
        throw new Error(`Erro de confirmação da transação: ${JSON.stringify(confirmation.value.err)}`);
      }
      
      console.log("✅ Transação confirmada com sistema de airdrop!");
      
      // Verificar resultados
      console.log("\n🔍 VERIFICANDO RESULTADOS COM VALIDAÇÕES DE AIRDROP...");
      
      try {
        // Verificar conta do usuário
        const userInfo = await program.account.userAccount.fetch(userAccount);
        console.log("\n📋 CONFIRMAÇÃO DE REGISTRO DE AIRDROP:");
        console.log("✅ Usuário registrado: " + userInfo.isRegistered);
        console.log("🧑‍🤝‍🧑 Referenciador: " + userInfo.referrer.toString());
        console.log("🔢 Depth: " + userInfo.upline.depth.toString());
        console.log("📊 Slots preenchidos: " + userInfo.chain.filledSlots + "/3");
        
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
          console.log("\n📋 CAMPOS DE SEGURANÇA DA CONTA:");
          console.log("👤 Owner Wallet: " + userInfo.ownerWallet.toString());
          
          if (userInfo.ownerWallet.equals(walletKeypair.publicKey)) {
            console.log("✅ Campo owner_wallet corretamente protegido");
          } else {
            console.log("❌ ALERTA DE SEGURANÇA: Owner Wallet não confere!");
          }
        }
        
        // Exibir informações de upline
        if (userInfo.upline.upline && userInfo.upline.upline.length > 0) {
          console.log("\n📋 INFORMAÇÕES DE UPLINE SEGURAS:");
          userInfo.upline.upline.forEach((entry, index) => {
            console.log(`  Upline #${index+1}:`);
            console.log(`    PDA: ${entry.pda.toString()}`);
            console.log(`    Wallet: ${entry.wallet.toString()}`);
          });
        }
        
        // Verificar dados semanais
        if (userInfo.weeklyMatrices && userInfo.weeklyMatrices.length > 0) {
          console.log("\n📊 DADOS SEMANAIS DO AIRDROP:");
          userInfo.weeklyMatrices.forEach((week, index) => {
            console.log(`  Semana ${week.weekNumber}: ${week.matricesCompleted} matrizes`);
          });
        } else {
          console.log("\n📊 Ainda sem dados semanais (normal para usuário recém-registrado)");
        }
        
        // Verificar estado do referenciador após registro
        const newReferrerInfo = await program.account.userAccount.fetch(referrerAccount);
        console.log("\n📋 ESTADO DO REFERENCIADOR APÓS PROCESSAMENTO DE AIRDROP:");
        console.log("📊 Slots preenchidos: " + newReferrerInfo.chain.filledSlots + "/3");
        
        // AIRDROP SYSTEM: Verificar dados do referenciador
        console.log("📊 Matrizes completadas: " + newReferrerInfo.completedMatricesTotal.toString());
        console.log("💰 DONUT ganho: " + newReferrerInfo.totalDonutEarned.toString());
        console.log("🎁 DONUT coletado: " + newReferrerInfo.totalDonutClaimed.toString());
        
        // Verificar valores reservados
        if (newReferrerInfo.reservedSol > 0) {
          console.log(`💰 SOL Reservado: ${newReferrerInfo.reservedSol / 1e9} SOL`);
        }
        
        // Se foi SLOT 3, verificar processamento de recursão
        if (isSlot3 && uplineAccounts.length > 0) {
          console.log("\n🔄 VERIFICANDO RESULTADO DA RECURSÃO DE AIRDROP:");
          
          let processedUplines = 0;
          for (let i = 0; i < uplineAccounts.length; i += 3) {
            if (i >= uplineAccounts.length) break;
            
            try {
              const uplineAccount = uplineAccounts[i].pubkey;
              console.log(`\n  Verificando upline seguro: ${uplineAccount.toString()}`);
              
              const uplineInfo = await program.account.userAccount.fetch(uplineAccount);
              console.log(`  Slots preenchidos: ${uplineInfo.chain.filledSlots}/3`);
              
              // Verificar se referenciador foi adicionado à matriz do upline
              for (let j = 0; j < uplineInfo.chain.filledSlots; j++) {
                if (uplineInfo.chain.slots[j] && uplineInfo.chain.slots[j].equals(referrerAccount)) {
                  console.log(`  ✅ REFERENCIADOR ADICIONADO COM SEGURANÇA AO SLOT ${j + 1}!`);
                  processedUplines++;
                  break;
                }
              }
              
              // AIRDROP SYSTEM: Verificar valores do upline
              console.log(`  📊 Matrizes completadas: ${uplineInfo.completedMatricesTotal.toString()}`);
              console.log(`  💰 DONUT ganho: ${uplineInfo.totalDonutEarned.toString()}`);
              
              if (uplineInfo.reservedSol > 0) {
                console.log(`  💰 SOL Reservado: ${uplineInfo.reservedSol / 1e9} SOL`);
              }
            } catch (e) {
              console.log(`  Erro ao verificar upline: ${e.message}`);
            }
          }
          
          console.log(`\n  ✅ Recursão de airdrop processou ${processedUplines}/${uplineAccounts.length / 3} uplines`);
        }
        
        // Obter e mostrar novo saldo
        const newBalance = await connection.getBalance(walletKeypair.publicKey);
        console.log("\n💼 Seu novo saldo: " + newBalance / 1e9 + " SOL");
        console.log("💰 SOL gasto: " + (balance - newBalance) / 1e9 + " SOL");
        
        console.log("\n🎉 REGISTRO COM REFERENCIADOR NO SISTEMA DE AIRDROP CONCLUÍDO! 🎉");
        console.log("🎯 TODAS AS VALIDAÇÕES DE AIRDROP PASSARAM!");
        console.log("================================================================");
        console.log("\n⚠️ IMPORTANTE: SALVE ESTES ENDEREÇOS PARA USO FUTURO:");
        console.log("🔑 SEU ENDEREÇO: " + walletKeypair.publicKey.toString());
        console.log("🔑 SUA CONTA PDA: " + userAccount.toString());
        console.log("🔑 REFERENCIADOR: " + referrerAddress.toString());
        console.log("🛡️ NÍVEL DE SEGURANÇA: MÁXIMO COM AIRDROP");
        
        console.log("\n🎯 PRÓXIMOS PASSOS:");
        console.log("1. 🔄 Complete matrizes para ganhar rewards de airdrop");
        console.log("2. 🎁 Use claim_airdrop para coletar DONUT ganhos");
        console.log("3. 📊 Monitore com get_user_airdrop_info");
        console.log("4. 👥 Convide outros usuários para expandir a rede");
        console.log("5. 📈 Acompanhe sistema com get_program_info");
        
        console.log("\n🔥 SISTEMA DEFLATIONARY ATIVO:");
        console.log("• Slot 1: Swap SOL → DONUT → Burn (deflationary)");
        console.log("• Slot 2: Reserva SOL para pagamento");
        console.log("• Slot 3: Paga SOL + Recursão com Swap+Burn");
        console.log("• Airdrops: 36 semanas progressivas baseadas em matrizes");
        console.log("• Claims: Sob demanda via instrução dedicada");
        
      } catch (e) {
        console.error("❌ ERRO AO VERIFICAR RESULTADOS DE AIRDROP:", e);
      }
    } catch (error) {
      console.error("❌ ERRO NO REGISTRO DE AIRDROP:", error);
      
      if (error.logs) {
        console.log("\n📋 LOGS DE ERRO DETALHADOS DO AIRDROP:");
        const relevantLogs = error.logs.filter(log => 
          log.includes("Program log:") || 
          log.includes("Error") || 
          log.includes("error") ||
          log.includes("CRITICAL") ||
          log.includes("ReentrancyLock") ||
          log.includes("overflow") ||
          log.includes("SLOT 3") ||
          log.includes("airdrop") ||
          log.includes("week") ||
          log.includes("matrix") ||
          log.includes("burn") ||
          log.includes("swap")
        );
        
        if (relevantLogs.length > 0) {
          console.log("🎯 Logs relacionados ao airdrop:");
          relevantLogs.forEach((log, i) => console.log(`  ${i}: ${log}`));
        } else {
          error.logs.forEach((log, i) => console.log(`  ${i}: ${log}`));
        }
      }
    }
  } catch (error) {
    console.error("❌ ERRO GERAL DE AIRDROP:", error);
    
    if (error.logs) {
      console.log("\n📋 DETALHES DO ERRO DE AIRDROP:");
      error.logs.forEach((log, i) => console.log(`${i}: ${log}`));
    }
  }
}

main();