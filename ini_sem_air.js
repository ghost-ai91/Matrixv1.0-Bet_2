// inicializacao.js - SWAP VERSION
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
const walletPath = args[0] || "/Users/dark/.config/solana/id.json" // Caminho padrão se não for fornecido
const configOutputPath = args[1] || "./matriz-config.json"

// Carregue seu IDL compilado
const idl = require("./target/idl/referral_system.json")

// Configurações principais - UPDATED for swap version
const PROGRAM_ID = new PublicKey(
  "4rB7DjRhDzGzeTmvWZFpe8h4yktL9xJTsrunGtErrjv3"
)
const TOKEN_MINT = new PublicKey(
  "CCTG4ZmGa9Nk9NVxbd1FXBNyKjyHSapuF9aU6zgcA3xz"
)
const SPL_TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
)
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
)
const SYSVAR_RENT_PUBKEY = new PublicKey(
  "SysvarRent111111111111111111111111111111111"
)
const MULTISIG_TREASURY = new PublicKey(
  "QgNN4aW9hPz4ANP1LqzR2FkDPZo9MzDZxDQ4abovHYv"
)

// SWAP ADDRESSES
const METEORA_AMM_PROGRAM = new PublicKey(
  "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB"
)
const PROTOCOL_FEE_ACCOUNT = new PublicKey(
  "FBSwbuckwK9cPU7zhCXL6HuQvWn8dAJBX46oRQonKQLa"
)

// Use the verified program token vault address
const PROGRAM_TOKEN_VAULT = new PublicKey(
  "6vcd7cv4tsqCmL1wFKe6H3ThCEgrpwfYFSiNyEWRFAp9"
)

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

// Função para calcular a ATA usando o método low-level como no script ata.js
async function findAssociatedTokenAddress(owner, mint) {
  const seeds = [
    owner.toBuffer(),
    SPL_TOKEN_PROGRAM_ID.toBuffer(),
    mint.toBuffer(),
  ]

  const [address] = PublicKey.findProgramAddressSync(
    seeds,
    ASSOCIATED_TOKEN_PROGRAM_ID
  )

  return address
}

// Função para criar uma ATA usando instruções low-level, como no script ata.js
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
    console.log(
      "🚀 INICIALIZANDO PROGRAMA DE MATRIZ COM SWAP WSOL/DONUT 🚀"
    )
    console.log(
      "================================================================="
    )
    console.log(`Usando arquivo de carteira: ${walletPath}`)
    console.log(`Multisig Treasury: ${MULTISIG_TREASURY.toString()}`)
    console.log("💱 Versão: SWAP Enhanced (WSOL → DONUT)")

    // Conectar à devnet
    const connection = new Connection(
      "https://weathered-quiet-theorem.solana-devnet.quiknode.pro/198997b67cb51804baeb34ed2257274aa2b2d8c0",
      "confirmed"
    )
    console.log("Conectando à Devnet")

    // Carregar carteira
    let walletKeypair
    try {
      walletKeypair = loadWalletFromFile(walletPath)
      console.log(
        "👤 Endereço da carteira: " +
          walletKeypair.publicKey.toString()
      )
    } catch (e) {
      console.error(`❌ Erro ao carregar carteira: ${e.message}`)
      return
    }

    // Verificar saldo da carteira
    const balance = await connection.getBalance(
      walletKeypair.publicKey
    )
    console.log(`💰 Saldo: ${balance / 1_000_000_000} SOL`)

    if (balance < 1_000_000_000) {
      console.warn(
        "⚠️ Saldo baixo! Recomendamos pelo menos 1 SOL para a inicialização."
      )
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
    console.log(
      "🔑 Novo endereço de estado: " +
        stateKeypair.publicKey.toString()
    )

    // Inicializar o estado do programa
    console.log("\n📝 INICIALIZANDO ESTADO DO PROGRAMA COM SWAP...")

    try {
      // Initialize com is_locked = false
      const tx = await program.methods
        .initialize()
        .accounts({
          state: stateKeypair.publicKey,
          owner: walletKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([stateKeypair])
        .rpc()

      console.log("✅ PROGRAMA COM SWAP INICIALIZADO COM SUCESSO: " + tx)
      console.log(
        `🔍 Link para explorador: https://explorer.solana.com/tx/${tx}?cluster=devnet`
      )

      // Verificar informações do estado
      const stateInfo = await program.account.programState.fetch(
        stateKeypair.publicKey
      )
      console.log("\n📊 INFORMAÇÕES DO ESTADO DA MATRIZ:")
      console.log("👑 Owner: " + stateInfo.owner.toString())
      console.log(
        "🏦 Multisig Treasury: " +
          stateInfo.multisigTreasury.toString()
      )
      console.log(
        "🆔 Próximo ID de upline: " +
          stateInfo.nextUplineId.toString()
      )
      console.log(
        "🆔 Próximo ID de chain: " + stateInfo.nextChainId.toString()
      )

      // Check is_locked field
      if (stateInfo.isLocked !== undefined) {
        console.log(
          "🛡️ Proteção Reentrancy: " + (stateInfo.isLocked ? "ATIVADA" : "PRONTA")
        )
        if (stateInfo.isLocked) {
          console.log("⚠️ AVISO: Estado inicializado com lock ativo - isso não deveria acontecer!")
        } else {
          console.log("✅ Estado inicializado corretamente sem lock")
        }
      }

      // Exibir o valor do last_mint_amount
      if (stateInfo.lastMintAmount !== undefined) {
        const lastMintValue = Number(
          stateInfo.lastMintAmount.toString()
        )
        console.log(
          `🔒 Limitador de Mintagem (último valor): ${lastMintValue} (${formatTokenAmount(lastMintValue)} DONUT)`
        )
        console.log(
          `ℹ️ Nota: O primeiro mint não terá limite (valor inicial = 0)`
        )
      }

      // Verificar PDAs necessárias para integração
      console.log("\n🔑 PDAS PARA INTEGRAÇÃO COM SWAP:")

      // PDA para autoridade de mintagem
      const [tokenMintAuthority, tokenMintAuthorityBump] =
        PublicKey.findProgramAddressSync(
          [Buffer.from("token_mint_authority")],
          PROGRAM_ID
        )
      console.log(
        "🔑 PDA Mint Authority: " +
          tokenMintAuthority.toString() +
          " (Bump: " +
          tokenMintAuthorityBump +
          ")"
      )

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

      // Use verified program token vault address
      console.log(
        "💰 Vault de Tokens (VERIFICADO): " + PROGRAM_TOKEN_VAULT.toString()
      )
      console.log("🛡️ Endereço hardcoded no contrato para prevenir ataques")

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
              `💎 Saldo de tokens no vault: ${tokenBalance.value.uiAmount} DONUT`
            )
          } catch (e) {
            console.log(
              `⚠️ Erro ao verificar saldo de tokens: ${e.message}`
            )
          }
        } else {
          console.log("⚠️ Vault de tokens ainda não foi criado")
          console.log("💡 Criando vault...")

          // Verify it matches the hardcoded address
          const derivedATA = await findAssociatedTokenAddress(
            vaultAuthority,
            TOKEN_MINT
          )
          
          if (!derivedATA.equals(PROGRAM_TOKEN_VAULT)) {
            console.log("❌ ERRO CRÍTICO: Endereço ATA derivado não confere com o hardcoded!")
            console.log(`Derivado: ${derivedATA.toString()}`)
            console.log(`Hardcoded: ${PROGRAM_TOKEN_VAULT.toString()}`)
            console.log("🛡️ Isso indica um problema de segurança - abortando!")
            return
          }
          
          console.log("✅ Verificação de segurança passou - endereços conferem")

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

            // Assinar e enviar a transação
            const signedTx = await provider.wallet.signTransaction(ataTx)
            const txid = await connection.sendRawTransaction(
              signedTx.serialize()
            )

            // Aguardar a confirmação da transação
            console.log("⏳ Aguardando confirmação da transação...")
            await connection.confirmTransaction(txid)
            console.log("✅ Vault criado: " + txid)
            console.log(
              `🔍 Link para explorador: https://explorer.solana.com/tx/${txid}?cluster=devnet`
            )

            // Verificar se a conta foi criada com sucesso
            const newAccountInfo = await connection.getAccountInfo(PROGRAM_TOKEN_VAULT)
            if (newAccountInfo) {
              console.log(
                "✅ Verificação confirmada: Vault criado com sucesso"
              )
              console.log(
                "📊 Tamanho da conta: " +
                  newAccountInfo.data.length +
                  " bytes"
              )
              console.log(
                "👤 Proprietário da conta: " +
                  newAccountInfo.owner.toString()
              )
            } else {
              console.log(
                "❌ ERRO: Não foi possível verificar a criação do vault"
              )
            }
          } catch (e) {
            console.log("⚠️ Erro ao criar vault: " + e.message)
            console.log(
              "Por favor, tente usar o script 'ata.js' separadamente para criar a ATA."
            )
          }
        }
      } catch (e) {
        console.log("⚠️ Erro ao verificar vault: " + e.message)
      }

      // Exibir informações do swap
      console.log("\n💱 INFORMAÇÕES DO SWAP METEORA:")
      console.log("🏛️ AMM Program: " + METEORA_AMM_PROGRAM.toString())
      console.log("💸 Protocol Fee Account: " + PROTOCOL_FEE_ACCOUNT.toString())
      console.log("📊 Pool Address: FrQ5KsAgjCe3FFg6ZENri8feDft54tgnATxyffcasuxU")
      console.log("💰 Token A (DONUT): CCTG4ZmGa9Nk9NVxbd1FXBNyKjyHSapuF9aU6zgcA3xz")
      console.log("💱 Token B (WSOL): So11111111111111111111111111111111111111112")

      // Gravar todas as informações importantes em um arquivo de configuração
      const configData = {
        programId: PROGRAM_ID.toString(),
        stateAddress: stateKeypair.publicKey.toString(),
        statePrivateKey: Array.from(stateKeypair.secretKey),
        tokenMint: TOKEN_MINT.toString(),
        tokenMintAuthority: tokenMintAuthority.toString(),
        tokenMintAuthorityBump,
        programSolVault: programSolVault.toString(),
        programSolVaultBump,
        vaultAuthority: vaultAuthority.toString(),
        vaultAuthorityBump,
        programTokenVault: PROGRAM_TOKEN_VAULT.toString(),
        ownerWallet: walletKeypair.publicKey.toString(),
        multisigTreasury: MULTISIG_TREASURY.toString(),
        lastMintAmount:
          stateInfo.lastMintAmount !== undefined
            ? stateInfo.lastMintAmount.toString()
            : "0",
        // SWAP INFO
        swapVersion: "wsol-to-donut",
        meteoraAmmProgram: METEORA_AMM_PROGRAM.toString(),
        protocolFeeAccount: PROTOCOL_FEE_ACCOUNT.toString(),
        poolAddress: "FrQ5KsAgjCe3FFg6ZENri8feDft54tgnATxyffcasuxU",
        hasSwapIntegration: true,
        contractVersion: "swap-enhanced-v1.0",
      }

      // Criar diretório para o arquivo de configuração se não existir
      const configDir = path.dirname(configOutputPath)
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
      }

      fs.writeFileSync(
        configOutputPath,
        JSON.stringify(configData, null, 2)
      )
      console.log(`\n💾 Configuração salva em ${configOutputPath}`)

      console.log(
        "\n⚠️ IMPORTANTE: GUARDE ESTES ENDEREÇOS PARA USO FUTURO!"
      )
      console.log("🔑 ENDEREÇO DO PROGRAMA: " + PROGRAM_ID.toString())
      console.log(
        "🔑 ESTADO DO PROGRAMA: " + stateKeypair.publicKey.toString()
      )
      console.log(
        "🔑 OWNER DO PROGRAMA: " + walletKeypair.publicKey.toString()
      )
      console.log(
        "🏦 MULTISIG TREASURY: " + MULTISIG_TREASURY.toString()
      )
      console.log(
        "🔑 PDA MINT AUTHORITY: " + tokenMintAuthority.toString()
      )
      console.log("🔑 PDA SOL VAULT: " + programSolVault.toString())
      console.log(
        "🔑 PDA VAULT AUTHORITY: " + vaultAuthority.toString()
      )
      console.log(
        "🔑 VAULT DE TOKENS: " + PROGRAM_TOKEN_VAULT.toString()
      )

      // Informações sobre o swap
      console.log("\n💱 RECURSOS DE SWAP ATIVADOS:")
      console.log("✅ Swap automático WSOL → DONUT")
      console.log("✅ Integração com Meteora Dynamic AMM")
      console.log("✅ Slippage protection (1%)")
      console.log("✅ Protocol fee account configurado")
      console.log("✅ Validação de programa AMM")

      console.log("\n📝 FLUXO DO SISTEMA COM SWAP:")
      console.log("1️⃣ SLOT 1: Usuário deposita SOL → Swap para DONUT")
      console.log("2️⃣ SLOT 2: Usuário deposita SOL → Reserva SOL + Mint DONUT")
      console.log("3️⃣ SLOT 3: Usuário deposita SOL → Paga referrer + Recursão")
      console.log("💱 Base User: Sempre faz swap SOL → DONUT")
      console.log("🔄 Fallback: Qualquer WSOL restante é convertido para DONUT")

    } catch (error) {
      console.error(
        "❌ ERRO AO INICIALIZAR O ESTADO DA MATRIZ:",
        error
      )

      // Exibir detalhes do erro para diagnóstico
      if (error.logs) {
        console.log("\n📋 LOGS DE ERRO:")
        const relevantLogs = error.logs.filter(log => 
          log.includes("Program log:") || 
          log.includes("Error") || 
          log.includes("error") ||
          log.includes("ReentrancyLock") ||
          log.includes("overflow") ||
          log.includes("CRITICAL") ||
          log.includes("swap") ||
          log.includes("AMM")
        );
        
        if (relevantLogs.length > 0) {
          relevantLogs.forEach((log, i) => console.log(`${i}: ${log}`))
        } else {
          error.logs.forEach((log, i) => console.log(`${i}: ${log}`))
        }
      }
    }
  } catch (error) {
    console.error("❌ ERRO GERAL DURANTE O PROCESSO:", error)
  } finally {
    process.exit(0)
  }
}

main()