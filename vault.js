// Script para descobrir os endereços corretos das structs Vault
const { Connection, PublicKey } = require('@solana/web3.js');
const { AnchorProvider, Program, Wallet } = require('@coral-xyz/anchor');

async function discoverVaultAddresses() {
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    
    // Seu endereço do pool
    const POOL_ADDRESS = new PublicKey("FrQ5KsAgjCe3FFg6ZENri8feDft54tgnATxyffcasuxU");
    
    console.log("🔍 Buscando informações do pool:", POOL_ADDRESS.toString());
    
    try {
        // Buscar dados do pool
        const poolAccount = await connection.getAccountInfo(POOL_ADDRESS);
        
        if (!poolAccount) {
            console.error("❌ Pool não encontrado!");
            return;
        }
        
        console.log("✅ Pool encontrado!");
        console.log("📋 Owner do pool:", poolAccount.owner.toString());
        console.log("📋 Data length:", poolAccount.data.length);
        
        // Tentar extrair endereços das structs Vault do pool data
        // Os endereços estão nos primeiros bytes do pool data
        const poolData = poolAccount.data;
        
        // Pular o discriminator (8 bytes) e ler os Pubkeys
        let offset = 8;
        
        try {
            // Ler endereços sequencialmente (cada Pubkey = 32 bytes)
            const readPubkey = (offset) => {
                const pubkeyBytes = poolData.slice(offset, offset + 32);
                return new PublicKey(pubkeyBytes).toString();
            };
            
            console.log("\n📋 ENDEREÇOS ENCONTRADOS NO POOL:");
            
            // Tentar ler vários offsets para encontrar os endereços
            for (let i = 0; i < 10; i++) {
                try {
                    const address = readPubkey(offset + (i * 32));
                    console.log(`Offset ${offset + (i * 32)}: ${address}`);
                    
                    // Verificar se este endereço corresponde aos seus endereços conhecidos
                    if (address === "CocstBGbeDVyTJWxbWs4docwWapVADAo1xXQSh9RfPMz") {
                        console.log("  ↳ ✅ Este é o A_VAULT_LP");
                    }
                    if (address === "HJNs8hPTzs9i6AVFkRDDMFVEkrrUoV7H7LDZHdCWvxn7") {
                        console.log("  ↳ ✅ Este é o B_VAULT_LP");
                    }
                    if (address === "6m1wvYoPrwjAnbuGMqpMoodQaq4VnZXRjrzufXnPSjmj") {
                        console.log("  ↳ ❓ Este é o seu A_TOKEN_VAULT");
                    }
                    if (address === "HZeLxbZ9uHtSpwZC3LBr4Nubd14iHwz7bRSghRZf5VCG") {
                        console.log("  ↳ ❓ Este é o seu B_TOKEN_VAULT");
                    }
                    if (address === "FERjPVNEa7Udq8CEv68h6tPL46Tq7ieE49HrE2wea3XT") {
                        console.log("  ↳ ❓ Este é o seu B_VAULT");
                    }
                } catch (e) {
                    // Ignorar erros de pubkey inválida
                }
            }
            
        } catch (e) {
            console.error("❌ Erro ao ler dados do pool:", e.message);
        }
        
        // Verificar que tipo de conta cada endereço é
        console.log("\n🔍 VERIFICANDO TIPOS DE CONTA:");
        
        const addressesToCheck = [
            { name: "A_TOKEN_VAULT", address: "6m1wvYoPrwjAnbuGMqpMoodQaq4VnZXRjrzufXnPSjmj" },
            { name: "B_TOKEN_VAULT", address: "HZeLxbZ9uHtSpwZC3LBr4Nubd14iHwz7bRSghRZf5VCG" },
            { name: "B_VAULT", address: "FERjPVNEa7Udq8CEv68h6tPL46Tq7ieE49HrE2wea3XT" },
        ];
        
        for (const item of addressesToCheck) {
            try {
                const account = await connection.getAccountInfo(new PublicKey(item.address));
                if (account) {
                    console.log(`${item.name}:`);
                    console.log(`  Address: ${item.address}`);
                    console.log(`  Owner: ${account.owner.toString()}`);
                    console.log(`  Data length: ${account.data.length}`);
                    
                    // Determinar tipo baseado no owner e tamanho
                    if (account.owner.toString() === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") {
                        console.log(`  ↳ 🏷️ TIPO: Token Account (SPL Token)`);
                    } else if (account.data.length > 500) {
                        console.log(`  ↳ 🏷️ TIPO: Possível Vault Struct (dados grandes)`);
                    } else {
                        console.log(`  ↳ 🏷️ TIPO: Outro (owner: ${account.owner.toString()})`);
                    }
                } else {
                    console.log(`${item.name}: ❌ Conta não encontrada`);
                }
            } catch (e) {
                console.log(`${item.name}: ❌ Erro: ${e.message}`);
            }
        }
        
    } catch (error) {
        console.error("❌ Erro geral:", error);
    }
}

discoverVaultAddresses();