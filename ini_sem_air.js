// inicializacao.js - UPDATED VERSION WITHOUT MINT AND WSOL
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
const configOutputPath = args[1] || "./matriz-config.json"

// Carregue seu IDL compilado
const idl = require("./target/idl/referral_system.json")

// Configurações principais - UPDATED for simplified contract
const PROGRAM_ID = new PublicKey(
  "G6dU3Ghhg7YGkSttucjvRzErkMAgPhFHx3efZ65Embin"
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
  "5C16cVYXe7KRPz6rBD33qhcqyjvy42LP8tyJRNMXbKiL"
)

// Swap-related addresses
const POOL_ADDRESS = new PublicKey("FrQ5KsAgjCe3FFg6ZENri8feDft54tgnATxyffcasuxU")
const TOKEN_A_VAULT = new PublicKey("4ndfcH16GKY76bzDkKfyVwHMoF8oY75KES2VaAhUYksN") // DONUT vault
const TOKEN_B_VAULT = new PublicKey("FERjPVNEa7Udq8CEv68h6tPL46Tq7ieE49HrE2wea3XT") // SOL vault
const METEORA_SWAP_PROGRAM = new PublicKey("Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB")

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

// Função para calcular a ATA usando o método low-level
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

async function main() {
  try {
    console.log(
      "🚀 INICIALIZANDO PROGRAMA DE MATRIZ SIMPLIFICADO - SEM MINT 🚀"
    )
    console.log(
      "================================================================="
    )
    console.log(`Usando arquivo de carteira: ${walletPath}`)
    console.log(`Multisig Treasury: ${MULTISIG_TREASURY.toString()}`)
    console.log("🔧 Versão: Simplificada (Apenas SOL + Swap)")

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
    console.log("\n📝 INICIALIZANDO ESTADO SIMPLIFICADO DO PROGRAMA...")
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
      
      console.log("✅ PROGRAMA SIMPLIFICADO INICIALIZADO COM SUCESSO: " + tx)
      console.log(
        `🔍 Link para explorador: https://explorer.solana.com/tx/${tx}?cluster=devnet`
      )

      // Verificar informações do estado
      const stateInfo = await program.account.programState.fetch(
        stateKeypair.publicKey
      )
      console.log("\n📊 INFORMAÇÕES DO ESTADO SIMPLIFICADO:")
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

      // Verificar proteção reentrancy
      if (stateInfo.isLocked !== undefined) {
        console.log(
          "🛡️ Proteção Reentrancy: " + (stateInfo.isLocked ? "ATIVADA" : "PRONTA")
        )
        if (stateInfo.isLocked) {
          console.log("⚠️ AVISO: Estado inicializado com lock ativo - isso não deveria acontecer!")
        } else {
          console.log("✅ Estado inicializado corretamente sem lock")
        }
      } else {
        console.log("❌ ERRO: Campo is_locked não encontrado - contrato pode não estar atualizado!")
      }

      // Verificar PDAs necessárias para integração SIMPLIFICADA
      console.log("\n🔑 PDAS PARA INTEGRAÇÃO SIMPLIFICADA:")
      
      // PDA para vault de SOL (ainda necessária para reservas)
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

      console.log("\n🔧 ENDEREÇOS DE SWAP METEORA:")
      console.log("🏊 Pool Address: " + POOL_ADDRESS.toString())
      console.log("🪙 Token A Vault (DONUT): " + TOKEN_A_VAULT.toString())
      console.log("💰 Token B Vault (SOL): " + TOKEN_B_VAULT.toString())
      console.log("🔄 Meteora Swap Program: " + METEORA_SWAP_PROGRAM.toString())

      // Gravar configuração simplificada
      const configData = {
        programId: PROGRAM_ID.toString(),
        stateAddress: stateKeypair.publicKey.toString(),
        statePrivateKey: Array.from(stateKeypair.secretKey),
        tokenMint: TOKEN_MINT.toString(),
        programSolVault: programSolVault.toString(),
        programSolVaultBump,
        ownerWallet: walletKeypair.publicKey.toString(),
        multisigTreasury: MULTISIG_TREASURY.toString(),
        
        // Swap-related configuration
        poolAddress: POOL_ADDRESS.toString(),
        tokenAVault: TOKEN_A_VAULT.toString(), // DONUT
        tokenBVault: TOKEN_B_VAULT.toString(), // SOL
        meteoraSwapProgram: METEORA_SWAP_PROGRAM.toString(),
        
        // Contract version info
        contractVersion: "simplified-no-mint-v1.0",
        features: {
          hasTokenMint: false,
          hasWSolHandling: false,
          hasSwapFunctionality: true,
          hasReentrancyProtection: stateInfo.isLocked !== undefined,
        },
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
      console.log(`\n💾 Configuração simplificada salva em ${configOutputPath}`)

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
      console.log("🔑 PDA SOL VAULT: " + programSolVault.toString())

      // Informações sobre funcionalidades
      console.log("\n🔧 FUNCIONALIDADES ATIVAS:")
      console.log("✅ Proteção contra Reentrancy Attacks")
      console.log("✅ Sistema de Slots (1: Swap, 2: Reserve, 3: Pay)")
      console.log("✅ Swap SOL->DONUT via Meteora")
      console.log("✅ Reserva e pagamento de SOL")
      console.log("❌ Mint de tokens (REMOVIDO)")
      console.log("❌ Gestão WSOL (REMOVIDO)")

      console.log("\n📋 PRÓXIMOS PASSOS:")
      console.log("1. Use o script de registro para criar usuários base")
      console.log("2. Os swaps SOL->DONUT serão feitos diretamente via Meteora")
      console.log("3. Sistema funcionará apenas com SOL (sem tokens customizados)")

    } catch (error) {
      console.error(
        "❌ ERRO AO INICIALIZAR O ESTADO SIMPLIFICADO:",
        error
      )
      
      if (error.logs) {
        console.log("\n📋 LOGS DE ERRO:")
        const relevantLogs = error.logs.filter(log => 
          log.includes("Program log:") || 
          log.includes("Error") || 
          log.includes("error") ||
          log.includes("ReentrancyLock")
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