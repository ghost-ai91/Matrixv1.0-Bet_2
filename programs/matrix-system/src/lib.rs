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
 
    // Pool address
    pub static POOL_ADDRESS: Pubkey = solana_program::pubkey!("FrQ5KsAgjCe3FFg6ZENri8feDft54tgnATxyffcasuxU");
    
    // WSOL mint
    pub static WSOL_MINT: Pubkey = solana_program::pubkey!("So11111111111111111111111111111111111111112");
    
    // Chainlink addresses (Devnet)
    pub static CHAINLINK_PROGRAM: Pubkey = solana_program::pubkey!("HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny");
    pub static SOL_USD_FEED: Pubkey = solana_program::pubkey!("99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR");
    
    // CRITICAL SECURITY ADDRESSES 
    pub static METEORA_POOL_PROGRAM: Pubkey = solana_program::pubkey!("LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo");
}

// Admin account addresses
pub mod admin_addresses {
    use solana_program::pubkey::Pubkey;

    pub static MULTISIG_TREASURY: Pubkey = solana_program::pubkey!("5C16cVYXe7KRPz6rBD33qhcqyjvy42LP8tyJRNMXbKiL");
    pub static AUTHORIZED_INITIALIZER: Pubkey = solana_program::pubkey!("QgNN4aW9hPz4ANP1LqzR2FkDPZo9MzDZxDQ4abovHYv");
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

// User account structure
#[account]
#[derive(Default)]
pub struct UserAccount {
    pub is_registered: bool,
    pub referrer: Option<Pubkey>,
    pub owner_wallet: Pubkey,
    pub upline: ReferralUpline,
    pub chain: ReferralChain,
    pub reserved_sol: u64,
}

impl UserAccount {
    pub const SIZE: usize = 1 + // is_registered
                           1 + 32 + // Option<Pubkey> (1 for is_some + 32 for Pubkey)
                           32 + // owner_wallet
                           4 + 1 + 4 + (MAX_UPLINE_DEPTH * (32 + 32)) + // ReferralUpline
                           4 + (3 * (1 + 32)) + 1 + // ReferralChain
                           8; // reserved_sol
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
    
    #[msg("Failed to wrap SOL to WSOL")]
    WrapSolFailed,
    
    #[msg("Failed to unwrap WSOL to SOL")]
    UnwrapSolFailed,

    #[msg("Invalid pool address")]
    InvalidPoolAddress,
    
    #[msg("Invalid WSOL mint address")]
    InvalidWsolMintAddress,

    #[msg("Missing required account for upline")]
    MissingUplineAccount,
    
    #[msg("Payment wallet is not a system account")]
    PaymentWalletInvalid,

    #[msg("Missing required accounts")]
    MissingRequiredAccounts,
    
    #[msg("Failed to read price feed")]
    PriceFeedReadFailed,
    
    #[msg("Price feed too old")]
    PriceFeedTooOld,
    
    #[msg("Invalid Chainlink program")]
    InvalidChainlinkProgram,
    
    #[msg("Invalid price feed")]
    InvalidPriceFeed,

    #[msg("Invalid pool program address")]
    InvalidPoolProgram,
    
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
}

// Event structure for slot filling
#[event]
pub struct SlotFilled {
    pub slot_idx: u8,
    pub chain_id: u32,
    pub user: Pubkey,
    pub owner: Pubkey,
}

// Decimal handling for price display
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

// Helper function to force memory cleanup
fn force_memory_cleanup() {
    let _dummy = Vec::<u8>::new();
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

// Function to calculate minimum SOL deposit based on USD price
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

// Function to verify all fixed addresses
fn verify_all_fixed_addresses<'info>(
    pool: &Pubkey,
    wsol_mint: &Pubkey,
) -> Result<()> {
    verify_address_strict(pool, &verified_addresses::POOL_ADDRESS, ErrorCode::InvalidPoolAddress)?;
    verify_address_strict(wsol_mint, &verified_addresses::WSOL_MINT, ErrorCode::InvalidWsolMintAddress)?;
    
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

fn validate_all_remaining_accounts<'info>(
    remaining_accounts: &[AccountInfo<'info>],
    expected_base_count: usize,
) -> Result<()> {
    if remaining_accounts.len() < expected_base_count {
        return Err(error!(ErrorCode::MissingRequiredAccounts));
    }
    
    let chainlink_feed = &remaining_accounts[0];
    let chainlink_program = &remaining_accounts[1];
    
    verify_address_strict(&chainlink_program.key(), &verified_addresses::CHAINLINK_PROGRAM, 
                         ErrorCode::InvalidChainlinkProgram)?;
    verify_address_strict(&chainlink_feed.key(), &verified_addresses::SOL_USD_FEED, 
                         ErrorCode::InvalidPriceFeed)?;
    
    if remaining_accounts.len() > expected_base_count {
        let upline_accounts = &remaining_accounts[expected_base_count..];
        if upline_accounts.len() % 2 != 0 {
            return Err(error!(ErrorCode::MissingUplineAccount));
        }
        
        for chunk in upline_accounts.chunks(2) {
            let upline_pda = &chunk[0];
            let upline_wallet = &chunk[1];
            
            if upline_pda.owner != &crate::ID {
                return Err(error!(ErrorCode::InvalidSlotOwner));
            }
            if upline_wallet.owner != &solana_program::system_program::ID {
                return Err(error!(ErrorCode::PaymentWalletInvalid));
            }
        }
    }
    
    Ok(())
}

fn validate_upline_accounts<'info>(
    referrer: &Account<'_, UserAccount>,
    upline_accounts: &[AccountInfo<'info>],
) -> Result<()> {
    let expected_uplines = referrer.upline.upline.len();
    
    if upline_accounts.len() % 2 != 0 {
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

// Verify if an account is a valid wallet (system account)
fn verify_wallet_is_system_account<'info>(wallet: &AccountInfo<'info>) -> Result<()> {
    if wallet.owner != &solana_program::system_program::ID {
        return Err(error!(ErrorCode::PaymentWalletInvalid));
    }
    
    Ok(())
}

// Function to manage WSOL operations
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
                // Transfer SOL to WSOL
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
                
                // Sync native
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

// Function to process swap on Meteora pool
fn process_swap<'info>(
    user_wallet: &AccountInfo<'info>,
    user_wsol_account: &AccountInfo<'info>,
    user_token_account: &AccountInfo<'info>,
    pool: &AccountInfo<'info>,
    pool_token_a_vault: &AccountInfo<'info>,
    pool_token_b_vault: &AccountInfo<'info>,
    pool_token_a_fees: &AccountInfo<'info>,
    pool_program: &UncheckedAccount<'info>,
    token_program: &Program<'info, Token>,
    amount_in: u64,
    minimum_amount_out: u64,
) -> Result<()> {
    // Derive pool authority
    let (pool_authority, _) = Pubkey::find_program_address(
        &[pool.key().as_ref()],
        &pool_program.key()
    );
    
    // Meteora swap instruction discriminator
    let swap_discriminator: [u8; 8] = [248, 198, 158, 145, 225, 117, 135, 200];
    
    let swap_accounts = vec![
        solana_program::instruction::AccountMeta::new_readonly(pool.key(), false),
        solana_program::instruction::AccountMeta::new_readonly(pool_authority, false),
        solana_program::instruction::AccountMeta::new(user_wallet.key(), true),
        solana_program::instruction::AccountMeta::new(user_wsol_account.key(), false),
        solana_program::instruction::AccountMeta::new(pool_token_b_vault.key(), false),
        solana_program::instruction::AccountMeta::new(user_token_account.key(), false),
        solana_program::instruction::AccountMeta::new(pool_token_a_vault.key(), false),
        solana_program::instruction::AccountMeta::new(pool_token_a_fees.key(), false),
        solana_program::instruction::AccountMeta::new_readonly(token_program.key(), false),
    ];

    let mut swap_data = Vec::with_capacity(24);
    swap_data.extend_from_slice(&swap_discriminator);
    swap_data.extend_from_slice(&amount_in.to_le_bytes());
    swap_data.extend_from_slice(&minimum_amount_out.to_le_bytes());

    let swap_ix = solana_program::instruction::Instruction {
        program_id: pool_program.key(),
        accounts: swap_accounts,
        data: swap_data,
    };

    // Note: We don't pass pool_authority in account_infos since it's derived
    let account_infos = vec![
        pool.clone(),
        user_wallet.clone(),
        user_wsol_account.clone(),
        pool_token_b_vault.clone(),
        user_token_account.clone(),
        pool_token_a_vault.clone(),
        pool_token_a_fees.clone(),
        token_program.to_account_info(),
    ];

    solana_program::program::invoke(
        &swap_ix,
        &account_infos,
    ).map_err(|e| {
        msg!("Swap failed: {:?}", e);
        error!(ErrorCode::SwapFailed)
    })?;
    
    msg!("Swap completed: {} WSOL -> DONUT", amount_in);
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

// Function process_pay_referrer with explicit lifetimes
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

// Accounts for registration without referrer with swap
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

    /// CHECK: User token account for Wrapped SOL, verified in the instruction code
    #[account(mut)]
    pub user_wsol_account: UncheckedAccount<'info>,
    
    /// CHECK: User token account for DONUT tokens
    #[account(mut)]
    pub user_token_account: UncheckedAccount<'info>,
    
    // WSOL mint
    /// CHECK: This is the fixed WSOL mint address
    pub wsol_mint: AccountInfo<'info>,

    // Pool and swap accounts
    /// CHECK: Pool account (PDA)
    #[account(mut)]
    pub pool: UncheckedAccount<'info>,

    /// CHECK: Pool token A vault (DONUT)
    #[account(mut)]
    pub pool_token_a_vault: UncheckedAccount<'info>,

    /// CHECK: Pool token B vault (WSOL)
    #[account(mut)]
    pub pool_token_b_vault: UncheckedAccount<'info>,

    /// CHECK: Pool token A fees
    #[account(mut)]
    pub pool_token_a_fees: UncheckedAccount<'info>,

    /// CHECK: Pool program
    pub pool_program: UncheckedAccount<'info>,

    // Required programs
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

// Structure for registration with SOL swap
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

    // New WSOL ATA account
    #[account(
        init,
        payer = user_wallet,
        associated_token::mint = wsol_mint,
        associated_token::authority = user_wallet
    )]
    pub user_wsol_account: Account<'info, TokenAccount>,
    
    /// CHECK: User token account for DONUT tokens
    #[account(mut)]
    pub user_token_account: UncheckedAccount<'info>,
    
    // WSOL mint
    /// CHECK: This is the fixed WSOL mint address
    pub wsol_mint: AccountInfo<'info>,

    // Pool and swap accounts
    /// CHECK: Pool account (PDA)
    #[account(mut)]
    pub pool: UncheckedAccount<'info>,

    /// CHECK: Pool token A vault (DONUT)
    #[account(mut)]
    pub pool_token_a_vault: UncheckedAccount<'info>,

    /// CHECK: Pool token B vault (WSOL)
    #[account(mut)]
    pub pool_token_b_vault: UncheckedAccount<'info>,

    /// CHECK: Pool token A fees
    #[account(mut)]
    pub pool_token_a_fees: UncheckedAccount<'info>,

    /// CHECK: Pool program
    pub pool_program: UncheckedAccount<'info>,

    // Accounts for SOL reserve (Slot 2)
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
    
    // Register without referrer
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
    
        // STRICT VERIFICATION OF ALL ADDRESSES
        if let Err(e) = verify_all_fixed_addresses(
            &ctx.accounts.pool.key(),
            &ctx.accounts.wsol_mint.key(),
        ) {
            ctx.accounts.state.is_locked = false;
            return Err(e);
        }

        // CRITICAL: Validate pool program
        if let Err(e) = verify_address_strict(
            &ctx.accounts.pool_program.key(), 
            &verified_addresses::METEORA_POOL_PROGRAM, 
            ErrorCode::InvalidPoolProgram
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

        // Sync the WSOL account 
        let sync_native_ix = spl_token::instruction::sync_native(
            &spl_token::ID,
            &ctx.accounts.user_wsol_account.key(),
        ).map_err(|_| {
            ctx.accounts.state.is_locked = false;
            error!(ErrorCode::WrapSolFailed)
        })?;
        
        let sync_accounts = [ctx.accounts.user_wsol_account.to_account_info()];
        
        solana_program::program::invoke(
            &sync_native_ix,
            &sync_accounts,
        ).map_err(|_| {
            ctx.accounts.state.is_locked = false;
            error!(ErrorCode::WrapSolFailed)
        })?;

        // Process swap from WSOL to DONUT
        if let Err(e) = process_swap(
            &ctx.accounts.user_wallet.to_account_info(),
            &ctx.accounts.user_wsol_account.to_account_info(),
            &ctx.accounts.user_token_account.to_account_info(),
            &ctx.accounts.pool.to_account_info(),
            &ctx.accounts.pool_token_a_vault.to_account_info(),
            &ctx.accounts.pool_token_b_vault.to_account_info(),
            &ctx.accounts.pool_token_a_fees.to_account_info(),
            &ctx.accounts.pool_program,
            &ctx.accounts.token_program,
            deposit_amount,
            0, // minimum_amount_out - you may want to calculate this based on slippage
        ) {
            ctx.accounts.state.is_locked = false;
            return Err(e);
        }

        // PROTEÇÃO REENTRANCY - FIM
        ctx.accounts.state.is_locked = false;
        Ok(())
    }

    // Register with SOL swap
    pub fn register_with_sol_swap<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, RegisterWithSolSwap<'info>>, 
        deposit_amount: u64
    ) -> Result<()> {
        // PROTEÇÃO REENTRANCY
        if ctx.accounts.state.is_locked {
            msg!("Transaction rejected: reentrancy protection active");
            return Err(error!(ErrorCode::ReentrancyLock));
        }
        
        // SETAR LOCK ANTES DE QUALQUER OPERAÇÃO EXTERNA
        ctx.accounts.state.is_locked = true;
        
        // CRITICAL SECURITY VALIDATIONS
        
        // 1. VALIDATE METEORA POOL PROGRAM
        if let Err(e) = verify_address_strict(
            &ctx.accounts.pool_program.key(), 
            &verified_addresses::METEORA_POOL_PROGRAM, 
            ErrorCode::InvalidPoolProgram
        ) {
            ctx.accounts.state.is_locked = false;
            return Err(e);
        }
        
        // 2. Check if referrer is registered
        if !ctx.accounts.referrer.is_registered {
            ctx.accounts.state.is_locked = false;
            return Err(error!(ErrorCode::ReferrerNotRegistered));
        }

        // 3. DETERMINE ACTUAL SLOT FROM BLOCKCHAIN
        let actual_slot_idx = ctx.accounts.referrer.chain.filled_slots as usize;
        
        // 4. DETECT BASE USER
        let is_base_user = ctx.accounts.referrer.referrer.is_none() && 
                           ctx.accounts.referrer.upline.upline.is_empty();
        
        msg!("Security Check - Slot: {}, Base User: {}, Referrer has {} uplines", 
             actual_slot_idx, is_base_user, ctx.accounts.referrer.upline.upline.len());

        // VALIDAÇÃO CRÍTICA SLOT 3
        if actual_slot_idx == 2 {
            if is_base_user {
                msg!("SLOT 3 - Base user detected: deposit will be swapped");
                
                if ctx.remaining_accounts.len() < 2 {
                    ctx.accounts.state.is_locked = false;
                    return Err(error!(ErrorCode::MissingRequiredAccounts));
                }
            } else {
                msg!("SLOT 3 - Normal user detected: validating ALL upline accounts");
                
                let base_accounts = 2; // chainlink feed + program
                let referrer_uplines_count = ctx.accounts.referrer.upline.upline.len();
                let required_upline_accounts = referrer_uplines_count * 2; // Changed from 3 to 2
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
        } else {
            if ctx.remaining_accounts.len() < 2 {
                ctx.accounts.state.is_locked = false;
                return Err(error!(ErrorCode::MissingRequiredAccounts));
            }
        }

        // VALIDAR TODAS AS CONTAS RESTANTES
        if let Err(e) = validate_all_remaining_accounts(&ctx.remaining_accounts, 2) {
            ctx.accounts.state.is_locked = false;
            return Err(e);
        }

        // Extract Chainlink accounts
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

        // VERIFY ALL FIXED ADDRESSES
        if let Err(e) = verify_all_fixed_addresses(
            &ctx.accounts.pool.key(),
            &ctx.accounts.wsol_mint.key(),
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
        
        // GESTÃO WSOL SIMPLIFICADA E SEGURA
        let mut deposit_processed = false;
        
        // 1. WRAP SOL -> WSOL (apenas uma vez no início)
        if let Err(e) = manage_wsol_operation(
            &ctx.accounts.user_wallet.to_account_info(),
            &ctx.accounts.user_wsol_account.to_account_info(),
            &ctx.accounts.token_program,
            "wrap",
            Some(deposit_amount),
        ) {
            ctx.accounts.state.is_locked = false;
            return Err(e);
        }
        
        // 2. Create new UplineEntry for referrer
        let referrer_entry = UplineEntry {
            pda: ctx.accounts.referrer.key(),
            wallet: ctx.accounts.referrer_wallet.key(),
        };
        
        // 3. Create user's upline chain
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

        // 4. Setup user account
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

        if slot_idx == 0 {
            // SLOT 1: Swap WSOL to DONUT
            if let Err(e) = process_swap(
                &ctx.accounts.user_wallet.to_account_info(),
                &ctx.accounts.user_wsol_account.to_account_info(),
                &ctx.accounts.user_token_account.to_account_info(),
                &ctx.accounts.pool.to_account_info(),
                &ctx.accounts.pool_authority.to_account_info(),
                &ctx.accounts.pool_token_a_vault.to_account_info(),
                &ctx.accounts.pool_token_b_vault.to_account_info(),
                &ctx.accounts.pool_token_a_fees.to_account_info(),
                &ctx.accounts.pool_program,
                &ctx.accounts.token_program,
                deposit_amount,
                0, // minimum_amount_out
            ) {
                ctx.accounts.state.is_locked = false;
                return Err(e);
            }
            deposit_processed = true;
            msg!("SLOT 1: Swapped {} WSOL to DONUT", deposit_amount);
        } 
        else if slot_idx == 1 {
            // SLOT 2: Reserve SOL (unwrap WSOL primeiro)
            
            // Unwrap WSOL para obter SOL de volta
            if let Err(e) = manage_wsol_operation(
                &ctx.accounts.user_wallet.to_account_info(),
                &ctx.accounts.user_wsol_account.to_account_info(),
                &ctx.accounts.token_program,
                "unwrap",
                None,
            ) {
                ctx.accounts.state.is_locked = false;
                return Err(e);
            }
            
            // Reserve SOL for referrer
            if let Err(e) = process_reserve_sol(
                &ctx.accounts.user_wallet.to_account_info(),
                &ctx.accounts.program_sol_vault.to_account_info(),
                deposit_amount
            ) {
                ctx.accounts.state.is_locked = false;
                return Err(e);
            }
            
            ctx.accounts.referrer.reserved_sol = deposit_amount;
            deposit_processed = true;
            msg!("SLOT 2: Reserved {} SOL", deposit_amount);
        }
        else if slot_idx == 2 {
            // SLOT 3: Pay referrer (unwrap WSOL primeiro)
            
            // Unwrap WSOL para recuperar SOL
            if let Err(e) = manage_wsol_operation(
                &ctx.accounts.user_wallet.to_account_info(),
                &ctx.accounts.user_wsol_account.to_account_info(),
                &ctx.accounts.token_program,
                "unwrap",
                None,
            ) {
                ctx.accounts.state.is_locked = false;
                return Err(e);
            }
            
            // Pay reserved SOL to referrer
            if ctx.accounts.referrer.reserved_sol > 0 {
                if let Err(e) = verify_wallet_is_system_account(&ctx.accounts.referrer_wallet.to_account_info()) {
                    ctx.accounts.state.is_locked = false;
                    return Err(e);
                }
                
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

        force_memory_cleanup();
        
        if chain_completed {
            state.next_chain_id += 1;
        }

        // RECURSION PROCESSING COM GESTÃO WSOL SEGURA
        if chain_completed && slot_idx == 2 {
            let mut current_user_pubkey = upline_pubkey;
            let current_deposit = deposit_amount;

            let upline_start_idx = 2; // chainlink feed + program

            if is_base_user {
                // BASE USER: No recursion, deposit gets swapped
                msg!("Base user matrix completed: swapping {} to DONUT", current_deposit);
                
                // Wrap SOL para WSOL para swap
                if let Err(e) = manage_wsol_operation(
                    &ctx.accounts.user_wallet.to_account_info(),
                    &ctx.accounts.user_wsol_account.to_account_info(),
                    &ctx.accounts.token_program,
                    "wrap",
                    Some(current_deposit),
                ) {
                    ctx.accounts.state.is_locked = false;
                    return Err(e);
                }
                
                // Swap to DONUT
                if let Err(e) = process_swap(
                    &ctx.accounts.user_wallet.to_account_info(),
                    &ctx.accounts.user_wsol_account.to_account_info(),
                    &ctx.accounts.user_token_account.to_account_info(),
                    &ctx.accounts.pool.to_account_info(),
                    &ctx.accounts.pool_authority.to_account_info(),
                    &ctx.accounts.pool_token_a_vault.to_account_info(),
                    &ctx.accounts.pool_token_b_vault.to_account_info(),
                    &ctx.accounts.pool_token_a_fees.to_account_info(),
                    &ctx.accounts.pool_program,
                    &ctx.accounts.token_program,
                    current_deposit,
                    0,
                ) {
                    ctx.accounts.state.is_locked = false;
                    return Err(e);
                }
                
                deposit_processed = true;
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
                
                const BATCH_SIZE: usize = 1;
                let batch_count = (pair_count + BATCH_SIZE - 1) / BATCH_SIZE;
                
                for batch_idx in 0..batch_count {
                    let start_pair = batch_idx * BATCH_SIZE;
                    let end_pair = std::cmp::min(start_pair + BATCH_SIZE, pair_count);
                    
                    for pair_index in start_pair..end_pair {
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

                        force_memory_cleanup();

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
                            // FOUND SLOT 1: Swap to DONUT
                            msg!("Recursion: Found SLOT 1 - preparing swap");
                            
                            // Wrap SOL para WSOL para swap
                            if let Err(e) = manage_wsol_operation(
                                &ctx.accounts.user_wallet.to_account_info(),
                                &ctx.accounts.user_wsol_account.to_account_info(),
                                &ctx.accounts.token_program,
                                "wrap",
                                Some(current_deposit),
                            ) {
                                ctx.accounts.state.is_locked = false;
                                return Err(e);
                            }
                            
                            if let Err(e) = process_swap(
                                &ctx.accounts.user_wallet.to_account_info(),
                                &ctx.accounts.user_wsol_account.to_account_info(),
                                &ctx.accounts.user_token_account.to_account_info(),
                                &ctx.accounts.pool.to_account_info(),
                                &ctx.accounts.pool_authority.to_account_info(),
                                &ctx.accounts.pool_token_a_vault.to_account_info(),
                                &ctx.accounts.pool_token_b_vault.to_account_info(),
                                &ctx.accounts.pool_token_a_fees.to_account_info(),
                                &ctx.accounts.pool_program,
                                &ctx.accounts.token_program,
                                current_deposit,
                                0,
                            ) {
                                ctx.accounts.state.is_locked = false;
                                return Err(e);
                            }
                            
                            deposit_processed = true;
                            msg!("Recursion: Found SLOT 1, swapped {} to DONUT", current_deposit);
                        } 
                        else if upline_slot_idx == 1 {
                            // FOUND SLOT 2: Reserve SOL
                            msg!("Recursion: Found SLOT 2 - processing");
                            
                            if let Err(e) = process_reserve_sol(
                                &ctx.accounts.user_wallet.to_account_info(),
                                &ctx.accounts.program_sol_vault.to_account_info(),
                                current_deposit
                            ) {
                                ctx.accounts.state.is_locked = false;
                                return Err(e);
                            }
                            
                            upline_account_data.reserved_sol = current_deposit;
                            deposit_processed = true;
                            msg!("Recursion: Found SLOT 2, reserved {} SOL", current_deposit);
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

                        force_memory_cleanup();
                        
                        if !chain_completed || current_deposit == 0 {
                            break;
                        }
                        
                        if pair_index >= MAX_UPLINE_DEPTH - 1 {
                            break;
                        }
                    }
                    
                    if current_deposit == 0 {
                        break;
                    }
                }

                // FALLBACK: Se a recursão processou todos os uplines sem encontrar slot 1 ou 2
                if current_deposit > 0 && !deposit_processed {
                    msg!("Recursion fallback: No slot 1/2 found, swapping {} to DONUT", current_deposit);
                    
                    // Wrap SOL para WSOL para swap
                    if let Err(e) = manage_wsol_operation(
                        &ctx.accounts.user_wallet.to_account_info(),
                        &ctx.accounts.user_wsol_account.to_account_info(),
                        &ctx.accounts.token_program,
                        "wrap",
                        Some(current_deposit),
                    ) {
                        ctx.accounts.state.is_locked = false;
                        return Err(e);
                    }
                    
                    if let Err(e) = process_swap(
                        &ctx.accounts.user_wallet.to_account_info(),
                        &ctx.accounts.user_wsol_account.to_account_info(),
                        &ctx.accounts.user_token_account.to_account_info(),
                        &ctx.accounts.pool.to_account_info(),
                        &ctx.accounts.pool_authority.to_account_info(),
                        &ctx.accounts.pool_token_a_vault.to_account_info(),
                        &ctx.accounts.pool_token_b_vault.to_account_info(),
                        &ctx.accounts.pool_token_a_fees.to_account_info(),
                        &ctx.accounts.pool_program,
                        &ctx.accounts.token_program,
                        current_deposit,
                        0,
                    ) {
                        ctx.accounts.state.is_locked = false;
                        return Err(e);
                    }
                    
                    deposit_processed = true;
                    msg!("Recursion fallback: Swapped {} to DONUT", current_deposit);
                }
            }
        }

        // FINAL VALIDATION
        if !deposit_processed {
            msg!("CRITICAL ERROR: Deposit not processed - this should NEVER happen!");
            ctx.accounts.state.is_locked = false;
            return Err(error!(ErrorCode::DepositNotProcessed));
        }
        
        // EMERGENCY FALLBACK: Handle any remaining WSOL balance
        let final_wsol_balance = ctx.accounts.user_wsol_account.amount;
        if final_wsol_balance > 0 {
            msg!("EMERGENCY: Found remaining WSOL balance: {}, forcing swap", final_wsol_balance);
            
            if let Err(e) = process_swap(
                &ctx.accounts.user_wallet.to_account_info(),
                &ctx.accounts.user_wsol_account.to_account_info(),
                &ctx.accounts.user_token_account.to_account_info(),
                &ctx.accounts.pool.to_account_info(),
                &ctx.accounts.pool_authority.to_account_info(),
                &ctx.accounts.pool_token_a_vault.to_account_info(),
                &ctx.accounts.pool_token_b_vault.to_account_info(),
                &ctx.accounts.pool_token_a_fees.to_account_info(),
                &ctx.accounts.pool_program,
                &ctx.accounts.token_program,
                final_wsol_balance,
                0,
            ) {
                ctx.accounts.state.is_locked = false;
                return Err(e);
            }
            
            msg!("Emergency swap completed: {}", final_wsol_balance);
        }

        msg!("Registration completed successfully: slot={}, base_user={}, deposit_processed=true", 
             slot_idx + 1, is_base_user);
        
        // PROTEÇÃO REENTRANCY - REMOVER LOCK NO FINAL
        ctx.accounts.state.is_locked = false;
        Ok(())
    }
}