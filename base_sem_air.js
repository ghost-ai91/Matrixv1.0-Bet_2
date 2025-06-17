const anchor = require('@coral-xyz/anchor');
const { 
    Connection, 
    PublicKey, 
    Keypair, 
    SystemProgram, 
    SYSVAR_RENT_PUBKEY,
    Transaction,
    TransactionInstruction
} = require('@solana/web3.js');
const fs = require('fs');

async function main() {
    console.log("🚀 REGISTRANDO USUÁRIO BASE (COM CORREÇÃO METEORA) 🚀");
    console.log("=========================================================");
    console.log("🔄 Versão: Meteora Swap Corrigido");
    
    // Carregar carteira
    console.log("Carregando carteira de ./carteiras/carteira1.json...");
    const keyPairData = JSON.parse(fs.readFileSync('./carteiras/carteira1.json', 'utf8'));
    const wallet = Keypair.fromSecretKey(new Uint8Array(keyPairData));
    
    // Carregar IDL
    console.log("Carregando IDL...");
    const idl = JSON.parse(fs.readFileSync('./target/idl/referral_system.json', 'utf8'));
    
    // Carregar configuração
    console.log("Carregando configuração de ./matriz-config.json...");
    let config;
    try {
        config = JSON.parse(fs.readFileSync('./matriz-config.json', 'utf8'));
        console.log("✅ Configuração carregada com sucesso");
        console.log("🔄 Configuração sem mint detectada");
        console.log("🛡️ Proteção Reentrancy: ATIVA");
    } catch (error) {
        console.log("❌ Erro ao carregar configuração:", error.message);
        console.log("Execute primeiro: node ini_sem_air.js");
        return;
    }
    
    console.log("Conectando à Devnet");
    const connection = new Connection("https://api.devnet.solana.com", 'confirmed');
    
    // Setup do provider
    const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(wallet), {
        commitment: 'confirmed',
        preflightCommitment: 'confirmed',
    });
    anchor.setProvider(provider);
    
    // Inicializar programa
    const programId = new PublicKey(config.programId);
    const program = new anchor.Program(idl, programId, provider);
    
    // ENDEREÇOS CORRIGIDOS PARA METEORA
    // Pool e vault addresses - CORRECTED
    const POOL_ADDRESS = new PublicKey("FrQ5KsAgjCe3FFg6ZENri8feDft54tgnATxyffcasuxU");
    
    // Vault A addresses (DONUT) - CORRECTED
    const A_VAULT = new PublicKey("4ndfcH16GKY76bzDkKfyVwHMoF8oY75KES2VaAhUYksN");
    const A_VAULT_LP = new PublicKey("CocstBGbeDVyTJWxbWs4docwWapVADAo1xXQSh9RfPMz");
    const A_VAULT_LP_MINT = new PublicKey("6f2FVX5UT5uBtgknc8fDj119Z7DQoLJeKRmBq7j1zsVi");
    const A_TOKEN_VAULT = new PublicKey("6m1wvYoPrwjAnbuGMqpMoodQaq4VnZXRjrzufXnPSjmj");
    
    // Vault B addresses (SOL) - CORRECTED
    const B_VAULT = new PublicKey("FERjPVNEa7Udq8CEv68h6tPL46Tq7ieE49HrE2wea3XT");
    const B_TOKEN_VAULT = new PublicKey("HZeLxbZ9uHtSpwZC3LBr4Nubd14iHwz7bRSghRZf5VCG");
    const B_VAULT_LP_MINT = new PublicKey("BvoAjwEDhpLzs3jtu4H72j96ShKT5rvZE9RP1vgpfSM");
    const B_VAULT_LP = new PublicKey("HJNs8hPTzs9i6AVFkRDDMFVEkrrUoV7H7LDZHdCWvxn7");
    const VAULT_PROGRAM = new PublicKey("24Uqj9JCLxUeoC3hGfh5W3s9FM9uCHDS2SG3LYwBpyTi");
    
    // Chainlink addresses (Devnet)
    const CHAINLINK_PROGRAM = new PublicKey("HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny");
    const SOL_USD_FEED = new PublicKey("99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR");
    
    // Pool program
    const METEORA_POOL_PROGRAM = new PublicKey("Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB");
    
    // Programas do sistema
    const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
    const DONUT_MINT = new PublicKey("F1vCKXMix75KigbwZUXkVU97NiE1H2ToopttH67ydqvq");
    const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
    
    console.log(`👤 CARTEIRA DO USUÁRIO: ${wallet.publicKey.toString()}`);
    
    // Verificar saldo
    const balance = await connection.getBalance(wallet.publicKey);
    console.log(`💰 SALDO ATUAL: ${balance / 1e9} SOL`);
    
    // Usar o estado do programa da configuração
    const statePda = new PublicKey(config.stateAddress);
    
    // Verificar estado do programa
    console.log("\n🔍 VERIFICANDO ESTADO DO PROGRAMA...");
    try {
        const stateAccount = await program.account.programState.fetch(statePda);
        console.log("✅ ESTADO DO PROGRAMA VERIFICADO:");
        console.log(`👑 Owner: ${stateAccount.owner.toString()}`);
        console.log(`🆔 Próximo ID de upline: ${stateAccount.nextUplineId}`);
        console.log(`🆔 Próximo ID de chain: ${stateAccount.nextChainId}`);
        console.log(`🛡️ Estado do lock de reentrancy: ${stateAccount.isLocked ? 'LOCKED' : 'PRONTO'}`);
    } catch (error) {
        console.log("❌ Estado do programa não encontrado - erro:", error.message);
        return;
    }
    
    // Derivar PDA da conta do usuário
    console.log("\n🔍 DERIVANDO PDA DA CONTA DO USUÁRIO...");
    const [userPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("user_account"), wallet.publicKey.toBuffer()],
        programId
    );
    console.log(`📄 PDA da conta do usuário: ${userPda.toString()}`);
    
    // Verificar se o usuário já está registrado
    try {
        const userAccount = await program.account.userAccount.fetch(userPda);
        if (userAccount.isRegistered) {
            console.log("❌ Usuário já está registrado!");
            return;
        }
    } catch (error) {
        console.log("✅ Usuário ainda não registrado, prosseguindo...");
    }
    
    // Calcular ATA para tokens DONUT (função manual)
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
    
    console.log("\n🔍 DERIVANDO ATA PARA TOKENS DONUT...");
    const userTokenAccount = getAssociatedTokenAddress(DONUT_MINT, wallet.publicKey);
    console.log(`🪙 ATA do usuário para DONUT: ${userTokenAccount.toString()}`);
    
    // Verificar se a ATA já existe, se não, criar
    console.log("\n🔍 VERIFICANDO E CRIANDO ATA PARA DONUT...");
    try {
        const ataInfo = await connection.getAccountInfo(userTokenAccount);
        if (!ataInfo) {
            console.log("📝 ATA não existe, criando...");
            
            const createATAIx = new TransactionInstruction({
                keys: [
                    { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
                    { pubkey: userTokenAccount, isSigner: false, isWritable: true },
                    { pubkey: wallet.publicKey, isSigner: false, isWritable: false },
                    { pubkey: DONUT_MINT, isSigner: false, isWritable: false },
                    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
                    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
                    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
                ],
                programId: ASSOCIATED_TOKEN_PROGRAM_ID,
                data: Buffer.alloc(0),
            });
            
            const ataTransaction = new Transaction().add(createATAIx);
            const ataSignature = await connection.sendTransaction(ataTransaction, [wallet]);
            await connection.confirmTransaction(ataSignature);
            
            console.log(`✅ ATA criada: ${ataSignature}`);
            console.log(`🔍 Link: https://explorer.solana.com/tx/${ataSignature}?cluster=devnet`);
        } else {
            console.log("✅ ATA já existe");
        }
    } catch (error) {
        console.log(`❌ Erro ao verificar/criar ATA: ${error.message}`);
        return;
    }
    
    // Gerar keypair para conta WSOL temporária
    const wsolKeypair = Keypair.generate();
    console.log(`🔑 Nova keypair para conta WSOL gerada: ${wsolKeypair.publicKey.toString()}`);
    
    // Valores de configuração
    const DEPOSIT_AMOUNT = 100_000_000; // 0.1 SOL em lamports
    const WSOL_ACCOUNT_RENT = 2039280; // Rent para conta WSOL
    const TOTAL_AMOUNT = DEPOSIT_AMOUNT + WSOL_ACCOUNT_RENT;
    
    console.log(`\n📋 ETAPA 1: CRIAR E FINANCIAR CONTA WSOL TEMPORÁRIA`);
    console.log(`💰 Aluguel para conta WSOL: ${WSOL_ACCOUNT_RENT / 1e9} SOL`);
    console.log(`💰 Depósito para swap: ${DEPOSIT_AMOUNT / 1e9} SOL`);
    console.log(`💰 Total a ser transferido: ${TOTAL_AMOUNT / 1e9} SOL`);
    console.log(`🔄 Valor será usado para swap WSOL -> DONUT`);
    
    // Criar conta WSOL manualmente
    try {
        console.log(`📤 Enviando transação para criar conta WSOL...`);
        
        const createAccountIx = SystemProgram.createAccount({
            fromPubkey: wallet.publicKey,
            newAccountPubkey: wsolKeypair.publicKey,
            lamports: TOTAL_AMOUNT,
            space: 165, // Tamanho da conta de token
            programId: TOKEN_PROGRAM_ID,
        });
        
        const initAccountIx = new TransactionInstruction({
            keys: [
                { pubkey: wsolKeypair.publicKey, isSigner: false, isWritable: true },
                { pubkey: WSOL_MINT, isSigner: false, isWritable: false },
                { pubkey: wallet.publicKey, isSigner: false, isWritable: false },
                { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
            ],
            programId: TOKEN_PROGRAM_ID,
            data: Buffer.from([1]), // InitializeAccount instruction
        });
        
        const syncNativeIx = new TransactionInstruction({
            keys: [
                { pubkey: wsolKeypair.publicKey, isSigner: false, isWritable: true },
            ],
            programId: TOKEN_PROGRAM_ID,
            data: Buffer.from([17]), // SyncNative instruction
        });
        
        const transaction = new Transaction()
            .add(createAccountIx)
            .add(initAccountIx)
            .add(syncNativeIx);
        
        const signature = await connection.sendTransaction(transaction, [wallet, wsolKeypair]);
        await connection.confirmTransaction(signature);
        
        console.log(`✅ Transação enviada: ${signature}`);
        console.log(`🔍 Link para explorador: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
        console.log(`✅ Conta WSOL criada e financiada!`);
        console.log(`💰 Saldo da conta WSOL: ${DEPOSIT_AMOUNT / 1e9} SOL`);
    } catch (error) {
        console.log(`❌ ERRO AO CRIAR CONTA WSOL:`, error);
        return;
    }
    
    console.log(`\n📋 ETAPA 2: EXECUTAR REGISTRO DO USUÁRIO BASE COM SWAP`);
    
    // Configurar remaining accounts
    console.log(`\n🔍 CONFIGURANDO REMAINING_ACCOUNTS:`);
    console.log(`  ✓ SOL_USD_FEED: ${SOL_USD_FEED.toString()}`);
    console.log(`  ✓ CHAINLINK_PROGRAM: ${CHAINLINK_PROGRAM.toString()}`);
    
    console.log(`\n📤 Enviando transação de registro com swap...`);
    console.log(`🔄 O depósito será automaticamente trocado por DONUT...`);
    
    try {
        // EXECUTAR REGISTRO COM SWAP CORRIGIDO
        const txid = await program.methods
            .registerWithoutReferrer(new anchor.BN(DEPOSIT_AMOUNT))
            .accounts({
                state: statePda,
                owner: wallet.publicKey,
                userWallet: wallet.publicKey,
                user: userPda,
                userWsolAccount: wsolKeypair.publicKey,
                userTokenAccount: userTokenAccount,
                wsolMint: WSOL_MINT,
                pool: POOL_ADDRESS,
                // CORRECTED: Meteora vault accounts
                aVault: A_VAULT,
                bVault: B_VAULT,
                aTokenVault: A_TOKEN_VAULT,
                bTokenVault: B_TOKEN_VAULT,
                aVaultLpMint: A_VAULT_LP_MINT,
                bVaultLpMint: B_VAULT_LP_MINT,
                aVaultLp: A_VAULT_LP,
                bVaultLp: B_VAULT_LP,
                vaultProgram: VAULT_PROGRAM,
                poolProgram: METEORA_POOL_PROGRAM,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                rent: SYSVAR_RENT_PUBKEY,
            })
            .remainingAccounts([
                {
                    pubkey: SOL_USD_FEED,
                    isWritable: false,
                    isSigner: false,
                },
                {
                    pubkey: CHAINLINK_PROGRAM,
                    isWritable: false,
                    isSigner: false,
                },
            ])
            .rpc();
        
        console.log(`✅ REGISTRO CONCLUÍDO COM SUCESSO!`);
        console.log(`🔗 Transação: ${txid}`);
        console.log(`🔍 Link para explorador: https://explorer.solana.com/tx/${txid}?cluster=devnet`);
        console.log(`🪙 WSOL trocado por DONUT no Meteora`);
        
        // Verificar conta do usuário
        console.log(`\n🔍 VERIFICANDO CONTA DO USUÁRIO REGISTRADO...`);
        const userAccount = await program.account.userAccount.fetch(userPda);
        console.log(`✅ Usuário registrado: ${userAccount.isRegistered}`);
        console.log(`👤 Owner wallet: ${userAccount.ownerWallet.toString()}`);
        console.log(`🆔 Upline ID: ${userAccount.upline.id}`);
        console.log(`📊 Profundidade: ${userAccount.upline.depth}`);
        console.log(`🔗 Chain ID: ${userAccount.chain.id}`);
        console.log(`📈 Slots preenchidos: ${userAccount.chain.filledSlots}/3`);
        
        console.log(`\n🎉 USUÁRIO BASE REGISTRADO COM SUCESSO!`);
        console.log(`💎 Sistema Matrix ativo e funcionando`);
        console.log(`🔄 Próximos usuários podem usar este como referrer`);
        
    } catch (error) {
        console.log(`\n❌ ERRO DURANTE O REGISTRO:`);
        console.error(error);
        
        if (error.logs) {
            console.log(`\n📋 LOGS DE ERRO:`);
            error.logs.forEach((log, index) => {
                console.log(`${index}: ${log}`);
            });
        }
    }
}

main().catch(console.error);