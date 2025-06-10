const { Connection, PublicKey } = require('@solana/web3.js');

async function checkPoolState() {
    const connection = new Connection('https://weathered-quiet-theorem.solana-devnet.quiknode.pro/198997b67cb51804baeb34ed2257274aa2b2d8c0', 'confirmed');
    
    // Vault B address (SOL vault)
    const B_VAULT = new PublicKey("FERjPVNEa7Udq8CEv68h6tPL46Tq7ieE49HrE2wea3XT");
    
    console.log("🔍 Checking Meteora Vault B state...\n");
    
    try {
        const accountInfo = await connection.getAccountInfo(B_VAULT);
        if (!accountInfo) {
            console.log("❌ Vault account not found!");
            return;
        }
        
        console.log(`📊 Account size: ${accountInfo.data.length} bytes`);
        console.log(`👤 Owner: ${accountInfo.owner.toString()}`);
        console.log(`💰 Lamports: ${accountInfo.lamports} (${accountInfo.lamports / 1e9} SOL)\n`);
        
        // Search for possible total_amount values
        console.log("🔍 Searching for possible total_amount values...\n");
        
        const data = accountInfo.data;
        const possibleValues = [];
        
        // Scan the entire data buffer for u64 values
        for (let offset = 8; offset <= data.length - 8; offset++) {
            const value = data.readBigUInt64LE(offset);
            const valueNumber = Number(value);
            
            // Look for values that could represent SOL amounts (1-10 SOL range)
            if (valueNumber >= 1_000_000_000 && valueNumber <= 10_000_000_000) {
                possibleValues.push({
                    offset,
                    value: valueNumber,
                    sol: valueNumber / 1e9
                });
            }
        }
        
        // Sort by offset
        possibleValues.sort((a, b) => a.offset - b.offset);
        
        console.log("📋 Possible total_amount values (1-10 SOL range):");
        possibleValues.forEach(item => {
            console.log(`  Offset ${item.offset}: ${item.value} lamports (${item.sol.toFixed(9)} SOL)`);
        });
        
        // Check specific offset 106 mentioned in the code
        if (data.length >= 114) {
            const valueAt106 = data.readBigUInt64LE(106);
            console.log(`\n🎯 Value at offset 106: ${valueAt106} lamports (${(Number(valueAt106) / 1e9).toFixed(9)} SOL)`);
        }
        
    } catch (error) {
        console.error("❌ Error:", error);
    }
}

checkPoolState();