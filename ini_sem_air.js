// initialize_simple.js - Inicialização do contrato simplificado
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
} = require("@solana/web3.js");
const { AnchorProvider, Program } = require("@coral-xyz/anchor");
const fs = require("fs");
const path = require("path");

// Configurações principais
const PROGRAM_ID = new PublicKey("CdKkHpRhewe3wJFpbouuQog5xTURycGgsyhyb7wjAVCv");
const MULTISIG_TREASURY = new PublicKey("QgNN4aW9hPz4ANP1LqzR2FkDPZo9MzDZxDQ4abovHYv");

// Função para carregar carteira
function loadWalletFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo de carteira não encontrado: ${filePath}`);
  }
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(filePath, "utf-8")))
  );
}

async function main() {
  try {
    console.log("🚀 INICIALIZANDO CONTRATO SIMPLIFICADO DE SWAP 🚀");
    console.log("=================================================");
    console.log("📄 Versão: Simple Swap (SOL → DONUT)");
    console.log(`📍 Program ID: ${PROGRAM_ID.toString()}`);
    console.log(`🏦 Treasury: ${MULTISIG_TREASURY.toString()}`);

    // Carregar IDL
    const idlPath = "./target/idl/simple_swap.json";
    if (!fs.existsSync(idlPath)) {
      console.error("❌ IDL não encontrado! Compile o programa primeiro.");
      return;
    }
    const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));

    // Conectar à devnet
    const connection = new Connection(
      "https://api.devnet.solana.com",
      "confirmed"
    );
    console.log("✅ Conectado à Devnet");

    // Carregar carteira (use o caminho padrão ou especifique)
    const walletPath = process.argv[2] || "/Users/dark/.config/solana/id.json";
    let walletKeypair;
    try {
      walletKeypair = loadWalletFromFile(walletPath);
      console.log(`👤 Carteira: ${walletKeypair.publicKey.toString()}`);
    } catch (e) {
      console.error(`❌ Erro ao carregar carteira: ${e.message}`);
      return;
    }

    // Verificar saldo
    const balance = await connection.getBalance(walletKeypair.publicKey);
    console.log(`💰 Saldo: ${balance / 1_000_000_000} SOL`);

    if (balance < 0.1 * 1_000_000_000) {
      console.error("❌ Saldo insuficiente! Precisa de pelo menos 0.1 SOL");
      return;
    }

    // Configurar provider
    const provider = new AnchorProvider(
      connection,
      {
        publicKey: walletKeypair.publicKey,
        signTransaction: async (tx) => {
          tx.partialSign(walletKeypair);
          return tx;
        },
        signAllTransactions: async (txs) => {
          return txs.map((tx) => {
            tx.partialSign(walletKeypair);
            return tx;
          });
        },
      },
      { commitment: "confirmed" }
    );

    // Inicializar programa
    const program = new Program(idl, PROGRAM_ID, provider);

    // Gerar keypair para o estado
    const stateKeypair = Keypair.generate();
    console.log(`\n🔑 Novo estado: ${stateKeypair.publicKey.toString()}`);

    // Executar inicialização
    console.log("\n📝 Inicializando programa...");
    try {
      const tx = await program.methods
        .initialize()
        .accounts({
          state: stateKeypair.publicKey,
          owner: walletKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([stateKeypair])
        .rpc();

      console.log("✅ Programa inicializado com sucesso!");
      console.log(`📎 Transação: ${tx}`);
      console.log(`🔍 Explorer: https://explorer.solana.com/tx/${tx}?cluster=devnet`);

      // Verificar estado
      const stateInfo = await program.account.programState.fetch(
        stateKeypair.publicKey
      );
      
      console.log("\n📊 ESTADO DO PROGRAMA:");
      console.log(`👑 Owner: ${stateInfo.owner.toString()}`);
      console.log(`🏦 Treasury: ${stateInfo.multisigTreasury.toString()}`);
      console.log(`🆔 Próximo User ID: ${stateInfo.nextUserId}`);

      // Salvar configuração
      const config = {
        programId: PROGRAM_ID.toString(),
        stateAddress: stateKeypair.publicKey.toString(),
        statePrivateKey: Array.from(stateKeypair.secretKey),
        owner: walletKeypair.publicKey.toString(),
        multisigTreasury: MULTISIG_TREASURY.toString(),
        initialized: new Date().toISOString(),
        network: "devnet",
        version: "simple-swap-v1",
      };

      const configPath = "./simple-swap-config.json";
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log(`\n💾 Configuração salva em: ${configPath}`);

      console.log("\n✅ INICIALIZAÇÃO COMPLETA!");
      console.log("🎯 Próximo passo: execute register_simple.js para testar o swap");

    } catch (error) {
      console.error("❌ Erro ao inicializar:", error);
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