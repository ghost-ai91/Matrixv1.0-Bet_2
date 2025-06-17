import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';

// Substitua pelo seu Program ID real
const PROGRAM_ID = new PublicKey("EWV1YNfhBTacafij2ffJ7RNyMuBVKNqtVgpyMiwX7syi");

// Token mint do DONUT (já definido no seu contrato)
const TOKEN_MINT = new PublicKey("F1vCKXMix75KigbwZUXkVU97NiE1H2ToopttH67ydqvq");

async function deriveProgramTokenVault() {
    console.log("=== Derivando Program Token Vault PDA ===\n");
    
    // 1. Primeiro, derive o vault_authority PDA
    const [vaultAuthority, vaultAuthorityBump] = await PublicKey.findProgramAddress(
        [Buffer.from("token_vault_authority")],
        PROGRAM_ID
    );
    
    console.log("Vault Authority PDA:");
    console.log("Address:", vaultAuthority.toBase58());
    console.log("Bump:", vaultAuthorityBump);
    console.log("");
    
    // 2. Agora derive o Associated Token Account para o vault_authority
    const programTokenVault = await getAssociatedTokenAddress(
        TOKEN_MINT,
        vaultAuthority,
        true // allowOwnerOffCurve = true porque o owner é um PDA
    );
    
    console.log("Program Token Vault (ATA):");
    console.log("Address:", programTokenVault.toBase58());
    console.log("");
    
    // 3. Gere o código para adicionar ao contrato
    console.log("=== Código para adicionar ao contrato ===\n");
    console.log("No módulo verified_addresses, adicione:");
    console.log(`pub static PROGRAM_TOKEN_VAULT: Pubkey = solana_program::pubkey!("${programTokenVault.toBase58()}");\n`);
    
    // 4. Informações adicionais úteis
    console.log("=== Informações Adicionais ===\n");
    console.log("Program ID:", PROGRAM_ID.toBase58());
    console.log("Token Mint:", TOKEN_MINT.toBase58());
    console.log("Vault Authority:", vaultAuthority.toBase58());
    console.log("Program Token Vault:", programTokenVault.toBase58());
    
    return {
        vaultAuthority: vaultAuthority.toBase58(),
        vaultAuthorityBump,
        programTokenVault: programTokenVault.toBase58()
    };
}

// Script alternativo sem usar getAssociatedTokenAddress
async function deriveProgramTokenVaultManual() {
    console.log("\n=== Derivação Manual (sem @solana/spl-token) ===\n");
    
    // Associated Token Account Program ID
    const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
    const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    
    // 1. Derive vault_authority
    const [vaultAuthority, vaultAuthorityBump] = await PublicKey.findProgramAddress(
        [Buffer.from("token_vault_authority")],
        PROGRAM_ID
    );
    
    // 2. Derive ATA manualmente
    const [programTokenVault] = await PublicKey.findProgramAddress(
        [
            vaultAuthority.toBuffer(),
            TOKEN_PROGRAM_ID.toBuffer(),
            TOKEN_MINT.toBuffer()
        ],
        ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    console.log("Program Token Vault (derivação manual):", programTokenVault.toBase58());
    
    return programTokenVault.toBase58();
}

// Executar as funções
(async () => {
    try {
        await deriveProgramTokenVault();
        await deriveProgramTokenVaultManual();
    } catch (error) {
        console.error("Erro:", error);
    }
})();