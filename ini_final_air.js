// inicializacao_v3_aligned.js - Alinhado com o contrato atual
// Script para inicializar o contrato com sistema de airdrop de 36 semanas

const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} = require("@solana/web3.js")
const { AnchorProvider, Program } = require("@coral-xyz/anchor")
const fs = require("fs")
const path = require("path")

// Receber parâmetros da linha de comando
const args = process.argv.slice(2)
const walletPath = args[0] || "/Users/dark/.config/solana/id.json"
const configOutputPath = args[1] || "./matriz-airdrop-config.json"

// Carregue seu IDL compilado
const idl = require("./target/idl/referral_system.json")

// ===== CONFIGURAÇÕES PRINCIPAIS - ALINHADAS COM O CONTRATO =====
const PROGRAM_ID = new PublicKey("CdKkHpRhewe3wJFpbouuQog5xTURycGgsyhyb7wjAVCv")

// Token addresses - DO CONTRATO
const TOKEN_MINT = new PublicKey("F1vCKXMix75KigbwZUXkVU97NiE1H2ToopttH67ydqvq")
const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112")

// Admin addresses - DO CONTRATO
const MULTISIG_TREASURY = new PublicKey("QgNN4aW9hPz4ANP1LqzR2FkDPZo9MzDZxDQ4abovHYv")
const AUTHORIZED_INITIALIZER = new PublicKey("QgNN4aW9hPz4ANP1LqzR2FkDPZo9MzDZxDQ4abovHYv")

// Program vault - DERIVADO
const PROGRAM_TOKEN_VAULT = new PublicKey("6JvVz3dMmVRCQ216tzdo3iQvfiMwLy59oWyTo8hwWSsQ")

// Programas do sistema
const SPL_TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
const SYSVAR_RENT_PUBKEY = new PublicKey("SysvarRent111111111111111111111111111111111")

// Função para carregar uma carteira a partir de um arquivo
function loadWalletFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo de carteira não encontrado: ${filePath}`)
  }
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(filePath, "utf-8")))
  )
}

// Função para formatar valores de token com 9 casas decimais
function formatTokenAmount(amount) {
  if (amount === 0) return "0"
  const amountStr = amount.toString().padStart(10, "0")
  const decimalPos = amountStr.length - 9
  const integerPart = amountStr.substring(0, decimalPos) || "0"
  const decimalPart = amountStr.substring(decimalPos)
  return `${integerPart}.${decimalPart}`
}

// Função para criar uma ATA usando instruções low-level
async function createAssociatedTokenAccountInstruction(
  payer,
  associatedToken,
  owner,
  mint
) {
  return new TransactionInstruction({
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      {
        pubkey: SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: SPL_TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: SYSVAR_RENT_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
    ],
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    data: Buffer.from([]),
  })
}

async function main() {
  try {
    console.log("🚀 INICIALIZANDO PROGRAMA DE MATRIZ COM SISTEMA DE AIRDROP 🚀")
    console.log("===========================================================")
    console.log(`Program ID: ${PROGRAM_ID.toString()}`)
    console.log(`Token Mint: ${TOKEN_MINT.toString()}`)
    console.log(`Multisig Treasury: ${MULTISIG_TREASURY.toString()}`)
    console.log(`Authorized Initializer: ${AUTHORIZED_INITIALIZER.toString()}`)
    console.log("🎯 Versão: AIRDROP SYSTEM v3.0")
    console.log("🔥 Modelo: DEFLATIONARY (Swap + Burn)")

    // Conectar à devnet/mainnet
    const connection = new Connection(
      "https://api.devnet.solana.com", // Ajuste para mainnet se necessário
      "confirmed"
    )
    console.log("Conectando à rede...")

    // Carregar carteira
    let walletKeypair
    try {
      walletKeypair = loadWalletFromFile(walletPath)
      console.log("👤 Endereço da carteira: " + walletKeypair.publicKey.toString())
    } catch (e) {
      console.error(`❌ Erro ao carregar carteira: ${e.message}`)
      return
    }

    // Verificar se é o inicializador autorizado
    if (!walletKeypair.publicKey.equals(AUTHORIZED_INITIALIZER)) {
      console.error("❌ ERRO: Apenas o inicializador autorizado pode executar este script!")
      console.error(`Esperado: ${AUTHORIZED_INITIALIZER.toString()}`)
      console.error(`Fornecido: ${walletKeypair.publicKey.toString()}`)
      return
    }

    // Verificar saldo da carteira
    const balance = await connection.getBalance(walletKeypair.publicKey)
    console.log(`💰 Saldo: ${balance / 1_000_000_000} SOL`)

    if (balance < 0.1 * 1_000_000_000) {
      console.warn("⚠️ Saldo baixo! Recomendamos pelo menos 0.1 SOL para a inicialização.")
      return
    }

    // Configurar o provider com a carteira
    const provider = new AnchorProvider(
      connection,
      {
        publicKey: walletKeypair.publicKey,
        signTransaction: async (tx) => {
          tx.partialSign(walletKeypair)
          return tx
        },
        signAllTransactions: async (txs) => {
          return txs.map((tx) => {
            tx.partialSign(walletKeypair)
            return tx
          })
        },
      },
      { commitment: "confirmed" }
    )

    // Inicializar o programa
    const program = new Program(idl, PROGRAM_ID, provider)

    // Gerar um novo keypair para o estado
    const stateKeypair = Keypair.generate()
    console.log("🔑 Novo endereço de estado: " + stateKeypair.publicKey.toString())

    // Inicializar o estado do programa
    console.log("\n📝 INICIALIZANDO ESTADO DO PROGRAMA...")

    try {
      const tx = await program.methods
        .initialize()
        .accounts({
          state: stateKeypair.publicKey,
          owner: walletKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([stateKeypair])
        .rpc()

      console.log("✅ PROGRAMA INICIALIZADO COM SUCESSO: " + tx)
      console.log(`🔍 Link para explorador: https://explorer.solana.com/tx/${tx}?cluster=devnet`)

      // Verificar informações do estado
      const stateInfo = await program.account.programState.fetch(
        stateKeypair.publicKey
      )
      
      console.log("\n📊 INFORMAÇÕES DO ESTADO:")
      console.log("👑 Owner: " + stateInfo.owner.toString())
      console.log("🏦 Multisig Treasury: " + stateInfo.multisigTreasury.toString())
      console.log("🔢 Próximo ID de upline: " + stateInfo.nextUplineId.toString())
      console.log("🔢 Próximo ID de chain: " + stateInfo.nextChainId.toString())
      console.log("🔒 Is Locked: " + (stateInfo.isLocked ? "SIM" : "NÃO"))

      console.log("\n🎯 CONFIGURAÇÕES DO SISTEMA DE AIRDROP:")
      console.log("📅 Semana atual: " + stateInfo.currentWeek.toString())
      console.log("🎲 Airdrop ativo: " + (stateInfo.airdropActive ? "SIM" : "NÃO"))
      console.log("📊 Matrizes esta semana: " + stateInfo.totalMatricesThisWeek.toString())
      
      const startDate = new Date(stateInfo.programStartTimestamp.toNumber() * 1000)
      console.log("⏰ Início do programa: " + startDate.toLocaleString())
      console.log("📜 Semanas fechadas: " + stateInfo.closedWeeks.length)

      // Verificar PDAs importantes
      console.log("\n🔑 PDAS IMPORTANTES:")

      // PDA para vault de SOL
      const [programSolVault, programSolVaultBump] =
        PublicKey.findProgramAddressSync(
          [Buffer.from("program_sol_vault")],
          PROGRAM_ID
        )
      console.log(
        "💰 PDA do Vault de SOL: " +
          programSolVault.toString() +
          " (Bump: " +
          programSolVaultBump +
          ")"
      )

      // PDA para autoridade do vault de tokens
      const [vaultAuthority, vaultAuthorityBump] =
        PublicKey.findProgramAddressSync(
          [Buffer.from("token_vault_authority")],
          PROGRAM_ID
        )
      console.log(
        "🔑 PDA do Vault Authority: " +
          vaultAuthority.toString() +
          " (Bump: " +
          vaultAuthorityBump +
          ")"
      )

      console.log("💎 Program Token Vault (ATA): " + PROGRAM_TOKEN_VAULT.toString())

      // Verificar se a ATA já existe
      try {
        const ataInfo = await connection.getAccountInfo(PROGRAM_TOKEN_VAULT)
        if (ataInfo) {
          console.log("✅ Vault de tokens já existe!")

          // Verificar saldo da ATA
          try {
            const tokenBalance = await connection.getTokenAccountBalance(
              PROGRAM_TOKEN_VAULT
            )
            console.log(
              `💎 Saldo de tokens no vault: ${formatTokenAmount(tokenBalance.value.amount)} DONUT`
            )
          } catch (e) {
            console.log(`⚠️ Erro ao verificar saldo de tokens: ${e.message}`)
          }
        } else {
          console.log("⚠️ Vault de tokens ainda não foi criado")
          console.log("💡 Criando vault de tokens...")

          try {
            const createAtaIx = await createAssociatedTokenAccountInstruction(
              walletKeypair.publicKey,
              PROGRAM_TOKEN_VAULT,
              vaultAuthority,
              TOKEN_MINT
            )

            const ataTx = new Transaction().add(createAtaIx)
            ataTx.feePayer = walletKeypair.publicKey
            const { blockhash } = await connection.getLatestBlockhash()
            ataTx.recentBlockhash = blockhash

            const signedTx = await provider.wallet.signTransaction(ataTx)
            const txid = await connection.sendRawTransaction(signedTx.serialize())

            console.log("⏳ Aguardando confirmação...")
            await connection.confirmTransaction(txid)
            console.log("✅ Vault criado: " + txid)
            console.log(`🔍 Link: https://explorer.solana.com/tx/${txid}?cluster=devnet`)
          } catch (e) {
            console.log("⚠️ Erro ao criar vault: " + e.message)
          }
        }
      } catch (e) {
        console.log("⚠️ Erro ao verificar vault: " + e.message)
      }

      // Gravar configuração
      const configData = {
        // Informações do programa
        programId: PROGRAM_ID.toString(),
        stateAddress: stateKeypair.publicKey.toString(),
        statePrivateKey: Array.from(stateKeypair.secretKey),
        
        // Tokens
        tokenMint: TOKEN_MINT.toString(),
        wsolMint: WSOL_MINT.toString(),
        
        // Wallets
        ownerWallet: walletKeypair.publicKey.toString(),
        multisigTreasury: MULTISIG_TREASURY.toString(),
        
        // PDAs
        programSolVault: programSolVault.toString(),
        programSolVaultBump,
        vaultAuthority: vaultAuthority.toString(),
        vaultAuthorityBump,
        programTokenVault: PROGRAM_TOKEN_VAULT.toString(),
        
        // Sistema de airdrop
        systemVersion: "airdrop-v3.0",
        airdropActive: stateInfo.airdropActive,
        currentWeek: stateInfo.currentWeek.toString(),
        programStartTimestamp: stateInfo.programStartTimestamp.toString(),
        totalWeeks: 36,
        
        // Features
        hasReentrancyProtection: true,
        hasOverflowProtection: true,
        hasStrictValidation: true,
        hasAirdropSystem: true,
        hasDeflationary: true,
        
        // Endereços verificados (do contrato)
        verifiedAddresses: {
          poolAddress: "FrQ5KsAgjCe3FFg6ZENri8feDft54tgnATxyffcasuxU",
          aVault: "4ndfcH16GKY76bzDkKfyVwHMoF8oY75KES2VaAhUYksN",
          aVaultLp: "CocstBGbeDVyTJWxbWs4docwWapVADAo1xXQSh9RfPMz",
          aVaultLpMint: "6f2FVX5UT5uBtgknc8fDj119Z7DQoLJeKRmBq7j1zsVi",
          aTokenVault: "6m1wvYoPrwjAnbuGMqpMoodQaq4VnZXRjrzufXnPSjmj",
          bVault: "FERjPVNEa7Udq8CEv68h6tPL46Tq7ieE49HrE2wea3XT",
          bVaultLp: "HJNs8hPTzs9i6AVFkRDDMFVEkrrUoV7H7LDZHdCWvxn7",
          bTokenVault: "HZeLxbZ9uHtSpwZC3LBr4Nubd14iHwz7bRSghRZf5VCG",
          bVaultLpMint: "BvoAjwEDhpLzs3jtu4H72j96ShKT5rvZE9RP1vgpfSM",
          meteoraVaultProgram: "24Uqj9JCLxUeoC3hGfh5W3s9FM9uCHDS2SG3LYwBpyTi",
          meteoraAmmProgram: "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB",
          protocolTokenAFee: "2B6tLDfiQAMSPAKuHqRMvhuQ5dRKDWkYF6m7ggtzmCY5",
          protocolTokenBFee: "88fLv3iEY7ubFCjwCzfzA7FsPG8xSBFicSPS8T8fX4Kq",
          chainlinkProgram: "HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny",
          solUsdFeed: "99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR",
        },
        
        // Timestamp de criação
        createdAt: new Date().toISOString(),
      }

      // Salvar configuração
      const configDir = path.dirname(configOutputPath)
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
      }

      fs.writeFileSync(
        configOutputPath,
        JSON.stringify(configData, null, 2)
      )
      console.log(`\n💾 Configuração salva em ${configOutputPath}`)

      console.log("\n⚠️ IMPORTANTE: GUARDE ESTES ENDEREÇOS!")
      console.log("🔑 PROGRAMA: " + PROGRAM_ID.toString())
      console.log("🔑 ESTADO: " + stateKeypair.publicKey.toString())
      console.log("🔑 TOKEN VAULT: " + PROGRAM_TOKEN_VAULT.toString())

      console.log("\n📋 PRÓXIMOS PASSOS:")
      console.log("1. Execute o script de registro de usuário base")
      console.log("2. Execute scripts de registro com referenciador")
      console.log("3. Use claim_airdrop para coletar rewards")
      console.log("4. Monitore o sistema com as funções de consulta")

    } catch (error) {
      console.error("❌ ERRO AO INICIALIZAR:", error)

      if (error.logs) {
        console.log("\n📋 LOGS DE ERRO:")
        error.logs.forEach((log, i) => console.log(`${i}: ${log}`))
      }
    }
  } catch (error) {
    console.error("❌ ERRO GERAL:", error)
  } finally {
    process.exit(0)
  }
}

main()