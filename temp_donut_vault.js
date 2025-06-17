// init_temp_vault.js - Script para inicializar o temp_donut_vault manualmente
// Necessário pois o programa espera que ele já exista

const {
    Connection,
    Keypair,
    PublicKey,
    SystemProgram,
    Transaction,
    TransactionInstruction,
  } = require("@solana/web3.js")
  const TOKEN_PROGRAM_ID = new PublicKey(
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
  )
  const fs = require("fs")
  
  // Receber parâmetros da linha de comando
  const args = process.argv.slice(2)
  const walletPath = args[0] || "/Users/dark/.config/solana/id.json"
  const configPath = args[1] || "./matriz-airdrop-config.json"
  
  // Configurações principais
  const PROGRAM_ID = new PublicKey(
    "G6dU3Ghhg7YGkSttucjvRzErkMAgPhFHx3efZ65Embin"
  )
  const TOKEN_MINT = new PublicKey(
    "CCTG4ZmGa9Nk9NVxbd1FXBNyKjyHSapuF9aU6zgcA3xz"
  )
  const SYSVAR_RENT_PUBKEY = new PublicKey(
    "SysvarRent111111111111111111111111111111111"
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
  
  // Função para carregar configuração existente
  function loadConfig(configPath) {
    if (!fs.existsSync(configPath)) {
      throw new Error(`Arquivo de configuração não encontrado: ${configPath}`)
    }
    return JSON.parse(fs.readFileSync(configPath, "utf-8"))
  }
  
  // Função para criar PDA (Program Derived Address)
  function findProgramAddress(seeds, programId) {
    return PublicKey.findProgramAddressSync(seeds, programId)
  }
  
  async function main() {
    try {
      console.log("🔥 INICIALIZANDO TEMP DONUT VAULT MANUALMENTE 🔥")
      console.log("===================================================")
      console.log(`Usando arquivo de carteira: ${walletPath}`)
      console.log(`Carregando configuração de: ${configPath}`)
  
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
          "👤 Endereço da carteira: " + walletKeypair.publicKey.toString()
        )
      } catch (e) {
        console.error(`❌ Erro ao carregar carteira: ${e.message}`)
        return
      }
  
      // Carregar configuração
      let config
      try {
        config = loadConfig(configPath)
        console.log("📋 Configuração carregada com sucesso")
      } catch (e) {
        console.error(`❌ Erro ao carregar configuração: ${e.message}`)
        return
      }
  
      // Verificar saldo da carteira
      const balance = await connection.getBalance(walletKeypair.publicKey)
      console.log(`💰 Saldo: ${balance / 1_000_000_000} SOL`)
  
      if (balance < 10_000_000) { // 0.01 SOL
        console.warn(
          "⚠️ Saldo baixo! Recomendamos pelo menos 0.01 SOL para criar o vault."
        )
        return
      }
  
      // Derivar PDAs
      const [tempDonutVault, tempDonutVaultBump] = findProgramAddress(
        [Buffer.from("temp_donut_vault")],
        PROGRAM_ID
      )
      
      const [tempDonutAuthority, tempDonutAuthorityBump] = findProgramAddress(
        [Buffer.from("temp_donut_authority")],
        PROGRAM_ID
      )
  
      console.log("\n🔑 INFORMAÇÕES DOS PDAs:")
      console.log("🔥 Temp Vault PDA: " + tempDonutVault.toString())
      console.log("🔥 Temp Vault Bump: " + tempDonutVaultBump)
      console.log("🔑 Temp Authority PDA: " + tempDonutAuthority.toString())
      console.log("🔑 Temp Authority Bump: " + tempDonutAuthorityBump)
  
      // Verificar se já existe
      console.log("\n🔍 VERIFICANDO SE TEMP VAULT JÁ EXISTE...")
      
      try {
        const existingAccount = await connection.getAccountInfo(tempDonutVault)
        
        if (existingAccount) {
          console.log("✅ Temp vault já existe!")
          console.log(`📏 Tamanho: ${existingAccount.data.length} bytes`)
          console.log(`👑 Owner: ${existingAccount.owner.toString()}`)
          
          if (existingAccount.owner.equals(TOKEN_PROGRAM_ID)) {
            console.log("✅ É uma token account válida")
            
            try {
              const balance = await connection.getTokenAccountBalance(tempDonutVault)
              console.log(`💰 Saldo: ${balance.value.uiAmount} DONUT`)
            } catch (e) {
              console.log("⚠️ Erro ao ler saldo: " + e.message)
            }
          }
          
          console.log("🎯 Vault já está pronto para uso!")
          return
        }
      } catch (e) {
        console.log("ℹ️ Temp vault não existe, será criado...")
      }
  
      // Calcular rent necessário
      const rentExemption = await connection.getMinimumBalanceForRentExemption(165) // Token account size
      console.log(`💰 Rent necessário: ${rentExemption / 1_000_000_000} SOL`)
  
      console.log("\n🔧 CRIANDO TEMP VAULT...")
  
      // Criar instrução para alocar espaço na conta PDA
      const allocateInstruction = SystemProgram.allocate({
        accountPubkey: tempDonutVault,
        space: 165, // Token account size
      })
  
      // Criar instrução para transferir rent
      const transferInstruction = SystemProgram.transfer({
        fromPubkey: walletKeypair.publicKey,
        toPubkey: tempDonutVault,
        lamports: rentExemption,
      })
  
      // Criar instrução para atribuir owner
      const assignInstruction = SystemProgram.assign({
        accountPubkey: tempDonutVault,
        programId: TOKEN_PROGRAM_ID,
      })
  
      // Criar instrução para inicializar token account
      const initializeInstruction = new TransactionInstruction({
        keys: [
          { pubkey: tempDonutVault, isSigner: false, isWritable: true },
          { pubkey: TOKEN_MINT, isSigner: false, isWritable: false },
          { pubkey: tempDonutAuthority, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        ],
        programId: TOKEN_PROGRAM_ID,
        data: Buffer.from([1]), // InitializeAccount instruction
      })
  
      // Montar transação com instruções em sequência
      const transaction = new Transaction()
      
      // Adicionar instruções para criar PDA manualmente
      transaction.add(transferInstruction)
      transaction.add(allocateInstruction) 
      transaction.add(assignInstruction)
      transaction.add(initializeInstruction)
  
      transaction.feePayer = walletKeypair.publicKey
      const { blockhash } = await connection.getLatestBlockhash()
      transaction.recentBlockhash = blockhash
  
      // Assinar com a carteira e com o PDA
      // Para PDAs, precisamos simular a assinatura
      console.log("⚠️ TENTATIVA DE CRIAÇÃO MANUAL...")
      console.log("💡 Pode falhar pois PDAs não podem assinar transações")
  
      try {
        // Assinar apenas com a carteira (PDAs não podem assinar)
        transaction.sign(walletKeypair)
        
        // Tentar enviar
        const txid = await connection.sendRawTransaction(transaction.serialize())
        console.log("📤 Transação enviada: " + txid)
        
        // Aguardar confirmação
        await connection.confirmTransaction(txid, "confirmed")
        console.log("✅ Transação confirmada!")
        
      } catch (error) {
        console.log("❌ Falha esperada na criação manual de PDA")
        console.log("Erro: " + error.message)
      }
  
      // SOLUÇÃO ALTERNATIVA: Criar via programa
      console.log("\n🎯 SOLUÇÃO RECOMENDADA:")
      console.log("💡 Modifique seu contrato para usar 'init_if_needed' no temp_donut_vault")
      console.log("📝 Mude de:")
      console.log("   #[account(mut, seeds = [b\"temp_donut_vault\"], bump)]")
      console.log("   pub temp_donut_vault: Account<'info, TokenAccount>,")
      console.log("📝 Para:")
      console.log("   #[account(")
      console.log("       init_if_needed,")
      console.log("       payer = owner,")
      console.log("       seeds = [b\"temp_donut_vault\"],")
      console.log("       bump,")
      console.log("       token::mint = token_mint,")
      console.log("       token::authority = temp_donut_authority")
      console.log("   )]")
      console.log("   pub temp_donut_vault: Account<'info, TokenAccount>,")
  
      console.log("\n🔧 ALTERNATIVA RÁPIDA:")
      console.log("Vou tentar criar usando instrução CPI do programa...")
  
      // Criar uma transação que force o programa a criar o vault
      // Isso pode ser feito criando uma função auxiliar no contrato
      console.log("💡 Considere adicionar uma função 'initialize_temp_vault' no contrato")
  
      // Atualizar configuração
      config.tempVaultInitializationAttempted = true
      config.tempVaultInitializationTimestamp = Math.floor(Date.now() / 1000)
      config.recommendedFix = "Use init_if_needed no contrato"
      
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
      console.log("💾 Configuração atualizada")
  
      console.log("\n📋 RESUMO:")
      console.log("🔥 Temp Vault PDA: " + tempDonutVault.toString())
      console.log("🔑 Authority PDA: " + tempDonutAuthority.toString())
      console.log("🛠️ Status: Precisa ser criado pelo programa")
      console.log("💡 Solução: Modificar contrato para usar init_if_needed")
  
    } catch (error) {
      console.error("❌ ERRO:", error)
    }
  }
  
  // Executar o script
  main().then(() => {
    console.log("\n🏁 Script finalizado!")
    process.exit(0)
  }).catch((error) => {
    console.error("❌ ERRO FATAL:", error)
    process.exit(1)
  })