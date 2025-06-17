// inicializacao_v2.js - AIRDROP SYSTEM VERSION
// Script para inicializar o novo contrato com sistema de airdrop de 36 semanas

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

// Configurações principais - AIRDROP VERSION
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
  "QgNN4aW9hPz4ANP1LqzR2FkDPZo9MzDZxDQ4abovHYv"
)

// VERIFIED ADDRESSES - AIRDROP VERSION
const PROGRAM_TOKEN_VAULT = new PublicKey(
  "BBJi5yNpb9oRi1ZA6SqVmQwZ8wbekuPcwUXZZNhrpCvh"
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
    console.log(
      "🚀 INICIALIZANDO PROGRAMA DE MATRIZ COM SISTEMA DE AIRDROP 36 SEMANAS 🚀"
    )
    console.log(
      "==========================================================================="
    )
    console.log(`Usando arquivo de carteira: ${walletPath}`)
    console.log(`Multisig Treasury: ${MULTISIG_TREASURY.toString()}`)
    console.log("🎯 Versão: AIRDROP SYSTEM v2.0 (36 semanas progressivas)")
    console.log("🔥 Modelo: DEFLATIONARY (Swap + Burn)")

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
    console.log("\n📝 INICIALIZANDO ESTADO DO PROGRAMA COM SISTEMA DE AIRDROP...")

    try {
      // AIRDROP SYSTEM: Initialize with temporal logic
      const tx = await program.methods
        .initialize()
        .accounts({
          state: stateKeypair.publicKey,
          owner: walletKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([stateKeypair])
        .rpc()

      console.log("✅ PROGRAMA COM AIRDROP INICIALIZADO COM SUCESSO: " + tx)
      console.log(
        `🔍 Link para explorador: https://explorer.solana.com/tx/${tx}?cluster=devnet`
      )

      // Verificar informações do estado
      const stateInfo = await program.account.programState.fetch(
        stateKeypair.publicKey
      )
      console.log("\n📊 INFORMAÇÕES DO ESTADO DO SISTEMA DE AIRDROP:")
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

      // AIRDROP SYSTEM: Check new fields
      console.log("\n🎯 CONFIGURAÇÕES DO SISTEMA DE AIRDROP:")
      console.log("📅 Semana atual: " + stateInfo.currentWeek.toString())
      console.log("🎲 Airdrop ativo: " + (stateInfo.airdropActive ? "SIM" : "NÃO"))
      console.log("📊 Matrizes esta semana: " + stateInfo.totalMatricesThisWeek.toString())
      
      const startDate = new Date(stateInfo.programStartTimestamp.toNumber() * 1000)
      console.log("⏰ Início do programa: " + startDate.toLocaleString())
      
      const currentTime = Math.floor(Date.now() / 1000)
      const elapsedSeconds = currentTime - stateInfo.programStartTimestamp.toNumber()
      const elapsedDays = Math.floor(elapsedSeconds / (24 * 60 * 60))
      const elapsedWeeks = Math.floor(elapsedSeconds / (7 * 24 * 60 * 60))
      
      console.log(`⏳ Tempo decorrido: ${elapsedDays} dias (${elapsedWeeks} semanas completas)`)
      console.log("📜 Semanas fechadas: " + stateInfo.closedWeeks.length)

      // Proteção reentrancy
      if (stateInfo.isLocked !== undefined) {
        console.log(
          "🛡️ Proteção Reentrancy: " + (stateInfo.isLocked ? "ATIVADA (ERRO!)" : "PRONTA")
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
      console.log("\n🔑 PDAS PARA INTEGRAÇÃO DO SISTEMA DE AIRDROP:")

      // PDA para autoridade de mintagem (não mais usado para mint, mas mantido)
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

      // AIRDROP SYSTEM: New PDAs for temp operations
      const [tempDonutVault, tempDonutVaultBump] =
        PublicKey.findProgramAddressSync(
          [Buffer.from("temp_donut_vault")],
          PROGRAM_ID
        )
      console.log(
        "🔥 PDA Temp DONUT Vault: " +
          tempDonutVault.toString() +
          " (Bump: " +
          tempDonutVaultBump +
          ")"
      )

      const [tempDonutAuthority, tempDonutAuthorityBump] =
        PublicKey.findProgramAddressSync(
          [Buffer.from("temp_donut_authority")],
          PROGRAM_ID
        )
      console.log(
        "🔥 PDA Temp DONUT Authority: " +
          tempDonutAuthority.toString() +
          " (Bump: " +
          tempDonutAuthorityBump +
          ")"
      )

      // PROGRAM TOKEN VAULT (verified address)
      console.log(
        "💰 Vault de Tokens (VERIFICADO): " + PROGRAM_TOKEN_VAULT.toString()
      )
      console.log("🛡️ Endereço hardcoded no contrato para prevenir ataques")

      // Verificar se a ATA já existe
      try {
        const ataInfo = await connection.getAccountInfo(PROGRAM_TOKEN_VAULT)
        if (ataInfo) {
          console.log("✅ Vault de tokens principal já existe!")

          // Verificar saldo da ATA
          try {
            const tokenBalance = await connection.getTokenAccountBalance(
              PROGRAM_TOKEN_VAULT
            )
            console.log(
              `💎 Saldo de tokens no vault principal: ${tokenBalance.value.uiAmount} DONUT`
            )
          } catch (e) {
            console.log(
              `⚠️ Erro ao verificar saldo de tokens: ${e.message}`
            )
          }
        } else {
          console.log("⚠️ Vault de tokens principal ainda não foi criado")
          console.log("💡 Criando vault principal...")

          // Verificação de segurança: derivar e comparar
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
            console.log("✅ Vault principal criado: " + txid)
            console.log(
              `🔍 Link para explorador: https://explorer.solana.com/tx/${txid}?cluster=devnet`
            )
          } catch (e) {
            console.log("⚠️ Erro ao criar vault principal: " + e.message)
          }
        }
      } catch (e) {
        console.log("⚠️ Erro ao verificar vault principal: " + e.message)
      }

      // AIRDROP SYSTEM: Verificar temp DONUT vault
      console.log("\n🔥 VERIFICANDO VAULT TEMPORÁRIO PARA SWAP+BURN:")
      try {
        const tempVaultInfo = await connection.getAccountInfo(tempDonutVault)
        if (tempVaultInfo) {
          console.log("✅ Temp DONUT vault já existe!")
          
          try {
            const tempBalance = await connection.getTokenAccountBalance(tempDonutVault)
            console.log(`🔥 Saldo temp vault: ${tempBalance.value.uiAmount} DONUT`)
            
            if (tempBalance.value.uiAmount > 0) {
              console.log("⚠️ ATENÇÃO: Temp vault tem saldo! Deve estar sempre vazio após operações.")
            }
          } catch (e) {
            console.log("⚠️ Erro ao verificar saldo temp vault: " + e.message)
          }
        } else {
          console.log("⚠️ Temp DONUT vault ainda não foi criado")
          console.log("💡 Será criado automaticamente na primeira operação de swap")
        }
      } catch (e) {
        console.log("⚠️ Erro ao verificar temp vault: " + e.message)
      }

      // Gravar todas as informações importantes em um arquivo de configuração
      const configData = {
        // BASIC CONFIG
        programId: PROGRAM_ID.toString(),
        stateAddress: stateKeypair.publicKey.toString(),
        statePrivateKey: Array.from(stateKeypair.secretKey),
        tokenMint: TOKEN_MINT.toString(),
        ownerWallet: walletKeypair.publicKey.toString(),
        multisigTreasury: MULTISIG_TREASURY.toString(),
        
        // PDAs
        tokenMintAuthority: tokenMintAuthority.toString(),
        tokenMintAuthorityBump,
        programSolVault: programSolVault.toString(),
        programSolVaultBump,
        vaultAuthority: vaultAuthority.toString(),
        vaultAuthorityBump,
        programTokenVault: PROGRAM_TOKEN_VAULT.toString(),
        
        // AIRDROP SYSTEM PDAs
        tempDonutVault: tempDonutVault.toString(),
        tempDonutVaultBump,
        tempDonutAuthority: tempDonutAuthority.toString(),
        tempDonutAuthorityBump,
        
        // AIRDROP SYSTEM CONFIG
        systemVersion: "airdrop-v2.0",
        airdropActive: stateInfo.airdropActive,
        currentWeek: stateInfo.currentWeek.toString(),
        programStartTimestamp: stateInfo.programStartTimestamp.toString(),
        totalWeeks: 36,
        
        // FEATURES
        hasReentrancyProtection: stateInfo.isLocked !== undefined,
        hasOverflowProtection: true,
        hasStrictValidation: true,
        hasAirdropSystem: true,
        hasDeflationary: true,
        contractVersion: "airdrop-enhanced-v2.0",
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
      console.log(`\n💾 Configuração do sistema de airdrop salva em ${configOutputPath}`)

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

      // Informações do sistema de airdrop
      console.log("\n🎯 CONFIGURAÇÕES DO SISTEMA DE AIRDROP:")
      console.log("📅 Duração: 36 semanas (aproximadamente 9 meses)")
      console.log("📈 Distribuição: Progressiva crescente (1.15% → 9.09%)")
      console.log("🔥 Modelo: Deflationary (Swap SOL → DONUT → Burn)")
      console.log("💰 Rewards: Baseados em matrizes completadas por semana")
      console.log("🎁 Claim: Sob demanda via instrução claim_airdrop")

      console.log("\n🛡️ RECURSOS DE SEGURANÇA ATIVADOS:")
      console.log("✅ Proteção contra Reentrancy Attacks")
      console.log("✅ Proteção contra Overflow/Underflow")
      console.log("✅ Validação rigorosa de endereços")
      console.log("✅ Sistema temporal robusto")
      console.log("✅ Verificação de input avançada")
      console.log("✅ Economia deflationary")

      console.log("\n📋 PRÓXIMOS PASSOS:")
      console.log("1. 🏗️ Execute o script de registro de usuário base")
      console.log("2. 👥 Execute scripts de registro com referenciador")
      console.log("3. 🎁 Use claim_airdrop para coletar rewards")
      console.log("4. 📊 Use get_program_info para monitorar estado")
      console.log("5. 📈 Use get_user_airdrop_info para status individual")

    } catch (error) {
      console.error(
        "❌ ERRO AO INICIALIZAR O SISTEMA DE AIRDROP:",
        error
      )

      if (error.logs) {
        console.log("\n📋 LOGS DE ERRO:")
        const airdropLogs = error.logs.filter(log => 
          log.includes("Program log:") || 
          log.includes("Error") || 
          log.includes("error") ||
          log.includes("airdrop") ||
          log.includes("week") ||
          log.includes("matrix")
        );
        
        if (airdropLogs.length > 0) {
          airdropLogs.forEach((log, i) => console.log(`${i}: ${log}`))
        } else {
          error.logs.forEach((log, i) => console.log(`${i}: ${log}`))
        }
      }
    }
  } catch (error) {
    console.error("❌ ERRO GERAL DURANTE O PROCESSO DE INICIALIZAÇÃO:", error)
  } finally {
    process.exit(0)
  }
}

main()