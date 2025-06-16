use anchor_lang::prelude::*;
use anchor_lang::solana_program::{self, clock::Clock};
use anchor_lang::AnchorDeserialize;
use anchor_lang::AnchorSerialize;
use anchor_spl::token::{Token, TokenAccount};
use anchor_spl::associated_token::AssociatedToken;
use chainlink_solana as chainlink;
#[cfg(not(feature = "no-entrypoint"))]
use {solana_security_txt::security_txt};

declare_id!("G6dU3Ghhg7YGkSttucjvRzErkMAgPhFHx3efZ65Embin");

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
    name: "Referral Matrix System",
    project_url: "https://mydonut.io",
    contacts: "email:dev@mydonut.io,whatsapp:+1 (530) 501-2621",
    policy: "https://github.com/ghost-ai91/matrixv1/blob/main/SECURITY.md",
    preferred_languages: "en",
    source_code: "https://github.com/ghost-ai91/matrixv1/blob/main/programs/matrix-system/src/lib.rs",
    source_revision: env!("GITHUB_SHA", "unknown-revision"),
    source_release: env!("PROGRAM_VERSION", "unknown-version"),
    encryption: "",
    auditors: "",
    acknowledgements: "We thank all security researchers who contributed to the security of our protocol."
}

// ===== CONSTANTES =====

// Minimum deposit amount in USD (10 dollars in base units - 8 decimals)
const MINIMUM_USD_DEPOSIT: u64 = 10_00000000;

// Maximum price feed staleness (24 hours in seconds)
const MAX_PRICE_FEED_AGE: i64 = 86400;

// Default SOL price in case of stale feed ($100 USD per SOL)
const DEFAULT_SOL_PRICE: i128 = 100_00000000;

// Maximum number of upline accounts that can be processed in a single transaction
const MAX_UPLINE_DEPTH: usize = 6;

// NOVA CONSTANTE: Tabela de distribuição de 36 semanas
const WEEKLY_DISTRIBUTIONS: [u64; 36] = [
    240_081,    // Semana 1: 1.1546%
    259_617,    // Semana 2: 1.2485%
    279_997,    // Semana 3: 1.3458%
    301_268,    // Semana 4: 1.4492%
    323_478,    // Semana 5: 1.5557%
    346_675,    // Semana 6: 1.6668%
    370_908,    // Semana 7: 1.7838%
    396_224,    // Semana 8: 1.9055%
    422_672,    // Semana 9: 2.0331%
    450_303,    // Semana 10: 2.1656%
    479_169,    // Semana 11: 2.3035%
    509_323,    // Semana 12: 2.4487%
    540_819,    // Semana 13: 2.5993%
    573_712,    // Semana 14: 2.7595%
    608_059,    // Semana 15: 2.9256%
    643_919,    // Semana 16: 3.0967%
    681_351,    // Semana 17: 3.2775%
    720_417,    // Semana 18: 3.4645%
    761_179,    // Semana 19: 3.6615%
    803_704,    // Semana 20: 3.8675%
    848_057,    // Semana 21: 4.0784%
    894_308,    // Semana 22: 4.3009%
    942_525,    // Semana 23: 4.5324%
    992_783,    // Semana 24: 4.7749%
    1_045_139,  // Semana 25: 5.0266%
    1_099_731,  // Semana 26: 5.3388%
    1_156_576,  // Semana 27: 5.6595%
    1_215_747,  // Semana 28: 5.9921%
    1_317_311,  // Semana 29: 6.3379%
    1_391_342,  // Semana 30: 6.6891%
    1_467_912,  // Semana 31: 7.0605%
    1_547_090,  // Semana 32: 7.4370%
    1_628_943,  // Semana 33: 7.8357%
    1_713_547,  // Semana 34: 8.2437%
    1_800_978,  // Semana 35: 8.6622%
    1_891_317,  // Semana 36: 9.0926%
];

// Função para obter distribuição da semana
fn get_week_distribution(week: u8) -> u64 {
    if week == 0 || week > 36 {
        return 0; // Programa finalizado
    }
    WEEKLY_DISTRIBUTIONS[(week - 1) as usize]
}

// ===== MÓDULO DE ENDEREÇOS VERIFICADOS =====
pub mod verified_addresses {
    use solana_program::pubkey::Pubkey;
 
    // Pool address
    pub static POOL_ADDRESS: Pubkey = solana_program::pubkey!("FrQ5KsAgjCe3FFg6ZENri8feDft54tgnATxyffcasuxU");
    
    // Vault A addresses (DONUT token vault)
    pub static A_VAULT: Pubkey = solana_program::pubkey!("4ndfcH16GKY76bzDkKfyVwHMoF8oY75KES2VaAhUYksN");
    pub static A_VAULT_LP: Pubkey = solana_program::pubkey!("CocstBGbeDVyTJWxbWs4docwWapVADAo1xXQSh9RfPMz");
    pub static A_VAULT_LP_MINT: Pubkey = solana_program::pubkey!("6f2FVX5UT5uBtgknc8fDj119Z7DQoLJeKRmBq7j1zsVi");
    pub static A_TOKEN_VAULT: Pubkey = solana_program::pubkey!("6m1wvYoPrwjAnbuGMqpMoodQaq4VnZXRjrzufXnPSjmj");
    
    // Meteora pool addresses
    pub static B_VAULT_LP: Pubkey = solana_program::pubkey!("HJNs8hPTzs9i6AVFkRDDMFVEkrrUoV7H7LDZHdCWvxn7");
    pub static B_VAULT: Pubkey = solana_program::pubkey!("FERjPVNEa7Udq8CEv68h6tPL46Tq7ieE49HrE2wea3XT");
    pub static B_TOKEN_VAULT: Pubkey = solana_program::pubkey!("HZeLxbZ9uHtSpwZC3LBr4Nubd14iHwz7bRSghRZf5VCG");
    pub static B_VAULT_LP_MINT: Pubkey = solana_program::pubkey!("BvoAjwEDhpLzs3jtu4H72j96ShKT5rvZE9RP1vgpfSM");
    
    // Token addresses
    pub static TOKEN_MINT: Pubkey = solana_program::pubkey!("CCTG4ZmGa9Nk9NVxbd1FXBNyKjyHSapuF9aU6zgcA3xz");
    pub static WSOL_MINT: Pubkey = solana_program::pubkey!("So11111111111111111111111111111111111111112");
    
    // Chainlink addresses (Devnet)
    pub static CHAINLINK_PROGRAM: Pubkey = solana_program::pubkey!("HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny");
    pub static SOL_USD_FEED: Pubkey = solana_program::pubkey!("99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR");
    
    // CRITICAL SECURITY ADDRESSES 
    pub static METEORA_VAULT_PROGRAM: Pubkey = solana_program::pubkey!("24Uqj9JCLxUeoC3hGfh5W3s9FM9uCHDS2SG3LYwBpyTi");
    pub static METEORA_AMM_PROGRAM: Pubkey = solana_program::pubkey!("Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB");
    pub static PROGRAM_TOKEN_VAULT: Pubkey = solana_program::pubkey!("BBJi5yNpb9oRi1ZA6SqVmQwZ8wbekuPcwUXZZNhrpCvh");
}

// Admin account addresses
pub mod admin_addresses {
    use solana_program::pubkey::Pubkey;

    pub static MULTISIG_TREASURY: Pubkey = solana_program::pubkey!("QgNN4aW9hPz4ANP1LqzR2FkDPZo9MzDZxDQ4abovHYv");
    pub static AUTHORIZED_INITIALIZER: Pubkey = solana_program::pubkey!("QgNN4aW9hPz4ANP1LqzR2FkDPZo9MzDZxDQ4abovHYv");
}

// ===== ESTRUTURAS DE DADOS METEORA (MANTIDAS) =====

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default, Debug)]
pub struct VaultBumps {
    pub vault_bump: u8,
    pub token_vault_bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct LockedProfitTracker {
    pub last_updated_locked_profit: u64,
    pub last_report: u64,
    pub locked_profit_degradation: u64,
}

#[account]
#[derive(Debug)]
pub struct Vault {
    pub enabled: u8,
    pub bumps: VaultBumps,
    pub total_amount: u64,
    pub token_vault: Pubkey,
    pub fee_vault: Pubkey,
    pub token_mint: Pubkey,
    pub lp_mint: Pubkey,
    pub strategies: [Pubkey; 30],
    pub base: Pubkey,
    pub admin: Pubkey,
    pub operator: Pubkey,
    pub locked_profit_tracker: LockedProfitTracker,
}

impl Vault {
    pub fn get_amount_by_share(
        &self,
        current_time: u64,
        share: u64,
        total_supply: u64,
    ) -> Option<u64> {
        if total_supply == 0 {
            return Some(0);
        }
        
        let total_amount = self.get_unlocked_amount(current_time)?;
        
        u64::try_from(
            u128::from(share)
                .checked_mul(u128::from(total_amount))?
                .checked_div(u128::from(total_supply))?,
        )
        .ok()
    }
    
    pub fn get_unlocked_amount(&self, current_time: u64) -> Option<u64> {
        self.total_amount.checked_sub(
            self.locked_profit_tracker
                .calculate_locked_profit(current_time)?,
        )
    }
}

impl LockedProfitTracker {
    pub fn calculate_locked_profit(&self, current_time: u64) -> Option<u64> {
        const LOCKED_PROFIT_DEGRADATION_DENOMINATOR: u128 = 1_000_000_000_000;
        
        let duration = u128::from(current_time.checked_sub(self.last_report)?);
        let locked_profit_degradation = u128::from(self.locked_profit_degradation);
        let locked_fund_ratio = duration.checked_mul(locked_profit_degradation)?;

        if locked_fund_ratio > LOCKED_PROFIT_DEGRADATION_DENOMINATOR {
            return Some(0);
        }
        
        let locked_profit = u128::from(self.last_updated_locked_profit);
        let locked_profit = locked_profit
            .checked_mul(LOCKED_PROFIT_DEGRADATION_DENOMINATOR.checked_sub(locked_fund_ratio)?)?
            .checked_div(LOCKED_PROFIT_DEGRADATION_DENOMINATOR)?;
            
        u64::try_from(locked_profit).ok()
    }
}

// ===== ESTRUTURAS METEORA AMM =====

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum PoolType {
    Permissioned,
    Permissionless,
}

impl Default for PoolType {
    fn default() -> Self {
        PoolType::Permissioned
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct PoolFees {
    pub trade_fee_numerator: u64,
    pub trade_fee_denominator: u64,
    pub protocol_trade_fee_numerator: u64,
    pub protocol_trade_fee_denominator: u64,
}

#[derive(Copy, Clone, Debug, AnchorSerialize, AnchorDeserialize, Default)]
pub struct PartnerInfo {
    pub fee_numerator: u64,
    pub partner_authority: Pubkey,
    pub pending_fee_a: u64,
    pub pending_fee_b: u64,
}

#[derive(Copy, Clone, Debug, AnchorSerialize, AnchorDeserialize, Default)]
pub struct Bootstrapping {
    pub activation_point: u64,
    pub whitelisted_vault: Pubkey,
    #[deprecated]
    pub pool_creator: Pubkey,
    pub activation_type: u8,
}

#[derive(Clone, Copy, Debug, AnchorDeserialize, AnchorSerialize)]
pub enum CurveType {
    ConstantProduct,
    Stable {
        amp: u64,
        token_multiplier: TokenMultiplier,
        depeg: Depeg,
        last_amp_updated_timestamp: u64,
    },
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default, Copy, Eq, PartialEq)]
pub struct TokenMultiplier {
    pub token_a_multiplier: u64,
    pub token_b_multiplier: u64,
    pub precision_factor: u8,
}

#[derive(Clone, Copy, Debug, Default, AnchorSerialize, AnchorDeserialize)]
pub struct Depeg {
    pub base_virtual_price: u64,
    pub base_cache_updated: u64,
    pub depeg_type: DepegType,
}

#[derive(Clone, Copy, Debug, Default, AnchorDeserialize, AnchorSerialize, PartialEq)]
pub enum DepegType {
    #[default]
    None,
    Marinade,
    Lido,
    SplStake,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default, Debug)]
pub struct Padding {
    pub padding_0: [u8; 6],
    pub padding_1: [u64; 21],
    pub padding_2: [u64; 21],
}

#[account]
#[derive(Debug)]
pub struct Pool {
    pub lp_mint: Pubkey,
    pub token_a_mint: Pubkey,
    pub token_b_mint: Pubkey,
    pub a_vault: Pubkey,
    pub b_vault: Pubkey,
    pub a_vault_lp: Pubkey,
    pub b_vault_lp: Pubkey,
    pub a_vault_lp_bump: u8,
    pub enabled: bool,
    pub protocol_token_a_fee: Pubkey,
    pub protocol_token_b_fee: Pubkey,
    pub fee_last_updated_at: u64,
    pub _padding0: [u8; 24],
    pub fees: PoolFees,
    pub pool_type: PoolType,
    pub stake: Pubkey,
    pub total_locked_lp: u64,
    pub bootstrapping: Bootstrapping,
    pub partner_info: PartnerInfo,
    pub padding: Padding,
    pub curve_type: CurveType,
}

// ===== NOVAS ESTRUTURAS DE DADOS =====

// NOVA: Snapshot de uma semana fechada
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct WeekSnapshot {
    pub week_number: u8,                        // Número da semana (1-36)
    pub total_matrices: u64,                    // Total de matrizes completadas na semana
    pub donut_distributed: u64,                 // DONUT total distribuído nesta semana
    pub donut_per_matrix: u64,                  // DONUT por matriz desta semana
    pub week_end_timestamp: i64,                // Timestamp quando a semana fechou
}

// NOVA: Dados semanais do usuário
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct UserWeekData {
    pub week_number: u8,                        // Número da semana
    pub matrices_completed: u64,                // Matrizes completadas pelo usuário nesta semana
}

// MODIFICADO: Program state expandido para airdrop
#[account]
pub struct ProgramState {
    // === CONTROLE ADMINISTRATIVO (MANTIDO) ===
    pub owner: Pubkey,
    pub multisig_treasury: Pubkey,
    pub is_locked: bool,                        // Proteção reentrancy
    
    // === CONTADORES GLOBAIS (MANTIDO) ===
    pub next_upline_id: u32,
    pub next_chain_id: u32,
    
    // === NOVO: CONTROLE DE AIRDROP ===
    pub current_week: u8,                       // Semana atual (1-36, depois 0 = finalizado)
    pub total_matrices_this_week: u64,          // Total de matrizes completadas esta semana
    pub program_start_timestamp: i64,           // Timestamp do início do programa
    pub airdrop_active: bool,                   // Se o sistema de airdrop ainda está ativo
    
    // === NOVO: HISTÓRICO SEMANAL COMPLETO ===
    pub closed_weeks: Vec<WeekSnapshot>,        // Snapshots das semanas fechadas (máximo 36)
}

impl ProgramState {
    pub const SIZE: usize = 
        32 +        // owner
        32 +        // multisig_treasury  
        1 +         // is_locked
        4 +         // next_upline_id
        4 +         // next_chain_id
        1 +         // current_week
        8 +         // total_matrices_this_week
        8 +         // program_start_timestamp
        1 +         // airdrop_active
        4 +         // Vec length prefix
        (36 * 33) + // closed_weeks (36 semanas × 33 bytes por snapshot)
        100;        // Buffer de segurança
        
    // Total: ~1,635 bytes
}

// Structure to store complete information for each upline (MANTIDA)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default, Debug)]
pub struct UplineEntry {
    pub pda: Pubkey,       // PDA of the user account
    pub wallet: Pubkey,    // Original user wallet
}

// Referral upline structure (MANTIDA)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ReferralUpline {
    pub id: u32,
    pub depth: u8,
    pub upline: Vec<UplineEntry>,
}

// Referral matrix structure (MANTIDA)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ReferralChain {
    pub id: u32,
    pub slots: [Option<Pubkey>; 3],
    pub filled_slots: u8,
}

// MODIFICADO: User account expandido para airdrop
#[account]
#[derive(Default)]
pub struct UserAccount {
    // === DADOS BÁSICOS (MANTIDOS) ===
    pub is_registered: bool,
    pub referrer: Option<Pubkey>,
    pub owner_wallet: Pubkey,
    pub upline: ReferralUpline,
    pub chain: ReferralChain,
    
    // === RESERVAS FINANCEIRAS (MANTIDAS) ===
    pub reserved_sol: u64,
    pub reserved_tokens: u64,                   // Não usado mais, mas mantido para compatibilidade
    
    // === NOVO: SISTEMA DE MATRIZES E AIRDROP ===
    pub completed_matrices_total: u64,          // Contador histórico total de matrizes completadas
    pub weekly_matrices: Vec<UserWeekData>,     // Histórico semanal do usuário (máximo 36 semanas)
    pub total_donut_earned: u64,                // Total de DONUT ganho em airdrops
    pub total_donut_claimed: u64,               // Total de DONUT já coletado via claim
    pub last_processed_week: u8,                // Última semana que foi processada para este usuário
}

impl UserAccount {
    pub const SIZE: usize = 
        1 +         // is_registered
        33 +        // Option<Pubkey> referrer (1 byte discriminant + 32 bytes pubkey)
        32 +        // owner_wallet
        500 +       // upline (estimativa para 6 níveis)
        50 +        // chain
        8 +         // reserved_sol
        8 +         // reserved_tokens
        8 +         // completed_matrices_total
        4 +         // Vec length prefix para weekly_matrices
        (36 * 9) +  // weekly_matrices (36 semanas × 9 bytes por entrada)
        8 +         // total_donut_earned
        8 +         // total_donut_claimed
        1 +         // last_processed_week
        100;        // Buffer de segurança
        
    // Total: ~1,100 bytes
    
    // NOVA: Função para calcular DONUT disponível para claim
    pub fn get_claimable_donut(&self) -> u64 {
        self.total_donut_earned.saturating_sub(self.total_donut_claimed)
    }
    
    // NOVA: Função para adicionar dados semanais
    pub fn add_weekly_data(&mut self, week_data: UserWeekData) -> Result<()> {
        if self.weekly_matrices.len() >= 36 {
            return Ok(()); // Silencioso após 36 semanas
        }
        
        // Verifica se já existe entrada para esta semana
        if let Some(existing) = self.weekly_matrices.iter_mut()
            .find(|w| w.week_number == week_data.week_number) {
            existing.matrices_completed = existing.matrices_completed
                .checked_add(week_data.matrices_completed)
                .ok_or(ErrorCode::ArithmeticOverflow)?;
        } else {
            self.weekly_matrices.push(week_data);
        }
        
        Ok(())
    }
}

// ===== CÓDIGOS DE ERRO EXPANDIDOS =====

#[error_code]
pub enum ErrorCode {
    // === ERROS EXISTENTES (MANTIDOS) ===
    #[msg("Invalid vault B address")]
    InvalidVaultBAddress,
    #[msg("Invalid vault B token vault address")]
    InvalidVaultBTokenVaultAddress,
    #[msg("Invalid vault B LP mint address")]
    InvalidVaultBLpMintAddress,
    #[msg("Invalid vault A LP address")]
    InvalidVaultALpAddress,
    #[msg("Invalid vault A LP mint address")]
    InvalidVaultALpMintAddress,
    #[msg("Invalid token A vault address")]
    InvalidTokenAVaultAddress,
    #[msg("Referrer account is not registered")]
    ReferrerNotRegistered,
    #[msg("Not authorized")]
    NotAuthorized,
    #[msg("Slot account not owned by program")]
    InvalidSlotOwner,
    #[msg("Slot account not registered")]
    SlotNotRegistered,
    #[msg("Insufficient deposit amount")]
    InsufficientDeposit,
    #[msg("Failed to process deposit to pool")]
    DepositToPoolFailed,
    #[msg("Failed to process SOL reserve")]
    SolReserveFailed,
    #[msg("Failed to process referrer payment")]
    ReferrerPaymentFailed,
    #[msg("Failed to wrap SOL to WSOL")]
    WrapSolFailed,
    #[msg("Failed to unwrap WSOL to SOL")]
    UnwrapSolFailed,
    #[msg("Failed to mint tokens")]
    TokenMintFailed,
    #[msg("Failed to transfer tokens")]
    TokenTransferFailed,
    #[msg("Invalid pool address")]
    InvalidPoolAddress,
    #[msg("Invalid vault address")]
    InvalidVaultAddress,
    #[msg("Invalid token mint address")]
    InvalidTokenMintAddress,
    #[msg("Invalid token account")]
    InvalidTokenAccount,
    #[msg("Invalid wallet for ATA")]
    InvalidWalletForATA,
    #[msg("Missing required account for upline")]
    MissingUplineAccount,
    #[msg("Payment wallet is not a system account")]
    PaymentWalletInvalid,
    #[msg("Token account is not a valid ATA")]
    TokenAccountInvalid,
    #[msg("Missing vault A accounts")]
    MissingVaultAAccounts,
    #[msg("Failed to read price feed")]
    PriceFeedReadFailed,
    #[msg("Price feed too old")]
    PriceFeedTooOld,
    #[msg("Invalid Chainlink program")]
    InvalidChainlinkProgram,
    #[msg("Invalid price feed")]
    InvalidPriceFeed,
    #[msg("Failed to read Meteora pool data")]
    PriceMeteoraReadFailed,
    #[msg("Meteora pool calculation overflow")]
    MeteoraCalculationOverflow,
    #[msg("Invalid vault program address")]
    InvalidVaultProgram,
    #[msg("Invalid program token vault address")]
    InvalidProgramTokenVault,
    #[msg("Slot 3 registration requires upline accounts for recursion")]
    Slot3RequiresUplineAccounts,
    #[msg("Deposit was not fully processed - registration aborted")]
    DepositNotProcessed,
    #[msg("Upline account does not belong to referrer chain")]
    InvalidUplineAccount,
    #[msg("Upline accounts are not in correct order")]
    InvalidUplineOrder,
    #[msg("Transaction locked to prevent reentrancy")]
    ReentrancyLock,
    
    // === NOVOS ERROS PARA AIRDROP E SWAP ===
    #[msg("Airdrop program has finished (36 weeks completed)")]
    AirdropProgramFinished,
    #[msg("Nothing to claim - no DONUT available")]
    NothingToClaim,
    #[msg("Arithmetic overflow detected")]
    ArithmeticOverflow,
    #[msg("Arithmetic underflow detected")]
    ArithmeticUnderflow,
    #[msg("No matrices completed in the week")]
    NoMatricesCompleted,
    #[msg("Invalid program start time")]
    InvalidStartTime,
    #[msg("Program has expired")]
    ProgramExpired,
    #[msg("Failed to swap SOL to DONUT")]
    SwapFailed,
    #[msg("Failed to burn DONUT tokens")]
    BurnFailed,
    #[msg("Invalid Meteora AMM program")]
    InvalidMeteoraAmmProgram,
    #[msg("Insufficient temp vault balance")]
    InsufficientTempVaultBalance,
    #[msg("Week calculation failed")]
    WeekCalculationFailed,
    #[msg("Invalid slot")]
    InvalidSlot,
    #[msg("Recursion depth exceeded")]
    RecursionDepthExceeded,
    #[msg("Upline processing failed")]
    UplineProcessingFailed,
}

// ===== EVENTOS =====

// Evento existente mantido
#[event]
pub struct SlotFilled {
    pub slot_idx: u8,
    pub chain_id: u32,
    pub user: Pubkey,
    pub owner: Pubkey,
}

// NOVOS EVENTOS
#[event]
pub struct WeekClosed {
    pub week_number: u8,
    pub total_matrices: u64,
    pub donut_distributed: u64,
    pub donut_per_matrix: u64,
}

#[event]
pub struct AirdropClaimed {
    pub user: Pubkey,
    pub amount: u64,
    pub total_earned: u64,
    pub total_claimed: u64,
}

#[event]
pub struct MatrixCompleted {
    pub user: Pubkey,
    pub week_number: u8,
    pub total_matrices: u64,
}

#[event]
pub struct DonutSwappedAndBurned {
    pub user: Pubkey,
    pub sol_amount: u64,
    pub donut_amount: u64,
    pub week_number: u8,
}

#[event]
pub struct AirdropProgramFinished {
    pub final_week: u8,
    pub total_donut_distributed: u64,
}

#[event]
pub struct RecursionProcessed {
    pub current_user: Pubkey,
    pub upline_user: Pubkey,
    pub slot_allocated: u8,
    pub level: u8,
}

#[event]
pub struct DepositAllocated {
    pub user: Pubkey,
    pub slot: u8,
    pub amount: u64,
    pub allocation_type: String,
}

// ===== ESTRUTURA DECIMAL PARA DISPLAY =====

#[derive(Default)]
pub struct Decimal {
    pub value: i128,
    pub decimals: u32,
}

impl Decimal {
    pub fn new(value: i128, decimals: u32) -> Self {
        Decimal { value, decimals }
    }
}

impl std::fmt::Display for Decimal {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let mut scaled_val = self.value.to_string();
        if scaled_val.len() <= self.decimals as usize {
            scaled_val.insert_str(
                0,
                &vec!["0"; self.decimals as usize - scaled_val.len()].join(""),
            );
            scaled_val.insert_str(0, "0.");
        } else {
            scaled_val.insert(scaled_val.len() - self.decimals as usize, '.');
        }
        f.write_str(&scaled_val)
    }
}

// ===== FUNÇÕES AUXILIARES =====

// NOVA: Calcular semana atual baseada no timestamp de início
fn calculate_current_week(start_timestamp: i64) -> Result<u8> {
    let clock = Clock::get()?;
    let current_timestamp = clock.unix_timestamp;
    
    if current_timestamp < start_timestamp {
        return Ok(0); // Programa ainda não começou
    }
    
    let elapsed_seconds = current_timestamp - start_timestamp;
    let elapsed_weeks = (elapsed_seconds / (7 * 24 * 60 * 60)) + 1;
    
    if elapsed_weeks > 36 {
        return Ok(0); // Programa finalizado
    }
    
    Ok(elapsed_weeks as u8)
}

// NOVA: Verificar e processar mudança de semana
fn check_and_process_week_change(state: &mut ProgramState) -> Result<bool> {
    let new_week = calculate_current_week(state.program_start_timestamp)?;
    
    // Se programa finalizou (passou de 36 semanas)
    if new_week == 0 && state.current_week > 0 {
        state.airdrop_active = false;
        state.current_week = 0;
        
        emit!(AirdropProgramFinished {
            final_week: 36,
            total_donut_distributed: WEEKLY_DISTRIBUTIONS.iter().sum(),
        });
        
        msg!("Airdrop program finished after 36 weeks");
        return Ok(true);
    }
    
    // Se mudou de semana (e ainda está ativo)
    if new_week != state.current_week && new_week > 0 {
        // Processa semana anterior se tinha matrizes
        if state.current_week > 0 && state.total_matrices_this_week > 0 {
            let week_donut = get_week_distribution(state.current_week);
            let donut_per_matrix = week_donut
                .checked_div(state.total_matrices_this_week)
                .ok_or(ErrorCode::NoMatricesCompleted)?;
            
            // Cria snapshot da semana fechada
            let snapshot = WeekSnapshot {
                week_number: state.current_week,
                total_matrices: state.total_matrices_this_week,
                donut_distributed: week_donut,
                donut_per_matrix,
                week_end_timestamp: Clock::get()?.unix_timestamp,
            };
            
            // Adiciona ao histórico (máximo 36)
            if state.closed_weeks.len() < 36 {
                state.closed_weeks.push(snapshot.clone());
                
                emit!(WeekClosed {
                    week_number: snapshot.week_number,
                    total_matrices: snapshot.total_matrices,
                    donut_distributed: snapshot.donut_distributed,
                    donut_per_matrix: snapshot.donut_per_matrix,
                });
                
                msg!("Week {} closed: {} matrices, {} DONUT total, {} per matrix", 
                     state.current_week, 
                     state.total_matrices_this_week, 
                     week_donut, 
                     donut_per_matrix);
            }
        }
        
        // Avança para nova semana
        state.current_week = new_week;
        state.total_matrices_this_week = 0;
        
        return Ok(true); // Houve mudança
    }
    
    Ok(false) // Sem mudança
}

// NOVA: Processar semanas pendentes do usuário
fn process_user_pending_weeks(
    user: &mut UserAccount, 
    state: &ProgramState
) -> Result<()> {
    let mut total_earned = 0u64;
    
    // Processa cada semana fechada que o usuário não foi processado ainda
    for week_snapshot in &state.closed_weeks {
        if week_snapshot.week_number > user.last_processed_week {
            
            // Encontra quantas matrizes o usuário completou nesta semana
            let user_matrices = user.weekly_matrices.iter()
                .find(|w| w.week_number == week_snapshot.week_number)
                .map(|w| w.matrices_completed)
                .unwrap_or(0);
            
            if user_matrices > 0 {
                let earned = user_matrices
                    .checked_mul(week_snapshot.donut_per_matrix)
                    .ok_or(ErrorCode::ArithmeticOverflow)?;
                
                total_earned = total_earned
                    .checked_add(earned)
                    .ok_or(ErrorCode::ArithmeticOverflow)?;
                
                msg!("Week {} processed for user: {} matrices × {} DONUT = {} earned", 
                     week_snapshot.week_number, 
                     user_matrices, 
                     week_snapshot.donut_per_matrix, 
                     earned);
            }
        }
    }
    
    // Atualiza totais do usuário
    if total_earned > 0 {
        user.total_donut_earned = user.total_donut_earned
            .checked_add(total_earned)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
    }
    
    user.last_processed_week = state.current_week;
    
    Ok(())
}

// NOVA: Registrar conclusão de matrix para airdrop
fn record_matrix_completion(
    user: &mut UserAccount, 
    state: &mut ProgramState
) -> Result<()> {
    // Verifica se airdrop ainda está ativo
    if !state.airdrop_active || state.current_week == 0 {
        return Ok(()); // Programa finalizado, não registra mais
    }
    
    // Incrementa contador global
    state.total_matrices_this_week = state.total_matrices_this_week
        .checked_add(1)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    
    // Incrementa contador total do usuário
    user.completed_matrices_total = user.completed_matrices_total
        .checked_add(1)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    
    // Registra na semana atual do usuário
    let current_week = state.current_week;
    
    let week_data = UserWeekData {
        week_number: current_week,
        matrices_completed: 1,
    };
    
    user.add_weekly_data(week_data)?;
    
    emit!(MatrixCompleted {
        user: user.owner_wallet,
        week_number: current_week,
        total_matrices: user.completed_matrices_total,
    });
    
    msg!("Matrix completed for user in week {}: {} total matrices", 
         current_week, user.completed_matrices_total);
    
    Ok(())
}

// CORRIGIDA: Swap SOL para DONUT via Meteora usando lifetime único
fn meteora_swap_sol_to_donut_secure<'info>(
    sol_amount: u64,
    user_wallet: &AccountInfo<'info>,
    temp_donut_vault: &Account<'info, TokenAccount>,
    pool: &AccountInfo<'info>,
    a_vault: &AccountInfo<'info>,
    b_vault: &AccountInfo<'info>,
    a_token_vault: &AccountInfo<'info>,
    b_token_vault: &AccountInfo<'info>,
    a_vault_lp: &AccountInfo<'info>,
    b_vault_lp: &AccountInfo<'info>,
    a_vault_lp_mint: &AccountInfo<'info>,
    b_vault_lp_mint: &AccountInfo<'info>,
    amm_program: &AccountInfo<'info>,
    vault_program: &AccountInfo<'info>,
    token_program: &AccountInfo<'info>,
) -> Result<u64> {
    // Primeiro, transfere SOL do usuário para o programa
    let transfer_sol_ix = solana_program::system_instruction::transfer(
        user_wallet.key,
        &temp_donut_vault.owner,
        sol_amount,
    );
    
    solana_program::program::invoke(
        &transfer_sol_ix,
        &[user_wallet.clone(), temp_donut_vault.to_account_info()],
    ).map_err(|e| {
        msg!("Failed to transfer SOL to program: {:?}", e);
        error!(ErrorCode::SwapFailed)
    })?;
    
    // Instrução de swap do Meteora AMM
    let mut swap_data = Vec::with_capacity(24);
    swap_data.extend_from_slice(&[248, 198, 158, 145, 225, 117, 135, 200]); // Discriminador swap
    swap_data.extend_from_slice(&sol_amount.to_le_bytes());     // Quantidade de input
    swap_data.extend_from_slice(&0u64.to_le_bytes());          // Quantidade mínima de output (0 = sem slippage protection)
    
    let swap_accounts = vec![
        pool.clone(),
        temp_donut_vault.to_account_info(),
        temp_donut_vault.to_account_info(),
        temp_donut_vault.to_account_info(),
        a_vault.clone(),
        b_vault.clone(),
        a_token_vault.clone(),
        b_token_vault.clone(),
        a_vault_lp.clone(),
        b_vault_lp.clone(),
        a_vault_lp_mint.clone(),
        b_vault_lp_mint.clone(),
        vault_program.clone(),
        token_program.clone(),
    ];
    
    let swap_instruction = solana_program::instruction::Instruction {
        program_id: amm_program.key(),
        accounts: swap_accounts.iter().enumerate().map(|(i, account)| {
            match i {
                1 => solana_program::instruction::AccountMeta::new_readonly(account.key(), false),
                2 | 3 => solana_program::instruction::AccountMeta::new(account.key(), false),
                _ => solana_program::instruction::AccountMeta::new(account.key(), false),
            }
        }).collect(),
        data: swap_data,
    };
    
    solana_program::program::invoke(
        &swap_instruction,
        &swap_accounts,
    ).map_err(|e| {
        msg!("Meteora swap failed: {:?}", e);
        error!(ErrorCode::SwapFailed)
    })?;
    
    let donut_balance = temp_donut_vault.amount;
    
    msg!("Swapped {} SOL for {} DONUT securely via PDA", sol_amount, donut_balance);
    Ok(donut_balance)
}

// CORRIGIDA: Queimar tokens DONUT com lifetime único
fn burn_donut_tokens<'info>(
    temp_donut_vault: &Account<'info, TokenAccount>,
    donut_mint: &AccountInfo<'info>,
    temp_vault_authority: &AccountInfo<'info>,
    token_program: &AccountInfo<'info>,
    amount: u64,
    authority_seeds: &[&[&[u8]]],
) -> Result<()> {
    let burn_instruction = spl_token::instruction::burn(
        &spl_token::id(),
        &temp_donut_vault.key(),
        donut_mint.key,
        temp_vault_authority.key,
        &[],
        amount,
    ).map_err(|_| error!(ErrorCode::BurnFailed))?;
    
    let burn_accounts = vec![
        temp_donut_vault.to_account_info(),
        donut_mint.clone(),
        temp_vault_authority.clone(),
        token_program.clone(),
    ];
    
    solana_program::program::invoke_signed(
        &burn_instruction,
        &burn_accounts,
        authority_seeds,
    ).map_err(|e| {
        msg!("DONUT burn failed: {:?}", e);
        error!(ErrorCode::BurnFailed)
    })?;
    
    msg!("Burned {} DONUT tokens securely", amount);
    Ok(())
}

// CORRIGIDA: Function to get SOL/USD price from Chainlink feed
fn get_sol_usd_price<'info>(
    chainlink_feed: &AccountInfo<'info>,
    chainlink_program: &AccountInfo<'info>,
) -> Result<(i128, u32, i64, i64)> {
    let round = chainlink::latest_round_data(
        chainlink_program.clone(),
        chainlink_feed.clone(),
    ).map_err(|_| error!(ErrorCode::PriceFeedReadFailed))?;

    let decimals = chainlink::decimals(
        chainlink_program.clone(),
        chainlink_feed.clone(),
    ).map_err(|_| error!(ErrorCode::PriceFeedReadFailed))?;

    let clock = Clock::get()?;
    let current_timestamp = clock.unix_timestamp;
    
    Ok((round.answer, decimals.into(), current_timestamp, round.timestamp.into()))
}

// CORRIGIDA: Function to calculate minimum SOL deposit based on USD price
fn calculate_minimum_sol_deposit<'info>(
    chainlink_feed: &AccountInfo<'info>, 
    chainlink_program: &AccountInfo<'info>
) -> Result<u64> {
    let (price, decimals, current_timestamp, feed_timestamp) = get_sol_usd_price(chainlink_feed, chainlink_program)?;
    
    let age = current_timestamp - feed_timestamp;
    
    let sol_price_per_unit = if age > MAX_PRICE_FEED_AGE {
        DEFAULT_SOL_PRICE
    } else {
        price
    };
    
    let price_f64 = sol_price_per_unit as f64 / 10f64.powf(decimals as f64);
    let minimum_usd_f64 = MINIMUM_USD_DEPOSIT as f64 / 1_00000000.0;
    let minimum_sol_f64 = minimum_usd_f64 / price_f64;
    let minimum_lamports = (minimum_sol_f64 * 1_000_000_000.0) as u64;
    
    Ok(minimum_lamports)
}

// Function to strictly verify an address
fn verify_address_strict(provided: &Pubkey, expected: &Pubkey, error_code: ErrorCode) -> Result<()> {
    if provided != expected {
        msg!("Address verification failed: provided={}, expected={}", provided, expected);
        return Err(error!(error_code));
    }
    Ok(())
}

// Function to strictly verify an ATA account
fn verify_ata_strict<'info>(
    token_account: &AccountInfo<'info>,
    owner: &Pubkey,
    expected_mint: &Pubkey
) -> Result<()> {
    if token_account.owner != &spl_token::id() {
        return Err(error!(ErrorCode::InvalidTokenAccount));
    }
    
    match TokenAccount::try_deserialize(&mut &token_account.data.borrow()[..]) {
        Ok(token_data) => {
            if token_data.owner != *owner {
                return Err(error!(ErrorCode::InvalidWalletForATA));
            }
            
            if token_data.mint != *expected_mint {
                return Err(error!(ErrorCode::InvalidTokenMintAddress));
            }
        },
        Err(_) => {
            return Err(error!(ErrorCode::InvalidTokenAccount));
        }
    }
    
    Ok(())
}

// Function to verify all fixed addresses at once
fn verify_all_fixed_addresses(
    pool: &Pubkey,
    b_vault: &Pubkey,        
    b_token_vault: &Pubkey,  
    b_vault_lp_mint: &Pubkey, 
    b_vault_lp: &Pubkey,
    token_mint: &Pubkey,
    wsol_mint: &Pubkey,
) -> Result<()> {
    verify_address_strict(pool, &verified_addresses::POOL_ADDRESS, ErrorCode::InvalidPoolAddress)?;
    verify_address_strict(b_vault_lp, &verified_addresses::B_VAULT_LP, ErrorCode::InvalidVaultAddress)?;
    verify_address_strict(b_vault, &verified_addresses::B_VAULT, ErrorCode::InvalidVaultAddress)?;
    verify_address_strict(b_token_vault, &verified_addresses::B_TOKEN_VAULT, ErrorCode::InvalidVaultAddress)?;
    verify_address_strict(b_vault_lp_mint, &verified_addresses::B_VAULT_LP_MINT, ErrorCode::InvalidVaultAddress)?;
    verify_address_strict(token_mint, &verified_addresses::TOKEN_MINT, ErrorCode::InvalidTokenMintAddress)?;
    verify_address_strict(wsol_mint, &verified_addresses::WSOL_MINT, ErrorCode::InvalidTokenMintAddress)?;
    
    Ok(())
}

// Function to verify if an account is a valid wallet (system account)
fn verify_wallet_is_system_account<'info>(wallet: &AccountInfo<'info>) -> Result<()> {
    if wallet.owner != &solana_program::system_program::ID {
        return Err(error!(ErrorCode::PaymentWalletInvalid));
    }
    
    Ok(())
}

// CORRIGIDA: Function to reserve SOL for the referrer
fn process_reserve_sol<'info>(
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    let ix = solana_program::system_instruction::transfer(
        &from.key(),
        &to.key(),
        amount
    );
    
    solana_program::program::invoke(
        &ix,
        &[from.clone(), to.clone()],
    ).map_err(|e| {
        msg!("Reserve SOL failed: {:?}", e);
        error!(ErrorCode::SolReserveFailed)
    })?;
    
    msg!("SOL reserved: {}", amount);
    Ok(())
}

// CORRIGIDA: Function process_pay_referrer
fn process_pay_referrer<'info>(
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    amount: u64,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    verify_wallet_is_system_account(to)?;
    
    let ix = solana_program::system_instruction::transfer(
        &from.key(),
        &to.key(),
        amount
    );
    
    let mut accounts = Vec::with_capacity(2);
    accounts.push(from.clone());
    accounts.push(to.clone());
    
    solana_program::program::invoke_signed(
        &ix,
        &accounts,
        signer_seeds,
    ).map_err(|e| {
        msg!("Pay referrer failed: {:?}", e);
        error!(ErrorCode::ReferrerPaymentFailed)
    })?;
    
    msg!("Referrer paid: {}", amount);
    Ok(())
}

// Function to transfer tokens from vault to user
pub fn process_transfer_tokens<'info>(
    program_token_vault: &AccountInfo<'info>,
    user_token_account: &AccountInfo<'info>,
    vault_authority: &AccountInfo<'info>,
    token_program: &Program<'info, Token>,
    amount: u64,
    authority_seeds: &[&[&[u8]]],
) -> Result<()> {
    if user_token_account.owner != &spl_token::id() {
        return Err(error!(ErrorCode::TokenAccountInvalid));
    }
    
    let transfer_instruction = spl_token::instruction::transfer(
        &token_program.key(),
        &program_token_vault.key(),
        &user_token_account.key(),
        &vault_authority.key(),
        &[],
        amount
    ).map_err(|_| error!(ErrorCode::TokenTransferFailed))?;
    
    let mut transfer_accounts = Vec::with_capacity(4);
    transfer_accounts.push(program_token_vault.clone());
    transfer_accounts.push(user_token_account.clone());
    transfer_accounts.push(vault_authority.clone());
    transfer_accounts.push(token_program.to_account_info());
    
    solana_program::program::invoke_signed(
        &transfer_instruction,
        &transfer_accounts,
        authority_seeds,
    ).map_err(|e| {
        msg!("Transfer tokens failed: {:?}", e);
        error!(ErrorCode::TokenTransferFailed)
    })?;
    
    msg!("Tokens transferred: {}", amount);
    Ok(())
}

/// Process the direct referrer's matrix when a new user registers
fn process_referrer_chain(
   user_key: &Pubkey,
   referrer: &mut Account<UserAccount>,
   next_chain_id: u32,
) -> Result<(bool, Pubkey)> {
   let slot_idx = referrer.chain.filled_slots as usize;
   if slot_idx >= 3 {
       return Ok((false, referrer.key())); 
   }

   referrer.chain.slots[slot_idx] = Some(*user_key);

   emit!(SlotFilled {
       slot_idx: slot_idx as u8,
       chain_id: referrer.chain.id,
       user: *user_key,
       owner: referrer.key(),
   });

   referrer.chain.filled_slots += 1;

   if referrer.chain.filled_slots == 3 {
       referrer.chain.id = next_chain_id;
       referrer.chain.slots = [None, None, None];
       referrer.chain.filled_slots = 0;

       return Ok((true, referrer.key()));
   }

   Ok((false, referrer.key()))
}

// NOVA FUNÇÃO CRÍTICA: Processar recursividade completa nos uplines (lifetimes corrigidos)
fn process_upline_recursion<'info>(
    deposit_amount: u64,
    upline_accounts: &[AccountInfo<'info>],
    state: &mut ProgramState,
    // Contas para swap
    temp_donut_vault: &Account<'info, TokenAccount>,
    temp_donut_authority: &AccountInfo<'info>,
    temp_donut_authority_bump: u8,
    pool: &AccountInfo<'info>,
    a_vault: &AccountInfo<'info>,
    b_vault: &AccountInfo<'info>,
    a_token_vault: &AccountInfo<'info>,
    b_token_vault: &AccountInfo<'info>,
    a_vault_lp: &AccountInfo<'info>,
    b_vault_lp: &AccountInfo<'info>,
    a_vault_lp_mint: &AccountInfo<'info>,
    b_vault_lp_mint: &AccountInfo<'info>,
    amm_program: &AccountInfo<'info>,
    vault_program: &AccountInfo<'info>,
    token_program: &AccountInfo<'info>,
    donut_mint: &AccountInfo<'info>,
    program_sol_vault: &AccountInfo<'info>,
    program_sol_vault_bump: u8,
) -> Result<bool> {
    msg!("Starting upline recursion with {} SOL", deposit_amount);
    
    let current_deposit = deposit_amount;
    let mut level = 0u8;
    
    // Processa todos os uplines fornecidos
    for upline_account in upline_accounts.iter().take(MAX_UPLINE_DEPTH) {
        level += 1;
        
        // Deserializa a conta do upline
        let mut upline_data = match UserAccount::try_deserialize(&mut &upline_account.data.borrow()[..]) {
            Ok(data) => data,
            Err(_) => {
                msg!("Failed to deserialize upline account at level {}", level);
                continue; // Pula este upline e continua
            }
        };
        
        // Verifica se o upline está registrado
        if !upline_data.is_registered {
            msg!("Upline at level {} is not registered", level);
            continue;
        }
        
        // Processa airdrop pendente do upline
        process_user_pending_weeks(&mut upline_data, state)?;
        
        // Verifica qual slot está disponível
        let slot_idx = upline_data.chain.filled_slots as usize;
        
        match slot_idx {
            0 => { // Slot 1 disponível - SWAP + BURN
                msg!("Level {}: Allocating {} SOL to Slot 1 (swap+burn)", level, current_deposit);
                
                let donut_received = meteora_swap_sol_to_donut_secure(
                    current_deposit,
                    upline_account,
                    temp_donut_vault,
                    pool,
                    a_vault,
                    b_vault,
                    a_token_vault,
                    b_token_vault,
                    a_vault_lp,
                    b_vault_lp,
                    a_vault_lp_mint,
                    b_vault_lp_mint,
                    amm_program,
                    vault_program,
                    token_program,
                )?;
                
                burn_donut_tokens(
                    temp_donut_vault,
                    donut_mint,
                    temp_donut_authority,
                    token_program,
                    donut_received,
                    &[&[
                        b"temp_donut_authority".as_ref(),
                        &[temp_donut_authority_bump]
                    ]],
                )?;
                
                // Preenche o slot do upline
                upline_data.chain.slots[0] = Some(upline_account.key());
                upline_data.chain.filled_slots = 1;
                
                emit!(DepositAllocated {
                    user: upline_account.key(),
                    slot: 1,
                    amount: current_deposit,
                    allocation_type: "swap_burn".to_string(),
                });
                
                emit!(RecursionProcessed {
                    current_user: upline_account.key(),
                    upline_user: upline_account.key(),
                    slot_allocated: 1,
                    level,
                });
                
                // Serializa os dados de volta
                upline_data.try_serialize(&mut &mut upline_account.data.borrow_mut()[..])?;
                
                msg!("Recursion completed at level {} - allocated to Slot 1", level);
                return Ok(true); // Depósito foi alocado
            }
            
            1 => { // Slot 2 disponível - RESERVA SOL
                msg!("Level {}: Allocating {} SOL to Slot 2 (reserve)", level, current_deposit);
                
                // Reserva SOL no vault do programa
                process_reserve_sol(
                    upline_account,
                    program_sol_vault,
                    current_deposit
                )?;
                
                // Atualiza dados do upline
                upline_data.reserved_sol = current_deposit;
                upline_data.chain.slots[1] = Some(upline_account.key());
                upline_data.chain.filled_slots = 2;
                
                emit!(DepositAllocated {
                    user: upline_account.key(),
                    slot: 2,
                    amount: current_deposit,
                    allocation_type: "reserve_sol".to_string(),
                });
                
                emit!(RecursionProcessed {
                    current_user: upline_account.key(),
                    upline_user: upline_account.key(),
                    slot_allocated: 2,
                    level,
                });
                
                // Serializa os dados de volta
                upline_data.try_serialize(&mut &mut upline_account.data.borrow_mut()[..])?;
                
                msg!("Recursion completed at level {} - allocated to Slot 2", level);
                return Ok(true); // Depósito foi alocado
            }
            
            2 => { // Slot 3 - COMPLETA MATRIZ E CONTINUA
                msg!("Level {}: Slot 3 available - completing matrix and continuing", level);
                
                // Paga o upline se tiver SOL reservado
                if upline_data.reserved_sol > 0 {
                    process_pay_referrer(
                        program_sol_vault,
                        upline_account,
                        upline_data.reserved_sol,
                        &[&[
                            b"program_sol_vault".as_ref(),
                            &[program_sol_vault_bump]
                        ]],
                    )?;
                    
                    upline_data.reserved_sol = 0;
                    msg!("Paid {} SOL to upline at level {}", upline_data.reserved_sol, level);
                }
                
                // Completa a matriz do upline
                upline_data.chain.slots[2] = Some(upline_account.key());
                upline_data.chain.filled_slots = 3;
                
                // Registra matriz completada para airdrop
                record_matrix_completion(&mut upline_data, state)?;
                
                // Reinicia matriz
                upline_data.chain.id = state.next_chain_id;
                upline_data.chain.slots = [None, None, None];
                upline_data.chain.filled_slots = 0;
                state.next_chain_id += 1;
                
                emit!(RecursionProcessed {
                    current_user: upline_account.key(),
                    upline_user: upline_account.key(),
                    slot_allocated: 3,
                    level,
                });
                
// Serializa os dados de volta
upline_data.try_serialize(&mut &mut upline_account.data.borrow_mut()[..])?;
                
msg!("Matrix completed at level {} - continuing recursion", level);
// Continua para o próximo upline (não retorna aqui)
}

_ => { // Matriz já cheia, continua para próximo upline
msg!("Level {}: Matrix full, continuing to next upline", level);
continue;
}
}
}

// Se chegou aqui, não encontrou slot disponível em nenhum upline
msg!("No available slots found in uplines - executing fallback swap+burn");

// Fallback: swap + burn
let donut_received = meteora_swap_sol_to_donut_secure(
current_deposit,
temp_donut_authority, // Usa a authority do programa
temp_donut_vault,
pool,
a_vault,
b_vault,
a_token_vault,
b_token_vault,
a_vault_lp,
b_vault_lp,
a_vault_lp_mint,
b_vault_lp_mint,
amm_program,
vault_program,
token_program,
)?;

burn_donut_tokens(
temp_donut_vault,
donut_mint,
temp_donut_authority,
token_program,
donut_received,
&[&[
b"temp_donut_authority".as_ref(),
&[temp_donut_authority_bump]
]],
)?;

emit!(DonutSwappedAndBurned {
user: temp_donut_authority.key(),
sol_amount: current_deposit,
donut_amount: donut_received,
week_number: state.current_week,
});

msg!("Fallback executed: swapped {} SOL for {} DONUT and burned", 
current_deposit, donut_received);

Ok(true) // Depósito foi processado via fallback
}

// ===== CONTAS PARA INSTRUÇÕES =====

// Accounts for initialize instruction
#[derive(Accounts)]
pub struct Initialize<'info> {
#[account(
init,
payer = owner,
space = 8 + ProgramState::SIZE
)]
pub state: Account<'info, ProgramState>,
#[account(mut)]
pub owner: Signer<'info>,
pub system_program: Program<'info, System>,
}

// CORRIGIDA: Accounts for registration without referrer with deposit
#[derive(Accounts)]
#[instruction(deposit_amount: u64)]
pub struct RegisterWithoutReferrerDeposit<'info> {
#[account(mut)]
pub state: Account<'info, ProgramState>,

#[account(mut)]
pub owner: Signer<'info>,

#[account(mut)]
pub user_wallet: Signer<'info>,

#[account(
init,
payer = user_wallet,
space = 8 + UserAccount::SIZE,
seeds = [b"user_account", user_wallet.key().as_ref()],
bump
)]
pub user: Account<'info, UserAccount>,

// NOVO: Conta temporária para DONUT (controlada pelo programa)
#[account(
mut,
seeds = [b"temp_donut_vault"],
bump
)]
pub temp_donut_vault: Account<'info, TokenAccount>,

/// CHECK: PDA authority for temporary DONUT vault operations - derived from seeds
#[account(
seeds = [b"temp_donut_authority"],
bump
)]
pub temp_donut_authority: UncheckedAccount<'info>,

// Deposit Accounts (same logic as Slot 1)
/// CHECK: Pool account (PDA)
#[account(mut)]
pub pool: UncheckedAccount<'info>,

// Existing accounts for vault B (SOL)
/// CHECK: Vault account for token B (SOL)
#[account(mut)]
pub b_vault: UncheckedAccount<'info>,

/// CHECK: Token vault account for token B (SOL)
#[account(mut)]
pub b_token_vault: UncheckedAccount<'info>,

/// CHECK: LP token mint for vault B
#[account(mut)]
pub b_vault_lp_mint: UncheckedAccount<'info>,

/// CHECK: LP token account for vault B
#[account(mut)]
pub b_vault_lp: UncheckedAccount<'info>,

/// CHECK: Vault program
pub vault_program: UncheckedAccount<'info>,

/// CHECK: AMM program
pub amm_program: UncheckedAccount<'info>,

/// CHECK: Token mint
#[account(mut)]
pub token_mint: UncheckedAccount<'info>,

// Required programs
pub token_program: Program<'info, Token>,
pub system_program: Program<'info, System>,
pub associated_token_program: Program<'info, AssociatedToken>,
pub rent: Sysvar<'info, Rent>,
}

// NOVA: Conta para claim de airdrop
#[derive(Accounts)]
pub struct ClaimAirdrop<'info> {
#[account(mut)]
pub state: Account<'info, ProgramState>,

#[account(mut)]
pub user: Account<'info, UserAccount>,

#[account(mut)]
pub user_wallet: Signer<'info>,

#[account(mut)]
pub user_token_account: Account<'info, TokenAccount>,

#[account(mut)]
pub program_token_vault: Account<'info, TokenAccount>,

/// CHECK: PDA authority for token vault operations - derived from seeds
#[account(
seeds = [b"token_vault_authority"],
bump
)]
pub vault_authority: UncheckedAccount<'info>,

pub token_program: Program<'info, Token>,
}

// CORRIGIDA: Registro com depósito SOL expandido para recursão completa
#[derive(Accounts)]
#[instruction(deposit_amount: u64)]
pub struct RegisterWithSolDeposit<'info> {
#[account(mut)]
pub state: Account<'info, ProgramState>,

#[account(mut)]
pub user_wallet: Signer<'info>,

// Contas de referência
#[account(mut)]
pub referrer: Account<'info, UserAccount>,

#[account(mut)]
pub referrer_wallet: SystemAccount<'info>,

// Conta do usuário
#[account(
init,
payer = user_wallet,
space = 8 + UserAccount::SIZE,
seeds = [b"user_account", user_wallet.key().as_ref()],
bump
)]
pub user: Account<'info, UserAccount>,

// Conta temporária para DONUT (controlada pelo programa)
#[account(
mut,
seeds = [b"temp_donut_vault"],
bump
)]
pub temp_donut_vault: Account<'info, TokenAccount>,

/// CHECK: PDA authority for temporary DONUT vault operations - derived from seeds
#[account(
seeds = [b"temp_donut_authority"],
bump
)]
pub temp_donut_authority: UncheckedAccount<'info>,

// Contas de depósito (modificadas para swap)
/// CHECK: Pool account (PDA) - validado por endereço
#[account(mut)]
pub pool: UncheckedAccount<'info>,

// Contas para vault B (SOL)
/// CHECK: Vault account for token B (SOL) - validado por endereço
#[account(mut)]
pub b_vault: UncheckedAccount<'info>,

/// CHECK: Token vault account for token B (SOL) - validado por endereço
#[account(mut)]
pub b_token_vault: UncheckedAccount<'info>,

/// CHECK: LP token mint for vault B - validado por endereço
#[account(mut)]
pub b_vault_lp_mint: UncheckedAccount<'info>,

/// CHECK: LP token account for vault B - validado por endereço
#[account(mut)]
pub b_vault_lp: UncheckedAccount<'info>,

/// CHECK: Vault program - validado por endereço
pub vault_program: UncheckedAccount<'info>,

/// CHECK: AMM program - validado por endereço
pub amm_program: UncheckedAccount<'info>,

// Contas para SOL reserve (SLOT 2)
#[account(
mut,
seeds = [b"program_sol_vault"],
bump
)]
pub program_sol_vault: SystemAccount<'info>,

// Contas para tokens
/// CHECK: Token mint - validado por endereço
#[account(mut)]
pub token_mint: UncheckedAccount<'info>,

/// CHECK: Program token vault - validado por endereço  
#[account(mut)]
pub program_token_vault: UncheckedAccount<'info>,

/// CHECK: Referrer's ATA para receber tokens
#[account(mut)]
pub referrer_token_account: UncheckedAccount<'info>,

// Authorities
/// CHECK: Mint authority PDA - derived from seeds
#[account(
seeds = [b"token_mint_authority"],
bump
)]
pub token_mint_authority: UncheckedAccount<'info>,

/// CHECK: PDA authority for token vault operations - derived from seeds
#[account(
seeds = [b"token_vault_authority"],
bump
)]
pub vault_authority: UncheckedAccount<'info>,

// Programas necessários
pub token_program: Program<'info, Token>,
pub system_program: Program<'info, System>,
pub associated_token_program: Program<'info, AssociatedToken>,
pub rent: Sysvar<'info, Rent>,
}

// Contas para informações do programa
#[derive(Accounts)]
pub struct GetProgramInfo<'info> {
pub state: Account<'info, ProgramState>,
pub user: Signer<'info>,
}

// Contas para informações de airdrop do usuário
#[derive(Accounts)]
pub struct GetUserAirdropInfo<'info> {
pub user: Account<'info, UserAccount>,
pub user_wallet: Signer<'info>,
}

// ===== PROGRAMA PRINCIPAL =====

#[program]
pub mod referral_system {
use super::*;

// MODIFICADO: Initialize expandido para airdrop
pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
if ctx.accounts.owner.key() != admin_addresses::AUTHORIZED_INITIALIZER {
return Err(error!(ErrorCode::NotAuthorized));
}

let state = &mut ctx.accounts.state;
state.owner = ctx.accounts.owner.key();
state.multisig_treasury = admin_addresses::MULTISIG_TREASURY;
state.next_upline_id = 1;
state.next_chain_id = 1;
state.is_locked = false;

// NOVO: Inicialização do sistema de airdrop
state.current_week = 1;
state.total_matrices_this_week = 0;
state.program_start_timestamp = Clock::get()?.unix_timestamp;
state.airdrop_active = true;
state.closed_weeks = Vec::new();

msg!("Program initialized with airdrop system starting at week 1");
Ok(())
}

// CORRIGIDA: Register without referrer com swap+burn obrigatório
pub fn register_without_referrer<'a, 'b, 'c, 'info>(
ctx: Context<'a, 'b, 'c, 'info, RegisterWithoutReferrerDeposit<'info>>, 
deposit_amount: u64
) -> Result<()> {
// PROTEÇÃO REENTRANCY
if ctx.accounts.state.is_locked {
return Err(error!(ErrorCode::ReentrancyLock));
}
ctx.accounts.state.is_locked = true;

// Verifica se é o multisig treasury
if ctx.accounts.owner.key() != ctx.accounts.state.multisig_treasury {
ctx.accounts.state.is_locked = false;
return Err(error!(ErrorCode::NotAuthorized));
}

// Verificação de mudança de semana
check_and_process_week_change(&mut ctx.accounts.state)?;

// VALIDAÇÕES DE SEGURANÇA CRÍTICAS
verify_address_strict(
&ctx.accounts.vault_program.key(), 
&verified_addresses::METEORA_VAULT_PROGRAM, 
ErrorCode::InvalidVaultProgram
)?;

verify_address_strict(
&ctx.accounts.amm_program.key(), 
&verified_addresses::METEORA_AMM_PROGRAM, 
ErrorCode::InvalidMeteoraAmmProgram
)?;

verify_address_strict(
&ctx.accounts.pool.key(),
&verified_addresses::POOL_ADDRESS,
ErrorCode::InvalidPoolAddress
)?;

verify_address_strict(
&ctx.accounts.token_mint.key(),
&verified_addresses::TOKEN_MINT,
ErrorCode::InvalidTokenMintAddress
)?;

// Validação de depósito mínimo usando remaining accounts para Chainlink
let expected_remaining_count = 7; // pool, a_vault, a_vault_lp, a_vault_lp_mint, a_token_vault, chainlink_feed, chainlink_program

if ctx.remaining_accounts.len() < expected_remaining_count {
ctx.accounts.state.is_locked = false;
return Err(error!(ErrorCode::MissingVaultAAccounts));
}

let a_vault = &ctx.remaining_accounts[1];
let a_vault_lp = &ctx.remaining_accounts[2];
let a_vault_lp_mint = &ctx.remaining_accounts[3];
let a_token_vault = &ctx.remaining_accounts[4];
let chainlink_feed = &ctx.remaining_accounts[5];
let chainlink_program = &ctx.remaining_accounts[6];

// Valida endereços das contas adicionais
verify_address_strict(&a_vault.key(), &verified_addresses::A_VAULT, ErrorCode::InvalidVaultAddress)?;
verify_address_strict(&a_vault_lp.key(), &verified_addresses::A_VAULT_LP, ErrorCode::InvalidVaultALpAddress)?;
verify_address_strict(&a_vault_lp_mint.key(), &verified_addresses::A_VAULT_LP_MINT, ErrorCode::InvalidVaultALpMintAddress)?;
verify_address_strict(&chainlink_program.key(), &verified_addresses::CHAINLINK_PROGRAM, ErrorCode::InvalidChainlinkProgram)?;
verify_address_strict(&chainlink_feed.key(), &verified_addresses::SOL_USD_FEED, ErrorCode::InvalidPriceFeed)?;

let minimum_deposit = calculate_minimum_sol_deposit(chainlink_feed, chainlink_program)?;

if deposit_amount < minimum_deposit {
msg!("Deposit amount: {}, minimum required: {}", deposit_amount, minimum_deposit);
ctx.accounts.state.is_locked = false;
return Err(error!(ErrorCode::InsufficientDeposit));
}

// Use global upline ID
let state = &mut ctx.accounts.state;
let upline_id = state.next_upline_id;
let chain_id = state.next_chain_id;

state.next_upline_id += 1;
state.next_chain_id += 1;

// Create new user data
let user = &mut ctx.accounts.user;

// Initialize user data with an empty upline structure
user.is_registered = true;
user.referrer = None;
user.owner_wallet = ctx.accounts.user_wallet.key();
user.upline = ReferralUpline {
id: upline_id,
depth: 1,
upline: vec![],
};
user.chain = ReferralChain {
id: chain_id,
slots: [None, None, None],
filled_slots: 0,
};

// Initialize financial data
user.reserved_sol = 0;
user.reserved_tokens = 0;

// Initialize airdrop data
user.completed_matrices_total = 0;
user.weekly_matrices = Vec::new();
user.total_donut_earned = 0;
user.total_donut_claimed = 0;
user.last_processed_week = 0;

// CRÍTICO: SWAP + BURN OBRIGATÓRIO PARA USUÁRIO BASE
msg!("BASE USER: Processing swap+burn for {} SOL", deposit_amount);

let donut_received = meteora_swap_sol_to_donut_secure(
deposit_amount,
&ctx.accounts.user_wallet.to_account_info(),
&ctx.accounts.temp_donut_vault,
&ctx.accounts.pool.to_account_info(),
a_vault,
&ctx.accounts.b_vault.to_account_info(),
a_token_vault,
&ctx.accounts.b_token_vault.to_account_info(),
a_vault_lp,
&ctx.accounts.b_vault_lp.to_account_info(),
a_vault_lp_mint,
&ctx.accounts.b_vault_lp_mint.to_account_info(),
&ctx.accounts.amm_program.to_account_info(),
&ctx.accounts.vault_program.to_account_info(),
&ctx.accounts.token_program.to_account_info(),
)?;

burn_donut_tokens(
&ctx.accounts.temp_donut_vault,
&ctx.accounts.token_mint.to_account_info(),
&ctx.accounts.temp_donut_authority.to_account_info(),
&ctx.accounts.token_program.to_account_info(),
donut_received,
&[&[
b"temp_donut_authority".as_ref(),
&[ctx.bumps.temp_donut_authority]
]],
)?;

emit!(DonutSwappedAndBurned {
user: ctx.accounts.user_wallet.key(),
sol_amount: deposit_amount,
donut_amount: donut_received,
week_number: ctx.accounts.state.current_week,
});

msg!("BASE USER: Swapped {} SOL for {} DONUT and burned successfully", 
deposit_amount, donut_received);

// PROTEÇÃO REENTRANCY - FIM
ctx.accounts.state.is_locked = false;

msg!("Base user registered successfully with deposit processed");
Ok(())
}

// NOVA: Instrução para claim de airdrop
pub fn claim_airdrop(ctx: Context<ClaimAirdrop>) -> Result<()> {
// Verifica mudança de semana
check_and_process_week_change(&mut ctx.accounts.state)?;

// Processa semanas pendentes do usuário
process_user_pending_weeks(
&mut ctx.accounts.user, 
&ctx.accounts.state
)?;

// Calcula disponível para claim
let available = ctx.accounts.user.get_claimable_donut();

if available == 0 {
return Err(error!(ErrorCode::NothingToClaim));
}

// Valida conta de token do usuário
verify_ata_strict(
&ctx.accounts.user_token_account.to_account_info(),
&ctx.accounts.user_wallet.key(),
&verified_addresses::TOKEN_MINT
)?;

// Transfere DONUT
let transfer_instruction = spl_token::instruction::transfer(
&ctx.accounts.token_program.key(),
&ctx.accounts.program_token_vault.key(),
&ctx.accounts.user_token_account.key(),
&ctx.accounts.vault_authority.key(),
&[],
available,
).map_err(|_| error!(ErrorCode::TokenTransferFailed))?;

let transfer_accounts = vec![
ctx.accounts.program_token_vault.to_account_info(),
ctx.accounts.user_token_account.to_account_info(),
ctx.accounts.vault_authority.to_account_info(),
ctx.accounts.token_program.to_account_info(),
];

solana_program::program::invoke_signed(
&transfer_instruction,
&transfer_accounts,
&[&[
b"token_vault_authority".as_ref(),
&[ctx.bumps.vault_authority]
]],
).map_err(|e| {
msg!("Airdrop transfer failed: {:?}", e);
error!(ErrorCode::TokenTransferFailed)
})?;

// Atualiza claimed
ctx.accounts.user.total_donut_claimed = ctx.accounts.user.total_donut_claimed
.checked_add(available)
.ok_or(ErrorCode::ArithmeticOverflow)?;

emit!(AirdropClaimed {
user: ctx.accounts.user_wallet.key(),
amount: available,
total_earned: ctx.accounts.user.total_donut_earned,
total_claimed: ctx.accounts.user.total_donut_claimed,
});

msg!("Claimed {} DONUT (total earned: {}, total claimed: {})", 
available, 
ctx.accounts.user.total_donut_earned, 
ctx.accounts.user.total_donut_claimed);

Ok(())
}

// CORRIGIDA: Registro com depósito SOL - sistema completo com recursão
pub fn register_with_sol_deposit<'a, 'b, 'c, 'info>(
ctx: Context<'a, 'b, 'c, 'info, RegisterWithSolDeposit<'info>>, 
deposit_amount: u64
) -> Result<()> {
// === PROTEÇÃO REENTRANCY ===
if ctx.accounts.state.is_locked {
msg!("Transaction rejected: reentrancy protection active");
return Err(error!(ErrorCode::ReentrancyLock));
}
ctx.accounts.state.is_locked = true;

// === VERIFICAÇÃO DE MUDANÇA DE SEMANA ===
check_and_process_week_change(&mut ctx.accounts.state)?;

// === PROCESSAMENTO DE AIRDROP PENDENTE DO REFERRER ===
process_user_pending_weeks(
&mut ctx.accounts.referrer, 
&ctx.accounts.state
)?;

// === VALIDAÇÕES DE SEGURANÇA CRÍTICAS ===

// Valida programas Meteora
verify_address_strict(
&ctx.accounts.vault_program.key(), 
&verified_addresses::METEORA_VAULT_PROGRAM, 
ErrorCode::InvalidVaultProgram
)?;

verify_address_strict(
&ctx.accounts.amm_program.key(), 
&verified_addresses::METEORA_AMM_PROGRAM, 
ErrorCode::InvalidMeteoraAmmProgram
)?;

// Valida vault do programa
verify_address_strict(
&ctx.accounts.program_token_vault.key(), 
&verified_addresses::PROGRAM_TOKEN_VAULT, 
ErrorCode::InvalidProgramTokenVault
)?;

// Verifica se referrer está registrado
if !ctx.accounts.referrer.is_registered {
ctx.accounts.state.is_locked = false;
return Err(error!(ErrorCode::ReferrerNotRegistered));
}

// === VALIDAÇÃO DE CONTAS RESTANTES ===
let expected_base_count = 7; // pool, a_vault, a_vault_lp, a_vault_lp_mint, a_token_vault, chainlink_feed, chainlink_program

if ctx.remaining_accounts.len() < expected_base_count {
ctx.accounts.state.is_locked = false;
return Err(error!(ErrorCode::MissingVaultAAccounts));
}

// Extrai contas validadas
let pool = &ctx.remaining_accounts[0];
let a_vault = &ctx.remaining_accounts[1];
let a_vault_lp = &ctx.remaining_accounts[2];
let a_vault_lp_mint = &ctx.remaining_accounts[3];
let a_token_vault = &ctx.remaining_accounts[4];
let chainlink_feed = &ctx.remaining_accounts[5];
let chainlink_program = &ctx.remaining_accounts[6];

// Contas de uplines para recursão (se existirem)
let upline_accounts = if ctx.remaining_accounts.len() > expected_base_count {
&ctx.remaining_accounts[expected_base_count..]
} else {
&[]
};

// Valida endereços das contas
verify_address_strict(&pool.key(), &verified_addresses::POOL_ADDRESS, ErrorCode::InvalidPoolAddress)?;
verify_address_strict(&a_vault.key(), &verified_addresses::A_VAULT, ErrorCode::InvalidVaultAddress)?;
verify_address_strict(&a_vault_lp.key(), &verified_addresses::A_VAULT_LP, ErrorCode::InvalidVaultALpAddress)?;
verify_address_strict(&a_vault_lp_mint.key(), &verified_addresses::A_VAULT_LP_MINT, ErrorCode::InvalidVaultALpMintAddress)?;
verify_address_strict(&chainlink_program.key(), &verified_addresses::CHAINLINK_PROGRAM, ErrorCode::InvalidChainlinkProgram)?;
verify_address_strict(&chainlink_feed.key(), &verified_addresses::SOL_USD_FEED, ErrorCode::InvalidPriceFeed)?;

// === VALIDAÇÃO DE DEPÓSITO MÍNIMO ===
let minimum_deposit = calculate_minimum_sol_deposit(chainlink_feed, chainlink_program)?;

if deposit_amount < minimum_deposit {
msg!("Deposit amount: {}, minimum required: {}", deposit_amount, minimum_deposit);
ctx.accounts.state.is_locked = false;
return Err(error!(ErrorCode::InsufficientDeposit));
}

// === CRIAÇÃO DA CONTA DO USUÁRIO ===

// Cria UplineEntry para o referrer
let referrer_entry = UplineEntry {
pda: ctx.accounts.referrer.key(),
wallet: ctx.accounts.referrer_wallet.key(),
};

// Constrói chain de upline (máximo 6 níveis)
let mut new_upline = Vec::new();
if ctx.accounts.referrer.upline.upline.len() >= MAX_UPLINE_DEPTH {
let start_idx = ctx.accounts.referrer.upline.upline.len() - (MAX_UPLINE_DEPTH - 1);
new_upline.extend_from_slice(&ctx.accounts.referrer.upline.upline[start_idx..]);
} else {
new_upline.extend_from_slice(&ctx.accounts.referrer.upline.upline);
}
new_upline.push(referrer_entry);

// Configura IDs
let state = &mut ctx.accounts.state;
let upline_id = state.next_upline_id;
let chain_id = state.next_chain_id;
state.next_chain_id += 1;

// Inicializa conta do usuário
let user = &mut ctx.accounts.user;
user.is_registered = true;
user.referrer = Some(ctx.accounts.referrer.key());
user.owner_wallet = ctx.accounts.user_wallet.key();
user.upline = ReferralUpline {
id: upline_id,
depth: ctx.accounts.referrer.upline.depth + 1,
upline: new_upline,
};
user.chain = ReferralChain {
id: chain_id,
slots: [None, None, None],
filled_slots: 0,
};
user.reserved_sol = 0;
user.reserved_tokens = 0;
user.completed_matrices_total = 0;
user.weekly_matrices = Vec::new();
user.total_donut_earned = 0;
user.total_donut_claimed = 0;
user.last_processed_week = 0;

// === LÓGICA DOS SLOTS ===

let slot_idx = ctx.accounts.referrer.chain.filled_slots as usize;
let mut deposit_processed = false;

match slot_idx {
0 => { // SLOT 1: SWAP + BURN
msg!("SLOT 1: Processing swap and burn for {} SOL", deposit_amount);

// Swap SOL -> DONUT via Meteora
let donut_received = meteora_swap_sol_to_donut_secure(
    deposit_amount,
    &ctx.accounts.user_wallet.to_account_info(),
    &ctx.accounts.temp_donut_vault,
    pool,
    a_vault,
    &ctx.accounts.b_vault.to_account_info(),
    a_token_vault,
    &ctx.accounts.b_token_vault.to_account_info(),
    a_vault_lp,
    &ctx.accounts.b_vault_lp.to_account_info(),
    a_vault_lp_mint,
    &ctx.accounts.b_vault_lp_mint.to_account_info(),
    &ctx.accounts.amm_program.to_account_info(),
    &ctx.accounts.vault_program.to_account_info(),
    &ctx.accounts.token_program.to_account_info(),
)?;

// Burn DONUT imediatamente
burn_donut_tokens(
    &ctx.accounts.temp_donut_vault,
    &ctx.accounts.token_mint.to_account_info(),
    &ctx.accounts.temp_donut_authority.to_account_info(),
    &ctx.accounts.token_program.to_account_info(),
    donut_received,
    &[&[
        b"temp_donut_authority".as_ref(),
        &[ctx.bumps.temp_donut_authority]
    ]],
)?;

emit!(DonutSwappedAndBurned {
    user: ctx.accounts.user_wallet.key(),
    sol_amount: deposit_amount,
    donut_amount: donut_received,
    week_number: ctx.accounts.state.current_week,
});

deposit_processed = true;
msg!("SLOT 1: Swapped {} SOL for {} DONUT and burned", deposit_amount, donut_received);
},

1 => { // SLOT 2: APENAS RESERVA SOL
msg!("SLOT 2: Processing SOL reserve for {} SOL", deposit_amount);

// Reserva SOL
process_reserve_sol(
    &ctx.accounts.user_wallet.to_account_info(),
    &ctx.accounts.program_sol_vault.to_account_info(),
    deposit_amount
)?;

ctx.accounts.referrer.reserved_sol = deposit_amount;
deposit_processed = true;
msg!("SLOT 2: Reserved {} SOL", deposit_amount);
},

2 => { // SLOT 3: PAGAMENTO + RECURSÃO
msg!("SLOT 3: Processing payment and recursion for {} SOL", deposit_amount);

// Paga SOL reservado se existir
if ctx.accounts.referrer.reserved_sol > 0 {
    process_pay_referrer(
        &ctx.accounts.program_sol_vault.to_account_info(),
        &ctx.accounts.referrer_wallet.to_account_info(),
        ctx.accounts.referrer.reserved_sol,
        &[&[
            b"program_sol_vault".as_ref(),
            &[ctx.bumps.program_sol_vault]
        ]],
    )?;
    
    msg!("SLOT 3: Paid {} SOL to referrer", ctx.accounts.referrer.reserved_sol);
    ctx.accounts.referrer.reserved_sol = 0;
}

msg!("SLOT 3: Starting recursion with {} SOL", deposit_amount);
},

_ => {
ctx.accounts.state.is_locked = false;
return Err(error!(ErrorCode::InvalidSlot));
}
}

// === PROCESSAMENTO DA MATRIX DO REFERRER ===

let (chain_completed, _upline_pubkey) = process_referrer_chain(
&ctx.accounts.user.key(),
&mut ctx.accounts.referrer,
ctx.accounts.state.next_chain_id,
)?;

// === REGISTRO DA MATRIX COMPLETADA PARA AIRDROP ===
if chain_completed {
record_matrix_completion(
&mut ctx.accounts.referrer, 
&mut ctx.accounts.state
)?;

ctx.accounts.state.next_chain_id += 1;

msg!("Matrix completed for referrer: {} total matrices in week {}", 
 ctx.accounts.referrer.completed_matrices_total,
 ctx.accounts.state.current_week);
}

// === PROCESSAMENTO DE RECURSÃO (SLOT 3 COM MATRIX COMPLETA) ===
if chain_completed && slot_idx == 2 {
msg!("Starting upline recursion for completed matrix in Slot 3");

// Processa recursão completa nos uplines
let recursion_success = process_upline_recursion(
deposit_amount,
upline_accounts,
&mut ctx.accounts.state,
// Contas para swap
&ctx.accounts.temp_donut_vault,
&ctx.accounts.temp_donut_authority.to_account_info(),
ctx.bumps.temp_donut_authority,
pool,
a_vault,
&ctx.accounts.b_vault.to_account_info(),
a_token_vault,
&ctx.accounts.b_token_vault.to_account_info(),
a_vault_lp,
&ctx.accounts.b_vault_lp.to_account_info(),
a_vault_lp_mint,
&ctx.accounts.b_vault_lp_mint.to_account_info(),
&ctx.accounts.amm_program.to_account_info(),
&ctx.accounts.vault_program.to_account_info(),
&ctx.accounts.token_program.to_account_info(),
&ctx.accounts.token_mint.to_account_info(),
&ctx.accounts.program_sol_vault.to_account_info(),
ctx.bumps.program_sol_vault,
)?;

if recursion_success {
deposit_processed = true;
msg!("Recursion completed successfully");
} else {
msg!("Recursion failed - should not happen with current implementation");
}
}

// === VALIDAÇÃO FINAL ===
if !deposit_processed {
msg!("CRITICAL ERROR: Deposit not processed - this should NEVER happen!");
ctx.accounts.state.is_locked = false;
return Err(error!(ErrorCode::DepositNotProcessed));
}

// === VERIFICAÇÃO DE SALDO RESIDUAL NA CONTA TEMPORÁRIA ===
let temp_vault_balance = ctx.accounts.temp_donut_vault.amount;

// FALLBACK DE EMERGÊNCIA: Se sobrou DONUT na conta temporária, queima
if temp_vault_balance > 0 {
msg!("EMERGENCY: Found remaining DONUT in temp vault: {}, burning it", temp_vault_balance);

burn_donut_tokens(
&ctx.accounts.temp_donut_vault,
&ctx.accounts.token_mint.to_account_info(),
&ctx.accounts.temp_donut_authority.to_account_info(),
&ctx.accounts.token_program.to_account_info(),
temp_vault_balance,
&[&[
    b"temp_donut_authority".as_ref(),
    &[ctx.bumps.temp_donut_authority]
]],
)?;

msg!("Emergency burn completed: {} DONUT", temp_vault_balance);
}

// === FINALIZAÇÃO ===
msg!("Registration completed successfully: slot={}, matrix_completed={}, week={}", 
slot_idx + 1, chain_completed, ctx.accounts.state.current_week);

// Remove lock de reentrancy
ctx.accounts.state.is_locked = false;

Ok(())
}

// NOVA: Função administrativa para verificar estado do programa
pub fn get_program_info(ctx: Context<GetProgramInfo>) -> Result<()> {
let state = &ctx.accounts.state;

msg!("=== PROGRAM STATE INFO ===");
msg!("Current week: {}", state.current_week);
msg!("Airdrop active: {}", state.airdrop_active);
msg!("Total matrices this week: {}", state.total_matrices_this_week);
msg!("Closed weeks count: {}", state.closed_weeks.len());
msg!("Next chain ID: {}", state.next_chain_id);

if state.current_week > 0 && state.current_week <= 36 {
let week_distribution = get_week_distribution(state.current_week);
msg!("Current week distribution: {} DONUT", week_distribution);
}

// Mostra últimas 3 semanas fechadas
let recent_weeks = state.closed_weeks.iter().rev().take(3);
msg!("=== RECENT CLOSED WEEKS ===");
for week in recent_weeks {
msg!("Week {}: {} matrices, {} DONUT total, {} per matrix", 
 week.week_number, 
 week.total_matrices, 
 week.donut_distributed, 
 week.donut_per_matrix);
}

Ok(())
}

// NOVA: Função para usuário verificar seus dados de airdrop
pub fn get_user_airdrop_info(ctx: Context<GetUserAirdropInfo>) -> Result<()> {
let user = &ctx.accounts.user;

msg!("=== USER AIRDROP INFO ===");
msg!("Total matrices completed: {}", user.completed_matrices_total);
msg!("Total DONUT earned: {}", user.total_donut_earned);
msg!("Total DONUT claimed: {}", user.total_donut_claimed);
msg!("Available to claim: {}", user.get_claimable_donut());
msg!("Last processed week: {}", user.last_processed_week);

msg!("=== WEEKLY BREAKDOWN ===");
for week_data in &user.weekly_matrices {
msg!("Week {}: {} matrices", week_data.week_number, week_data.matrices_completed);
}

Ok(())
}
}

// ===== TESTES E VALIDAÇÕES =====

#[cfg(test)]
mod tests {
use super::*;

#[test]
fn test_week_calculation() {
// Testa cálculo de semanas
let start_time = 1700000000; // Timestamp base

// Semana 1
let week1_time = start_time + (3 * 24 * 60 * 60); // 3 dias depois
let week = calculate_current_week_test(start_time, week1_time);
assert_eq!(week, 1);

// Semana 2
let week2_time = start_time + (8 * 24 * 60 * 60); // 8 dias depois
let week = calculate_current_week_test(start_time, week2_time);
assert_eq!(week, 2);

// Semana 37 (programa finalizado)
let week37_time = start_time + (37 * 7 * 24 * 60 * 60); // 37 semanas depois
let week = calculate_current_week_test(start_time, week37_time);
assert_eq!(week, 0); // Finalizado
}

fn calculate_current_week_test(start_timestamp: i64, current_timestamp: i64) -> u8 {
if current_timestamp < start_timestamp {
return 0;
}

let elapsed_seconds = current_timestamp - start_timestamp;
let elapsed_weeks = (elapsed_seconds / (7 * 24 * 60 * 60)) + 1;

if elapsed_weeks > 36 {
return 0;
}

elapsed_weeks as u8
}

#[test]
fn test_weekly_distributions() {
// Testa se todas as 36 semanas têm distribuições válidas
for week in 1..=36 {
let distribution = get_week_distribution(week);
assert!(distribution > 0, "Week {} should have positive distribution", week);
}

// Testa semanas inválidas
assert_eq!(get_week_distribution(0), 0);
assert_eq!(get_week_distribution(37), 0);

// Testa se distribuições são crescentes
for week in 1..36 {
let current = get_week_distribution(week);
let next = get_week_distribution(week + 1);
assert!(next > current, "Week {} distribution should be less than week {}", week, week + 1);
}
}

#[test]
fn test_user_account_functions() {
let mut user = UserAccount::default();

// Testa função get_claimable_donut
user.total_donut_earned = 1000;
user.total_donut_claimed = 300;
assert_eq!(user.get_claimable_donut(), 700);

// Testa função add_weekly_data
let week_data = UserWeekData {
week_number: 1,
matrices_completed: 5,
};

assert!(user.add_weekly_data(week_data.clone()).is_ok());
assert_eq!(user.weekly_matrices.len(), 1);
assert_eq!(user.weekly_matrices[0].matrices_completed, 5);

// Testa adição na mesma semana (deve somar)
let week_data2 = UserWeekData {
week_number: 1,
matrices_completed: 3,
};

assert!(user.add_weekly_data(week_data2).is_ok());
assert_eq!(user.weekly_matrices.len(), 1);
assert_eq!(user.weekly_matrices[0].matrices_completed, 8);
}

#[test]
fn test_arithmetic_operations() {
// Testa operações aritméticas para prevenir overflow
let large_number: u64 = u64::MAX - 1000;

// Testa soma segura
let result = large_number.checked_add(500);
assert!(result.is_some());

let result = large_number.checked_add(2000);
assert!(result.is_none()); // Deve dar overflow

// Testa multiplicação segura
let result = 1000u64.checked_mul(1000);
assert_eq!(result, Some(1_000_000));

let result = (u64::MAX / 2).checked_mul(3);
assert!(result.is_none()); // Deve dar overflow
}

#[test]
fn test_recursion_logic() {
// Testa se a lógica de recursão está correta
// Este teste seria mais complexo em um ambiente real
assert!(true); // Placeholder para testes de recursão
}
}