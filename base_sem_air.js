// register_simple.js - Registro com swap SOL->DONUT
const {
    Connection,
    Keypair,
    PublicKey,
    SystemProgram,
    Transaction,
    TransactionInstruction,
    SYSVAR_RENT_PUBKEY,
  } = require("@solana/web3.js");
  const { AnchorProvider, Program, BN } = require("@coral-xyz/anchor");
  const fs = require("fs");
  
  // Endereços verificados da Meteora
  const VERIFIED_ADDRESSES = {
    // Pool Meteora
    POOL_ADDRESS: new PublicKey("FrQ5KsAgjCe3FFg6ZENri8feDft54tgnATxyffcasuxU"),
    
    // Vault A (DONUT)
    A_VAULT: new PublicKey("4ndfcH16GKY76bzDkKfyVwHMoF8oY75KES2VaAhUYksN"),
    A_VAULT_LP: new PublicKey("CocstBGbeDVyTJWxbWs4docwWapVADAo1xXQSh9RfPMz"),
    A_VAULT_LP_MINT: new PublicKey("6f2FVX5UT5uBtgknc8fDj119Z7DQoLJeKRmBq7j1zsVi"),
    A_TOKEN_VAULT: new PublicKey("6m1wvYoPrwjAnbuGMqpMoodQaq4VnZXRjrzufXnPSjmj"),
    
    // Vault B (SOL)
    B_VAULT_LP: new PublicKey("HJNs8hPTzs9i6AVFkRDDMFVEkrrUoV7H7LDZHdCWvxn7"),
    B_VAULT: new PublicKey("FERjPVNEa7Udq8CEv68h6tPL46Tq7ieE49HrE2wea3XT"),
    B_TOKEN_VAULT: new PublicKey("HZeLxbZ9uHtSpwZC3LBr4Nubd14iHwz7bRSghRZf5VCG"),
    B_VAULT_LP_MINT: new PublicKey("BvoAjwEDhpLzs3jtu4H72j96ShKT5rvZE9RP1vgpfSM"),
    
    // Tokens
    TOKEN_MINT: new PublicKey("F1vCKXMix75KigbwZUXkVU97NiE1H2ToopttH67ydqvq"), // DONUT
    WSOL_MINT: new PublicKey("So11111111111111111111111111111111111111112"),
    
    // Programas Meteora
    METEORA_VAULT_PROGRAM: new PublicKey("24Uqj9JCLxUeoC3hGfh5W3s9FM9uCHDS2SG3LYwBpyTi"),
    METEORA_AMM_PROGRAM: new PublicKey("Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB"),
    PROTOCOL_FEE_ACCOUNT: new PublicKey("FBSwbuckwK9cPU7zhCXL6HuQvWn8dAJBX46oRQonKQLa"),
  };
  
  // Programas do sistema
  const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
  
  // Função para carregar carteira
  function loadWallet(path) {
    const keypairData = JSON.parse(fs.readFileSync(path, 'utf8'));
    return Keypair.fromSecretKey(new Uint8Array(keypairData));
  }
  
  // Função para derivar ATA
  function getAssociatedTokenAddress(mint, owner) {
    const [address] = PublicKey.findProgramAddressSync(
      [
        owner.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
      ],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    return address;
  }
  
  // Função para criar instrução de criar ATA
  function createAssociatedTokenAccountInstruction(payer, ata, owner, mint) {
    return new TransactionInstruction({
      keys: [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: ata, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: false, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      programId: ASSOCIATED_TOKEN_PROGRAM_ID,
      data: Buffer.alloc(0),
    });
  }
  
  async function main() {
    console.log("🚀 TESTE DE REGISTRO COM SWAP SOL → DONUT 🚀");
    console.log("============================================");
  
    try {
      // Carregar configuração
      const configPath = "./simple-swap-config.json";
      if (!fs.existsSync(configPath)) {
        console.error("❌ Configuração não encontrada! Execute initialize_simple.js primeiro.");
        return;
      }
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      console.log("✅ Configuração carregada");
  
      // Carregar IDL
      const idl = JSON.parse(fs.readFileSync('./target/idl/simple_swap.json', 'utf8'));
  
      // Conectar à devnet
      const connection = new Connection("https://api.devnet.solana.com", 'confirmed');
      console.log("✅ Conectado à Devnet");
  
      // Carregar carteira do usuário (pode ser diferente do owner)
      const walletPath = process.argv[2] || "./carteiras/carteira1.json";
      const userWallet = loadWallet(walletPath);
      console.log(`👤 Usuário: ${userWallet.publicKey.toString()}`);
  
      // Carregar carteira do owner (para autorização)
      const ownerWallet = loadWallet("/Users/dark/.config/solana/id.json");
      console.log(`👑 Owner: ${ownerWallet.publicKey.toString()}`);
  
      // Verificar saldo do usuário
      const balance = await connection.getBalance(userWallet.publicKey);
      console.log(`💰 Saldo do usuário: ${balance / 1e9} SOL`);
  
      if (balance < 0.2 * 1e9) {
        console.error("❌ Saldo insuficiente! Precisa de pelo menos 0.2 SOL");
        return;
      }
  
      // Setup provider
      const provider = new AnchorProvider(
        connection,
        {
          publicKey: userWallet.publicKey,
          signTransaction: async (tx) => {
            tx.partialSign(userWallet);
            return tx;
          },
          signAllTransactions: async (txs) => {
            return txs.map((tx) => {
              tx.partialSign(userWallet);
              return tx;
            });
          },
        },
        { commitment: 'confirmed' }
      );
  
      // Inicializar programa
      const programId = new PublicKey(config.programId);
      const program = new Program(idl, programId, provider);
  
      // Derivar PDA do usuário
      const [userPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("user_account"), userWallet.publicKey.toBuffer()],
        programId
      );
      console.log(`📄 PDA do usuário: ${userPda.toString()}`);
  
      // Verificar se já está registrado
      try {
        const userAccount = await program.account.userAccount.fetch(userPda);
        if (userAccount.isRegistered) {
          console.log("❌ Usuário já está registrado!");
          return;
        }
      } catch {
        console.log("✅ Usuário não registrado, prosseguindo...");
      }
  
      // Criar/verificar WSOL ATA
      console.log("\n📋 PREPARANDO CONTA WSOL...");
      const userWsolAccount = getAssociatedTokenAddress(VERIFIED_ADDRESSES.WSOL_MINT, userWallet.publicKey);
      
      let wsolExists = false;
      try {
        const wsolInfo = await connection.getAccountInfo(userWsolAccount);
        if (wsolInfo) {
          wsolExists = true;
          console.log("✅ Conta WSOL já existe");
        }
      } catch {}
  
      if (!wsolExists) {
        console.log("📝 Criando conta WSOL...");
        const createWsolIx = createAssociatedTokenAccountInstruction(
          userWallet.publicKey,
          userWsolAccount,
          userWallet.publicKey,
          VERIFIED_ADDRESSES.WSOL_MINT
        );
        
        const tx = new Transaction().add(createWsolIx);
        const sig = await connection.sendTransaction(tx, [userWallet]);
        await connection.confirmTransaction(sig);
        console.log(`✅ Conta WSOL criada: ${sig}`);
      }
  
      // Criar/verificar DONUT ATA
      console.log("\n📋 PREPARANDO CONTA DONUT...");
      const userDonutAccount = getAssociatedTokenAddress(VERIFIED_ADDRESSES.TOKEN_MINT, userWallet.publicKey);
      
      let donutExists = false;
      try {
        const donutInfo = await connection.getAccountInfo(userDonutAccount);
        if (donutInfo) {
          donutExists = true;
          console.log("✅ Conta DONUT já existe");
        }
      } catch {}
  
      if (!donutExists) {
        console.log("📝 Criando conta DONUT...");
        const createDonutIx = createAssociatedTokenAccountInstruction(
          userWallet.publicKey,
          userDonutAccount,
          userWallet.publicKey,
          VERIFIED_ADDRESSES.TOKEN_MINT
        );
        
        const tx = new Transaction().add(createDonutIx);
        const sig = await connection.sendTransaction(tx, [userWallet]);
        await connection.confirmTransaction(sig);
        console.log(`✅ Conta DONUT criada: ${sig}`);
      }
  
      // Valor do depósito (0.1 SOL)
      const DEPOSIT_AMOUNT = 0.1 * 1e9;
      console.log(`\n💱 PREPARANDO SWAP DE ${DEPOSIT_AMOUNT / 1e9} SOL PARA DONUT...`);
  
      // Preparar remaining accounts (Vault A)
      const remainingAccounts = [
        { pubkey: VERIFIED_ADDRESSES.A_VAULT, isWritable: true, isSigner: false },
        { pubkey: VERIFIED_ADDRESSES.A_VAULT_LP, isWritable: true, isSigner: false },
        { pubkey: VERIFIED_ADDRESSES.A_VAULT_LP_MINT, isWritable: true, isSigner: false },
        { pubkey: VERIFIED_ADDRESSES.A_TOKEN_VAULT, isWritable: true, isSigner: false },
        // Dummy account para manter compatibilidade com o contrato original
        { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
      ];
  
      console.log("\n📤 Executando registro com swap...");
      
      try {
        // Criar a transação manualmente para ter controle total
        const instruction = await program.methods
          .registerWithoutReferrer(new BN(DEPOSIT_AMOUNT))
          .accounts({
            state: new PublicKey(config.stateAddress),
            owner: ownerWallet.publicKey, // Owner autoriza
            userWallet: userWallet.publicKey,
            user: userPda,
            userWsolAccount: userWsolAccount,
            userDonutAccount: userDonutAccount,
            wsolMint: VERIFIED_ADDRESSES.WSOL_MINT,
            pool: VERIFIED_ADDRESSES.POOL_ADDRESS,
            bVault: VERIFIED_ADDRESSES.B_VAULT,
            bTokenVault: VERIFIED_ADDRESSES.B_TOKEN_VAULT,
            bVaultLpMint: VERIFIED_ADDRESSES.B_VAULT_LP_MINT,
            bVaultLp: VERIFIED_ADDRESSES.B_VAULT_LP,
            vaultProgram: VERIFIED_ADDRESSES.METEORA_VAULT_PROGRAM,
            tokenMint: VERIFIED_ADDRESSES.TOKEN_MINT,
            protocolTokenFee: VERIFIED_ADDRESSES.PROTOCOL_FEE_ACCOUNT,
            ammProgram: VERIFIED_ADDRESSES.METEORA_AMM_PROGRAM,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .remainingAccounts(remainingAccounts)
          .instruction();
  
        const transaction = new Transaction().add(instruction);
        
        // Precisa de duas assinaturas: owner e user
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = userWallet.publicKey;
        
        // Assinar com ambas as carteiras
        transaction.partialSign(userWallet);
        transaction.partialSign(ownerWallet);
        
        const txid = await connection.sendRawTransaction(transaction.serialize());
        console.log(`⏳ Aguardando confirmação...`);
        
        await connection.confirmTransaction(txid);
        
        console.log("\n✅ REGISTRO CONCLUÍDO COM SUCESSO!");
        console.log(`📎 Transação: ${txid}`);
        console.log(`🔍 Explorer: https://explorer.solana.com/tx/${txid}?cluster=devnet`);
  
        // Verificar o registro
        console.log("\n📊 VERIFICANDO REGISTRO...");
        const userAccount = await program.account.userAccount.fetch(userPda);
        console.log(`✅ Registrado: ${userAccount.isRegistered}`);
        console.log(`👤 Wallet: ${userAccount.ownerWallet.toString()}`);
        console.log(`📅 Registro: ${new Date(userAccount.registrationTime * 1000).toLocaleString()}`);
  
        // Verificar saldo de DONUT
        try {
          const donutBalance = await connection.getTokenAccountBalance(userDonutAccount);
          console.log(`\n💎 Saldo DONUT: ${donutBalance.value.uiAmount} DONUT`);
          console.log("🎉 Swap SOL → DONUT realizado com sucesso!");
        } catch {
          console.log("⚠️ Não foi possível verificar saldo DONUT");
        }
  
      } catch (error) {
        console.error("\n❌ Erro durante o registro:", error);
        if (error.logs) {
          console.log("\n📋 Logs de erro:");
          error.logs.forEach((log, i) => console.log(`${i}: ${log}`));
        }
      }
  
    } catch (error) {
      console.error("❌ Erro geral:", error);
    }
  }
  
  main();