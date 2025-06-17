// inicializacao.js - Versão para contrato SEM MINT e COM SWAP
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
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

// Configurações principais - ATUALIZADO para contrato sem mint
const PROGRAM_ID = new PublicKey(
  "G6dU3Ghhg7YGkSttucjvRzErkMAgPhFHx3efZ65Embin"
)
const MULTISIG_TREASURY = new PublicKey(
  "5C16cVYXe7KRPz6rBD33qhcqyjvy42LP8tyJRNMXbKiL"
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

async function main() {
  try {
    console.log(
      "🚀 INICIALIZANDO PROGRAMA DE MATRIZ (SEM MINT - COM SWAP) 🚀"
    )
    console.log(
      "================================================================="
    )
    console.log(`Usando arquivo de carteira: ${walletPath}`)
    console.log(`Multisig Treasury: ${MULTISIG_TREASURY.toString()}`)
    console.log("🔄 Versão: Swap Only (Sem sistema de mint)")

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
    console.log("\n📝 INICIALIZANDO ESTADO DO PROGRAMA (SEM MINT)...")

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

      // Verificar proteção de reentrancy
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

      // Verificar PDAs necessárias para integração
      console.log("\n🔑 PDAS PARA INTEGRAÇÃO:")

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

      // Gravar todas as informações importantes em um arquivo de configuração
      const configData = {
        programId: PROGRAM_ID.toString(),
        stateAddress: stateKeypair.publicKey.toString(),
        statePrivateKey: Array.from(stateKeypair.secretKey),
        programSolVault: programSolVault.toString(),
        programSolVaultBump,
        ownerWallet: walletKeypair.publicKey.toString(),
        multisigTreasury: MULTISIG_TREASURY.toString(),
        // Informações da versão sem mint
        version: "no-mint-swap-only",
        hasReentrancyProtection: stateInfo.isLocked !== undefined,
        contractVersion: "swap-only-v1.0",
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
      console.log("🔑 PDA SOL VAULT: " + programSolVault.toString())

      // Informações sobre a nova versão
      console.log("\n🔄 RECURSOS DA VERSÃO SEM MINT:")
      console.log("✅ Slot 1: Swap WSOL -> DONUT")
      console.log("✅ Slot 2: Reserva SOL para referrer")
      console.log("✅ Slot 3: Paga SOL ao referrer")
      console.log("✅ Base User: Swap direto WSOL -> DONUT")
      console.log("❌ Sistema de mint removido")
      console.log("❌ Cálculo de tokens removido")
      console.log("✅ Proteção contra reentrancy mantida")

    } catch (error) {
      console.error(
        "❌ ERRO AO INICIALIZAR O ESTADO DA MATRIZ:",
        error
      )

      // Exibir detalhes do erro para diagnóstico
      if (error.logs) {
        console.log("\n📋 LOGS DE ERRO:")
        error.logs.forEach((log, i) => console.log(`${i}: ${log}`))
      }
    }
  } catch (error) {
    console.error("❌ ERRO GERAL DURANTE O PROCESSO:", error)
  } finally {
    process.exit(0)
  }
}

main()