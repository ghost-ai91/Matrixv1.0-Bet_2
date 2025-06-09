// Script para registrar usuário base do sistema de referral com Chainlink - REGISTRO DIRETO
const { Connection, Keypair, PublicKey, SystemProgram, Transaction, ComputeBudgetProgram, TransactionInstruction } = require('@solana/web3.js');
const { AnchorProvider, Program, BN, Wallet, utils } = require('@coral-xyz/anchor');
const fs = require('fs');
const path = require('path');

// Receber parâmetros da linha de comando (opcional)
const args = process.argv.slice(2);
const walletPath = args[0] || '/root/.config/solana/id.json';
const configPath = args[1] || './matriz-config.json';

async function main() {
  try {
    console.log("🚀 REGISTRANDO USUÁRIO BASE COM CHAINLINK ORACLE - DIRETO 🚀");
    console.log("==============================================================");
    
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
    const connection = new Connection('https://weathered-quiet-theorem.solana-devnet.quiknode.pro/198997b67cb51804baeb34ed2257274aa2b2d8c0', 'confirmed');
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
    } catch (e) {
      console.error("❌ ERRO: Estado do programa não encontrado ou inacessível!");
      console.error(e);
      return;
    }
    
    // Derivar PDA da conta do usuário (usando a carteira normal, não multisig)
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
    
    // Gerar nova keypair para a conta WSOL temporária
    const tokenKeypair = Keypair.generate();
    const tokenAddress = tokenKeypair.publicKey.toString();
    console.log(`🔑 Nova keypair para conta WSOL gerada: ${tokenAddress}`);
    
    // ==== ETAPA 1: CRIAR CONTA WSOL TEMPORÁRIA ====
    console.log("\n📋 ETAPA 1: CRIAR E FINANCIAR CONTA WSOL TEMPORÁRIA");
    
    // Calcular espaço necessário e aluguel
    const tokenAccountSpace = 165; // Tamanho padrão para uma conta de token SPL
    const rent = await connection.getMinimumBalanceForRentExemption(tokenAccountSpace);
    const totalAmount = rent + DEPOSIT_AMOUNT;
    
    console.log(`💰 Aluguel para conta WSOL: ${rent / 1e9} SOL`);
    console.log(`💰 Depósito para registro: ${DEPOSIT_AMOUNT / 1e9} SOL`);
    console.log(`💰 Total a ser transferido: ${totalAmount / 1e9} SOL`);
    
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
    
    // Etapa 2: Inicializar a conta como token WSOL (owner = usuário normal)
    createWsolTx.add(
      new TransactionInstruction({
        keys: [
          { pubkey: tokenKeypair.publicKey, isSigner: false, isWritable: true },
          { pubkey: WSOL_MINT, isSigner: false, isWritable: false },
          { pubkey: walletKeypair.publicKey, isSigner: false, isWritable: false }, // Owner = usuário normal
          { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        ],
        programId: SPL_TOKEN_PROGRAM_ID,
        data: Buffer.from([1, ...walletKeypair.publicKey.toBuffer()]), // 1 = Initialize, seguido do owner
      })
    );
    
    // Etapa 3: Sincronizar WSOL
    createWsolTx.add(
      new TransactionInstruction({
        keys: [{ pubkey: tokenKeypair.publicKey, isSigner: false, isWritable: true }],
        programId: SPL_TOKEN_PROGRAM_ID,
        data: Buffer.from([17]), // SyncNative instruction code
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
    console.log("✅ Conta WSOL criada, inicializada e financiada com sucesso!");
    
    // Verificar saldo da conta WSOL
    try {
      const tokenBalance = await connection.getTokenAccountBalance(tokenKeypair.publicKey);
      console.log(`💰 Saldo da conta WSOL: ${tokenBalance.value.uiAmount} SOL`);
    } catch (e) {
      console.log(`⚠️ Não foi possível verificar o saldo WSOL: ${e.message}`);
    }
    
    // ==== ETAPA 2: EXECUTAR REGISTRO DIRETAMENTE ====
    console.log("\n📋 ETAPA 2: EXECUTAR REGISTRO DO USUÁRIO BASE");
    
    // Preparar os remaining accounts para Vault A e Chainlink
    const remainingAccounts = [
      { pubkey: A_VAULT_LP, isWritable: true, isSigner: false },
      { pubkey: A_VAULT_LP_MINT, isWritable: true, isSigner: false },
      { pubkey: A_TOKEN_VAULT, isWritable: true, isSigner: false },
      { pubkey: SOL_USD_FEED, isWritable: false, isSigner: false },
      { pubkey: CHAINLINK_PROGRAM, isWritable: false, isSigner: false },
    ];
    
    console.log("\n🔍 INCLUINDO REMAINING_ACCOUNTS PARA VAULT A E CHAINLINK...");
    console.log("  ✓ A_VAULT_LP: " + A_VAULT_LP.toString());
    console.log("  ✓ A_VAULT_LP_MINT: " + A_VAULT_LP_MINT.toString());
    console.log("  ✓ A_TOKEN_VAULT: " + A_TOKEN_VAULT.toString());
    console.log("  ✓ SOL_USD_FEED: " + SOL_USD_FEED.toString());
    console.log("  ✓ CHAINLINK_PROGRAM: " + CHAINLINK_PROGRAM.toString());
    
    // Aumentar compute units
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: 1_000_000, // 1 milhão de unidades
    });
    
    // Definir prioridade da transação
    const setPriority = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 5000,
    });
    
    try {
      console.log("\n📤 Enviando transação de registro...");
      
      const txid = await program.methods
        .registerWithoutReferrer(new BN(DEPOSIT_AMOUNT))
        .accounts({
          state: STATE_ADDRESS,
          owner: walletKeypair.publicKey, // Owner = usuário normal
          userWallet: walletKeypair.publicKey, // User wallet = usuário normal
          user: userPDA,
          userSourceToken: tokenKeypair.publicKey,
          wsolMint: WSOL_MINT,
          pool: POOL_ADDRESS,
          bVault: B_VAULT,
          bTokenVault: B_TOKEN_VAULT,
          bVaultLpMint: B_VAULT_LP_MINT,
          bVaultLp: B_VAULT_LP,
          vaultProgram: VAULT_PROGRAM,
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
      console.log("✅ Transação de registro confirmada!");
      
      // Verificar se o registro foi bem-sucedido
      const userInfo = await program.account.userAccount.fetch(userPDA);
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
        console.log("\n📋 INFORMAÇÕES DAS UPLINES:");
        userInfo.upline.upline.forEach((entry, index) => {
          console.log(`  Upline #${index+1}:`);
          console.log(`    PDA: ${entry.pda.toString()}`);
          console.log(`    Wallet: ${entry.wallet.toString()}`);
        });
      } else {
        console.log("\n📋 ⚠️ USUÁRIO BASE SEM ESTRUTURA UPLINEENTRY (NORMAL PARA BASE)");
      }
      
      console.log("\n🎉 REGISTRO CONCLUÍDO COM SUCESSO! 🎉");
      console.log("=============================================");
      console.log("\n📋 RESUMO DOS ENDEREÇOS:");
      console.log(`🏦 Usuário registrado: ${walletKeypair.publicKey.toString()}`);
      console.log(`📄 PDA da conta do usuário: ${userPDA.toString()}`);
      console.log(`💰 Conta WSOL temporária: ${tokenKeypair.publicKey.toString()}`);
      console.log(`💰 Valor de depósito: ${DEPOSIT_AMOUNT / 1e9} SOL`);
      
    } catch (error) {
      console.error("\n❌ ERRO DURANTE O REGISTRO:");
      console.error(error);
      
      if (error.logs) {
        console.log("\n📋 LOGS DE ERRO DETALHADOS:");
        error.logs.forEach((log, i) => console.log(`${i}: ${log}`));
      }
    }
    
  } catch (error) {
    console.error("\n❌ ERRO DURANTE A EXECUÇÃO DO SCRIPT:");
    console.error(error);
    
    if (error.logs) {
      console.log("\n📋 LOGS DE ERRO DETALHADOS:");
      error.logs.forEach((log, i) => console.log(`${i}: ${log}`));
    }
  }
}

// Execução da função principal
main();