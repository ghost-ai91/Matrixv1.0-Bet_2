use anchor_lang::prelude::*;
use anchor_lang::solana_program::{self};
use anchor_spl::token::{Token, TokenAccount};
use anchor_spl::associated_token::AssociatedToken;

declare_id!("G6dU3Ghhg7YGkSttucjvRzErkMAgPhFHx3efZ65Embin");

// ===== CONSTANTS =====
const MAX_PRICE_FEED_AGE: i64 = 86400;
const DEFAULT_SOL_PRICE: i128 = 100_00000000;

// ===== VERIFIED ADDRESSES =====
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
    
    // CRITICAL SECURITY ADDRESSES 
    pub static METEORA_VAULT_PROGRAM: Pubkey = solana_program::pubkey!("24Uqj9JCLxUeoC3hGfh5W3s9FM9uCHDS2SG3LYwBpyTi");
    
    // Meteora AMM addresses
    pub static METEORA_AMM_PROGRAM: Pubkey = solana_program::pubkey!("Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB");
    pub static PROTOCOL_FEE_ACCOUNT: Pubkey = solana_program::pubkey!("FBSwbuckwK9cPU7zhCXL6HuQvWn8dAJBX46oRQonKQLa");
}

// ===== ADMIN ADDRESSES =====
pub mod admin_addresses {
    use solana_program::pubkey::Pubkey;
    pub static MULTISIG_TREASURY: Pubkey = solana_program::pubkey!("QgNN4aW9hPz4ANP1LqzR2FkDPZo9MzDZxDQ4abovHYv");
}

// ===== ERROR CODES =====
#[error_code]
pub enum ErrorCode {
    #[msg("Invalid vault B address")]
    InvalidVaultBAddress,
    
    #[msg("Invalid pool address")]
    InvalidPoolAddress,
    
    #[msg("Invalid vault address")]
    InvalidVaultAddress,
    
    #[msg("Invalid token mint address")]
    InvalidTokenMintAddress,
    
    #[msg("Failed to process deposit to pool")]
    DepositToPoolFailed,
    
    #[msg("Failed to wrap SOL to WSOL")]
    WrapSolFailed,
    
    #[msg("Failed to unwrap WSOL to SOL")]
    UnwrapSolFailed,
    
    #[msg("Invalid vault program address")]
    InvalidVaultProgram,
    
    #[msg("Invalid AMM program")]
    InvalidAmmProgram,
    
    #[msg("Invalid protocol fee account")]
    InvalidProtocolFeeAccount,
    
    #[msg("Meteora pool calculation overflow")]
    MeteoraCalculationOverflow,
    
    #[msg("Failed to read Meteora pool data")]
    PriceMeteoraReadFailed,
    
    #[msg("Not authorized")]
    NotAuthorized,
    
    #[msg("Missing vault A accounts")]
    MissingVaultAAccounts,
}

// ===== PROGRAM STRUCTURES =====
#[account]
pub struct ProgramState {
    pub owner: Pubkey,
    pub multisig_treasury: Pubkey,
    pub next_user_id: u32,
}

impl ProgramState {
    pub const SIZE: usize = 32 + 32 + 4;
}

#[account]
pub struct UserAccount {
    pub is_registered: bool,
    pub owner_wallet: Pubkey,
    pub registration_time: i64,
}

impl UserAccount {
    pub const SIZE: usize = 1 + 32 + 8;
}

// ===== HELPER FUNCTIONS =====

/// Verify address strictly
fn verify_address_strict(provided: &Pubkey, expected: &Pubkey, error_code: ErrorCode) -> Result<()> {
    if provided != expected {
        msg!("Address verification failed: provided={}, expected={}", provided, expected);
        return Err(error!(error_code));
    }
    Ok(())
}

/// Verify all fixed addresses
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

/// Calculate expected swap output
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
    const PRECISION_FACTOR: i128 = 1_000_000_000;
    
    // Check if pool is enabled
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
    
    // Read vault A total amount
    let vault_data = a_vault.try_borrow_data()?;
    if vault_data.len() < 19 {
        return Err(error!(ErrorCode::PriceMeteoraReadFailed));
    }
    
    let vault_a_total = u64::from_le_bytes([
        vault_data[11], vault_data[12], vault_data[13], vault_data[14],
        vault_data[15], vault_data[16], vault_data[17], vault_data[18]
    ]);
    
    // Read vault B total amount
    let vault_data = b_vault.try_borrow_data()?;
    if vault_data.len() < 19 {
        return Err(error!(ErrorCode::PriceMeteoraReadFailed));
    }
    
    let vault_b_total = u64::from_le_bytes([
        vault_data[11], vault_data[12], vault_data[13], vault_data[14],
        vault_data[15], vault_data[16], vault_data[17], vault_data[18]
    ]);
    
    // Read LP amounts
    let a_data = a_vault_lp.try_borrow_data()?;
    let b_data = b_vault_lp.try_borrow_data()?;
    
    if a_data.len() < 72 || b_data.len() < 72 {
        return Err(error!(ErrorCode::PriceMeteoraReadFailed));
    }
    
    let a_vault_lp_amount = u64::from_le_bytes([
        a_data[64], a_data[65], a_data[66], a_data[67],
        a_data[68], a_data[69], a_data[70], a_data[71]
    ]);
    
    let b_vault_lp_amount = u64::from_le_bytes([
        b_data[64], b_data[65], b_data[66], b_data[67],
        b_data[68], b_data[69], b_data[70], b_data[71]
    ]);
    
    // Read LP supplies
    let a_mint_data = a_vault_lp_mint.try_borrow_data()?;
    let b_mint_data = b_vault_lp_mint.try_borrow_data()?;
    
    if a_mint_data.len() < 44 || b_mint_data.len() < 44 {
        return Err(error!(ErrorCode::PriceMeteoraReadFailed));
    }
    
    let a_vault_lp_supply = u64::from_le_bytes([
        a_mint_data[36], a_mint_data[37], a_mint_data[38], a_mint_data[39],
        a_mint_data[40], a_mint_data[41], a_mint_data[42], a_mint_data[43]
    ]);
    
    let b_vault_lp_supply = u64::from_le_bytes([
        b_mint_data[36], b_mint_data[37], b_mint_data[38], b_mint_data[39],
        b_mint_data[40], b_mint_data[41], b_mint_data[42], b_mint_data[43]
    ]);
    
    // Calculate token amounts
    let token_a_amount = if a_vault_lp_supply == 0 {
        0
    } else {
        let numerator = (a_vault_lp_amount as u128)
            .checked_mul(vault_a_total as u128)
            .ok_or(error!(ErrorCode::MeteoraCalculationOverflow))?;
        
        let result = numerator
            .checked_div(a_vault_lp_supply as u128)
            .ok_or(error!(ErrorCode::MeteoraCalculationOverflow))?;
        
        u64::try_from(result).map_err(|_| error!(ErrorCode::MeteoraCalculationOverflow))?
    };

    let token_b_amount = if b_vault_lp_supply == 0 {
        0
    } else {
        let numerator = (b_vault_lp_amount as u128)
            .checked_mul(vault_b_total as u128)
            .ok_or(error!(ErrorCode::MeteoraCalculationOverflow))?;
        
        let result = numerator
            .checked_div(b_vault_lp_supply as u128)
            .ok_or(error!(ErrorCode::MeteoraCalculationOverflow))?;
        
        u64::try_from(result).map_err(|_| error!(ErrorCode::MeteoraCalculationOverflow))?
    };
    
    msg!("Token amounts - A: {}, B: {}", token_a_amount, token_b_amount);
    
    if token_a_amount == 0 || token_b_amount == 0 {
        return Err(error!(ErrorCode::PriceMeteoraReadFailed));
    }
    
    // Calculate ratio
    let ratio = (token_a_amount as i128)
        .checked_mul(PRECISION_FACTOR)
        .and_then(|n| n.checked_div(token_b_amount as i128))
        .ok_or(error!(ErrorCode::MeteoraCalculationOverflow))?;
    
    // Calculate DONUT tokens
    let donut_tokens = (amount_in as i128)
        .checked_mul(ratio)
        .and_then(|n| n.checked_div(PRECISION_FACTOR))
        .ok_or(error!(ErrorCode::MeteoraCalculationOverflow))?;
    
    if donut_tokens > i128::from(u64::MAX) || donut_tokens < 0 {
        return Err(error!(ErrorCode::MeteoraCalculationOverflow));
    }
    
    let result = donut_tokens as u64;
    
    // Apply 1% slippage tolerance
    let minimum_out = result
        .checked_mul(99)
        .and_then(|n| n.checked_div(100))
        .ok_or(error!(ErrorCode::MeteoraCalculationOverflow))?;
    
    Ok(if minimum_out == 0 { 1 } else { minimum_out })
}

/// Process swap from WSOL to DONUT
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
    
    // Build swap accounts
    // NOTA: protocol_token_fee deve ser PROTOCOL_TOKEN_B_FEE pois estamos vendendo WSOL (token B)
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

// ===== ACCOUNT STRUCTURES =====

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

#[derive(Accounts)]
#[instruction(deposit_amount: u64)]
pub struct RegisterWithoutReferrer<'info> {
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

    /// User's WSOL account (created by user before calling)
    #[account(
        mut,
        associated_token::mint = wsol_mint,
        associated_token::authority = user_wallet
    )]
    pub user_wsol_account: Account<'info, TokenAccount>,
    
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
    #[account(mut)]
    pub protocol_token_fee: UncheckedAccount<'info>,
    
    /// CHECK: Meteora Dynamic AMM program
    pub amm_program: UncheckedAccount<'info>,

    /// Required programs
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

// ===== PROGRAM MODULE =====

#[program]
pub mod matrix_system {
    use super::*;

    /// Initialize program state
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let state = &mut ctx.accounts.state;
        state.owner = ctx.accounts.owner.key();
        state.multisig_treasury = admin_addresses::MULTISIG_TREASURY;
        state.next_user_id = 1;
        
        Ok(())
    }
    
    /// Register without referrer - simple version with swap
    pub fn register_without_referrer<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, RegisterWithoutReferrer<'info>>, 
        deposit_amount: u64
    ) -> Result<()> {
        // Verify if the caller is the multisig treasury
        if ctx.accounts.owner.key() != ctx.accounts.state.multisig_treasury {
            return Err(error!(ErrorCode::NotAuthorized));
        }
    
        // STRICT VERIFICATION OF ALL ADDRESSES
        verify_all_fixed_addresses(
            &ctx.accounts.pool.key(),
            &ctx.accounts.b_vault.key(),
            &ctx.accounts.b_token_vault.key(),
            &ctx.accounts.b_vault_lp_mint.key(),
            &ctx.accounts.b_vault_lp.key(),
            &ctx.accounts.token_mint.key(),
            &ctx.accounts.wsol_mint.key(),
        )?;

        // CRITICAL: Validate vault program
        verify_address_strict(
            &ctx.accounts.vault_program.key(), 
            &verified_addresses::METEORA_VAULT_PROGRAM, 
            ErrorCode::InvalidVaultProgram
        )?;
        
        // Validate AMM program
        verify_address_strict(
            &ctx.accounts.amm_program.key(),
            &verified_addresses::METEORA_AMM_PROGRAM,
            ErrorCode::InvalidAmmProgram
        )?;
        
        // Validate protocol fee account - agora usando TOKEN_B_FEE pois estamos swappando WSOL
        verify_address_strict(
            &ctx.accounts.protocol_token_fee.key(),
            &verified_addresses::PROTOCOL_TOKEN_B_FEE,
            ErrorCode::InvalidProtocolFeeAccount
        )?;

        // Create new user data
        let user = &mut ctx.accounts.user;
        user.is_registered = true;
        user.owner_wallet = ctx.accounts.user_wallet.key();
        user.registration_time = Clock::get()?.unix_timestamp;

        // Wrap SOL to WSOL
        manage_wsol_operation(
            &ctx.accounts.user_wallet.to_account_info(),
            &ctx.accounts.user_wsol_account.to_account_info(),
            &ctx.accounts.token_program,
            "wrap",
            Some(deposit_amount),
        )?;

        // SWAP WSOL FOR DONUT
        // Need to get vault A accounts from remaining_accounts
        if ctx.remaining_accounts.len() < 5 {
            return Err(error!(ErrorCode::MissingVaultAAccounts));
        }
        
        let a_vault = &ctx.remaining_accounts[0];
        let a_vault_lp = &ctx.remaining_accounts[1];
        let a_vault_lp_mint = &ctx.remaining_accounts[2];
        let a_token_vault = &ctx.remaining_accounts[3];
        
        // Verify vault A addresses
        verify_address_strict(&a_vault.key(), &verified_addresses::A_VAULT, ErrorCode::InvalidVaultAddress)?;
        verify_address_strict(&a_vault_lp.key(), &verified_addresses::A_VAULT_LP, ErrorCode::InvalidVaultAddress)?;
        verify_address_strict(&a_vault_lp_mint.key(), &verified_addresses::A_VAULT_LP_MINT, ErrorCode::InvalidVaultAddress)?;
        verify_address_strict(&a_token_vault.key(), &verified_addresses::A_TOKEN_VAULT, ErrorCode::InvalidVaultAddress)?;
        
        // Calculate minimum DONUT expected
        let minimum_donut_out = calculate_swap_amount_out(
            &ctx.accounts.pool.to_account_info(),
            a_vault,
            &ctx.accounts.b_vault.to_account_info(),
            a_vault_lp,
            &ctx.accounts.b_vault_lp.to_account_info(),
            a_vault_lp_mint,
            &ctx.accounts.b_vault_lp_mint.to_account_info(),
            deposit_amount,
        )?;

        // Execute swap
        process_swap_wsol_to_donut(
            &ctx.accounts.pool.to_account_info(),
            &ctx.accounts.user_wallet.to_account_info(),
            &ctx.accounts.user_wsol_account.to_account_info(),
            &ctx.accounts.user_donut_account.to_account_info(),
            a_vault,
            &ctx.accounts.b_vault.to_account_info(),
            a_token_vault,
            &ctx.accounts.b_token_vault.to_account_info(),
            a_vault_lp_mint,
            &ctx.accounts.b_vault_lp_mint.to_account_info(),
            a_vault_lp,
            &ctx.accounts.b_vault_lp.to_account_info(),
            &ctx.accounts.protocol_token_fee.to_account_info(),
            &ctx.accounts.vault_program.to_account_info(),
            &ctx.accounts.token_program.to_account_info(),
            &ctx.accounts.amm_program.to_account_info(),
            deposit_amount,
            minimum_donut_out,
        )?;

        msg!("User registered: swapped {} WSOL for DONUT", deposit_amount);
        
        Ok(())
    }
}