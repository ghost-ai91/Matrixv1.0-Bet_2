// derive-corrected.js - Script corrigido para derivar o vault
const { PublicKey } = require('@solana/web3.js');

// CONFIGURAÇÕES
const PROGRAM_ID = "DeppEXXy7Bk91AW9hKppfZHK4qvPKLK83nGbh8pE3Goy";
const TOKEN_MINT = "CCTG4ZmGa9Nk9NVxbd1FXBNyKjyHSapuF9aU6zgcA3xz";
const SPL_TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

// 1. Primeiro, derivar a vault authority
const [vaultAuthority, vaultBump] = PublicKey.findProgramAddressSync(
  [Buffer.from("token_vault_authority")],
  new PublicKey(PROGRAM_ID)
);

console.log(`Vault Authority: ${vaultAuthority.toString()} (bump: ${vaultBump})`);

// 2. Função manual para derivar ATA (exatamente como no inicializacao.js)
function findAssociatedTokenAddress(owner, mint) {
  const seeds = [
    owner.toBuffer(),
    new PublicKey(SPL_TOKEN_PROGRAM_ID).toBuffer(),
    mint.toBuffer(),
  ];

  const [address] = PublicKey.findProgramAddressSync(
    seeds,
    new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID)
  );

  return address;
}

// 3. Derivar o vault usando o método manual
const programTokenVault = findAssociatedTokenAddress(
  vaultAuthority,
  new PublicKey(TOKEN_MINT)
);

console.log(`\nPROGRAM_TOKEN_VAULT: ${programTokenVault.toString()}`);
console.log(`Esperado: 7qW1bCFvYhG5obi4HpTJtptPUcxqWX8qeQcp71QhCVxg`);
console.log(`Conferem: ${programTokenVault.toString() === "7qW1bCFvYhG5obi4HpTJtptPUcxqWX8qeQcp71QhCVxg" ? "✅ SIM" : "❌ NÃO"}`);

// 4. Comparar com o método do Anchor (para debug)
try {
  const { utils } = require('@coral-xyz/anchor');
  
  const anchorDerived = utils.token.associatedAddress({
    mint: new PublicKey(TOKEN_MINT),
    owner: vaultAuthority,
  });
  
  console.log(`\nComparação com Anchor utils:`);
  console.log(`Anchor derivou: ${anchorDerived.toString()}`);
  console.log(`Manual derivou: ${programTokenVault.toString()}`);
  console.log(`São iguais: ${anchorDerived.equals(programTokenVault) ? "✅ SIM" : "❌ NÃO"}`);
} catch (e) {
  console.log(`\nNão foi possível comparar com Anchor utils: ${e.message}`);
}

// 5. Código para o contrato Rust
console.log(`\n// Código para adicionar no contrato Rust:`);
console.log(`pub static PROGRAM_TOKEN_VAULT: Pubkey = solana_program::pubkey!("${programTokenVault.toString()}");`);

// 6. Debug adicional - mostrar as seeds em hex
console.log(`\n// Debug - Seeds usadas:`);
console.log(`Owner (vault_authority): ${vaultAuthority.toBuffer().toString('hex')}`);
console.log(`Token Program ID: ${new PublicKey(SPL_TOKEN_PROGRAM_ID).toBuffer().toString('hex')}`);
console.log(`Mint: ${new PublicKey(TOKEN_MINT).toBuffer().toString('hex')}`);