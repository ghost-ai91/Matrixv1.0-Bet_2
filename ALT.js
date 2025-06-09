// verificar.js
const { Connection, PublicKey } = require("@solana/web3.js")
const {
  AnchorProvider,
  Program,
  utils,
  Wallet,
} = require("@coral-xyz/anchor")
const fs = require("fs")
const path = require("path")
const web3 = require("@solana/web3.js")

// Carregar seu IDL compilado
const idl = require("./target/idl/referral_system.json")

// Configurações principais
const PROGRAM_ID = new PublicKey(
  "2wFmCLVQ8pSF2aKu43gLv2vzasUHhtmAA9HffBDXcRfF"
)
const TOKEN_MINT = new PublicKey(
  "3dCXCZd3cbKHT7jQSLzRNJQYu1zEzaD8FHi4MWHLX4DZ"
)
const MULTISIG_TREASURY = new PublicKey(
  "Eu22Js2qTu5bCr2WFY2APbvhDqAhUZpkYKmVsfeyqR2N"
)

function loadWalletFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo de carteira não encontrado: ${filePath}`)
  }
  return require("@solana/web3.js").Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(filePath, "utf-8")))
  )
}
const args = process.argv.slice(2)
const walletPath = args[0]

async function testAddressLookupTables() {
  try {
    console.log("🔍 TESTE DE ADDRESS LOOKUP TABLES NA DEVNET 🔍")
    console.log("===============================================")

    // No Solana Playground, a conexão já está disponível via objeto pg
    console.log("✅ Usando conexão do Solana Playground")
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
    const pg = new Program(idl, PROGRAM_ID, provider)
    const wallet = new Wallet(walletKeypair)

    pg.connection = connection
    pg.wallet = wallet
    pg.program = pg

    // Obter slot atual (necessário para criar a ALT)
    const slot = await pg.connection.getSlot()
    console.log(`📊 Slot atual: ${slot}`)

    // Mostrar saldo da carteira antes de criar ALT
    const walletBalance = await pg.connection.getBalance(
      pg.wallet.publicKey
    )
    console.log(`💰 Saldo inicial: ${walletBalance / 1e9} SOL`)

    // ETAPA 1: Criar Address Lookup Table
    console.log("\n📝 CRIANDO ADDRESS LOOKUP TABLE...")

    const [createInstruction, lookupTableAddress] =
      web3.AddressLookupTableProgram.createLookupTable({
        authority: pg.wallet.publicKey,
        payer: pg.wallet.publicKey,
        recentSlot: slot,
      })

    console.log(
      `🔑 Endereço da ALT: ${lookupTableAddress.toString()}`
    )

    // Criar e enviar a transação
    const createTableTx = new web3.Transaction().add(
      createInstruction
    )
    createTableTx.feePayer = pg.wallet.publicKey
    const { blockhash } = await pg.connection.getLatestBlockhash()
    createTableTx.recentBlockhash = blockhash

    const signedCreateTx =
      await pg.wallet.signTransaction(createTableTx)
    const createTxId = await pg.connection.sendRawTransaction(
      signedCreateTx.serialize()
    )

    console.log(`✅ Transação enviada: ${createTxId}`)
    console.log(
      `🔍 Link para explorador: https://explorer.solana.com/tx/${createTxId}?cluster=devnet`
    )

    console.log("\n⏳ Aguardando confirmação...")
    await pg.connection.confirmTransaction(createTxId, "confirmed")
    console.log("✅ Address Lookup Table criada com sucesso!")

    // ETAPA 2: Adicionar endereços à ALT
    // Lista de endereços que queremos adicionar
    // Vamos incluir as contas globais do seu sistema
    const addressesToAdd = [
      // Endereços do programa e tokens
      new web3.PublicKey(
        "CoRsyf6xCdgfKp64dG5oEKgRZLn5ckrux5YyCLoQ9rk4"
      ), // MATRIX_PROGRAM_ID
      new web3.PublicKey(
        "F1vCKXMix75KigbwZUXkVU97NiE1H2ToopttH67ydqvq"
      ), // TOKEN_MINT
      new web3.PublicKey(
        "DQh7cmuBAHDyYFhq6ntY56JGbiwMKjb5QQoNT732FKzi"
      ), // STATE_ADDRESS

      // Endereços da Pool Meteora
      new web3.PublicKey(
        "FrQ5KsAgjCe3FFg6ZENri8feDft54tgnATxyffcasuxU"
      ), // POOL_ADDRESS

      // Endereços do Vault A (DONUT) - NOVOS PARA MINTAGEM PROPORCIONAL
      new web3.PublicKey(
        "6m1wvYoPrwjAnbuGMqpMoodQaq4VnZXRjrzufXnPSjmj"
      ), // A_TOKEN_VAULT
      new web3.PublicKey(
        "CocstBGbeDVyTJWxbWs4docwWapVADAo1xXQSh9RfPMz"
      ), // A_VAULT_LP
      new web3.PublicKey(
        "6f2FVX5UT5uBtgknc8fDj119Z7DQoLJeKRmBq7j1zsVi"
      ), // A_VAULT_LP_MINT

      // Endereços do Vault B (SOL)
      new web3.PublicKey(
        "FERjPVNEa7Udq8CEv68h6tPL46Tq7ieE49HrE2wea3XT"
      ), // B_VAULT
      new web3.PublicKey(
        "HZeLxbZ9uHtSpwZC3LBr4Nubd14iHwz7bRSghRZf5VCG"
      ), // B_TOKEN_VAULT
      new web3.PublicKey(
        "BvoAjwEDhpLzs3jtu4H72j96ShKT5rvZE9RP1vgpfSM"
      ), // B_VAULT_LP_MINT
      new web3.PublicKey(
        "CZSkqNpYs1iHi7cfDJNFvFgwHhoCeSoJzCvuvGwKEkZM"
      ), // B_VAULT_LP
      new web3.PublicKey(
        "HJNs8hPTzs9i6AVFkRDDMFVEkrrUoV7H7LDZHdCWvxn7"
      ), // VAULT_PROGRAM

      // NOVO: Endereços Chainlink (Devnet)
      new web3.PublicKey(
        "HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny"
      ), // CHAINLINK_PROGRAM
      new web3.PublicKey(
        "99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR"
      ), // SOL_USD_FEED

      // Programas do sistema
      new web3.PublicKey(
        "So11111111111111111111111111111111111111112"
      ), // WSOL_MINT
      new web3.PublicKey(
        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
      ), // SPL_TOKEN_PROGRAM_ID
      new web3.PublicKey("11111111111111111111111111111111"), // SystemProgram.programId
      new web3.PublicKey(
        "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
      ), // ASSOCIATED_TOKEN_PROGRAM_ID
      new web3.PublicKey(
        "SysvarRent111111111111111111111111111111111"
      ), // SYSVAR_RENT_PUBKEY
    ]

    console.log(
      `\n📝 ADICIONANDO ${addressesToAdd.length} ENDEREÇOS À ALT...`
    )

    const extendInstruction =
      web3.AddressLookupTableProgram.extendLookupTable({
        payer: pg.wallet.publicKey,
        authority: pg.wallet.publicKey,
        lookupTable: lookupTableAddress,
        addresses: addressesToAdd,
      })

    // Criar e enviar a transação
    const extendTableTx = new web3.Transaction().add(
      extendInstruction
    )
    extendTableTx.feePayer = pg.wallet.publicKey
    const { blockhash: extendBlockhash } =
      await pg.connection.getLatestBlockhash()
    extendTableTx.recentBlockhash = extendBlockhash

    const signedExtendTx =
      await pg.wallet.signTransaction(extendTableTx)
    const extendTxId = await pg.connection.sendRawTransaction(
      signedExtendTx.serialize()
    )

    console.log(`✅ Transação enviada: ${extendTxId}`)
    console.log(
      `🔍 Link para explorador: https://explorer.solana.com/tx/${extendTxId}?cluster=devnet`
    )

    console.log("\n⏳ Aguardando confirmação...")
    await pg.connection.confirmTransaction(extendTxId, "confirmed")
    console.log("✅ Endereços adicionados com sucesso!")

    // ETAPA 3: Verificar a ALT criada
    console.log("\n🔍 VERIFICANDO ADDRESS LOOKUP TABLE...")

    // Em vez de setTimeout, usamos uma alternativa com confirmação adicional
    // para garantir que a ALT esteja pronta
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`Tentativa ${attempt} de verificar a ALT...`)

      try {
        const lookupTableAccount = (
          await pg.connection.getAddressLookupTable(
            lookupTableAddress
          )
        ).value

        if (!lookupTableAccount) {
          console.log(
            "ALT ainda não disponível, aguardando mais um pouco..."
          )
          // Aguardar confirmação adicional, já que não podemos usar setTimeout
          await pg.connection.confirmTransaction(
            extendTxId,
            "finalized"
          )
          continue
        }

        console.log(
          `✅ ALT recuperada: ${lookupTableAccount.key.toString()}`
        )
        console.log(
          `📊 Estado: ${
            lookupTableAccount.state.deactivationSlot
              ? "Desativada"
              : "Ativa"
          }`
        )
        console.log(
          `📊 Total de endereços: ${lookupTableAccount.state.addresses.length}`
        )

        // Listar todos os endereços adicionados
        console.log("\n📋 ENDEREÇOS NA ALT:")
        lookupTableAccount.state.addresses.forEach(
          (address, index) => {
            // Obter o nome amigável do endereço (se disponível)
            let addressName = getAddressName(address.toString())
            console.log(
              `${index}: ${address.toString()} ${
                addressName ? `(${addressName})` : ""
              }`
            )
          }
        )

        // Sair do loop se conseguimos recuperar a ALT
        break
      } catch (verifyError) {
        console.log(
          `Erro ao verificar ALT na tentativa ${attempt}: ${verifyError.message}`
        )

        if (attempt === 3) {
          throw new Error(
            "Não foi possível verificar a ALT após várias tentativas"
          )
        }

        // Aguardar confirmação adicional, já que não podemos usar setTimeout
        await pg.connection.confirmTransaction(
          extendTxId,
          "finalized"
        )
      }
    }

    // Mostrar saldo da carteira depois de criar ALT
    const newWalletBalance = await pg.connection.getBalance(
      pg.wallet.publicKey
    )
    console.log(`\n💰 Saldo final: ${newWalletBalance / 1e9} SOL`)
    console.log(
      `💰 Custo total: ${
        (walletBalance - newWalletBalance) / 1e9
      } SOL`
    )

    console.log("\n🎉 TESTE DE ALT CONCLUÍDO COM SUCESSO! 🎉")
    console.log("===========================================")
    console.log(
      "\n⚠️ IMPORTANTE: GUARDE ESTE ENDEREÇO PARA USO FUTURO:"
    )
    console.log(
      `🔑 ADDRESS LOOKUP TABLE: ${lookupTableAddress.toString()}`
    )
    console.log("\n📋 RESUMO DOS ENDEREÇOS NA ALT:")
    console.log("✅ Endereços do programa e tokens: 4")
    console.log("✅ Endereço da Pool Meteora: 1")
    console.log(
      "✅ Endereços do Vault A (DONUT) para mintagem proporcional: 4"
    )
    console.log("✅ Endereços do Vault B (SOL): 5")
    console.log("✅ Endereços Chainlink: 2") // NOVA LINHA
    console.log("✅ Programas do sistema: 5")
    console.log("✅ Total: 21 endereços") // ATUALIZADO DE 19 PARA 21
  } catch (error) {
    console.error("\n❌ ERRO DURANTE O TESTE:", error)

    if (error.logs) {
      console.log("\n📋 LOGS DE ERRO DETALHADOS:")
      error.logs.forEach((log, i) => console.log(`${i}: ${log}`))
    }
  }
}

// Função para obter nome amigável dos endereços
function getAddressName(address) {
  const addressMap = {
    Fx5gHHhqzn8vhYoFUTvYn6fzN7jxubohD9VyNTR6fdPD: "MATRIX_PROGRAM_ID",
    "3qytzVfJSg6yJHEKeN7RiH5i5t8mEEJ2jBezYDrh9ckp": "TOKEN_MINT",
    AaZukNFM4D6Rn2iByQFLHtfbiacsh58XEm3yzbzvdeL: "STATE_ADDRESS",
    CBPTSi75JXHrhejScdEsFVFTNgT22MEx7BgXTyRugL84: "POOL_ADDRESS",

    // Endereços do Vault A (DONUT) - NOVOS
    B1njdy1SBBvE3qRUjP3LexKRz8ThrAQzpFMifBXT6tQ9: "A_VAULT",
    "2h2Z9mhfdvGUZnubxDcn2PD9vPSeeekEcnBRcCWtAt9b": "A_TOKEN_VAULT",
    "5fNj6tGC35QuofE799DvVxH3e41z7772bzsFg5dJbNoE": "A_VAULT_LP",
    "7d6bm8vGtj64nzz8Eqgiqdt27WSebaGZtfkGZxZA1ckW": "A_VAULT_LP_MINT",

    // Endereços do Vault B (SOL)
    FERjPVNEa7Udq8CEv68h6tPL46Tq7ieE49HrE2wea3XT: "B_VAULT",
    HZeLxbZ9uHtSpwZC3LBr4Nubd14iHwz7bRSghRZf5VCG: "B_TOKEN_VAULT",
    BvoAjwEDhpLzs3jtu4H72j96ShKT5rvZE9RP1vgpfSM: "B_VAULT_LP_MINT",
    DkTSUH4PEsGXw18VU3b4nUPtfvabPHzzz3j4KPCyimgp: "B_VAULT_LP",
    "24Uqj9JCLxUeoC3hGfh5W3s9FM9uCHDS2SG3LYwBpyTi": "VAULT_PROGRAM",

    // NOVO: Endereços Chainlink (Devnet)
    HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEMJWHNY: "CHAINLINK_PROGRAM",
    "99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR": "SOL_USD_FEED",

    // Programas do sistema
    So11111111111111111111111111111111111111112: "WSOL_MINT",
    TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA:
      "SPL_TOKEN_PROGRAM_ID",
    "11111111111111111111111111111111": "SystemProgram.programId",
    ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL:
      "ASSOCIATED_TOKEN_PROGRAM_ID",
    SysvarRent111111111111111111111111111111111: "SYSVAR_RENT_PUBKEY",
  }

  return addressMap[address] || null
}

// Executar o teste
testAddressLookupTables()
