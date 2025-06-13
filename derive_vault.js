// derive.js - Script minimalista
const { PublicKey } = require('@solana/web3.js');
const { utils } = require('@coral-xyz/anchor');

// CONFIGURAR AQUI:
const PROGRAM_ID = "DeppEXXy7Bk91AW9hKppfZHK4qvPKLK83nGbh8pE3Goy";
const TOKEN_MINT = "CCTG4ZmGa9Nk9NVxbd1FXBNyKjyHSapuF9aU6zgcA3xz";

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