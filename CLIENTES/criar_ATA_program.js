// create_program_ata.js
// Script para criar a ATA do Program Token Vault - SEM DEPENDÊNCIAS EXTRAS

const { Connection, PublicKey, Keypair, Transaction, SystemProgram, TransactionInstruction } = require('@solana/web3.js');
const { utils } = require('@coral-xyz/anchor');
const fs = require('fs');

// Program IDs necessários
const SPL_TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const SYSVAR_RENT_PUBKEY = new PublicKey("SysvarRent111111111111111111111111111111111");

async function main() {
  // CONFIGURAÇÕES - ALTERE CONFORME NECESSÁRIO
  const WALLET_PATH = '/Users/dark/.config/solana/id.json'; // SEU CAMINHO DA CARTEIRA
  const KEYPAIR_PATH = './target/deploy/matrix_system-keypair.json';
  const TOKEN_MINT = 'CCTG4ZmGa9Nk9NVxbd1FXBNyKjyHSapuF9aU6zgcA3xz'; // SEU TOKEN MINT
  
  const connection = new Connection('https://weathered-quiet-theorem.solana-devnet.quiknode.pro/198997b67cb51804baeb34ed2257274aa2b2d8c0', 'confirmed');
  
  // Carregar carteira
  const walletKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(WALLET_PATH)))
  );
  
  // Carregar Program ID
  const programKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH)))
  );
  const PROGRAM_ID = programKeypair.publicKey;
  
  console.log('🔧 CRIANDO PROGRAM TOKEN VAULT ATA');
  console.log('Program ID:', PROGRAM_ID.toString());
  console.log('Token Mint:', TOKEN_MINT);
  console.log('Wallet:', walletKeypair.publicKey.toString());
  
  // Derivar Vault Authority PDA
  const [vaultAuthority, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from('token_vault_authority')],
    PROGRAM_ID
  );
  
  console.log('Vault Authority:', vaultAuthority.toString(), `(Bump: ${bump})`);
  
  // Calcular ATA usando utils do Anchor
  const programTokenVault = utils.token.associatedAddress({
    mint: new PublicKey(TOKEN_MINT),
    owner: vaultAuthority,
  });
  
  console.log('Program Token Vault ATA:', programTokenVault.toString());
  
  // Verificar se já existe
  const ataInfo = await connection.getAccountInfo(programTokenVault);
  if (ataInfo) {
    console.log('✅ ATA já existe!');
    console.log('Owner:', ataInfo.owner.toString());
    console.log('Data length:', ataInfo.data.length);
    
    // Tentar verificar saldo
    try {
      const balance = await connection.getTokenAccountBalance(programTokenVault);
      console.log('Saldo atual:', balance.value.uiAmount || 0, 'tokens');
    } catch (e) {
      console.log('⚠️ Não foi possível verificar o saldo:', e.message);
    }
    return;
  }
  
  console.log('⚠️ ATA não existe, criando...');
  
  // Criar instrução ATA manualmente (sem dependência extra)
  const createATAIx = new TransactionInstruction({
    keys: [
      { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: true }, // payer
      { pubkey: programTokenVault, isSigner: false, isWritable: true },     // ata
      { pubkey: vaultAuthority, isSigner: false, isWritable: false },        // owner
      { pubkey: new PublicKey(TOKEN_MINT), isSigner: false, isWritable: false }, // mint
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    data: Buffer.from([]), // ATA creation instruction has no data
  });
  
  // Criar transação
  const transaction = new Transaction().add(createATAIx);
  
  // Configurar transação
  transaction.feePayer = walletKeypair.publicKey;
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  
  // Assinar transação
  transaction.sign(walletKeypair);
  
  // Enviar transação
  console.log('📤 Enviando transação...');
  const signature = await connection.sendRawTransaction(transaction.serialize());
  
  console.log('⏳ Aguardando confirmação...');
  await connection.confirmTransaction(signature, 'confirmed');
  
  console.log('✅ ATA criada com sucesso!');
  console.log('Signature:', signature);
  console.log(`🔍 Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
  
  // Verificar se foi criada
  const newAtaInfo = await connection.getAccountInfo(programTokenVault);
  if (newAtaInfo) {
    console.log('✅ Verificação: ATA criada e acessível');
    console.log('Owner:', newAtaInfo.owner.toString());
    console.log('Data length:', newAtaInfo.data.length);
    
    // Verificar se é uma token account válida
    if (newAtaInfo.owner.equals(SPL_TOKEN_PROGRAM_ID) && newAtaInfo.data.length === 165) {
      console.log('✅ ATA válida criada com sucesso!');
    } else {
      console.log('⚠️ ATA criada mas pode ter problemas de formato');
    }
  } else {
    console.log('❌ Erro: ATA não foi criada corretamente');
  }
}

main().catch(console.error);