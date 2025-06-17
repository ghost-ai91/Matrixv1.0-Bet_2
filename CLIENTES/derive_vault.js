// calculate_program_token_vault.js
// Script simples para calcular o endereço correto do Program Token Vault

const { PublicKey, Keypair } = require('@solana/web3.js');
const { utils } = require('@coral-xyz/anchor');
const fs = require('fs');

// ALTERE ESTES VALORES
const KEYPAIR_PATH = './target/deploy/matrix_system-keypair.json';
const TOKEN_MINT = 'G6dU3Ghhg7YGkSttucjvRzErkMAgPhFHx3efZ65Embin'; // ALTERE AQUI

// Carregar Program ID
const keypairData = JSON.parse(fs.readFileSync(KEYPAIR_PATH));
const PROGRAM_ID = Keypair.fromSecretKey(Uint8Array.from(keypairData)).publicKey;

// Derivar Vault Authority PDA
const [vaultAuthority] = PublicKey.findProgramAddressSync(
  [Buffer.from('token_vault_authority')],
  PROGRAM_ID
);

// Calcular Program Token Vault (ATA)
const programTokenVault = utils.token.associatedAddress({
  mint: new PublicKey(TOKEN_MINT),
  owner: vaultAuthority,
});

console.log('Program ID:', PROGRAM_ID.toString());
console.log('Token Mint:', TOKEN_MINT);
console.log('Vault Authority:', vaultAuthority.toString());
console.log('');
console.log('🎯 PROGRAM TOKEN VAULT:');
console.log(programTokenVault.toString());
console.log('');
console.log('📝 COPIE ESTA LINHA PARA SEU lib.rs:');
console.log(`pub static PROGRAM_TOKEN_VAULT: Pubkey = solana_program::pubkey!("${programTokenVault.toString()}");`);