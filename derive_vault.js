// derive.js - Script minimalista
const { PublicKey } = require('@solana/web3.js');
const { utils } = require('@coral-xyz/anchor');

// CONFIGURAR AQUI:
const PROGRAM_ID = "6xjmdQP5BcWskUmjGkqFU72dz9hp81SRvfrEmwZzieik";
const TOKEN_MINT = "FXAN6cjSjAiiGJf3fXK9T7kuLwmuFGN8x5o3bWjQhLSN";

// Derivar
const [vaultAuthority] = PublicKey.findProgramAddressSync(
  [Buffer.from("token_vault_authority")],
  new PublicKey(PROGRAM_ID)
);

const programTokenVault = utils.token.associatedAddress({
  mint: new PublicKey(TOKEN_MINT),
  owner: vaultAuthority,
});

// Resultado
console.log(`PROGRAM_TOKEN_VAULT: ${programTokenVault.toString()}`);
console.log(`\nCódigo para o contrato:`);
console.log(`pub static PROGRAM_TOKEN_VAULT: Pubkey = solana_program::pubkey!("${programTokenVault.toString()}");`);