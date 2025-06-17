use anchor_lang::prelude::*;
use anchor_lang::solana_program::{self, clock::Clock};
use anchor_lang::AnchorDeserialize;
use anchor_lang::AnchorSerialize;
use anchor_spl::token::{Token, TokenAccount};
use anchor_spl::associated_token::AssociatedToken;
use chainlink_solana as chainlink;
#[cfg(not(feature = "no-entrypoint"))]
use {solana_security_txt::security_txt};

declare_id!("CdKkHpRhewe3wJFpbouuQog5xTURycGgsyhyb7wjAVCv");

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

// ===== CONSTANTS =====

/// Minimum deposit amount in USD (10 dollars with 8 decimals - Chainlink format)
const MINIMUM_USD_DEPOSIT: u64 = 10_00000000;

/// Maximum price feed staleness (24 hours in seconds)
const MAX_PRICE_FEED_AGE: i64 = 86400;

/// Default SOL price in case of stale feed ($100 USD per SOL with 8 decimals)
const DEFAULT_SOL_PRICE: i128 = 100_00000000;

/// Maximum number of upline accounts that can be processed in a single transaction
const MAX_UPLINE_DEPTH: usize = 6;

/// Number of Vault A accounts in the remaining_accounts (including pool)
const VAULT_A_ACCOUNTS_COUNT: usize = 5;

// ===== VERIFIED ADDRESSES MODULE =====
/// Module containing all verified protocol addresses
pub mod verified_addresses {
    use solana_program::pubkey::Pubkey;
 
    // Meteora Pool address
    pub static POOL_ADDRESS: Pubkey = solana_program::pubkey!("FrQ5KsAgjCe3FFg6ZENri8feDft54tgnATxyffcasuxU");
    
    // Vault A addresses (DONUT token vault)
    pub static A_VAULT: Pubkey = solana_program::pubkey!("4ndfcH16GKY76bzDkKfyVwHMoF8oY75KES2VaAhUYksN");
    pub static A_VAULT_LP: Pubkey = solana_program::pubkey!("CocstBGbeDVyTJWxbWs4docwWapVADAo1xXQSh9RfPMz");
    pub static A_VAULT_LP_MINT: Pubkey = solana_program::pubkey!("6f2FVX5UT5uBtgknc8fDj119Z7DQoLJeKRmBq7j1zsVi");
    pub static A_TOKEN_VAULT: Pubkey = solana_program::pubkey!("6m1wvYoPrwjAnbuGMqpMoodQaq4VnZXRjrzufXnPSjmj");
    
    // Meteora pool addresses (Vault B - SOL)
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
    pub static PROGRAM_TOKEN_VAULT: Pubkey = solana_program::pubkey!("6vcd7cv4tsqCmL1wFKe6H3ThCEgrpwfYFSiNyEWRFAp9");
    
    // Meteora AMM addresses
    pub static METEORA_AMM_PROGRAM: Pubkey = solana_program::pubkey!("Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB");
    pub static PROTOCOL_FEE_ACCOUNT: Pubkey = solana_program::pubkey!("FBSwbuckwK9cPU7zhCXL6HuQvWn8dAJBX46oRQonKQLa");
}

// ===== ADMIN ADDRESSES MODULE =====
/// Module containing admin account addresses
pub mod admin_addresses {
    use solana_program::pubkey::Pubkey;

    pub static MULTISIG_TREASURY: Pubkey = solana_program::pubkey!("QgNN4aW9hPz4ANP1LqzR2FkDPZo9MzDZxDQ4abovHYv");
    pub static AUTHORIZED_INITIALIZER: Pubkey = solana_program::pubkey!("QgNN4aW9hPz4ANP1LqzR2FkDPZo9MzDZxDQ4abovHYv");
}

// ===== METEORA DYNAMIC VAULT STRUCTURES =====

/// Vault bumps structure
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default, Debug)]
pub struct VaultBumps {
    pub vault_bump: u8,
    pub token_vault_bump: u8,
}

/// Locked profit tracker for vault calculations
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct LockedProfitTracker {
    pub last_updated_locked_profit: u64,
    pub last_report: u64,
    pub locked_profit_degradation: u64,
}

/// Meteora Vault account structure
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
    pub strategies: [Pubkey; 30], // MAX_STRATEGY = 30
    pub base: Pubkey,
    pub admin: Pubkey,
    pub operator: Pubkey,
    pub locked_profit_tracker: LockedProfitTracker,
}

impl Vault {
    /// Calculate token amount based on LP share
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
    
    /// Get unlocked amount available in vault
    pub fn get_unlocked_amount(&self, current_time: u64) -> Option<u64> {
        self.total_amount.checked_sub(
            self.locked_profit_tracker
                .calculate_locked_profit(current_time)?,
        )
    }
}

impl LockedProfitTracker {
    /// Calculate current locked profit amount
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

// ===== METEORA DYNAMIC AMM STRUCTURES =====

/// Pool type enum
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

/// Pool fee structure
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct PoolFees {
    pub trade_fee_numerator: u64,
    pub trade_fee_denominator: u64,
    pub protocol_trade_fee_numerator: u64,
    pub protocol_trade_fee_denominator: u64,
}

/// Partner info structure
#[derive(Copy, Clone, Debug, AnchorSerialize, AnchorDeserialize, Default)]
pub struct PartnerInfo {
    pub fee_numerator: u64,
    pub partner_authority: Pubkey,
    pub pending_fee_a: u64,
    pub pending_fee_b: u64,
}

/// Bootstrapping configuration
#[derive(Copy, Clone, Debug, AnchorSerialize, AnchorDeserialize, Default)]
pub struct Bootstrapping {
    pub activation_point: u64,
    pub whitelisted_vault: Pubkey,
    #[deprecated]
    pub pool_creator: Pubkey,
    pub activation_type: u8,
}

/// Curve type for AMM calculations
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

/// Token multiplier for stable curves
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default, Copy, Eq, PartialEq)]
pub struct TokenMultiplier {
    pub token_a_multiplier: u64,
    pub token_b_multiplier: u64,
    pub precision_factor: u8,
}

/// Depeg configuration
#[derive(Clone, Copy, Debug, Default, AnchorSerialize, AnchorDeserialize)]
pub struct Depeg {
    pub base_virtual_price: u64,
    pub base_cache_updated: u64,
    pub depeg_type: DepegType,
}

/// Depeg type enum
#[derive(Clone, Copy, Debug, Default, AnchorDeserialize, AnchorSerialize, PartialEq)]
pub enum DepegType {
    #[default]
    None,
    Marinade,
    Lido,
    SplStake,
}

/// Padding structure for account alignment
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default, Debug)]
pub struct Padding {
    pub padding_0: [u8; 6],
    pub padding_1: [u64; 21],
    pub padding_2: [u64; 21],
}

/// Meteora Pool account structure
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

// ===== PROGRAM STRUCTURES =====

/// Program state structure
#[account]
pub struct ProgramState {
    /// Owner of the program
    pub owner: Pubkey,
    /// Multisig treasury address
    pub multisig_treasury: Pubkey,
    /// Next upline ID to be assigned
    pub next_upline_id: u32,
    /// Next chain ID to be assigned
    pub next_chain_id: u32,
    /// Last mint amount for rate limiting
    pub last_mint_amount: u64,
    /// Reentrancy lock flag
    pub is_locked: bool,
}

impl ProgramState {
    pub const SIZE: usize = 32 + 32 + 4 + 4 + 8 + 1;
}

/// Structure to store complete information for each upline
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default, Debug)]
pub struct UplineEntry {
    /// PDA of the user account
    pub pda: Pubkey,
    /// Original user wallet
    pub wallet: Pubkey,
}

/// Referral upline structure
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ReferralUpline {
    /// Unique upline ID
    pub id: u32,
    /// Depth in the referral tree
    pub depth: u8,
    /// List of upline entries
    pub upline: Vec<UplineEntry>,
}

/// Referral matrix structure
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ReferralChain {
    /// Chain ID
    pub id: u32,
    /// Matrix slots (3 slots)
    pub slots: [Option<Pubkey>; 3],
    /// Number of filled slots
    pub filled_slots: u8,
}

/// User account structure
#[account]
#[derive(Default)]
pub struct UserAccount {
    /// Registration status
    pub is_registered: bool,
    /// Referrer PDA (optional)
    pub referrer: Option<Pubkey>,
    /// Owner wallet address
    pub owner_wallet: Pubkey,
    /// Upline information
    pub upline: ReferralUpline,
    /// Matrix chain information
    pub chain: ReferralChain,
    /// Reserved SOL amount
    pub reserved_sol: u64,
    /// Reserved token amount
    pub reserved_tokens: u64,
}

impl UserAccount {
    pub const SIZE: usize = 1 + // is_registered
                           1 + 32 + // Option<Pubkey>
                           32 + // owner_wallet
                           4 + 1 + 4 + (MAX_UPLINE_DEPTH * (32 + 32)) + // ReferralUpline
                           4 + (3 * (1 + 32)) + 1 + // ReferralChain
                           8 + // reserved_sol
                           8;  // reserved_tokens
}

// ===== ERROR CODES =====

/// Custom error codes for the program
#[error_code]
pub enum ErrorCode {
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
    
    #[msg("Invalid AMM program")]
    InvalidAmmProgram,
    
    #[msg("Invalid protocol fee account")]
    InvalidProtocolFeeAccount,
}

// ===== EVENTS =====

/// Event emitted when a slot is filled
#[event]
pub struct SlotFilled {
    /// Slot index (0-2)
    pub slot_idx: u8,
    /// Chain ID
    pub chain_id: u32,
    /// User who filled the slot
    pub user: Pubkey,
    /// Owner of the slot
    pub owner: Pubkey,
}

// ===== HELPER STRUCTURES =====

/// Decimal handling for price display
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

// ===== HELPER FUNCTIONS =====

/// Force memory cleanup
fn force_memory_cleanup() {
    let _dummy = Vec::<u8>::new();
}

/// Get SOL/USD price from Chainlink feed
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

/// Calculate minimum SOL deposit based on USD price
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

/// Check and adjust the mint value based on history (rate limiting)
fn check_mint_limit(program_state: &mut ProgramState, proposed_mint_value: u64) -> Result<u64> {
    if program_state.last_mint_amount == 0 {
        msg!("First mint: establishing base value for limiter: {}", proposed_mint_value);
        program_state.last_mint_amount = proposed_mint_value;
        return Ok(proposed_mint_value);
    }
    
    let current_limit = program_state.last_mint_amount.saturating_mul(3);
    
    if proposed_mint_value > current_limit {
        msg!(
            "Mint adjustment: {} exceeds limit of {} (3x last mint). Using previous value: {}",
            proposed_mint_value,
            current_limit,
            program_state.last_mint_amount
        );
        return Ok(program_state.last_mint_amount);
    }
    
    program_state.last_mint_amount = proposed_mint_value;
    Ok(proposed_mint_value)
}

/// Calculate DONUT tokens amount based on pool state
fn get_donut_tokens_amount<'info>(
    pool: &AccountInfo<'info>,
    a_vault: &AccountInfo<'info>,
    b_vault: &AccountInfo<'info>,
    a_vault_lp: &AccountInfo<'info>,
    b_vault_lp: &AccountInfo<'info>,
    a_vault_lp_mint: &AccountInfo<'info>,
    b_vault_lp_mint: &AccountInfo<'info>,
    sol_amount: u64,
) -> Result<u64> {
    const PRECISION_FACTOR: i128 = 1_000_000_000;
    
    msg!("get_donut_tokens_amount called with sol_amount: {}", sol_amount);
    
    let _current_time = Clock::get()?.unix_timestamp as u64;
    
    // Check if pool is enabled
    {
        let pool_data = pool.try_borrow_data()?;
        let enabled_offset = 8 + 225;
        
        if pool_data.len() <= enabled_offset {
            return Err(error!(ErrorCode::PriceMeteoraReadFailed));
        }
        
        let pool_enabled = pool_data[enabled_offset] != 0;
        if !pool_enabled {
            msg!("Pool is disabled");
            return Err(error!(ErrorCode::PriceMeteoraReadFailed));
        }
    }
    
    // Read vault A total amount
    let (vault_a_total, vault_a_enabled) = {
        let vault_data = a_vault.try_borrow_data()?;
        if vault_data.len() < 19 {
            return Err(error!(ErrorCode::PriceMeteoraReadFailed));
        }
        
        let enabled = vault_data[8] != 0;
        let total_amount = u64::from_le_bytes([
            vault_data[11], vault_data[12], vault_data[13], vault_data[14],
            vault_data[15], vault_data[16], vault_data[17], vault_data[18]
        ]);
        
        (total_amount, enabled)
    };
    
    // Read vault B total amount
    let (vault_b_total, vault_b_enabled) = {
        let vault_data = b_vault.try_borrow_data()?;
        if vault_data.len() < 19 {
            return Err(error!(ErrorCode::PriceMeteoraReadFailed));
        }
        
        let enabled = vault_data[8] != 0;
        let total_amount = u64::from_le_bytes([
            vault_data[11], vault_data[12], vault_data[13], vault_data[14],
            vault_data[15], vault_data[16], vault_data[17], vault_data[18]
        ]);
        
        (total_amount, enabled)
    };
    
    if !vault_a_enabled || !vault_b_enabled {
        msg!("One or both vaults are disabled");
        return Err(error!(ErrorCode::PriceMeteoraReadFailed));
    }
    
    // Read LP amounts
    let (a_vault_lp_amount, b_vault_lp_amount) = {
        let a_data = a_vault_lp.try_borrow_data()?;
        let b_data = b_vault_lp.try_borrow_data()?;
        
        if a_data.len() < 72 || b_data.len() < 72 {
            return Err(error!(ErrorCode::PriceMeteoraReadFailed));
        }
        
        let a_amount = u64::from_le_bytes([
            a_data[64], a_data[65], a_data[66], a_data[67],
            a_data[68], a_data[69], a_data[70], a_data[71]
        ]);
        
        let b_amount = u64::from_le_bytes([
            b_data[64], b_data[65], b_data[66], b_data[67],
            b_data[68], b_data[69], b_data[70], b_data[71]
        ]);
        
        msg!("LP amounts - A: {}, B: {}", a_amount, b_amount);
        (a_amount, b_amount)
    };
    
    // Read LP supplies
    let (a_vault_lp_supply, b_vault_lp_supply) = {
        let a_mint_data = a_vault_lp_mint.try_borrow_data()?;
        let b_mint_data = b_vault_lp_mint.try_borrow_data()?;
        
        if a_mint_data.len() < 44 || b_mint_data.len() < 44 {
            return Err(error!(ErrorCode::PriceMeteoraReadFailed));
        }
        
        let a_supply = u64::from_le_bytes([
            a_mint_data[36], a_mint_data[37], a_mint_data[38], a_mint_data[39],
            a_mint_data[40], a_mint_data[41], a_mint_data[42], a_mint_data[43]
        ]);
        
        let b_supply = u64::from_le_bytes([
            b_mint_data[36], b_mint_data[37], b_mint_data[38], b_mint_data[39],
            b_mint_data[40], b_mint_data[41], b_mint_data[42], b_mint_data[43]
        ]);
        
        msg!("LP supplies - A: {}, B: {}", a_supply, b_supply);
        (a_supply, b_supply)
    };
    
    // Calculate token amounts
    let token_a_amount = if a_vault_lp_supply == 0 {
        0
    } else {
        let numerator = (a_vault_lp_amount as u128)
            .checked_mul(vault_a_total as u128)
            .ok_or_else(|| {
                msg!("Overflow in token A calculation: {} * {}", a_vault_lp_amount, vault_a_total);
                error!(ErrorCode::MeteoraCalculationOverflow)
            })?;
        
        let result = numerator
            .checked_div(a_vault_lp_supply as u128)
            .ok_or_else(|| {
                msg!("Division by zero in token A calculation");
                error!(ErrorCode::MeteoraCalculationOverflow)
            })?;
        
        u64::try_from(result)
            .map_err(|_| {
                msg!("Token A result too large for u64: {}", result);
                error!(ErrorCode::MeteoraCalculationOverflow)
            })?
    };

    let token_b_amount = if b_vault_lp_supply == 0 {
        0
    } else {
        let numerator = (b_vault_lp_amount as u128)
            .checked_mul(vault_b_total as u128)
            .ok_or_else(|| {
                msg!("Overflow in token B calculation: {} * {}", b_vault_lp_amount, vault_b_total);
                error!(ErrorCode::MeteoraCalculationOverflow)
            })?;
        
        let result = numerator
            .checked_div(b_vault_lp_supply as u128)
            .ok_or_else(|| {
                msg!("Division by zero in token B calculation");
                error!(ErrorCode::MeteoraCalculationOverflow)
            })?;
        
        u64::try_from(result)
            .map_err(|_| {
                msg!("Token B result too large for u64: {}", result);
                error!(ErrorCode::MeteoraCalculationOverflow)
            })?
    };
    
    msg!("Token amounts - A: {}, B: {}", token_a_amount, token_b_amount);
    
    if token_a_amount == 0 || token_b_amount == 0 {
        msg!("One or both token amounts is zero");
        return Err(error!(ErrorCode::PriceMeteoraReadFailed));
    }
    
    // Calculate ratio
    let ratio = (token_a_amount as i128)
        .checked_mul(PRECISION_FACTOR)
        .and_then(|n| n.checked_div(token_b_amount as i128))
        .ok_or_else(|| {
            msg!("Ratio calculation overflow");
            error!(ErrorCode::MeteoraCalculationOverflow)
        })?;
    
    msg!("Token ratio (A/B): {}", ratio);
    
    // Calculate DONUT tokens
    let donut_tokens = (sol_amount as i128)
        .checked_mul(ratio)
        .and_then(|n| n.checked_div(PRECISION_FACTOR))
        .ok_or_else(|| {
            msg!("Final calculation overflow");
            error!(ErrorCode::MeteoraCalculationOverflow)
        })?;
    
    if donut_tokens > i128::from(u64::MAX) || donut_tokens < 0 {
        msg!("Result out of u64 range: {}", donut_tokens);
        return Err(error!(ErrorCode::MeteoraCalculationOverflow));
    }
    
    let result = donut_tokens as u64;
    msg!("Final donut_tokens: {}", result);
    
    Ok(if result == 0 { 1 } else { result })
}

/// Verify address strictly
fn verify_address_strict(provided: &Pubkey, expected: &Pubkey, error_code: ErrorCode) -> Result<()> {
    if provided != expected {
        msg!("Address verification failed: provided={}, expected={}", provided, expected);
        return Err(error!(error_code));
    }
    Ok(())
}

/// Verify pool and vault A addresses
fn verify_pool_and_vault_a_addresses<'info>(
    pool: &Pubkey,
    a_vault: &Pubkey,
    a_vault_lp: &Pubkey,
    a_vault_lp_mint: &Pubkey,
) -> Result<()> {
    verify_address_strict(pool, &verified_addresses::POOL_ADDRESS, ErrorCode::InvalidPoolAddress)?;
    verify_address_strict(a_vault, &verified_addresses::A_VAULT, ErrorCode::InvalidVaultAddress)?;
    verify_address_strict(a_vault_lp, &verified_addresses::A_VAULT_LP, ErrorCode::InvalidVaultALpAddress)?;
    verify_address_strict(a_vault_lp_mint, &verified_addresses::A_VAULT_LP_MINT, ErrorCode::InvalidVaultALpMintAddress)?;
    
    Ok(())
}

/// Verify ATA account strictly
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

/// Verify all fixed addresses at once
fn verify_all_fixed_addresses<'info>(
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

/// Verify Chainlink addresses
fn verify_chainlink_addresses<'info>(
    chainlink_program: &Pubkey,
    chainlink_feed: &Pubkey,
) -> Result<()> {
    verify_address_strict(chainlink_program, &verified_addresses::CHAINLINK_PROGRAM, ErrorCode::InvalidChainlinkProgram)?;
    verify_address_strict(chainlink_feed, &verified_addresses::SOL_USD_FEED, ErrorCode::InvalidPriceFeed)?;
    
    Ok(())
}

/// Validate all remaining accounts
fn validate_all_remaining_accounts<'info>(
    remaining_accounts: &[AccountInfo<'info>],
    expected_base_count: usize,
) -> Result<()> {
    if remaining_accounts.len() < expected_base_count {
        return Err(error!(ErrorCode::MissingVaultAAccounts));
    }
    
    // Verify pool
    let pool = &remaining_accounts[0];
    verify_address_strict(&pool.key(), &verified_addresses::POOL_ADDRESS, 
                         ErrorCode::InvalidPoolAddress)?;
    
    // Verify vault A accounts
    let a_vault = &remaining_accounts[1];
    let a_vault_lp = &remaining_accounts[2];
    let a_vault_lp_mint = &remaining_accounts[3];
    let _a_token_vault = &remaining_accounts[4];
    
    verify_address_strict(&a_vault.key(), &verified_addresses::A_VAULT, 
                         ErrorCode::InvalidVaultAddress)?;
    verify_address_strict(&a_vault_lp.key(), &verified_addresses::A_VAULT_LP, 
                         ErrorCode::InvalidVaultALpAddress)?;
    verify_address_strict(&a_vault_lp_mint.key(), &verified_addresses::A_VAULT_LP_MINT, 
                         ErrorCode::InvalidVaultALpMintAddress)?;
    
    // Verify Chainlink accounts
    let chainlink_feed = &remaining_accounts[5];
    let chainlink_program = &remaining_accounts[6];
    
    verify_address_strict(&chainlink_program.key(), &verified_addresses::CHAINLINK_PROGRAM, 
                         ErrorCode::InvalidChainlinkProgram)?;
    verify_address_strict(&chainlink_feed.key(), &verified_addresses::SOL_USD_FEED, 
                         ErrorCode::InvalidPriceFeed)?;
    
    // Validate upline accounts if present
    if remaining_accounts.len() > expected_base_count {
        let upline_accounts = &remaining_accounts[expected_base_count..];
        if upline_accounts.len() % 3 != 0 {
            return Err(error!(ErrorCode::MissingUplineAccount));
        }
        
        for chunk in upline_accounts.chunks(3) {
            let upline_pda = &chunk[0];
            let upline_wallet = &chunk[1];
            let upline_token = &chunk[2];
            
            if upline_pda.owner != &crate::ID {
                return Err(error!(ErrorCode::InvalidSlotOwner));
            }
            if upline_wallet.owner != &solana_program::system_program::ID {
                return Err(error!(ErrorCode::PaymentWalletInvalid));
            }
            if upline_token.owner != &spl_token::ID {
                return Err(error!(ErrorCode::TokenAccountInvalid));
            }
        }
    }
    
    Ok(())
}

/// Validate upline accounts
fn validate_upline_accounts<'info>(
    referrer: &Account<'_, UserAccount>,
    upline_accounts: &[AccountInfo<'info>],
) -> Result<()> {
    let expected_uplines = referrer.upline.upline.len();
    
    if upline_accounts.len() % 3 != 0 {
        msg!("ERROR: Upline accounts not in trios: {}", upline_accounts.len());
        return Err(error!(ErrorCode::MissingUplineAccount));
    }
    
    let trio_count = upline_accounts.len() / 3;
    
    if trio_count != expected_uplines {
        msg!(
            "CRITICAL: Must send ALL uplines! Referrer has {} uplines, got {} trios",
            expected_uplines,
            trio_count
        );
        return Err(error!(ErrorCode::InvalidUplineAccount));
    }
    
    if expected_uplines == 0 {
        msg!("Referrer has no uplines - this should not happen in SLOT 3 normal user");
        return Ok(());
    }
    
    msg!("Validating ALL {} upline trios", trio_count);
    
    for i in 0..trio_count {
        let base_idx = i * 3;
        let upline_pda = &upline_accounts[base_idx];
        let upline_wallet = &upline_accounts[base_idx + 1];
        let upline_ata = &upline_accounts[base_idx + 2];
        
        let upline_entry_idx = expected_uplines - 1 - i;
        let expected_upline = &referrer.upline.upline[upline_entry_idx];
        
        if upline_pda.key() != expected_upline.pda {
            msg!(
                "UPLINE PDA MISMATCH at position {}: Expected {}, Got {}", 
                i, expected_upline.pda, upline_pda.key()
            );
            return Err(error!(ErrorCode::InvalidUplineAccount));
        }
        
        if upline_wallet.key() != expected_upline.wallet {
            msg!(
                "UPLINE WALLET MISMATCH at position {}: Expected {}, Got {}", 
                i, expected_upline.wallet, upline_wallet.key()
            );
            return Err(error!(ErrorCode::InvalidUplineAccount));
        }
        
        if upline_pda.owner != &crate::ID {
            return Err(error!(ErrorCode::InvalidSlotOwner));
        }
        
        if upline_wallet.owner != &solana_program::system_program::ID {
            return Err(error!(ErrorCode::PaymentWalletInvalid));
        }
        
        verify_token_account(
            upline_ata,
            &upline_wallet.key(),
            &verified_addresses::TOKEN_MINT
        )?;
        
        msg!("✅ Upline {} validated: {}", i, upline_pda.key());
    }
    
    msg!("🎯 ALL {} upline trios validated successfully", trio_count);
    Ok(())
}

/// Verify if an account is a valid wallet (system account)
fn verify_wallet_is_system_account<'info>(wallet: &AccountInfo<'info>) -> Result<()> {
    if wallet.owner != &solana_program::system_program::ID {
        return Err(error!(ErrorCode::PaymentWalletInvalid));
    }
    
    Ok(())
}

/// Verify if an account is a valid token account
fn verify_token_account<'info>(
    token_account: &AccountInfo<'info>,
    wallet: &Pubkey,
    token_mint: &Pubkey
) -> Result<()> {
    if token_account.owner != &spl_token::id() {
        return Err(error!(ErrorCode::TokenAccountInvalid));
    }
    
    let token_data = match TokenAccount::try_deserialize(&mut &token_account.data.borrow()[..]) {
        Ok(data) => data,
        Err(_) => {
            return Err(error!(ErrorCode::TokenAccountInvalid));
        }
    };
    
    if token_data.owner != *wallet {
        return Err(error!(ErrorCode::TokenAccountInvalid));
    }
    
    if token_data.mint != *token_mint {
        return Err(error!(ErrorCode::TokenAccountInvalid));
    }
    
    Ok(())
}

/// Manage WSOL operations (wrap/unwrap)
fn manage_wsol_operation<'info>(
    user_wallet: &AccountInfo<'info>,
    user_wsol_account: &AccountInfo<'info>,
    token_program: &Program<'info, Token>,
    operation: &str,
    amount: Option<u64>,
) -> Result<()> {
    match operation {
        "wrap" => {
            if let Some(transfer_amount) = amount {
                // Transfer SOL to WSOL account
                let transfer_ix = solana_program::system_instruction::transfer(
                    &user_wallet.key(),
                    &user_wsol_account.key(),
                    transfer_amount
                );
                
                solana_program::program::invoke(
                    &transfer_ix,
                    &[user_wallet.clone(), user_wsol_account.clone()],
                ).map_err(|e| {
                    msg!("Transfer to WSOL failed: {:?}", e);
                    error!(ErrorCode::WrapSolFailed)
                })?;
                
                // Sync native balance
                let sync_native_ix = spl_token::instruction::sync_native(
                    &token_program.key(),
                    &user_wsol_account.key(),
                ).map_err(|_| error!(ErrorCode::WrapSolFailed))?;
                
                solana_program::program::invoke(
                    &sync_native_ix,
                    &[user_wsol_account.clone()],
                ).map_err(|e| {
                    msg!("Sync native failed: {:?}", e);
                    error!(ErrorCode::WrapSolFailed)
                })?;
                
                msg!("WSOL wrapped successfully: {}", transfer_amount);
            }
        },
        
        "unwrap" => {
            // Close WSOL account to recover SOL
            let close_ix = spl_token::instruction::close_account(
                &token_program.key(),
                &user_wsol_account.key(),
                &user_wallet.key(),
                &user_wallet.key(),
                &[]
            ).map_err(|_| error!(ErrorCode::UnwrapSolFailed))?;
            
            solana_program::program::invoke(
                &close_ix,
                &[
                    user_wsol_account.clone(),
                    user_wallet.clone(),
                    user_wallet.clone(),
                ],
            ).map_err(|e| {
                msg!("Close WSOL account failed: {:?}", e);
                error!(ErrorCode::UnwrapSolFailed)
            })?;
            
            msg!("WSOL unwrapped successfully");
        },
        
        _ => {
            return Err(error!(ErrorCode::WrapSolFailed));
        }
    }
    
    Ok(())
}

/// Process swap from WSOL to DONUT tokens
fn process_swap_wsol_to_donut<'info>(
    pool: &AccountInfo<'info>,
    user: &AccountInfo<'info>,
    user_wsol_account: &AccountInfo<'info>,
    user_donut_account: &AccountInfo<'info>,
    a_vault: &AccountInfo<'info>,
    b_vault: &AccountInfo<'info>,
    a_token_vault: &AccountInfo<'info>,
    b_token_vault: &AccountInfo<'info>,
    a_vault_lp_mint: &AccountInfo<'info>,
    b_vault_lp_mint: &AccountInfo<'info>,
    a_vault_lp: &AccountInfo<'info>,
    b_vault_lp: &AccountInfo<'info>,
    protocol_token_fee: &AccountInfo<'info>,
    vault_program: &AccountInfo<'info>,
    token_program: &AccountInfo<'info>,
    amm_program: &AccountInfo<'info>,
    amount_in: u64,
    minimum_amount_out: u64,
) -> Result<()> {
    msg!("Starting swap: {} WSOL for DONUT (min: {})", amount_in, minimum_amount_out);
    
    // Verify AMM program
    if amm_program.key() != verified_addresses::METEORA_AMM_PROGRAM {
        return Err(error!(ErrorCode::InvalidAmmProgram));
    }
    
    // Build swap accounts
    let swap_accounts = vec![
        solana_program::instruction::AccountMeta::new(pool.key(), false),
        solana_program::instruction::AccountMeta::new(user_wsol_account.key(), false),
        solana_program::instruction::AccountMeta::new(user_donut_account.key(), false),
        solana_program::instruction::AccountMeta::new(a_vault.key(), false),
        solana_program::instruction::AccountMeta::new(b_vault.key(), false),
        solana_program::instruction::AccountMeta::new(a_token_vault.key(), false),
        solana_program::instruction::AccountMeta::new(b_token_vault.key(), false),
        solana_program::instruction::AccountMeta::new(a_vault_lp_mint.key(), false),
        solana_program::instruction::AccountMeta::new(b_vault_lp_mint.key(), false),
        solana_program::instruction::AccountMeta::new(a_vault_lp.key(), false),
        solana_program::instruction::AccountMeta::new(b_vault_lp.key(), false),
        solana_program::instruction::AccountMeta::new(protocol_token_fee.key(), false),
        solana_program::instruction::AccountMeta::new_readonly(user.key(), true),
        solana_program::instruction::AccountMeta::new_readonly(vault_program.key(), false),
        solana_program::instruction::AccountMeta::new_readonly(token_program.key(), false),
    ];
    
    // Swap discriminator: sha256("global:swap")[0..8]
    let mut data = vec![248, 198, 158, 145, 225, 117, 135, 200];
    data.extend_from_slice(&amount_in.to_le_bytes());
    data.extend_from_slice(&minimum_amount_out.to_le_bytes());
    
    let swap_instruction = solana_program::instruction::Instruction {
        program_id: amm_program.key(),
        accounts: swap_accounts,
        data,
    };
    
    // Execute swap
    solana_program::program::invoke(
        &swap_instruction,
        &[
            pool.clone(),
            user_wsol_account.clone(),
            user_donut_account.clone(),
            a_vault.clone(),
            b_vault.clone(),
            a_token_vault.clone(),
            b_token_vault.clone(),
            a_vault_lp_mint.clone(),
            b_vault_lp_mint.clone(),
            a_vault_lp.clone(),
            b_vault_lp.clone(),
            protocol_token_fee.clone(),
            user.clone(),
            vault_program.clone(),
            token_program.clone(),
        ],
    ).map_err(|e| {
        msg!("Swap failed: {:?}", e);
        error!(ErrorCode::DepositToPoolFailed)
    })?;
    
    msg!("Swap completed successfully");
    Ok(())
}

/// Calculate expected swap output with slippage
fn calculate_swap_amount_out<'info>(
    pool: &AccountInfo<'info>,
    a_vault: &AccountInfo<'info>,
    b_vault: &AccountInfo<'info>,
    a_vault_lp: &AccountInfo<'info>,
    b_vault_lp: &AccountInfo<'info>,
    a_vault_lp_mint: &AccountInfo<'info>,
    b_vault_lp_mint: &AccountInfo<'info>,
    amount_in: u64,
) -> Result<u64> {
    // Use existing function to calculate expected output
    let expected_out = get_donut_tokens_amount(
        pool,
        a_vault,
        b_vault,
        a_vault_lp,
        b_vault_lp,
        a_vault_lp_mint,
        b_vault_lp_mint,
        amount_in,
    )?;
    
    // Apply 1% slippage tolerance
    let minimum_out = expected_out
        .checked_mul(99)
        .and_then(|n| n.checked_div(100))
        .ok_or_else(|| error!(ErrorCode::MeteoraCalculationOverflow))?;
    
    Ok(minimum_out)
}

/// Reserve SOL for referrer
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

/// Pay referrer with SOL
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

/// Mint tokens to program vault
pub fn process_mint_tokens<'info>(
    token_mint: &AccountInfo<'info>,
    program_token_vault: &AccountInfo<'info>,
    token_mint_authority: &AccountInfo<'info>,
    token_program: &Program<'info, Token>,
    amount: u64,
    mint_authority_seeds: &[&[&[u8]]],
) -> Result<()> {
    let mint_instruction = spl_token::instruction::mint_to(
        &token_program.key(),
        &token_mint.key(),
        &program_token_vault.key(),
        &token_mint_authority.key(),
        &[],
        amount
    ).map_err(|_| error!(ErrorCode::TokenMintFailed))?;
    
    let mut mint_accounts = Vec::with_capacity(4);
    mint_accounts.push(token_mint.clone());
    mint_accounts.push(program_token_vault.clone());
    mint_accounts.push(token_mint_authority.clone());
    mint_accounts.push(token_program.to_account_info());
    
    solana_program::program::invoke_signed(
        &mint_instruction,
        &mint_accounts,
        mint_authority_seeds,
    ).map_err(|e| {
        msg!("Mint tokens failed: {:?}", e);
        error!(ErrorCode::TokenMintFailed)
    })?;
    
    msg!("Tokens minted: {}", amount);
    Ok(())
}

/// Transfer tokens from vault to user
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
fn process_referrer_chain<'info>(
   user_key: &Pubkey,
   referrer: &mut Account<'_, UserAccount>,
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

// ===== ACCOUNT STRUCTURES - OPTIMIZED TO PREVENT STACK OVERFLOW =====

/// Initialize instruction accounts
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

/// Register without referrer (base user) with deposit
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

    /// CHECK: User token account for Wrapped SOL, verified in the instruction code
    #[account(mut)]
    pub user_source_token: UncheckedAccount<'info>,
    
    /// Account to receive DONUT tokens
    #[account(
        init_if_needed,
        payer = user_wallet,
        associated_token::mint = token_mint,
        associated_token::authority = user_wallet
    )]
    pub user_donut_account: Account<'info, TokenAccount>,
    
    /// WSOL mint
    /// CHECK: This is the fixed WSOL mint address
    pub wsol_mint: AccountInfo<'info>,

    /// Deposit Accounts
    /// CHECK: Pool account (PDA)
    #[account(mut)]
    pub pool: UncheckedAccount<'info>,

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

    /// CHECK: Token mint
    pub token_mint: UncheckedAccount<'info>,
    
    /// CHECK: Protocol fee account for Meteora
    pub protocol_token_fee: UncheckedAccount<'info>,
    
    /// CHECK: Meteora Dynamic AMM program
    pub amm_program: UncheckedAccount<'info>,

    /// Required programs
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

/// OPTIMIZED: Register with SOL deposit - using AccountInfo to reduce stack usage
#[derive(Accounts)]
#[instruction(deposit_amount: u64)]
pub struct RegisterWithSolDeposit<'info> {
    /// Program state
    /// CHECK: Validated in instruction
    #[account(mut)]
    pub state: AccountInfo<'info>,

    #[account(mut)]
    pub user_wallet: Signer<'info>,

    /// Referrer accounts
    /// CHECK: Validated in instruction
    #[account(mut)]
    pub referrer: AccountInfo<'info>,
    
    /// CHECK: Validated in instruction
    #[account(mut)]
    pub referrer_wallet: AccountInfo<'info>,

    /// User account
    /// CHECK: Validated in instruction with proper PDA derivation
    #[account(mut)]
    pub user: AccountInfo<'info>,

    /// WSOL account for user
    /// CHECK: Validated in instruction
    #[account(mut)]
    pub user_wsol_account: AccountInfo<'info>,
    
    /// Account to receive DONUT tokens
    /// CHECK: Validated in instruction
    #[account(mut)]
    pub user_donut_account: AccountInfo<'info>,
    
    /// WSOL mint
    /// CHECK: This is the fixed WSOL mint address
    pub wsol_mint: AccountInfo<'info>,

    /// Pool accounts
    /// CHECK: Pool account (PDA)
    #[account(mut)]
    pub pool: AccountInfo<'info>,

    /// CHECK: Vault account for token B (SOL)
    #[account(mut)]
    pub b_vault: AccountInfo<'info>,

    /// CHECK: Token vault account for token B (SOL)
    #[account(mut)]
    pub b_token_vault: AccountInfo<'info>,

    /// CHECK: LP token mint for vault B
    #[account(mut)]
    pub b_vault_lp_mint: AccountInfo<'info>,

    /// CHECK: LP token account for vault B
    #[account(mut)]
    pub b_vault_lp: AccountInfo<'info>,

    /// CHECK: Vault program - CRITICAL: Must be validated against hardcoded address
    pub vault_program: AccountInfo<'info>,

    /// Program vault accounts
    /// CHECK: Program SOL vault
    #[account(mut)]
    pub program_sol_vault: AccountInfo<'info>,
    
    /// CHECK: Token mint for minting new tokens
    #[account(mut)]
    pub token_mint: AccountInfo<'info>,
    
    /// CHECK: Program token vault - CRITICAL: Must be validated against hardcoded address  
    #[account(mut)]
    pub program_token_vault: AccountInfo<'info>,
    
    /// CHECK: Referrer's ATA to receive tokens
    #[account(mut)]
    pub referrer_token_account: AccountInfo<'info>,
    
    /// CHECK: Mint authority PDA
    pub token_mint_authority: AccountInfo<'info>,
    
    /// CHECK: Token vault authority
    pub vault_authority: AccountInfo<'info>,
    
    /// CHECK: Protocol fee account for Meteora
    pub protocol_token_fee: AccountInfo<'info>,
    
    /// CHECK: Meteora Dynamic AMM program
    pub amm_program: AccountInfo<'info>,

    /// Required programs
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

// ===== PROGRAM MODULE =====

#[program]
pub mod referral_system {
    use super::*;

    /// Initialize program state
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        // Verify authorized initializer
        if ctx.accounts.owner.key() != admin_addresses::AUTHORIZED_INITIALIZER {
            return Err(error!(ErrorCode::NotAuthorized));
        }

        let state = &mut ctx.accounts.state;
        state.owner = ctx.accounts.owner.key();
        state.multisig_treasury = admin_addresses::MULTISIG_TREASURY;
        state.next_upline_id = 1;
        state.next_chain_id = 1;
        state.last_mint_amount = 0;
        state.is_locked = false;
        
        Ok(())
    }
    
    /// Register without referrer (base user registration)
    pub fn register_without_referrer<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, RegisterWithoutReferrerDeposit<'info>>, 
        deposit_amount: u64
    ) -> Result<()> {
        // REENTRANCY PROTECTION
        if ctx.accounts.state.is_locked {
            return Err(error!(ErrorCode::ReentrancyLock));
        }
        ctx.accounts.state.is_locked = true;

        // Verify if the caller is the multisig treasury
        if ctx.accounts.owner.key() != ctx.accounts.state.multisig_treasury {
            ctx.accounts.state.is_locked = false;
            return Err(error!(ErrorCode::NotAuthorized));
        }
    
        // STRICT VERIFICATION OF ALL ADDRESSES
        if let Err(e) = verify_all_fixed_addresses(
            &ctx.accounts.pool.key(),
            &ctx.accounts.b_vault.key(),
            &ctx.accounts.b_token_vault.key(),
            &ctx.accounts.b_vault_lp_mint.key(),
            &ctx.accounts.b_vault_lp.key(),
            &ctx.accounts.token_mint.key(),
            &ctx.accounts.wsol_mint.key(),
        ) {
            ctx.accounts.state.is_locked = false;
            return Err(e);
        }

        // CRITICAL: Validate vault program
        if let Err(e) = verify_address_strict(
            &ctx.accounts.vault_program.key(), 
            &verified_addresses::METEORA_VAULT_PROGRAM, 
            ErrorCode::InvalidVaultProgram
        ) {
            ctx.accounts.state.is_locked = false;
            return Err(e);
        }
        
        // Validate AMM program
        if let Err(e) = verify_address_strict(
            &ctx.accounts.amm_program.key(),
            &verified_addresses::METEORA_AMM_PROGRAM,
            ErrorCode::InvalidAmmProgram
        ) {
            ctx.accounts.state.is_locked = false;
            return Err(e);
        }
        
        // Validate protocol fee account
        if let Err(e) = verify_address_strict(
            &ctx.accounts.protocol_token_fee.key(),
            &verified_addresses::PROTOCOL_FEE_ACCOUNT,
            ErrorCode::InvalidProtocolFeeAccount
        ) {
            ctx.accounts.state.is_locked = false;
            return Err(e);
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

        // Sync the WSOL account 
        let sync_native_ix = spl_token::instruction::sync_native(
            &spl_token::ID,
            &ctx.accounts.user_source_token.key(),
        ).map_err(|_| {
            ctx.accounts.state.is_locked = false;
            error!(ErrorCode::WrapSolFailed)
        })?;
        
        let sync_accounts = [ctx.accounts.user_source_token.to_account_info()];
        
        solana_program::program::invoke(
            &sync_native_ix,
            &sync_accounts,
        ).map_err(|_| {
            ctx.accounts.state.is_locked = false;
            error!(ErrorCode::WrapSolFailed)
        })?;

        // SWAP WSOL FOR DONUT
        // Need to get vault A accounts from remaining_accounts
        if ctx.remaining_accounts.len() < 5 {
            ctx.accounts.state.is_locked = false;
            return Err(error!(ErrorCode::MissingVaultAAccounts));
        }
        
        // Create local references to avoid lifetime issues
        let pool_info = ctx.accounts.pool.to_account_info();
        let b_vault_info = ctx.accounts.b_vault.to_account_info();
        let b_vault_lp_info = ctx.accounts.b_vault_lp.to_account_info();
        let b_vault_lp_mint_info = ctx.accounts.b_vault_lp_mint.to_account_info();
        let b_token_vault_info = ctx.accounts.b_token_vault.to_account_info();
        
        let a_vault = &ctx.remaining_accounts[0];
        let a_vault_lp = &ctx.remaining_accounts[1];
        let a_vault_lp_mint = &ctx.remaining_accounts[2];
        let a_token_vault = &ctx.remaining_accounts[3];
        
        // Calculate minimum DONUT expected
        let minimum_donut_out = match calculate_swap_amount_out(
            &pool_info,
            a_vault,
            &b_vault_info,
            a_vault_lp,
            &b_vault_lp_info,
            a_vault_lp_mint,
            &b_vault_lp_mint_info,
            deposit_amount,
        ) {
            Ok(amount) => amount,
            Err(e) => {
                ctx.accounts.state.is_locked = false;
                return Err(e);
            }
        };

        // Execute swap
        if let Err(e) = process_swap_wsol_to_donut(
            &pool_info,
            &ctx.accounts.user_wallet.to_account_info(),
            &ctx.accounts.user_source_token.to_account_info(),
            &ctx.accounts.user_donut_account.to_account_info(),
            a_vault,
            &b_vault_info,
            a_token_vault,
            &b_token_vault_info,
            a_vault_lp_mint,
            &b_vault_lp_mint_info,
            a_vault_lp,
            &b_vault_lp_info,
            &ctx.accounts.protocol_token_fee.to_account_info(),
            &ctx.accounts.vault_program.to_account_info(),
            &ctx.accounts.token_program.to_account_info(),
            &ctx.accounts.amm_program.to_account_info(),
            deposit_amount,
            minimum_donut_out,
        ) {
            ctx.accounts.state.is_locked = false;
            return Err(e);
        }

        msg!("Base user registered: swapped {} WSOL for DONUT", deposit_amount);

        // REENTRANCY PROTECTION - UNLOCK AT END
        ctx.accounts.state.is_locked = false;
        Ok(())
    }

    /// Register with referrer and SOL deposit (optimized version)
    pub fn register_with_sol_deposit<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, RegisterWithSolDeposit<'info>>, 
        deposit_amount: u64
    ) -> Result<()> {
        // Manual deserialization of state account
        let state_data = ctx.accounts.state.try_borrow_data()?;
        if state_data.len() < 8 + ProgramState::SIZE {
            return Err(ProgramError::InvalidAccountData.into());
        }
        let mut state_bytes = &state_data[8..];
        let mut state: ProgramState = ProgramState::deserialize(&mut state_bytes)?;
        drop(state_data);
        
        // REENTRANCY PROTECTION
        if state.is_locked {
            msg!("Transaction rejected: reentrancy protection active");
            return Err(error!(ErrorCode::ReentrancyLock));
        }
        
        // SET LOCK BEFORE ANY EXTERNAL OPERATION
        state.is_locked = true;
        
        // CRITICAL SECURITY VALIDATIONS
        
        // 1. VALIDATE METEORA VAULT PROGRAM
        if let Err(e) = verify_address_strict(
            &ctx.accounts.vault_program.key(), 
            &verified_addresses::METEORA_VAULT_PROGRAM, 
            ErrorCode::InvalidVaultProgram
        ) {
            state.is_locked = false;
            // Write state back
            let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
            let mut state_bytes = &mut state_data[8..];
            state.serialize(&mut state_bytes)?;
            return Err(e);
        }
        
        // 2. VALIDATE PROGRAM TOKEN VAULT
        if let Err(e) = verify_address_strict(
            &ctx.accounts.program_token_vault.key(), 
            &verified_addresses::PROGRAM_TOKEN_VAULT, 
            ErrorCode::InvalidProgramTokenVault
        ) {
            state.is_locked = false;
            let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
            let mut state_bytes = &mut state_data[8..];
            state.serialize(&mut state_bytes)?;
            return Err(e);
        }
        
        // 3. VALIDATE AMM PROGRAM
        if let Err(e) = verify_address_strict(
            &ctx.accounts.amm_program.key(),
            &verified_addresses::METEORA_AMM_PROGRAM,
            ErrorCode::InvalidAmmProgram
        ) {
            state.is_locked = false;
            let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
            let mut state_bytes = &mut state_data[8..];
            state.serialize(&mut state_bytes)?;
            return Err(e);
        }
        
        // 4. VALIDATE PROTOCOL FEE
        if let Err(e) = verify_address_strict(
            &ctx.accounts.protocol_token_fee.key(),
            &verified_addresses::PROTOCOL_FEE_ACCOUNT,
            ErrorCode::InvalidProtocolFeeAccount
        ) {
            state.is_locked = false;
            let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
            let mut state_bytes = &mut state_data[8..];
            state.serialize(&mut state_bytes)?;
            return Err(e);
        }
        
        // 5. Validate referrer account
        if ctx.accounts.referrer.owner != &crate::ID {
            state.is_locked = false;
            let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
            let mut state_bytes = &mut state_data[8..];
            state.serialize(&mut state_bytes)?;
            return Err(error!(ErrorCode::InvalidSlotOwner));
        }
        
        // Deserialize referrer account
        let referrer_data = ctx.accounts.referrer.try_borrow_data()?;
        if referrer_data.len() < 8 + UserAccount::SIZE {
            state.is_locked = false;
            let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
            let mut state_bytes = &mut state_data[8..];
            state.serialize(&mut state_bytes)?;
            return Err(ProgramError::InvalidAccountData.into());
        }
        let mut referrer_bytes = &referrer_data[8..];
        let mut referrer: UserAccount = UserAccount::deserialize(&mut referrer_bytes)?;
        drop(referrer_data);
        
        if !referrer.is_registered {
            state.is_locked = false;
            let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
            let mut state_bytes = &mut state_data[8..];
            state.serialize(&mut state_bytes)?;
            return Err(error!(ErrorCode::ReferrerNotRegistered));
        }

        // 6. Validate user account PDA
        let (expected_user, user_bump) = Pubkey::find_program_address(
            &[b"user_account", ctx.accounts.user_wallet.key().as_ref()],
            &crate::ID
        );
        if ctx.accounts.user.key() != expected_user {
            state.is_locked = false;
            let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
            let mut state_bytes = &mut state_data[8..];
            state.serialize(&mut state_bytes)?;
            return Err(ProgramError::InvalidSeeds.into());
        }
        
        // 7. Validate SOL vault PDA
        let (expected_sol_vault, sol_vault_bump) = Pubkey::find_program_address(
            &[b"program_sol_vault"],
            &crate::ID
        );
        if ctx.accounts.program_sol_vault.key() != expected_sol_vault {
            state.is_locked = false;
            let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
            let mut state_bytes = &mut state_data[8..];
            state.serialize(&mut state_bytes)?;
            return Err(ProgramError::InvalidSeeds.into());
        }
        
        // 8. Validate mint authority PDA
        let (expected_mint_authority, mint_authority_bump) = Pubkey::find_program_address(
            &[b"token_mint_authority"],
            &crate::ID
        );
        if ctx.accounts.token_mint_authority.key() != expected_mint_authority {
            state.is_locked = false;
            let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
            let mut state_bytes = &mut state_data[8..];
            state.serialize(&mut state_bytes)?;
            return Err(ProgramError::InvalidSeeds.into());
        }
        
        // 9. Validate vault authority PDA
        let (expected_vault_authority, vault_authority_bump) = Pubkey::find_program_address(
            &[b"token_vault_authority"],
            &crate::ID
        );
        if ctx.accounts.vault_authority.key() != expected_vault_authority {
            state.is_locked = false;
            let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
            let mut state_bytes = &mut state_data[8..];
            state.serialize(&mut state_bytes)?;
            return Err(ProgramError::InvalidSeeds.into());
        }

        // DETERMINE ACTUAL SLOT FROM BLOCKCHAIN
        let actual_slot_idx = referrer.chain.filled_slots as usize;
        
        // DETECT BASE USER
        let is_base_user = referrer.referrer.is_none() && 
                           referrer.upline.upline.is_empty();
        
        msg!("Security Check - Slot: {}, Base User: {}, Referrer has {} uplines", 
             actual_slot_idx, is_base_user, referrer.upline.upline.len());

        // SLOT 3 VALIDATION
        if actual_slot_idx == 2 {
            if is_base_user {
                msg!("SLOT 3 - Base user detected: deposit will be swapped for DONUT");
                
                if ctx.remaining_accounts.len() < VAULT_A_ACCOUNTS_COUNT + 2 {
                    state.is_locked = false;
                    let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                    let mut state_bytes = &mut state_data[8..];
                    state.serialize(&mut state_bytes)?;
                    return Err(error!(ErrorCode::MissingVaultAAccounts));
                }
            } else {
                msg!("SLOT 3 - Normal user detected: validating ALL upline accounts");
                
                let base_accounts = VAULT_A_ACCOUNTS_COUNT + 2;
                let referrer_uplines_count = referrer.upline.upline.len();
                let required_upline_accounts = referrer_uplines_count * 3;
                let total_required = base_accounts + required_upline_accounts;
                
                msg!(
                    "SLOT 3 validation: Referrer has {} uplines, requiring {} accounts total (got {})",
                    referrer_uplines_count, 
                    total_required,
                    ctx.remaining_accounts.len()
                );
                
                if ctx.remaining_accounts.len() != total_required {
                    msg!(
                        "CRITICAL: SLOT 3 requires ALL {} uplines! Expected {} accounts, got {}", 
                        referrer_uplines_count,
                        total_required,
                        ctx.remaining_accounts.len()
                    );
                    state.is_locked = false;
                    let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                    let mut state_bytes = &mut state_data[8..];
                    state.serialize(&mut state_bytes)?;
                    return Err(error!(ErrorCode::Slot3RequiresUplineAccounts));
                }
                
                // Create a temporary Account wrapper for validation
                let temp_referrer = Account::<UserAccount> {
                    owner: crate::ID,
                    inner: referrer.clone(),
                    info: ctx.accounts.referrer.clone(),
                };
                
                let upline_accounts = &ctx.remaining_accounts[base_accounts..];
                if let Err(e) = validate_upline_accounts(&temp_referrer, upline_accounts) {
                    state.is_locked = false;
                    let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                    let mut state_bytes = &mut state_data[8..];
                    state.serialize(&mut state_bytes)?;
                    return Err(e);
                }
                
                msg!("SLOT 3 validation passed: ALL {} uplines verified", referrer_uplines_count);
            }
        } else {
            if ctx.remaining_accounts.len() < VAULT_A_ACCOUNTS_COUNT + 2 {
                state.is_locked = false;
                let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                let mut state_bytes = &mut state_data[8..];
                state.serialize(&mut state_bytes)?;
                return Err(error!(ErrorCode::MissingVaultAAccounts));
            }
        }

        // VALIDATE ALL REMAINING ACCOUNTS
        if let Err(e) = validate_all_remaining_accounts(&ctx.remaining_accounts, VAULT_A_ACCOUNTS_COUNT + 2) {
            state.is_locked = false;
            let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
            let mut state_bytes = &mut state_data[8..];
            state.serialize(&mut state_bytes)?;
            return Err(e);
        }

        // Extract validated accounts
        let pool = &ctx.remaining_accounts[0];
        let a_vault = &ctx.remaining_accounts[1];
        let a_vault_lp = &ctx.remaining_accounts[2];
        let a_vault_lp_mint = &ctx.remaining_accounts[3];
        let a_token_vault = &ctx.remaining_accounts[4];

        // Verify Pool and Vault A addresses
        if let Err(e) = verify_pool_and_vault_a_addresses(
            &pool.key(),
            &a_vault.key(),
            &a_vault_lp.key(),
            &a_vault_lp_mint.key()
        ) {
            state.is_locked = false;
            let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
            let mut state_bytes = &mut state_data[8..];
            state.serialize(&mut state_bytes)?;
            return Err(e);
        }

        // Extract Chainlink accounts
        let chainlink_feed = &ctx.remaining_accounts[5];
        let chainlink_program = &ctx.remaining_accounts[6];

        // Verify Chainlink addresses
        if let Err(e) = verify_chainlink_addresses(
            &chainlink_program.key(),
            &chainlink_feed.key(),
        ) {
            state.is_locked = false;
            let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
            let mut state_bytes = &mut state_data[8..];
            state.serialize(&mut state_bytes)?;
            return Err(e);
        }

        // VERIFY ALL FIXED ADDRESSES
        if let Err(e) = verify_all_fixed_addresses(
            &ctx.accounts.pool.key(),
            &ctx.accounts.b_vault.key(),
            &ctx.accounts.b_token_vault.key(),
            &ctx.accounts.b_vault_lp_mint.key(),
            &ctx.accounts.b_vault_lp.key(),
            &ctx.accounts.token_mint.key(),
            &ctx.accounts.wsol_mint.key(),
        ) {
            state.is_locked = false;
            let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
            let mut state_bytes = &mut state_data[8..];
            state.serialize(&mut state_bytes)?;
            return Err(e);
        }

        // Get minimum deposit amount from Chainlink feed
        let minimum_deposit = match calculate_minimum_sol_deposit(
            chainlink_feed,
            chainlink_program,
        ) {
            Ok(val) => val,
            Err(e) => {
                state.is_locked = false;
                let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                let mut state_bytes = &mut state_data[8..];
                state.serialize(&mut state_bytes)?;
                return Err(e);
            }
        };

        // Verify deposit amount meets minimum requirement
        if deposit_amount < minimum_deposit {
            msg!("Deposit amount: {}, minimum required: {}", deposit_amount, minimum_deposit);
            state.is_locked = false;
            let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
            let mut state_bytes = &mut state_data[8..];
            state.serialize(&mut state_bytes)?;
            return Err(error!(ErrorCode::InsufficientDeposit));
        }

        // Verify referrer's ATA account
        if let Err(e) = verify_ata_strict(
            &ctx.accounts.referrer_token_account,
            &ctx.accounts.referrer_wallet.key(),
            &ctx.accounts.token_mint.key()
        ) {
            state.is_locked = false;
            let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
            let mut state_bytes = &mut state_data[8..];
            state.serialize(&mut state_bytes)?;
            return Err(e);
        }
        
        // Initialize user account (using CPI to create account)
        let user_account_size = 8 + UserAccount::SIZE;
        let rent = Rent::get()?;
        let required_lamports = rent.minimum_balance(user_account_size);
        
        // Create user account
        let create_account_ix = solana_program::system_instruction::create_account(
            &ctx.accounts.user_wallet.key(),
            &ctx.accounts.user.key(),
            required_lamports,
            user_account_size as u64,
            &crate::ID,
        );
        
        solana_program::program::invoke_signed(
            &create_account_ix,
            &[
                ctx.accounts.user_wallet.to_account_info(),
                ctx.accounts.user.to_account_info(),
            ],
            &[&[
                b"user_account",
                ctx.accounts.user_wallet.key().as_ref(),
                &[user_bump],
            ]],
        )?;
        
        // Initialize WSOL account
        let create_wsol_ix = spl_associated_token_account::instruction::create_associated_token_account(
            &ctx.accounts.user_wallet.key(),
            &ctx.accounts.user_wallet.key(),
            &ctx.accounts.wsol_mint.key(),
            &spl_token::ID,
        );
        
        solana_program::program::invoke(
            &create_wsol_ix,
            &[
                ctx.accounts.user_wallet.to_account_info(),
                ctx.accounts.user_wsol_account.to_account_info(),
                ctx.accounts.user_wallet.to_account_info(),
                ctx.accounts.wsol_mint.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
            ],
        )?;
        
        // Initialize DONUT account if needed
        if ctx.accounts.user_donut_account.owner == &System::id() {
            let create_donut_ix = spl_associated_token_account::instruction::create_associated_token_account(
                &ctx.accounts.user_wallet.key(),
                &ctx.accounts.user_wallet.key(),
                &ctx.accounts.token_mint.key(),
                &spl_token::ID,
            );
            
            solana_program::program::invoke(
                &create_donut_ix,
                &[
                    ctx.accounts.user_wallet.to_account_info(),
                    ctx.accounts.user_donut_account.to_account_info(),
                    ctx.accounts.user_wallet.to_account_info(),
                    ctx.accounts.token_mint.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                    ctx.accounts.token_program.to_account_info(),
                ],
            )?;
        }
        
        // WSOL MANAGEMENT
        let mut deposit_processed = false;
        
        // 1. WRAP SOL -> WSOL (only once at the beginning)
        if let Err(e) = manage_wsol_operation(
            &ctx.accounts.user_wallet.to_account_info(),
            &ctx.accounts.user_wsol_account,
            &ctx.accounts.token_program,
            "wrap",
            Some(deposit_amount),
        ) {
            state.is_locked = false;
            let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
            let mut state_bytes = &mut state_data[8..];
            state.serialize(&mut state_bytes)?;
            return Err(e);
        }
        
        // 2. Create new UplineEntry for referrer
        let referrer_entry = UplineEntry {
            pda: ctx.accounts.referrer.key(),
            wallet: ctx.accounts.referrer_wallet.key(),
        };
        
        // 3. Create user's upline chain
        let mut new_upline = Vec::new();
        
        if referrer.upline.upline.len() >= MAX_UPLINE_DEPTH {
            new_upline.try_reserve(MAX_UPLINE_DEPTH).ok();
            let start_idx = referrer.upline.upline.len() - (MAX_UPLINE_DEPTH - 1);
            new_upline.extend_from_slice(&referrer.upline.upline[start_idx..]);
        } else {
            new_upline.try_reserve(referrer.upline.upline.len() + 1).ok();
            new_upline.extend_from_slice(&referrer.upline.upline);
        }
        
        new_upline.push(referrer_entry);
        new_upline.shrink_to_fit();

        // 4. Setup user account
        let upline_id = state.next_upline_id;
        let chain_id = state.next_chain_id;

        state.next_chain_id += 1;

        let user = UserAccount {
            is_registered: true,
            referrer: Some(ctx.accounts.referrer.key()),
            owner_wallet: ctx.accounts.user_wallet.key(),
            upline: ReferralUpline {
                id: upline_id,
                depth: referrer.upline.depth + 1,
                upline: new_upline,
            },
            chain: ReferralChain {
                id: chain_id,
                slots: [None, None, None],
                filled_slots: 0,
            },
            reserved_sol: 0,
            reserved_tokens: 0,
        };
        
        // Write user account data
        let mut user_data = ctx.accounts.user.try_borrow_mut_data()?;
        let discriminator = UserAccount::discriminator();
        user_data[..8].copy_from_slice(&discriminator);
        let mut user_bytes = &mut user_data[8..];
        user.serialize(&mut user_bytes)?;
        drop(user_data);

        // SLOT-BASED FINANCIAL LOGIC
        let slot_idx = actual_slot_idx;

        if slot_idx == 0 {
            // SLOT 1: Swap WSOL for DONUT
            let pool_info = pool.clone();
            let b_vault_info = ctx.accounts.b_vault.to_account_info();
            let b_vault_lp_info = ctx.accounts.b_vault_lp.to_account_info();
            let b_vault_lp_mint_info = ctx.accounts.b_vault_lp_mint.to_account_info();
            let b_token_vault_info = ctx.accounts.b_token_vault.to_account_info();
            
            let minimum_donut_out = match calculate_swap_amount_out(
                &pool_info,
                a_vault,
                &b_vault_info,
                a_vault_lp,
                &b_vault_lp_info,
                a_vault_lp_mint,
                &b_vault_lp_mint_info,
                deposit_amount,
            ) {
                Ok(amount) => amount,
                Err(e) => {
                    state.is_locked = false;
                    let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                    let mut state_bytes = &mut state_data[8..];
                    state.serialize(&mut state_bytes)?;
                    return Err(e);
                }
            };
            
            if let Err(e) = process_swap_wsol_to_donut(
                &pool_info,
                &ctx.accounts.user_wallet.to_account_info(),
                &ctx.accounts.user_wsol_account,
                &ctx.accounts.user_donut_account,
                a_vault,
                &b_vault_info,
                a_token_vault,
                &b_token_vault_info,
                a_vault_lp_mint,
                &b_vault_lp_mint_info,
                a_vault_lp,
                &b_vault_lp_info,
                &ctx.accounts.protocol_token_fee,
                &ctx.accounts.vault_program,
                &ctx.accounts.token_program.to_account_info(),
                &ctx.accounts.amm_program,
                deposit_amount,
                minimum_donut_out,
            ) {
                state.is_locked = false;
                let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                let mut state_bytes = &mut state_data[8..];
                state.serialize(&mut state_bytes)?;
                return Err(e);
            }
            
            deposit_processed = true;
            msg!("SLOT 1: Swapped {} WSOL for DONUT", deposit_amount);
        } 
        else if slot_idx == 1 {
            // SLOT 2: Reserve SOL (unwrap WSOL first)
            
            // Unwrap WSOL to get SOL back
            if let Err(e) = manage_wsol_operation(
                &ctx.accounts.user_wallet.to_account_info(),
                &ctx.accounts.user_wsol_account,
                &ctx.accounts.token_program,
                "unwrap",
                None,
            ) {
                state.is_locked = false;
                let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                let mut state_bytes = &mut state_data[8..];
                state.serialize(&mut state_bytes)?;
                return Err(e);
            }
            
            // Reserve SOL for referrer
            if let Err(e) = process_reserve_sol(
                &ctx.accounts.user_wallet.to_account_info(),
                &ctx.accounts.program_sol_vault,
                deposit_amount
            ) {
                state.is_locked = false;
                let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                let mut state_bytes = &mut state_data[8..];
                state.serialize(&mut state_bytes)?;
                return Err(e);
            }
            
            referrer.reserved_sol = deposit_amount;
            
            // Calculate tokens based on pool value
            let token_amount = match get_donut_tokens_amount(
                pool,
                a_vault,
                &ctx.accounts.b_vault,
                a_vault_lp,
                &ctx.accounts.b_vault_lp,
                a_vault_lp_mint,
                &ctx.accounts.b_vault_lp_mint,
                deposit_amount
            ) {
                Ok(amount) => amount,
                Err(e) => {
                    state.is_locked = false;
                    let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                    let mut state_bytes = &mut state_data[8..];
                    state.serialize(&mut state_bytes)?;
                    return Err(e);
                }
            };
            
            let adjusted_token_amount = match check_mint_limit(&mut state, token_amount) {
                Ok(amount) => amount,
                Err(e) => {
                    state.is_locked = false;
                    let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                    let mut state_bytes = &mut state_data[8..];
                    state.serialize(&mut state_bytes)?;
                    return Err(e);
                }
            };
            force_memory_cleanup();
            
            // Mint tokens to program vault
            if let Err(e) = process_mint_tokens(
                &ctx.accounts.token_mint,
                &ctx.accounts.program_token_vault,
                &ctx.accounts.token_mint_authority,
                &ctx.accounts.token_program,
                adjusted_token_amount,
                &[&[
                    b"token_mint_authority".as_ref(),
                    &[mint_authority_bump]
                ]],
            ) {
                state.is_locked = false;
                let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                let mut state_bytes = &mut state_data[8..];
                state.serialize(&mut state_bytes)?;
                return Err(e);
            }

            force_memory_cleanup();
            referrer.reserved_tokens = adjusted_token_amount;
            deposit_processed = true;
            msg!("SLOT 2: Reserved {} SOL and minted {} tokens", deposit_amount, adjusted_token_amount);
        }
        else if slot_idx == 2 {
            // SLOT 3: Pay referrer (unwrap WSOL first)
            
            // Unwrap WSOL to recover SOL
            if let Err(e) = manage_wsol_operation(
                &ctx.accounts.user_wallet.to_account_info(),
                &ctx.accounts.user_wsol_account,
                &ctx.accounts.token_program,
                "unwrap",
                None,
            ) {
                state.is_locked = false;
                let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                let mut state_bytes = &mut state_data[8..];
                state.serialize(&mut state_bytes)?;
                return Err(e);
            }
            
            // Pay reserved SOL to referrer
            if referrer.reserved_sol > 0 {
                if let Err(e) = verify_wallet_is_system_account(&ctx.accounts.referrer_wallet) {
                    state.is_locked = false;
                    let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                    let mut state_bytes = &mut state_data[8..];
                    state.serialize(&mut state_bytes)?;
                    return Err(e);
                }
                
                if let Err(e) = process_pay_referrer(
                    &ctx.accounts.program_sol_vault,
                    &ctx.accounts.referrer_wallet,
                    referrer.reserved_sol,
                    &[&[
                        b"program_sol_vault".as_ref(),
                        &[sol_vault_bump]
                    ]],
                ) {
                    state.is_locked = false;
                    let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                    let mut state_bytes = &mut state_data[8..];
                    state.serialize(&mut state_bytes)?;
                    return Err(e);
                }
                
                referrer.reserved_sol = 0;
            }
            
            // Transfer reserved tokens to referrer
            if let Err(e) = verify_token_account(
                &ctx.accounts.referrer_token_account,
                &ctx.accounts.referrer_wallet.key(),
                &ctx.accounts.token_mint.key()
            ) {
                state.is_locked = false;
                let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                let mut state_bytes = &mut state_data[8..];
                state.serialize(&mut state_bytes)?;
                return Err(e);
            }
            
            if referrer.reserved_tokens > 0 {
                if let Err(e) = process_transfer_tokens(
                    &ctx.accounts.program_token_vault,
                    &ctx.accounts.referrer_token_account,
                    &ctx.accounts.vault_authority,
                    &ctx.accounts.token_program,
                    referrer.reserved_tokens,
                    &[&[
                        b"token_vault_authority".as_ref(),
                        &[vault_authority_bump]
                    ]],
                ) {
                    state.is_locked = false;
                    let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                    let mut state_bytes = &mut state_data[8..];
                    state.serialize(&mut state_bytes)?;
                    return Err(e);
                }
                force_memory_cleanup();
                referrer.reserved_tokens = 0;
            }
            
            msg!("SLOT 3: Paid referrer, preparing recursion with {} deposit", deposit_amount);
        }
        
        // Process referrer's matrix
        let temp_referrer = Account::<UserAccount> {
            owner: crate::ID,
            inner: referrer.clone(),
            info: ctx.accounts.referrer.clone(),
        };
        
        let (chain_completed, upline_pubkey) = match process_referrer_chain(
            &ctx.accounts.user_wallet.key(),
            &mut referrer,
            state.next_chain_id,
        ) {
            Ok(result) => result,
            Err(e) => {
                state.is_locked = false;
                let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                let mut state_bytes = &mut state_data[8..];
                state.serialize(&mut state_bytes)?;
                return Err(e);
            }
        };

        force_memory_cleanup();
        
        if chain_completed {
            state.next_chain_id += 1;
        }
        
        // Write updated referrer back
        let mut referrer_data = ctx.accounts.referrer.try_borrow_mut_data()?;
        let mut referrer_bytes = &mut referrer_data[8..];
        referrer.serialize(&mut referrer_bytes)?;
        drop(referrer_data);

        // RECURSION PROCESSING
        if chain_completed && slot_idx == 2 {
            let mut current_user_pubkey = upline_pubkey;
            let current_deposit = deposit_amount;

            let upline_start_idx = VAULT_A_ACCOUNTS_COUNT + 2;

            if is_base_user {
                // BASE USER: No recursion, swap WSOL for DONUT
                msg!("Base user matrix completed: swapping {} WSOL for DONUT", current_deposit);
                
                // Wrap SOL to WSOL for swap
                if let Err(e) = manage_wsol_operation(
                    &ctx.accounts.user_wallet.to_account_info(),
                    &ctx.accounts.user_wsol_account,
                    &ctx.accounts.token_program,
                    "wrap",
                    Some(current_deposit),
                ) {
                    state.is_locked = false;
                    let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                    let mut state_bytes = &mut state_data[8..];
                    state.serialize(&mut state_bytes)?;
                    return Err(e);
                }
                
                // Create local references
                let pool_info = pool.clone();
                let b_vault_info = ctx.accounts.b_vault.to_account_info();
                let b_vault_lp_info = ctx.accounts.b_vault_lp.to_account_info();
                let b_vault_lp_mint_info = ctx.accounts.b_vault_lp_mint.to_account_info();
                let b_token_vault_info = ctx.accounts.b_token_vault.to_account_info();
                
                // Calculate minimum
                let minimum_donut_out = match calculate_swap_amount_out(
                    &pool_info,
                    a_vault,
                    &b_vault_info,
                    a_vault_lp,
                    &b_vault_lp_info,
                    a_vault_lp_mint,
                    &b_vault_lp_mint_info,
                    current_deposit,
                ) {
                    Ok(amount) => amount,
                    Err(e) => {
                        state.is_locked = false;
                        let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                        let mut state_bytes = &mut state_data[8..];
                        state.serialize(&mut state_bytes)?;
                        return Err(e);
                    }
                };
                
                // Execute swap
                if let Err(e) = process_swap_wsol_to_donut(
                    &pool_info,
                    &ctx.accounts.user_wallet.to_account_info(),
                    &ctx.accounts.user_wsol_account,
                    &ctx.accounts.user_donut_account,
                    a_vault,
                    &b_vault_info,
                    a_token_vault,
                    &b_token_vault_info,
                    a_vault_lp_mint,
                    &b_vault_lp_mint_info,
                    a_vault_lp,
                    &b_vault_lp_info,
                    &ctx.accounts.protocol_token_fee,
                    &ctx.accounts.vault_program,
                    &ctx.accounts.token_program.to_account_info(),
                    &ctx.accounts.amm_program,
                    current_deposit,
                    minimum_donut_out,
                ) {
                    state.is_locked = false;
                    let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                    let mut state_bytes = &mut state_data[8..];
                    state.serialize(&mut state_bytes)?;
                    return Err(e);
                }
                
                deposit_processed = true;
                msg!("Base user: {} WSOL swapped for DONUT", deposit_amount);
                
            } else if ctx.remaining_accounts.len() > upline_start_idx && current_deposit > 0 {
                // NORMAL USER: Process recursion
                let upline_accounts = &ctx.remaining_accounts[upline_start_idx..];
                
                if upline_accounts.len() % 3 != 0 {
                    msg!("ERROR: Upline accounts not in trios: {}", upline_accounts.len());
                    state.is_locked = false;
                    let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                    let mut state_bytes = &mut state_data[8..];
                    state.serialize(&mut state_bytes)?;
                    return Err(error!(ErrorCode::MissingUplineAccount));
                }
                
                let trio_count = upline_accounts.len() / 3;
                msg!("Processing recursion with {} validated upline trios", trio_count);
                
                const BATCH_SIZE: usize = 1;
                let batch_count = (trio_count + BATCH_SIZE - 1) / BATCH_SIZE;
                
                for batch_idx in 0..batch_count {
                    let start_trio = batch_idx * BATCH_SIZE;
                    let end_trio = std::cmp::min(start_trio + BATCH_SIZE, trio_count);
                    
                    for trio_index in start_trio..end_trio {
                        if trio_index >= MAX_UPLINE_DEPTH || current_deposit == 0 {
                            break;
                        }

                        let base_idx = trio_index * 3;
                        let upline_info = &upline_accounts[base_idx];
                        let upline_wallet = &upline_accounts[base_idx + 1];
                        let upline_token = &upline_accounts[base_idx + 2];
                        
                        if upline_wallet.owner != &solana_program::system_program::ID {
                            state.is_locked = false;
                            let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                            let mut state_bytes = &mut state_data[8..];
                            state.serialize(&mut state_bytes)?;
                            return Err(error!(ErrorCode::PaymentWalletInvalid));
                        }
                        
                        if !upline_info.owner.eq(&crate::ID) {
                            state.is_locked = false;
                            let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                            let mut state_bytes = &mut state_data[8..];
                            state.serialize(&mut state_bytes)?;
                            return Err(error!(ErrorCode::InvalidSlotOwner));
                        }

                        let mut upline_account_data;
                        {
                            let data = match upline_info.try_borrow_data() {
                                Ok(data) => data,
                                Err(_) => {
                                    state.is_locked = false;
                                    let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                                    let mut state_bytes = &mut state_data[8..];
                                    state.serialize(&mut state_bytes)?;
                                    return Err(ProgramError::InvalidAccountData.into());
                                }
                            };
                            if data.len() <= 8 {
                                state.is_locked = false;
                                let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                                let mut state_bytes = &mut state_data[8..];
                                state.serialize(&mut state_bytes)?;
                                return Err(ProgramError::InvalidAccountData.into());
                            }

                            let mut account_slice = &data[8..];
                            upline_account_data = match UserAccount::deserialize(&mut account_slice) {
                                Ok(data) => data,
                                Err(_) => {
                                    state.is_locked = false;
                                    let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                                    let mut state_bytes = &mut state_data[8..];
                                    state.serialize(&mut state_bytes)?;
                                    return Err(ProgramError::InvalidAccountData.into());
                                }
                            };

                            if !upline_account_data.is_registered {
                                state.is_locked = false;
                                let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                                let mut state_bytes = &mut state_data[8..];
                                state.serialize(&mut state_bytes)?;
                                return Err(error!(ErrorCode::SlotNotRegistered));
                            }
                        }

                        force_memory_cleanup();

                        let upline_slot_idx = upline_account_data.chain.filled_slots as usize;
                        let upline_key = *upline_info.key;
                        
                        if upline_slot_idx == 2 {
                            if upline_token.owner != &spl_token::id() {
                                state.is_locked = false;
                                let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                                let mut state_bytes = &mut state_data[8..];
                                state.serialize(&mut state_bytes)?;
                                return Err(error!(ErrorCode::TokenAccountInvalid));
                            }
                            
                            if let Err(e) = verify_token_account(
                                upline_token,
                                &upline_wallet.key(),
                                &ctx.accounts.token_mint.key()
                            ) {
                                state.is_locked = false;
                                let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                                let mut state_bytes = &mut state_data[8..];
                                state.serialize(&mut state_bytes)?;
                                return Err(e);
                            }
                        }
                        
                        upline_account_data.chain.slots[upline_slot_idx] = Some(current_user_pubkey);
                        
                        emit!(SlotFilled {
                            slot_idx: upline_slot_idx as u8,
                            chain_id: upline_account_data.chain.id,
                            user: current_user_pubkey,
                            owner: upline_key,
                        });
                        
                        upline_account_data.chain.filled_slots += 1;
                        
                        // Apply slot logic
                        if upline_slot_idx == 0 {
                            // FOUND SLOT 1: Swap WSOL for DONUT
                            msg!("Recursion: Found SLOT 1 - preparing swap");
                            
                            // Wrap SOL to WSOL for swap
                            if let Err(e) = manage_wsol_operation(
                                &ctx.accounts.user_wallet.to_account_info(),
                                &ctx.accounts.user_wsol_account,
                                &ctx.accounts.token_program,
                                "wrap",
                                Some(current_deposit),
                            ) {
                                state.is_locked = false;
                                let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                                let mut state_bytes = &mut state_data[8..];
                                state.serialize(&mut state_bytes)?;
                                return Err(e);
                            }
                            
                            // Create local references
                            let pool_info = pool.clone();
                            let b_vault_info = ctx.accounts.b_vault.to_account_info();
                            let b_vault_lp_info = ctx.accounts.b_vault_lp.to_account_info();
                            let b_vault_lp_mint_info = ctx.accounts.b_vault_lp_mint.to_account_info();
                            let b_token_vault_info = ctx.accounts.b_token_vault.to_account_info();
                            
                            // Calculate minimum
                            let minimum_donut_out = match calculate_swap_amount_out(
                                &pool_info,
                                a_vault,
                                &b_vault_info,
                                a_vault_lp,
                                &b_vault_lp_info,
                                a_vault_lp_mint,
                                &b_vault_lp_mint_info,
                                current_deposit,
                            ) {
                                Ok(amount) => amount,
                                Err(e) => {
                                    state.is_locked = false;
                                    let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                                    let mut state_bytes = &mut state_data[8..];
                                    state.serialize(&mut state_bytes)?;
                                    return Err(e);
                                }
                            };
                            
                            // Execute swap
                            if let Err(e) = process_swap_wsol_to_donut(
                                &pool_info,
                                &ctx.accounts.user_wallet.to_account_info(),
                                &ctx.accounts.user_wsol_account,
                                &ctx.accounts.user_donut_account,
                                a_vault,
                                &b_vault_info,
                                a_token_vault,
                                &b_token_vault_info,
                                a_vault_lp_mint,
                                &b_vault_lp_mint_info,
                                a_vault_lp,
                                &b_vault_lp_info,
                                &ctx.accounts.protocol_token_fee,
                                &ctx.accounts.vault_program,
                                &ctx.accounts.token_program.to_account_info(),
                                &ctx.accounts.amm_program,
                                current_deposit,
                                minimum_donut_out,
                            ) {
                                state.is_locked = false;
                                let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                                let mut state_bytes = &mut state_data[8..];
                                state.serialize(&mut state_bytes)?;
                                return Err(e);
                            }
                            
                            deposit_processed = true;
                            msg!("Recursion: Found SLOT 1, swapped {} WSOL for DONUT", current_deposit);
                        } 
                        else if upline_slot_idx == 1 {
                            // FOUND SLOT 2: Reserve SOL and mint tokens
                            msg!("Recursion: Found SLOT 2 - processing");
                            
                            if let Err(e) = process_reserve_sol(
                                &ctx.accounts.user_wallet.to_account_info(),
                                &ctx.accounts.program_sol_vault,
                                current_deposit
                            ) {
                                state.is_locked = false;
                                let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                                let mut state_bytes = &mut state_data[8..];
                                state.serialize(&mut state_bytes)?;
                                return Err(e);
                            }
                            
                            upline_account_data.reserved_sol = current_deposit;
                            
                            let token_amount = match get_donut_tokens_amount(
                                pool,
                                a_vault,
                                &ctx.accounts.b_vault,
                                a_vault_lp,
                                &ctx.accounts.b_vault_lp,
                                a_vault_lp_mint,
                                &ctx.accounts.b_vault_lp_mint,
                                current_deposit
                            ) {
                                Ok(amount) => amount,
                                Err(e) => {
                                    state.is_locked = false;
                                    let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                                    let mut state_bytes = &mut state_data[8..];
                                    state.serialize(&mut state_bytes)?;
                                    return Err(e);
                                }
                            };
                            
                            let adjusted_token_amount = match check_mint_limit(&mut state, token_amount) {
                                Ok(amount) => amount,
                                Err(e) => {
                                    state.is_locked = false;
                                    let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                                    let mut state_bytes = &mut state_data[8..];
                                    state.serialize(&mut state_bytes)?;
                                    return Err(e);
                                }
                            };
                            force_memory_cleanup();
                            
                            if let Err(e) = process_mint_tokens(
                                &ctx.accounts.token_mint,
                                &ctx.accounts.program_token_vault,
                                &ctx.accounts.token_mint_authority,
                                &ctx.accounts.token_program,
                                adjusted_token_amount,
                                &[&[
                                    b"token_mint_authority".as_ref(),
                                    &[mint_authority_bump]
                                ]],
                            ) {
                                state.is_locked = false;
                                let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                                let mut state_bytes = &mut state_data[8..];
                                state.serialize(&mut state_bytes)?;
                                return Err(e);
                            }

                            force_memory_cleanup();
                            upline_account_data.reserved_tokens = adjusted_token_amount;
                            deposit_processed = true;
                            msg!("Recursion: Found SLOT 2, reserved {} SOL and minted {} tokens", 
                                 current_deposit, adjusted_token_amount);
                        }
                        else if upline_slot_idx == 2 {
                            // SLOT 3: Pay upline and continue recursion
                            if upline_account_data.reserved_sol > 0 {
                                let reserved_sol = upline_account_data.reserved_sol;
                                
                                if upline_wallet.owner != &solana_program::system_program::ID {
                                    state.is_locked = false;
                                    let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                                    let mut state_bytes = &mut state_data[8..];
                                    state.serialize(&mut state_bytes)?;
                                    return Err(error!(ErrorCode::PaymentWalletInvalid));
                                }
                                
                                let ix = solana_program::system_instruction::transfer(
                                    &ctx.accounts.program_sol_vault.key(),
                                    &upline_wallet.key(),
                                    reserved_sol
                                );
                                
                                let mut accounts = Vec::with_capacity(2);
                                accounts.push(ctx.accounts.program_sol_vault.to_account_info());
                                accounts.push(upline_wallet.clone());
                                
                                if let Err(_) = solana_program::program::invoke_signed(
                                    &ix,
                                    &accounts,
                                    &[&[
                                        b"program_sol_vault".as_ref(),
                                        &[sol_vault_bump]
                                    ]],
                                ) {
                                    state.is_locked = false;
                                    let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                                    let mut state_bytes = &mut state_data[8..];
                                    state.serialize(&mut state_bytes)?;
                                    return Err(error!(ErrorCode::ReferrerPaymentFailed));
                                }
                                
                                upline_account_data.reserved_sol = 0;
                            }
                            
                            if upline_account_data.reserved_tokens > 0 {
                                let reserved_tokens = upline_account_data.reserved_tokens;
                                
                                if upline_token.owner != &spl_token::id() {
                                    state.is_locked = false;
                                    let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                                    let mut state_bytes = &mut state_data[8..];
                                    state.serialize(&mut state_bytes)?;
                                    return Err(error!(ErrorCode::TokenAccountInvalid));
                                }
                                
                                if let Err(e) = process_transfer_tokens(
                                    &ctx.accounts.program_token_vault,
                                    upline_token,
                                    &ctx.accounts.vault_authority,
                                    &ctx.accounts.token_program,
                                    reserved_tokens,
                                    &[&[
                                        b"token_vault_authority".as_ref(),
                                        &[vault_authority_bump]
                                    ]],
                                ) {
                                    state.is_locked = false;
                                    let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                                    let mut state_bytes = &mut state_data[8..];
                                    state.serialize(&mut state_bytes)?;
                                    return Err(e);
                                }
                                
                                force_memory_cleanup();
                                upline_account_data.reserved_tokens = 0;
                            }
                            
                            msg!("Recursion: Paid upline {}, continuing...", upline_key);
                        }
                        
                        let chain_completed = upline_account_data.chain.filled_slots == 3;
                        
                        if chain_completed {
                            let next_chain_id_value = state.next_chain_id;
                            state.next_chain_id += 1;
                            
                            upline_account_data.chain.id = next_chain_id_value;
                            upline_account_data.chain.slots = [None, None, None];
                            upline_account_data.chain.filled_slots = 0;
                            
                            current_user_pubkey = upline_key;
                        }
                        
                        // Serialize the changes
                        {
                            let mut data = match upline_info.try_borrow_mut_data() {
                                Ok(data) => data,
                                Err(_) => {
                                    state.is_locked = false;
                                    let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                                    let mut state_bytes = &mut state_data[8..];
                                    state.serialize(&mut state_bytes)?;
                                    return Err(ProgramError::InvalidAccountData.into());
                                }
                            };
                            let mut write_data = &mut data[8..];
                            if let Err(_) = upline_account_data.serialize(&mut write_data) {
                                state.is_locked = false;
                                let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                                let mut state_bytes = &mut state_data[8..];
                                state.serialize(&mut state_bytes)?;
                                return Err(ProgramError::InvalidAccountData.into());
                            }
                        }

                        force_memory_cleanup();
                        
                        if !chain_completed || current_deposit == 0 {
                            break;
                        }
                        
                        if trio_index >= MAX_UPLINE_DEPTH - 1 {
                            break;
                        }
                    }
                    
                    if current_deposit == 0 {
                        break;
                    }
                }

                // FALLBACK: If recursion processed all uplines without finding slot 1 or 2
                if current_deposit > 0 && !deposit_processed {
                    msg!("Recursion fallback: No slot 1/2 found, swapping {} WSOL for DONUT", current_deposit);
                    
                    // Wrap SOL to WSOL for swap
                    if let Err(e) = manage_wsol_operation(
                        &ctx.accounts.user_wallet.to_account_info(),
                        &ctx.accounts.user_wsol_account,
                        &ctx.accounts.token_program,
                        "wrap",
                        Some(current_deposit),
                    ) {
                        state.is_locked = false;
                        let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                        let mut state_bytes = &mut state_data[8..];
                        state.serialize(&mut state_bytes)?;
                        return Err(e);
                    }
                    
                    // Create local references
                    let pool_info = pool.clone();
                    let b_vault_info = ctx.accounts.b_vault.to_account_info();
                    let b_vault_lp_info = ctx.accounts.b_vault_lp.to_account_info();
                    let b_vault_lp_mint_info = ctx.accounts.b_vault_lp_mint.to_account_info();
                    let b_token_vault_info = ctx.accounts.b_token_vault.to_account_info();
                    
                    // Calculate minimum
                    let minimum_donut_out = match calculate_swap_amount_out(
                        &pool_info,
                        a_vault,
                        &b_vault_info,
                        a_vault_lp,
                        &b_vault_lp_info,
                        a_vault_lp_mint,
                        &b_vault_lp_mint_info,
                        current_deposit,
                    ) {
                        Ok(amount) => amount,
                        Err(e) => {
                            state.is_locked = false;
                            let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                            let mut state_bytes = &mut state_data[8..];
                            state.serialize(&mut state_bytes)?;
                            return Err(e);
                        }
                    };
                    
                    // Execute swap
                    if let Err(e) = process_swap_wsol_to_donut(
                        &pool_info,
                        &ctx.accounts.user_wallet.to_account_info(),
                        &ctx.accounts.user_wsol_account,
                        &ctx.accounts.user_donut_account,
                        a_vault,
                        &b_vault_info,
                        a_token_vault,
                        &b_token_vault_info,
                        a_vault_lp_mint,
                        &b_vault_lp_mint_info,
                        a_vault_lp,
                        &b_vault_lp_info,
                        &ctx.accounts.protocol_token_fee,
                        &ctx.accounts.vault_program,
                        &ctx.accounts.token_program.to_account_info(),
                        &ctx.accounts.amm_program,
                        current_deposit,
                        minimum_donut_out,
                    ) {
                        state.is_locked = false;
                        let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                        let mut state_bytes = &mut state_data[8..];
                        state.serialize(&mut state_bytes)?;
                        return Err(e);
                    }
                    
                    deposit_processed = true;
                    msg!("Recursion fallback: Swapped {} WSOL for DONUT", current_deposit);
                }
            }
        }

        // FINAL VALIDATION
        if !deposit_processed {
            msg!("CRITICAL ERROR: Deposit not processed - this should NEVER happen!");
            state.is_locked = false;
            let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
            let mut state_bytes = &mut state_data[8..];
            state.serialize(&mut state_bytes)?;
            return Err(error!(ErrorCode::DepositNotProcessed));
        }
        
        // EMERGENCY FALLBACK: Handle any remaining WSOL balance
        // Read WSOL balance
        let wsol_data = ctx.accounts.user_wsol_account.try_borrow_data()?;
        let wsol_account = TokenAccount::try_deserialize(&mut &wsol_data[..])?;
        let final_wsol_balance = wsol_account.amount;
        drop(wsol_data);
        
        if final_wsol_balance > 0 {
            msg!("EMERGENCY: Found remaining WSOL balance: {}, forcing swap", final_wsol_balance);
            
            // Create local references
            let pool_info = pool.clone();
            let b_vault_info = ctx.accounts.b_vault.to_account_info();
            let b_vault_lp_info = ctx.accounts.b_vault_lp.to_account_info();
            let b_vault_lp_mint_info = ctx.accounts.b_vault_lp_mint.to_account_info();
            let b_token_vault_info = ctx.accounts.b_token_vault.to_account_info();
            
            // Calculate minimum
            let minimum_donut_out = match calculate_swap_amount_out(
                &pool_info,
                a_vault,
                &b_vault_info,
                a_vault_lp,
                &b_vault_lp_info,
                a_vault_lp_mint,
                &b_vault_lp_mint_info,
                final_wsol_balance,
            ) {
                Ok(amount) => amount,
                Err(e) => {
                    state.is_locked = false;
                    let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                    let mut state_bytes = &mut state_data[8..];
                    state.serialize(&mut state_bytes)?;
                    return Err(e);
                }
            };
            
            // Execute emergency swap
            if let Err(e) = process_swap_wsol_to_donut(
                &pool_info,
                &ctx.accounts.user_wallet.to_account_info(),
                &ctx.accounts.user_wsol_account,
                &ctx.accounts.user_donut_account,
                a_vault,
                &b_vault_info,
                a_token_vault,
                &b_token_vault_info,
                a_vault_lp_mint,
                &b_vault_lp_mint_info,
                a_vault_lp,
                &b_vault_lp_info,
                &ctx.accounts.protocol_token_fee,
                &ctx.accounts.vault_program,
                &ctx.accounts.token_program.to_account_info(),
                &ctx.accounts.amm_program,
                final_wsol_balance,
                minimum_donut_out,
            ) {
                state.is_locked = false;
                let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
                let mut state_bytes = &mut state_data[8..];
                state.serialize(&mut state_bytes)?;
                return Err(e);
            }
            
            msg!("Emergency swap completed: {} WSOL for DONUT", final_wsol_balance);
        }

        msg!("Registration completed successfully: slot={}, base_user={}, deposit_processed=true", 
             slot_idx + 1, is_base_user);
        
        // REENTRANCY PROTECTION - REMOVE LOCK AT END
        state.is_locked = false;
        
        // Write state back
        let mut state_data = ctx.accounts.state.try_borrow_mut_data()?;
        let mut state_bytes = &mut state_data[8..];
        state.serialize(&mut state_bytes)?;
        
        Ok(())
    }
}

// ===== ADDITIONAL HELPER TRAITS =====

/// Discriminator trait for account types
trait Discriminator {
    fn discriminator() -> [u8; 8];
}

impl Discriminator for UserAccount {
    fn discriminator() -> [u8; 8] {
        // This should match the actual discriminator used by Anchor
        // Usually it's the first 8 bytes of SHA256("account:UserAccount")
        [216, 146, 107, 94, 104, 75, 182, 31]
    }
}

// ===== TESTS MODULE =====

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decimal_display() {
        let decimal = Decimal::new(12345678, 6);
        assert_eq!(decimal.to_string(), "12.345678");
        
        let decimal2 = Decimal::new(100, 2);
        assert_eq!(decimal2.to_string(), "1.00");
        
        let decimal3 = Decimal::new(5, 6);
        assert_eq!(decimal3.to_string(), "0.000005");
    }

    #[test]
    fn test_upline_entry_size() {
        let entry = UplineEntry {
            pda: Pubkey::default(),
            wallet: Pubkey::default(),
        };
        
        let serialized = entry.try_to_vec().unwrap();
        assert_eq!(serialized.len(), 64); // 32 + 32 bytes
    }

    #[test]
    fn test_user_account_size() {
        // Verify that our SIZE constant matches the actual serialized size
        let user = UserAccount {
            is_registered: true,
            referrer: Some(Pubkey::default()),
            owner_wallet: Pubkey::default(),
            upline: ReferralUpline {
                id: 1,
                depth: 1,
                upline: vec![],
            },
            chain: ReferralChain {
                id: 1,
                slots: [None, None, None],
                filled_slots: 0,
            },
            reserved_sol: 0,
            reserved_tokens: 0,
        };
        
        let serialized = user.try_to_vec().unwrap();
        assert!(serialized.len() <= UserAccount::SIZE);
    }
}

// ===== END OF CONTRACT =====