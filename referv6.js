// register-with-dynamic-alt.js
// Script completo que cria ALT dinâmica e registra o usuário em uma única execução
const { 
  Connection, 
  Keypair, 
  PublicKey, 
  TransactionMessage, 
  VersionedTransaction,
  ComputeBudgetProgram,
  TransactionInstruction,
  Transaction,
  SystemProgram,
  AddressLookupTableProgram
} = require('@solana/web3.js');
const { AnchorProvider, Program, BN, Wallet, utils } = require('@coral-xyz/anchor');
const fs = require('fs');
const path = require('path');

// Configuração de endereços fixos
const FIXED_ADDRESSES = {
  // Programa Matrix
  MATRIX_PROGRAM: "6xjmdQP5BcWskUmjGkqFU72dz9hp81SRvfrEmwZzieik",
  
  // Token
  TOKEN_MINT: "FXAN6cjSjAiiGJf3fXK9T7kuLwmuFGN8x5o3bWjQhLSN",
  
  // Pool Meteora
  POOL_ADDRESS: "FrQ5KsAgjCe3FFg6ZENri8feDft54tgnATxyffcasuxU",
  
  // Vault A (DONUT)
  A_VAULT: "4ndfcH16GKY76bzDkKfyVwHMoF8oY75KES2VaAhUYksN",
  A_TOKEN_VAULT: "6m1wvYoPrwjAnbuGMqpMoodQaq4VnZXRjrzufXnPSjmj",
  A_VAULT_LP: "CocstBGbeDVyTJWxbWs4docwWapVADAo1xXQSh9RfPMz",
  A_VAULT_LP_MINT: "6f2FVX5UT5uBtgknc8fDj119Z7DQoLJeKRmBq7j1zsVi",
  
  // Vault B (SOL)
  B_VAULT: "FERjPVNEa7Udq8CEv68h6tPL46Tq7ieE49HrE2wea3XT",
  B_TOKEN_VAULT: "HZeLxbZ9uHtSpwZC3LBr4Nubd14iHwz7bRSghRZf5VCG",
  B_VAULT_LP_MINT: "BvoAjwEDhpLzs3jtu4H72j96ShKT5rvZE9RP1vgpfSM",
  B_VAULT_LP: "HJNs8hPTzs9i6AVFkRDDMFVEkrrUoV7H7LDZHdCWvxn7",
  VAULT_PROGRAM: "24Uqj9JCLxUeoC3hGfh5W3s9FM9uCHDS2SG3LYwBpyTi",
  
  // Chainlink (Devnet)
  CHAINLINK_PROGRAM: "HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny",
  SOL_USD_FEED: "99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR",
  
  // Programas do sistema
  WSOL_MINT: "So11111111111111111111111111111111111111112",
  SPL_TOKEN_PROGRAM: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  SYSTEM_PROGRAM: "11111111111111111111111111111111",
  ASSOCIATED_TOKEN_PROGRAM: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  SYSVAR_RENT: "SysvarRent111111111111111111111111111111111"
};

// Função auxiliar para aguardar com feedback
async function waitWithFeedback(ms, message) {
  const steps = 10;
  const stepTime = ms / steps;
  
  for (let i = 0; i < steps; i++) {
    process.stdout.write(`\r${message} ${'.'.repeat(i + 1)}${' '.repeat(steps - i - 1)}`);
    await new Promise(resolve => setTimeout(resolve, stepTime));
  }
  console.log(); // Nova linha
}

// Criar ALT com endereços dinâmicos
async function createDynamicALT(connection, wallet, referrerInfo, program, TOKEN_MINT, STATE_ADDRESS) {
  console.log("\n🔧 CRIANDO ALT DINÂMICA PERSONALIZADA...");
  
  // 1. Coletar endereços fixos
  const fixedAddresses = [
    new PublicKey(FIXED_ADDRESSES.MATRIX_PROGRAM),
    TOKEN_MINT,
    STATE_ADDRESS,
    new PublicKey(FIXED_ADDRESSES.POOL_ADDRESS),
    new PublicKey(FIXED_ADDRESSES.A_VAULT),
    new PublicKey(FIXED_ADDRESSES.A_TOKEN_VAULT),
    new PublicKey(FIXED_ADDRESSES.A_VAULT_LP),
    new PublicKey(FIXED_ADDRESSES.A_VAULT_LP_MINT),
    new PublicKey(FIXED_ADDRESSES.B_VAULT),
    new PublicKey(FIXED_ADDRESSES.B_TOKEN_VAULT),
    new PublicKey(FIXED_ADDRESSES.B_VAULT_LP_MINT),
    new PublicKey(FIXED_ADDRESSES.B_VAULT_LP),
    new PublicKey(FIXED_ADDRESSES.VAULT_PROGRAM),
    new PublicKey(FIXED_ADDRESSES.CHAINLINK_PROGRAM),
    new PublicKey(FIXED_ADDRESSES.SOL_USD_FEED),
    new PublicKey(FIXED_ADDRESSES.WSOL_MINT),
    new PublicKey(FIXED_ADDRESSES.SPL_TOKEN_PROGRAM),
    new PublicKey(FIXED_ADDRESSES.SYSTEM_PROGRAM),
    new PublicKey(FIXED_ADDRESSES.ASSOCIATED_TOKEN_PROGRAM),
    new PublicKey(FIXED_ADDRESSES.SYSVAR_RENT),
  ];
  
  // 2. Coletar endereços de upline dinâmicos
  const uplineAddresses = [];
  
  if (referrerInfo.upline && referrerInfo.upline.upline && referrerInfo.upline.upline.length > 0) {
    console.log(`📊 Processando ${Math.min(referrerInfo.upline.upline.length, 6)} uplines...`);
    
    const uplinesToProcess = referrerInfo.upline.upline.slice(0, 6); // Máximo 6 uplines
    
    for (let i = 0; i < uplinesToProcess.length; i++) {
      const entry = uplinesToProcess[i];
      
      // Adicionar trio: PDA, Wallet, ATA
      uplineAddresses.push(entry.pda);
      uplineAddresses.push(entry.wallet);
      
      const uplineATA = utils.token.associatedAddress({
        mint: TOKEN_MINT,
        owner: entry.wallet,
      });
      uplineAddresses.push(uplineATA);
      
      console.log(`  Upline ${i + 1}: ${entry.pda.toString().slice(0, 8)}...`);
    }
  }
  
  // 3. Combinar todos os endereços
  const allAddresses = [...fixedAddresses, ...uplineAddresses];
  console.log(`\n📊 Resumo de endereços:`);
  console.log(`  - Fixos: ${fixedAddresses.length}`);
  console.log(`  - Uplines: ${uplineAddresses.length} (${uplineAddresses.length / 3} trios)`);
  console.log(`  - Total: ${allAddresses.length}`);
  
  // 4. Criar ALT
  const slot = await connection.getSlot();
  const [createInstruction, lookupTableAddress] = AddressLookupTableProgram.createLookupTable({
    authority: wallet.publicKey,
    payer: wallet.publicKey,
    recentSlot: slot - 1,
  });
  
  console.log(`\n🔑 Endereço da nova ALT: ${lookupTableAddress.toString()}`);
  
  // 5. Enviar transação de criação
  const createTx = new Transaction().add(createInstruction);
  const { blockhash } = await connection.getLatestBlockhash();
  createTx.recentBlockhash = blockhash;
  createTx.feePayer = wallet.publicKey;
  
  const signedTx = await wallet.signTransaction(createTx);
  const txId = await connection.sendRawTransaction(signedTx.serialize());
  
  console.log(`✅ ALT criada: ${txId}`);
  await connection.confirmTransaction(txId, 'confirmed');
  
  // 6. Adicionar endereços em lotes
  await waitWithFeedback(2000, "⏳ Aguardando ALT ficar disponível");
  
  const BATCH_SIZE = 20;
  for (let i = 0; i < allAddresses.length; i += BATCH_SIZE) {
    const batch = allAddresses.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(allAddresses.length / BATCH_SIZE);
    
    console.log(`\n📝 Adicionando lote ${batchNum}/${totalBatches} (${batch.length} endereços)...`);
    
    const extendInstruction = AddressLookupTableProgram.extendLookupTable({
      payer: wallet.publicKey,
      authority: wallet.publicKey,
      lookupTable: lookupTableAddress,
      addresses: batch,
    });
    
    const extendTx = new Transaction().add(extendInstruction);
    const { blockhash: extendBlockhash } = await connection.getLatestBlockhash();
    extendTx.recentBlockhash = extendBlockhash;
    extendTx.feePayer = wallet.publicKey;
    
    const signedExtendTx = await wallet.signTransaction(extendTx);
    const extendTxId = await connection.sendRawTransaction(signedExtendTx.serialize());
    
    console.log(`✅ Lote ${batchNum} adicionado: ${extendTxId}`);
    await connection.confirmTransaction(extendTxId, 'confirmed');
    
    if (i + BATCH_SIZE < allAddresses.length) {
      await waitWithFeedback(1000, "⏳ Preparando próximo lote");
    }
  }
  
  // 7. Verificar ALT final
  await waitWithFeedback(3000, "🔍 Verificando ALT completa");
  
  const lookupTableAccount = await connection.getAddressLookupTable(lookupTableAddress);
  if (!lookupTableAccount.value) {
    throw new Error("ALT não encontrada após criação");
  }
  
  console.log(`\n✅ ALT DINÂMICA CRIADA COM SUCESSO!`);
  console.log(`📊 Total de endereços: ${lookupTableAccount.value.state.addresses.length}`);
  
  return {
    address: lookupTableAddress,
    account: lookupTableAccount.value,
    stats: {
      fixedCount: fixedAddresses.length,
      uplineCount: uplineAddresses.length,
      totalCount: allAddresses.length
    }
  };
}

// Função para preparar remaining accounts
function prepareRemainingAccounts(referrerInfo, TOKEN_MINT) {
  const remainingAccounts = [];
  
  // 1. Adicionar contas do Pool e Vault A (índices 0-4)
  const vaultAAccounts = [
    { pubkey: new PublicKey(FIXED_ADDRESSES.POOL_ADDRESS), isWritable: false, isSigner: false },
    { pubkey: new PublicKey(FIXED_ADDRESSES.A_VAULT), isWritable: false, isSigner: false },
    { pubkey: new PublicKey(FIXED_ADDRESSES.A_VAULT_LP), isWritable: false, isSigner: false },
    { pubkey: new PublicKey(FIXED_ADDRESSES.A_VAULT_LP_MINT), isWritable: false, isSigner: false },
    { pubkey: new PublicKey(FIXED_ADDRESSES.A_TOKEN_VAULT), isWritable: false, isSigner: false },
  ];
  
  // 2. Adicionar contas Chainlink (índices 5-6)
  const chainlinkAccounts = [
    { pubkey: new PublicKey(FIXED_ADDRESSES.SOL_USD_FEED), isWritable: false, isSigner: false },
    { pubkey: new PublicKey(FIXED_ADDRESSES.CHAINLINK_PROGRAM), isWritable: false, isSigner: false },
  ];
  
  // 3. Adicionar uplines (se houver)
  const uplineAccounts = [];
  if (referrerInfo.upline && referrerInfo.upline.upline && referrerInfo.upline.upline.length > 0) {
    const uplines = referrerInfo.upline.upline.slice(0, 6);
    
    for (const entry of uplines) {
      // Trio: PDA, Wallet, ATA
      uplineAccounts.push({ pubkey: entry.pda, isWritable: true, isSigner: false });
      uplineAccounts.push({ pubkey: entry.wallet, isWritable: true, isSigner: false });
      
      const ata = utils.token.associatedAddress({
        mint: TOKEN_MINT,
        owner: entry.wallet,
      });
      uplineAccounts.push({ pubkey: ata, isWritable: true, isSigner: false });
    }
  }
  
  return [...vaultAAccounts, ...chainlinkAccounts, ...uplineAccounts];
}

// Função principal
async function main() {
  try {
    console.log("🚀 REGISTRO COM ALT DINÂMICA INTEGRADA 🚀");
    console.log("=========================================");
    
    // Argumentos
    const args = process.argv.slice(2);
    const walletPath = args[0] || './carteiras/carteira1.json';
    const configPath = args[1] || './matriz-config.json';
    const referrerAddressStr = args[2];
    
    if (!referrerAddressStr) {
      console.error("❌ ERRO: Endereço do referenciador não fornecido!");
      console.error("Uso: node register-with-dynamic-alt.js <wallet> <config> <referrer>");
      return;
    }
    
    // Carregar carteira
    const walletKeypair = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, 'utf8')))
    );
    const anchorWallet = new Wallet(walletKeypair);
    
    console.log(`👤 Carteira: ${walletKeypair.publicKey.toString()}`);
    
    // Carregar configuração e IDL
    const idl = require(path.resolve('./target/idl/referral_system.json'));
    let config = {};
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
    
    // Conexão
    const connection = new Connection(
      'https://weathered-quiet-theorem.solana-devnet.quiknode.pro/198997b67cb51804baeb34ed2257274aa2b2d8c0',
      { commitment: 'confirmed', confirmTransactionInitialTimeout: 60000 }
    );
    
    // Endereços do programa
    const MATRIX_PROGRAM_ID = new PublicKey(config.programId || "4CxdTPK3Hxq2FJNBdAT44HK6rgMrBqSdbBMbudzGkSvt");
    const TOKEN_MINT = new PublicKey(config.tokenMint || "FXAN6cjSjAiiGJf3fXK9T7kuLwmuFGN8x5o3bWjQhLSN");
    const STATE_ADDRESS = new PublicKey(config.stateAddress || "34GuqWF4vAZ5bNxrD9bZpUnhoNWJb3nBqiBo987uYySs");
    
    // Provider e programa
    const provider = new AnchorProvider(connection, anchorWallet, {
      commitment: 'confirmed',
      skipPreflight: true,
      preflightCommitment: 'processed'
    });
    const program = new Program(idl, MATRIX_PROGRAM_ID, provider);
    
    // Verificar saldo
    const balance = await connection.getBalance(walletKeypair.publicKey);
    console.log(`💰 Saldo: ${balance / 1e9} SOL`);
    
    const REQUIRED_BALANCE = 65_000_000 + 30_000_000 + 20_000_000; // Depósito + taxas + ALT
    if (balance < REQUIRED_BALANCE) {
      console.error(`❌ Saldo insuficiente! Necessário: ${REQUIRED_BALANCE / 1e9} SOL`);
      return;
    }
    
    // Buscar referenciador
    const referrerAddress = new PublicKey(referrerAddressStr);
    const [referrerAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_account"), referrerAddress.toBuffer()],
      MATRIX_PROGRAM_ID
    );
    
    console.log(`\n🔍 Verificando referenciador...`);
    const referrerInfo = await program.account.userAccount.fetch(referrerAccount);
    
    if (!referrerInfo.isRegistered) {
      console.error("❌ Referenciador não está registrado!");
      return;
    }
    
    console.log(`✅ Referenciador verificado`);
    console.log(`📊 Slots: ${referrerInfo.chain.filledSlots}/3`);
    console.log(`🔢 Profundidade: ${referrerInfo.upline.depth}`);
    
    const nextSlot = referrerInfo.chain.filledSlots;
    if (nextSlot >= 3) {
      console.error("❌ Matriz do referenciador já está cheia!");
      return;
    }
    
    console.log(`🎯 Você preencherá o slot ${nextSlot + 1}`);
    
    // ETAPA 1: Criar ALT dinâmica
    const altResult = await createDynamicALT(
      connection,
      anchorWallet,
      referrerInfo,
      program,
      TOKEN_MINT,
      STATE_ADDRESS
    );
    
    // ETAPA 2: Preparar e executar registro
    console.log("\n📤 PREPARANDO TRANSAÇÃO DE REGISTRO...");
    
    // Derivar PDAs necessários
    const [userAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_account"), walletKeypair.publicKey.toBuffer()],
      MATRIX_PROGRAM_ID
    );
    
    const [tokenMintAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_mint_authority")],
      MATRIX_PROGRAM_ID
    );
    
    const [vaultAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_vault_authority")],
      MATRIX_PROGRAM_ID
    );
    
    const [programSolVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("program_sol_vault")],
      MATRIX_PROGRAM_ID
    );
    
    // ATAs
    const programTokenVault = utils.token.associatedAddress({
      mint: TOKEN_MINT,
      owner: vaultAuthority,
    });
    
    const referrerWallet = referrerInfo.ownerWallet || referrerAddress;
    const referrerTokenAccount = utils.token.associatedAddress({
      mint: TOKEN_MINT,
      owner: referrerWallet,
    });
    
    const userWsolAccount = utils.token.associatedAddress({
      mint: new PublicKey(FIXED_ADDRESSES.WSOL_MINT),
      owner: walletKeypair.publicKey,
    });
    
    // Preparar remaining accounts
    const remainingAccounts = prepareRemainingAccounts(referrerInfo, TOKEN_MINT);
    
    // Criar instrução
    const DEPOSIT_AMOUNT = new BN(65_000_000);
    const registerIx = await program.methods
      .registerWithSolDeposit(DEPOSIT_AMOUNT)
      .accounts({
        state: STATE_ADDRESS,
        userWallet: walletKeypair.publicKey,
        referrer: referrerAccount,
        referrerWallet: referrerWallet,
        user: userAccount,
        userWsolAccount: userWsolAccount,
        wsolMint: new PublicKey(FIXED_ADDRESSES.WSOL_MINT),
        pool: new PublicKey(FIXED_ADDRESSES.POOL_ADDRESS),
        bVault: new PublicKey(FIXED_ADDRESSES.B_VAULT),
        bTokenVault: new PublicKey(FIXED_ADDRESSES.B_TOKEN_VAULT),
        bVaultLpMint: new PublicKey(FIXED_ADDRESSES.B_VAULT_LP_MINT),
        bVaultLp: new PublicKey(FIXED_ADDRESSES.B_VAULT_LP),
        vaultProgram: new PublicKey(FIXED_ADDRESSES.VAULT_PROGRAM),
        programSolVault: programSolVault,
        tokenMint: TOKEN_MINT,
        programTokenVault: programTokenVault,
        referrerTokenAccount: referrerTokenAccount,
        tokenMintAuthority: tokenMintAuthority,
        vaultAuthority: vaultAuthority,
        tokenProgram: new PublicKey(FIXED_ADDRESSES.SPL_TOKEN_PROGRAM),
        systemProgram: new PublicKey(FIXED_ADDRESSES.SYSTEM_PROGRAM),
        associatedTokenProgram: new PublicKey(FIXED_ADDRESSES.ASSOCIATED_TOKEN_PROGRAM),
        rent: new PublicKey(FIXED_ADDRESSES.SYSVAR_RENT),
      })
      .remainingAccounts(remainingAccounts)
      .instruction();
    
    // Criar transação versionada com ALT
    console.log("\n🔧 Criando transação versionada com ALT dinâmica...");
    
    const { blockhash } = await connection.getLatestBlockhash();
    
    const messageV0 = new TransactionMessage({
      payerKey: walletKeypair.publicKey,
      recentBlockhash: blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5000 }),
        registerIx
      ]
    }).compileToV0Message([altResult.account]);
    
    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([walletKeypair]);
    
    // Enviar transação
    console.log("\n📤 Enviando transação...");
    const txId = await connection.sendTransaction(transaction, {
      maxRetries: 5,
      skipPreflight: true
    });
    
    console.log(`✅ Transação enviada: ${txId}`);
    console.log(`🔍 Explorer: https://explorer.solana.com/tx/${txId}?cluster=devnet`);
    
    await waitWithFeedback(5000, "⏳ Aguardando confirmação");
    
    const confirmation = await connection.confirmTransaction(txId, 'confirmed');
    if (confirmation.value.err) {
      throw new Error(`Erro na confirmação: ${JSON.stringify(confirmation.value.err)}`);
    }
    
    console.log("\n✅ REGISTRO CONCLUÍDO COM SUCESSO!");
    
    // Verificar resultado
    const userInfo = await program.account.userAccount.fetch(userAccount);
    console.log("\n📋 DADOS DO USUÁRIO:");
    console.log(`  Registrado: ${userInfo.isRegistered}`);
    console.log(`  Referenciador: ${userInfo.referrer.toString()}`);
    console.log(`  Profundidade: ${userInfo.upline.depth}`);
    console.log(`  Slots: ${userInfo.chain.filledSlots}/3`);
    
    // Salvar informações
    const registrationInfo = {
      user: walletKeypair.publicKey.toString(),
      userAccount: userAccount.toString(),
      referrer: referrerAddress.toString(),
      altAddress: altResult.address.toString(),
      altStats: altResult.stats,
      transactionId: txId,
      timestamp: new Date().toISOString()
    };
    
    const infoPath = `./registration-${walletKeypair.publicKey.toString().slice(0, 8)}.json`;
    fs.writeFileSync(infoPath, JSON.stringify(registrationInfo, null, 2));
    
    console.log(`\n💾 Informações salvas em: ${infoPath}`);
    console.log("\n🎉 PROCESSO COMPLETO! 🎉");
    
  } catch (error) {
    console.error("\n❌ ERRO:", error);
    if (error.logs) {
      console.log("\n📋 Logs:");
      error.logs.forEach((log, i) => console.log(`${i}: ${log}`));
    }
  }
}

// Executar
main();