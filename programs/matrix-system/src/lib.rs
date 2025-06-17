use anchor_lang::prelude::*;
use anchor_lang::solana_program::{self, clock::Clock};
use anchor_lang::AnchorDeserialize;
use anchor_lang::AnchorSerialize;
use anchor_spl::token::{self, Token, TokenAccount};
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

// Minimum deposit amount in USD (10 dollars in base units - 8 decimals)
const MINIMUM_USD_DEPOSIT: u64 = 10_00000000; // 10 USD with 8 decimals (Chainlink format)

// Maximum price feed staleness (24 hours in seconds)
const MAX_PRICE_FEED_AGE: i64 = 86400;

// Default SOL price in case of stale feed ($100 USD per SOL)
const DEFAULT_SOL_PRICE: i128 = 100_00000000; // $100 with 8 decimals

// Maximum number of upline accounts that can be processed in a single transaction
const MAX_UPLINE_DEPTH: usize = 6;

// Constants for strict address verification
pub mod verified_addresses {
    use solana_program::pubkey::Pubkey;
 
    // Pool address for swaps
    pub static POOL_ADDRESS: Pubkey = solana_program::pubkey!("FrQ5KsAgjCe3FFg6ZENri8feDft54tgnATxyffcasuxU");
    
    // Token addresses
    pub static TOKEN_MINT: Pubkey = solana_program::pubkey!("CCTG4ZmGa9Nk9NVxbd1FXBNyKjyHSapuF9aU6zgcA3xz");
    pub static WSOL_MINT: Pubkey = solana_program::pubkey!("So11111111111111111111111111111111111111112");
    
    // Chainlink addresses (Devnet)
    pub static CHAINLINK_PROGRAM: Pubkey = solana_program::pubkey!("HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny");
    pub static SOL_USD_FEED: Pubkey = solana_program::pubkey!("99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR");
    
    // Meteora swap program
    pub static METEORA_SWAP_PROGRAM: Pubkey = solana_program::pubkey!("Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB");
}

// Admin account addresses
pub mod admin_addresses {
    use solana_program::pubkey::Pubkey;

    pub static MULTISIG_TREASURY: Pubkey = solana_program::pubkey!("5C16cVYXe7KRPz6rBD33qhcqyjvy42LP8tyJRNMXbKiL");
    pub static AUTHORIZED_INITIALIZER: Pubkey = solana_program::pubkey!("QgNN4aW9hPz4ANP1LqzR2FkDPZo9MzDZxDQ4abovHYv");
}

// ===== METEORA DYNAMIC AMM STRUCTURES =====

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

// ===== PROGRAM STRUCTURES =====

// Program state structure
#[account]
pub struct ProgramState {
    pub owner: Pubkey,
    pub multisig_treasury: Pubkey,
    pub next_upline_id: u32,
    pub next_chain_id: u32,
    pub is_locked: bool,
}

impl ProgramState {
    pub const SIZE: usize = 32 + 32 + 4 + 4 + 1;
}

// Structure to store complete information for each upline
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default, Debug)]
pub struct UplineEntry {
    pub pda: Pubkey,       // PDA of the user account
    pub wallet: Pubkey,    // Original user wallet
}

// Referral upline structure
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ReferralUpline {
    pub id: u32,
    pub depth: u8,
    pub upline: Vec<UplineEntry>, // Stores UplineEntry with all information
}

// Referral matrix structure
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ReferralChain {
    pub id: u32,
    pub slots: [Option<Pubkey>; 3],
    pub filled_slots: u8,
}

// User account structure - REMOVED token fields
#[account]
#[derive(Default)]
pub struct UserAccount {
    pub is_registered: bool,
    pub referrer: Option<Pubkey>,
    pub owner_wallet: Pubkey,
    pub upline: ReferralUpline,
    pub chain: ReferralChain,
    pub reserved_sol: u64,  // Only SOL reservation
}

impl UserAccount {
    pub const SIZE: usize = 1 + // is_registered
                           1 + 32 + // Option<Pubkey> (1 for is_some + 32 for Pubkey)
                           32 + // owner_wallet
                           4 + 1 + 4 + (MAX_UPLINE_DEPTH * (32 + 32)) + // ReferralUpline
                           4 + (3 * (1 + 32)) + 1 + // ReferralChain
                           8; // reserved_sol (removed reserved_tokens)
}

// Error codes
#[error_code]
pub enum ErrorCode {
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

    #[msg("Failed to process swap")]
    SwapFailed,

    #[msg("Failed to process SOL reserve")]
    SolReserveFailed,

    #[msg("Failed to process referrer payment")]
    ReferrerPaymentFailed,

    #[msg("Invalid pool address")]
    InvalidPoolAddress,
    
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

    #[msg("Failed to read price feed")]
    PriceFeedReadFailed,
    
    #[msg("Price feed too old")]
    PriceFeedTooOld,
    
    #[msg("Invalid Chainlink program")]
    InvalidChainlinkProgram,
    
    #[msg("Invalid price feed")]
    InvalidPriceFeed,

    #[msg("Invalid swap program address")]
    InvalidSwapProgram,
    
    #[msg("Slot 3 registration requires upline accounts for recursion")]
    Slot3RequiresUplineAccounts,
    
    #[msg("Swap was not fully processed - registration aborted")]
    SwapNotProcessed,
    
    #[msg("Upline account does not belong to referrer chain")]
    InvalidUplineAccount,
    
    #[msg("Upline accounts are not in correct order")]
    InvalidUplineOrder,

    #[msg("Transaction locked to prevent reentrancy")]
    ReentrancyLock,
}

// Event structure for slot filling
#[event]
pub struct SlotFilled {
    pub slot_idx: u8,
    pub chain_id: u32,
    pub user: Pubkey,
    pub owner: Pubkey,
}

// Function to get SOL/USD price from Chainlink feed
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

// Function to calculate minimum SOL deposit based on USD price - FIXED to use integer math
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
    
    // Use integer arithmetic only - no floats
    let sol_price_lamports = sol_price_per_unit as u64; // Price in 8 decimals
    let minimum_usd_lamports = MINIMUM_USD_DEPOSIT; // $10 in 8 decimals
    
    // Calculate: (minimum_usd * 10^9) / sol_price
    // Both are in 8 decimals, so we need to adjust for lamports (10^9)
    let numerator = minimum_usd_lamports * 1_000_000_000; // Convert to lamports scale
    let minimum_lamports = numerator / sol_price_lamports;
    
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

// Function to verify Chainlink addresses
fn verify_chainlink_addresses<'info>(
    chainlink_program: &Pubkey,
    chainlink_feed: &Pubkey,
) -> Result<()> {
    verify_address_strict(chainlink_program, &verified_addresses::CHAINLINK_PROGRAM, ErrorCode::InvalidChainlinkProgram)?;
    verify_address_strict(chainlink_feed, &verified_addresses::SOL_USD_FEED, ErrorCode::InvalidPriceFeed)?;
    
    Ok(())
}

// Function to process SOL->DONUT swap using Meteora
fn process_sol_to_donut_swap<'info>(
    user_wallet: &AccountInfo<'info>,
    user_donut_account: &AccountInfo<'info>,
    pool: &AccountInfo<'info>,
    token_a_vault: &AccountInfo<'info>,
    token_b_vault: &AccountInfo<'info>,
    swap_program: &AccountInfo<'info>,
    token_program: &Program<'info, Token>,
    system_program: &Program<'info, System>,
    sol_amount: u64,
) -> Result<()> {
    // Verify swap program
    verify_address_strict(&swap_program.key(), &verified_addresses::METEORA_SWAP_PROGRAM, ErrorCode::InvalidSwapProgram)?;
    
    // Verify pool
    verify_address_strict(&pool.key(), &verified_addresses::POOL_ADDRESS, ErrorCode::InvalidPoolAddress)?;
    
    let swap_accounts = [
        pool.clone(),
        user_wallet.clone(),
        token_a_vault.clone(), // DONUT vault
        token_b_vault.clone(), // SOL vault
        user_donut_account.clone(),
        user_wallet.clone(), // SOL source
        token_program.to_account_info(),
        system_program.to_account_info(),
    ];

    // Meteora swap instruction data
    // This is a placeholder - you need to get the actual instruction discriminator from Meteora
    let mut swap_data = Vec::with_capacity(24);
    swap_data.extend_from_slice(&[248, 198, 158, 145, 225, 117, 135, 200]); // Swap discriminator (placeholder)
    swap_data.extend_from_slice(&sol_amount.to_le_bytes()); // Amount in
    swap_data.extend_from_slice(&0u64.to_le_bytes()); // Minimum amount out

    solana_program::program::invoke(
        &solana_program::instruction::Instruction {
            program_id: swap_program.key(),
            accounts: swap_accounts.iter().enumerate().map(|(i, a)| {
                match i {
                    0 => solana_program::instruction::AccountMeta::new(a.key(), false), // pool
                    1 => solana_program::instruction::AccountMeta::new_readonly(a.key(), true), // user (signer)
                    2 | 3 => solana_program::instruction::AccountMeta::new(a.key(), false), // vaults
                    4 => solana_program::instruction::AccountMeta::new(a.key(), false), // user donut account
                    5 => solana_program::instruction::AccountMeta::new(a.key(), true), // user wallet (SOL source)
                    _ => solana_program::instruction::AccountMeta::new_readonly(a.key(), false), // programs
                }
            }).collect::<Vec<solana_program::instruction::AccountMeta>>(),
            data: swap_data,
        },
        &swap_accounts,
    ).map_err(|e| {
        msg!("SOL to DONUT swap failed: {:?}", e);
        error!(ErrorCode::SwapFailed)
    })?;
    
    msg!("SOL to DONUT swap completed: {} SOL", sol_amount);
    Ok(())
}

// Function to reserve SOL for the referrer
fn process_reserve_sol<'info>(
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    let ix = solana_program::system_instruction::transfer(
        &from.key(),
        &to.to_account_info().key(),
        amount
    );
    
    solana_program::program::invoke(
        &ix,
        &[from.clone(), to.to_account_info()],
    ).map_err(|e| {
        msg!("Reserve SOL failed: {:?}", e);
        error!(ErrorCode::SolReserveFailed)
    })?;
    
    msg!("SOL reserved: {}", amount);
    Ok(())
}

// Function process_pay_referrer with explicit lifetimes
fn process_pay_referrer<'info>(
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    amount: u64,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    if to.owner != &solana_program::system_program::ID {
        return Err(error!(ErrorCode::PaymentWalletInvalid));
    }
    
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

fn validate_upline_accounts<'info>(
    referrer: &Account<'_, UserAccount>,
    upline_accounts: &[AccountInfo<'info>],
) -> Result<()> {
    let expected_uplines = referrer.upline.upline.len();
    
    if upline_accounts.len() % 2 != 0 { // Changed from 3 to 2 (no token accounts)
        msg!("ERROR: Upline accounts not in pairs: {}", upline_accounts.len());
        return Err(error!(ErrorCode::MissingUplineAccount));
    }
    
    let pair_count = upline_accounts.len() / 2;
    
    if pair_count != expected_uplines {
        msg!(
            "CRITICAL: Must send ALL uplines! Referrer has {} uplines, got {} pairs",
            expected_uplines,
            pair_count
        );
        return Err(error!(ErrorCode::InvalidUplineAccount));
    }
    
    if expected_uplines == 0 {
        msg!("Referrer has no uplines - this should not happen in SLOT 3 normal user");
        return Ok(());
    }
    
    msg!("Validating ALL {} upline pairs", pair_count);
    
    for i in 0..pair_count {
        let base_idx = i * 2;
        let upline_pda = &upline_accounts[base_idx];
        let upline_wallet = &upline_accounts[base_idx + 1];
        
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
        
        msg!("✅ Upline {} validated: {}", i, upline_pda.key());
    }
    
    msg!("🎯 ALL {} upline pairs validated successfully", pair_count);
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

// Accounts for registration without referrer - SIMPLIFIED
#[derive(Accounts)]
#[instruction(deposit_amount: u64)]
pub struct RegisterWithoutReferrerSwap<'info> {
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

    // User DONUT token account
    #[account(
        init,
        payer = user_wallet,
        associated_token::mint = token_mint,
        associated_token::authority = user_wallet
    )]
    pub user_donut_account: Account<'info, TokenAccount>,
    
    // Token mint
    /// CHECK: This is the DONUT token mint address
    pub token_mint: AccountInfo<'info>,

    // Swap Accounts
    /// CHECK: Pool account for swaps
    #[account(mut)]
    pub pool: UncheckedAccount<'info>,

    /// CHECK: Token A vault (DONUT)
    #[account(mut)]
    pub token_a_vault: UncheckedAccount<'info>,

    /// CHECK: Token B vault (SOL)
    #[account(mut)]
    pub token_b_vault: UncheckedAccount<'info>,

    /// CHECK: Meteora swap program
    pub swap_program: UncheckedAccount<'info>,

    // Required programs
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

// Structure for registration with SOL - SIMPLIFIED
#[derive(Accounts)]
#[instruction(deposit_amount: u64)]
pub struct RegisterWithSolSwap<'info> {
    #[account(mut)]
    pub state: Account<'info, ProgramState>,

    #[account(mut)]
    pub user_wallet: Signer<'info>,

    // Reference accounts
    #[account(mut)]
    pub referrer: Account<'info, UserAccount>,
    
    #[account(mut)]
    pub referrer_wallet: SystemAccount<'info>,

    // User account
    #[account(
        init,
        payer = user_wallet,
        space = 8 + UserAccount::SIZE,
        seeds = [b"user_account", user_wallet.key().as_ref()],
        bump
    )]
    pub user: Account<'info, UserAccount>,

    // User DONUT token account
    #[account(
        init,
        payer = user_wallet,
        associated_token::mint = token_mint,
        associated_token::authority = user_wallet
    )]
    pub user_donut_account: Account<'info, TokenAccount>,
    
    // Token mint
    /// CHECK: This is the DONUT token mint address
    pub token_mint: AccountInfo<'info>,

    // Swap Accounts
    /// CHECK: Pool account for swaps
    #[account(mut)]
    pub pool: UncheckedAccount<'info>,

    /// CHECK: Token A vault (DONUT)
    #[account(mut)]
    pub token_a_vault: UncheckedAccount<'info>,

    /// CHECK: Token B vault (SOL)
    #[account(mut)]
    pub token_b_vault: UncheckedAccount<'info>,

    /// CHECK: Meteora swap program
    pub swap_program: UncheckedAccount<'info>,

    // SOL reserve vault
    #[account(
        mut,
        seeds = [b"program_sol_vault"],
        bump
    )]
    pub program_sol_vault: SystemAccount<'info>,
    
    // Required programs
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[program]
pub mod referral_system {
    use super::*;

    // Initialize program state
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
        
        Ok(())
    }
    
    // Register without referrer - SIMPLIFIED
    pub fn register_without_referrer(ctx: Context<RegisterWithoutReferrerSwap>, deposit_amount: u64) -> Result<()> {
        // PROTEÇÃO REENTRANCY
        if ctx.accounts.state.is_locked {
            return Err(error!(ErrorCode::ReentrancyLock));
        }
        ctx.accounts.state.is_locked = true;

        // Verify if the caller is the multisig treasury
        if ctx.accounts.owner.key() != ctx.accounts.state.multisig_treasury {
            ctx.accounts.state.is_locked = false;
            return Err(error!(ErrorCode::NotAuthorized));
        }
    
        // STRICT VERIFICATION OF ADDRESSES
        if let Err(e) = verify_address_strict(
            &ctx.accounts.pool.key(), 
            &verified_addresses::POOL_ADDRESS, 
            ErrorCode::InvalidPoolAddress
        ) {
            ctx.accounts.state.is_locked = false;
            return Err(e);
        }

        if let Err(e) = verify_address_strict(
            &ctx.accounts.token_mint.key(), 
            &verified_addresses::TOKEN_MINT, 
            ErrorCode::InvalidTokenMintAddress
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

        // Process SOL to DONUT swap
        if let Err(e) = process_sol_to_donut_swap(
            &ctx.accounts.user_wallet.to_account_info(),
            &ctx.accounts.user_donut_account.to_account_info(),
            &ctx.accounts.pool.to_account_info(),
            &ctx.accounts.token_a_vault.to_account_info(),
            &ctx.accounts.token_b_vault.to_account_info(),
            &ctx.accounts.swap_program.to_account_info(),
            &ctx.accounts.token_program,
            &ctx.accounts.system_program,
            deposit_amount
        ) {
            ctx.accounts.state.is_locked = false;
            return Err(e);
        }

        // PROTEÇÃO REENTRANCY - FIM
        ctx.accounts.state.is_locked = false;
        Ok(())
    }

    // Register with SOL - SIMPLIFIED AND CORRECTED
    pub fn register_with_sol_swap<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, RegisterWithSolSwap<'info>>, 
        deposit_amount: u64
    ) -> Result<()> {
        // PROTEÇÃO REENTRANCY
        if ctx.accounts.state.is_locked {
            msg!("Transaction rejected: reentrancy protection active");
            return Err(error!(ErrorCode::ReentrancyLock));
        }
        
        ctx.accounts.state.is_locked = true;
        
        // Check if referrer is registered
        if !ctx.accounts.referrer.is_registered {
            ctx.accounts.state.is_locked = false;
            return Err(error!(ErrorCode::ReferrerNotRegistered));
        }

        // DETERMINE ACTUAL SLOT FROM BLOCKCHAIN
        let actual_slot_idx = ctx.accounts.referrer.chain.filled_slots as usize;
        
        // DETECT BASE USER
        let is_base_user = ctx.accounts.referrer.referrer.is_none() && 
                           ctx.accounts.referrer.upline.upline.is_empty();
        
        msg!("Security Check - Slot: {}, Base User: {}, Referrer has {} uplines", 
             actual_slot_idx, is_base_user, ctx.accounts.referrer.upline.upline.len());

        // VALIDATE CHAINLINK PRICE FEED - Get from remaining accounts
        if ctx.remaining_accounts.len() < 2 {
            ctx.accounts.state.is_locked = false;
            return Err(error!(ErrorCode::InvalidPriceFeed));
        }
        
        let chainlink_feed = &ctx.remaining_accounts[0];
        let chainlink_program = &ctx.remaining_accounts[1];
        
        // Verify Chainlink addresses
        if let Err(e) = verify_chainlink_addresses(
            &chainlink_program.key(),
            &chainlink_feed.key(),
        ) {
            ctx.accounts.state.is_locked = false;
            return Err(e);
        }

        // Get minimum deposit amount from Chainlink feed
        let minimum_deposit = match calculate_minimum_sol_deposit(
            chainlink_feed,
            chainlink_program,
        ) {
            Ok(val) => val,
            Err(e) => {
                ctx.accounts.state.is_locked = false;
                return Err(e);
            }
        };

        // Verify deposit amount meets minimum requirement
        if deposit_amount < minimum_deposit {
            msg!("Deposit amount: {}, minimum required: {}", deposit_amount, minimum_deposit);
            ctx.accounts.state.is_locked = false;
            return Err(error!(ErrorCode::InsufficientDeposit));
        }

        // STRICT VERIFICATION OF ADDRESSES
        if let Err(e) = verify_address_strict(
            &ctx.accounts.pool.key(), 
            &verified_addresses::POOL_ADDRESS, 
            ErrorCode::InvalidPoolAddress
        ) {
            ctx.accounts.state.is_locked = false;
            return Err(e);
        }

        if let Err(e) = verify_address_strict(
            &ctx.accounts.token_mint.key(), 
            &verified_addresses::TOKEN_MINT, 
            ErrorCode::InvalidTokenMintAddress
        ) {
            ctx.accounts.state.is_locked = false;
            return Err(e);
        }

        // VALIDATE SLOT 3 UPLINE ACCOUNTS
        if actual_slot_idx == 2 && !is_base_user {
            msg!("SLOT 3 - Normal user detected: validating ALL upline accounts");
            
            let base_accounts = 2; // chainlink feed + program
            let referrer_uplines_count = ctx.accounts.referrer.upline.upline.len();
            let required_upline_accounts = referrer_uplines_count * 2; // pairs instead of trios
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
                ctx.accounts.state.is_locked = false;
                return Err(error!(ErrorCode::Slot3RequiresUplineAccounts));
            }
            
            let upline_accounts = &ctx.remaining_accounts[base_accounts..];
            if let Err(e) = validate_upline_accounts(&ctx.accounts.referrer, upline_accounts) {
                ctx.accounts.state.is_locked = false;
                return Err(e);
            }
            
            msg!("SLOT 3 validation passed: ALL {} uplines verified", referrer_uplines_count);
        }
        
        // Create new UplineEntry for referrer
        let referrer_entry = UplineEntry {
            pda: ctx.accounts.referrer.key(),
            wallet: ctx.accounts.referrer_wallet.key(),
        };
        
        // Create user's upline chain
        let mut new_upline = Vec::new();
        
        if ctx.accounts.referrer.upline.upline.len() >= MAX_UPLINE_DEPTH {
            new_upline.try_reserve(MAX_UPLINE_DEPTH).ok();
            let start_idx = ctx.accounts.referrer.upline.upline.len() - (MAX_UPLINE_DEPTH - 1);
            new_upline.extend_from_slice(&ctx.accounts.referrer.upline.upline[start_idx..]);
        } else {
            new_upline.try_reserve(ctx.accounts.referrer.upline.upline.len() + 1).ok();
            new_upline.extend_from_slice(&ctx.accounts.referrer.upline.upline);
        }
        
        new_upline.push(referrer_entry);
        new_upline.shrink_to_fit();

        // Setup user account
        let state = &mut ctx.accounts.state;
        let upline_id = state.next_upline_id;
        let chain_id = state.next_chain_id;

        state.next_chain_id += 1;

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

        // SLOT-BASED FINANCIAL LOGIC
        let slot_idx = actual_slot_idx;
        let mut swap_processed = false;

        if slot_idx == 0 {
            // SLOT 1: Swap SOL to DONUT
            if let Err(e) = process_sol_to_donut_swap(
                &ctx.accounts.user_wallet.to_account_info(),
                &ctx.accounts.user_donut_account.to_account_info(),
                &ctx.accounts.pool.to_account_info(),
                &ctx.accounts.token_a_vault.to_account_info(),
                &ctx.accounts.token_b_vault.to_account_info(),
                &ctx.accounts.swap_program.to_account_info(),
                &ctx.accounts.token_program,
                &ctx.accounts.system_program,
                deposit_amount
            ) {
                ctx.accounts.state.is_locked = false;
                return Err(e);
            }
            swap_processed = true;
            msg!("SLOT 1: Swapped {} SOL to DONUT", deposit_amount);
        } 
        else if slot_idx == 1 {
            // SLOT 2: Reserve SOL for referrer
            if let Err(e) = process_reserve_sol(
                &ctx.accounts.user_wallet.to_account_info(),
                &ctx.accounts.program_sol_vault.to_account_info(),
                deposit_amount
            ) {
                ctx.accounts.state.is_locked = false;
                return Err(e);
            }
            
            ctx.accounts.referrer.reserved_sol = deposit_amount;
            swap_processed = true;
            msg!("SLOT 2: Reserved {} SOL", deposit_amount);
        }
        else if slot_idx == 2 {
            // SLOT 3: Pay referrer
            
            // Pay reserved SOL to referrer
            if ctx.accounts.referrer.reserved_sol > 0 {
                if let Err(e) = process_pay_referrer(
                    &ctx.accounts.program_sol_vault.to_account_info(),
                    &ctx.accounts.referrer_wallet.to_account_info(),
                    ctx.accounts.referrer.reserved_sol,
                    &[&[
                        b"program_sol_vault".as_ref(),
                        &[ctx.bumps.program_sol_vault]
                    ]],
                ) {
                    ctx.accounts.state.is_locked = false;
                    return Err(e);
                }
                
                ctx.accounts.referrer.reserved_sol = 0;
            }
            
            msg!("SLOT 3: Paid referrer, preparing recursion with {} deposit", deposit_amount);
        }
        
        // Process referrer's matrix
        let (chain_completed, upline_pubkey) = match process_referrer_chain(
            &ctx.accounts.user_wallet.key(),
            &mut ctx.accounts.referrer,
            state.next_chain_id,
        ) {
            Ok(result) => result,
            Err(e) => {
                ctx.accounts.state.is_locked = false;
                return Err(e);
            }
        };
        
        if chain_completed {
            state.next_chain_id += 1;
        }

        // RECURSION PROCESSING (SLOT 3)
        if chain_completed && slot_idx == 2 {
            let mut current_user_pubkey = upline_pubkey;
            let current_deposit = deposit_amount;

            let upline_start_idx = 2; // After chainlink accounts

            if is_base_user {
                // BASE USER: No recursion, swap goes to user
                msg!("Base user matrix completed: swapping {} SOL to DONUT", current_deposit);
                
                if let Err(e) = process_sol_to_donut_swap(
                    &ctx.accounts.user_wallet.to_account_info(),
                    &ctx.accounts.user_donut_account.to_account_info(),
                    &ctx.accounts.pool.to_account_info(),
                    &ctx.accounts.token_a_vault.to_account_info(),
                    &ctx.accounts.token_b_vault.to_account_info(),
                    &ctx.accounts.swap_program.to_account_info(),
                    &ctx.accounts.token_program,
                    &ctx.accounts.system_program,
                    current_deposit
                ) {
                    ctx.accounts.state.is_locked = false;
                    return Err(e);
                }
                
                swap_processed = true;
                msg!("Base user: {} swapped to DONUT", deposit_amount);
                
            } else if ctx.remaining_accounts.len() > upline_start_idx && current_deposit > 0 {
                // NORMAL USER: Process recursion
                let upline_accounts = &ctx.remaining_accounts[upline_start_idx..];
                
                if upline_accounts.len() % 2 != 0 {
                    msg!("ERROR: Upline accounts not in pairs: {}", upline_accounts.len());
                    ctx.accounts.state.is_locked = false;
                    return Err(error!(ErrorCode::MissingUplineAccount));
                }
                
                let pair_count = upline_accounts.len() / 2;
                msg!("Processing recursion with {} validated upline pairs", pair_count);
                
                for pair_index in 0..pair_count {
                    if pair_index >= MAX_UPLINE_DEPTH || current_deposit == 0 {
                        break;
                    }

                    let base_idx = pair_index * 2;
                    let upline_info = &upline_accounts[base_idx];
                    let upline_wallet = &upline_accounts[base_idx + 1];
                    
                    if upline_wallet.owner != &solana_program::system_program::ID {
                        ctx.accounts.state.is_locked = false;
                        return Err(error!(ErrorCode::PaymentWalletInvalid));
                    }
                    
                    if !upline_info.owner.eq(&crate::ID) {
                        ctx.accounts.state.is_locked = false;
                        return Err(error!(ErrorCode::InvalidSlotOwner));
                    }

                    let mut upline_account_data;
                    {
                        let data = match upline_info.try_borrow_data() {
                            Ok(data) => data,
                            Err(_) => {
                                ctx.accounts.state.is_locked = false;
                                return Err(ProgramError::InvalidAccountData.into());
                            }
                        };
                        if data.len() <= 8 {
                            ctx.accounts.state.is_locked = false;
                            return Err(ProgramError::InvalidAccountData.into());
                        }

                        let mut account_slice = &data[8..];
                        upline_account_data = match UserAccount::deserialize(&mut account_slice) {
                            Ok(data) => data,
                            Err(_) => {
                                ctx.accounts.state.is_locked = false;
                                return Err(ProgramError::InvalidAccountData.into());
                            }
                        };

                        if !upline_account_data.is_registered {
                            ctx.accounts.state.is_locked = false;
                            return Err(error!(ErrorCode::SlotNotRegistered));
                        }
                    }

                    let upline_slot_idx = upline_account_data.chain.filled_slots as usize;
                    let upline_key = *upline_info.key;
                    
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
                        // FOUND SLOT 1: Swap SOL to DONUT
                        msg!("Recursion: Found SLOT 1 - swapping to DONUT");
                        
                        if let Err(e) = process_sol_to_donut_swap(
                            &ctx.accounts.user_wallet.to_account_info(),
                            &ctx.accounts.user_donut_account.to_account_info(),
                            &ctx.accounts.pool.to_account_info(),
                            &ctx.accounts.token_a_vault.to_account_info(),
                            &ctx.accounts.token_b_vault.to_account_info(),
                            &ctx.accounts.swap_program.to_account_info(),
                            &ctx.accounts.token_program,
                            &ctx.accounts.system_program,
                            current_deposit
                        ) {
                            ctx.accounts.state.is_locked = false;
                            return Err(e);
                        }
                        
                        swap_processed = true;
                        msg!("Recursion: Found SLOT 1, swapped {} SOL to DONUT", current_deposit);
                        break; // Stop recursion after swap
                    } 
                    else if upline_slot_idx == 1 {
                        // FOUND SLOT 2: Reserve SOL
                        msg!("Recursion: Found SLOT 2 - reserving SOL");
                        
                        if let Err(e) = process_reserve_sol(
                            &ctx.accounts.user_wallet.to_account_info(),
                            &ctx.accounts.program_sol_vault.to_account_info(),
                            current_deposit
                        ) {
                            ctx.accounts.state.is_locked = false;
                            return Err(e);
                        }
                        
                        upline_account_data.reserved_sol = current_deposit;
                        swap_processed = true;
                        msg!("Recursion: Found SLOT 2, reserved {} SOL", current_deposit);
                        break; // Stop recursion after reserve
                    }
                    else if upline_slot_idx == 2 {
                        // SLOT 3: Pay upline and continue recursion
                        if upline_account_data.reserved_sol > 0 {
                            let reserved_sol = upline_account_data.reserved_sol;
                            
                            if upline_wallet.owner != &solana_program::system_program::ID {
                                ctx.accounts.state.is_locked = false;
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
                                    &[ctx.bumps.program_sol_vault]
                                ]],
                            ) {
                                ctx.accounts.state.is_locked = false;
                                return Err(error!(ErrorCode::ReferrerPaymentFailed));
                            }
                            
                            upline_account_data.reserved_sol = 0;
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
                    
                    // Serialize changes
                    {
                        let mut data = match upline_info.try_borrow_mut_data() {
                            Ok(data) => data,
                            Err(_) => {
                                ctx.accounts.state.is_locked = false;
                                return Err(ProgramError::InvalidAccountData.into());
                            }
                        };
                        let mut write_data = &mut data[8..];
                        if let Err(_) = upline_account_data.serialize(&mut write_data) {
                            ctx.accounts.state.is_locked = false;
                            return Err(ProgramError::InvalidAccountData.into());
                        }
                    }
                    
                    if !chain_completed || current_deposit == 0 {
                        break;
                    }
                    
                    if pair_index >= MAX_UPLINE_DEPTH - 1 {
                        break;
                    }
                }

                // FALLBACK: If recursion processed all uplines without finding slot 1 or 2
                if current_deposit > 0 && !swap_processed {
                    msg!("Recursion fallback: No slot 1/2 found, swapping {} SOL to DONUT", current_deposit);
                    
                    if let Err(e) = process_sol_to_donut_swap(
                        &ctx.accounts.user_wallet.to_account_info(),
                        &ctx.accounts.user_donut_account.to_account_info(),
                        &ctx.accounts.pool.to_account_info(),
                        &ctx.accounts.token_a_vault.to_account_info(),
                        &ctx.accounts.token_b_vault.to_account_info(),
                        &ctx.accounts.swap_program.to_account_info(),
                        &ctx.accounts.token_program,
                        &ctx.accounts.system_program,
                        current_deposit
                    ) {
                        ctx.accounts.state.is_locked = false;
                        return Err(e);
                    }
                    
                    swap_processed = true;
                    msg!("Recursion fallback: Swapped {} SOL to DONUT", current_deposit);
                }
            }
        }

        // FINAL VALIDATION
        if !swap_processed && (slot_idx == 0 || (slot_idx == 2 && chain_completed)) {
            msg!("CRITICAL ERROR: Swap not processed - this should NEVER happen!");
            ctx.accounts.state.is_locked = false;
            return Err(error!(ErrorCode::SwapNotProcessed));
        }

        msg!("Registration completed successfully: slot={}, base_user={}, swap_processed={}", 
             slot_idx + 1, is_base_user, swap_processed);
        
        // REMOVE REENTRANCY LOCK
        ctx.accounts.state.is_locked = false;
        Ok(())
    }
}