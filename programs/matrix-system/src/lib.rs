use anchor_lang::prelude::*;
use anchor_lang::solana_program::{self, clock::Clock};
use anchor_lang::AnchorDeserialize;
use anchor_lang::AnchorSerialize;
use anchor_spl::token::{Token, TokenAccount};
use anchor_spl::associated_token::AssociatedToken;
use chainlink_solana as chainlink;

#[cfg(not(feature = "no-entrypoint"))]
use {solana_security_txt::security_txt};

declare_id!("EWV1YNfhBTacafij2ffJ7RNyMuBVKNqtVgpyMiwX7syi");

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

const MINIMUM_USD_DEPOSIT: u64 = 10_00000000;
const MAX_PRICE_FEED_AGE: i64 = 86400;
const DEFAULT_SOL_PRICE: i128 = 100_00000000;
const MAX_UPLINE_DEPTH: usize = 6;

const WEEKLY_DISTRIBUTIONS: [u64; 36] = [
    240_081,    259_617,    279_997,    301_268,    323_478,    346_675,
    370_908,    396_224,    422_672,    450_303,    479_169,    509_323,
    540_819,    573_712,    608_059,    643_919,    681_351,    720_417,
    761_179,    803_704,    848_057,    894_308,    942_525,    992_783,
    1_045_139,  1_099_731,  1_156_576,  1_215_747,  1_317_311,  1_391_342,
    1_467_912,  1_547_090,  1_628_943,  1_713_547,  1_800_978,  1_891_317,
];

fn get_week_distribution(week: u8) -> u64 {
    if week == 0 || week > 36 {
        return 0;
    }
    WEEKLY_DISTRIBUTIONS[(week - 1) as usize]
}

// ===== MÓDULO DE ENDEREÇOS VERIFICADOS =====
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
    pub static TOKEN_MINT: Pubkey = solana_program::pubkey!("F1vCKXMix75KigbwZUXkVU97NiE1H2ToopttH67ydqvq");
    pub static WSOL_MINT: Pubkey = solana_program::pubkey!("So11111111111111111111111111111111111111112");
    
    // Chainlink
    pub static CHAINLINK_PROGRAM: Pubkey = solana_program::pubkey!("HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny");
    pub static SOL_USD_FEED: Pubkey = solana_program::pubkey!("99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR");
    
    // CRITICAL SECURITY ADDRESSES 
    pub static METEORA_VAULT_PROGRAM: Pubkey = solana_program::pubkey!("24Uqj9JCLxUeoC3hGfh5W3s9FM9uCHDS2SG3LYwBpyTi");
    pub static METEORA_AMM_PROGRAM: Pubkey = solana_program::pubkey!("Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB");
    
    // Protocol fee accounts
    pub static PROTOCOL_TOKEN_A_FEE: Pubkey = solana_program::pubkey!("2B6tLDfiQAMSPAKuHqRMvhuQ5dRKDWkYF6m7ggtzmCY5");
    pub static PROTOCOL_TOKEN_B_FEE: Pubkey = solana_program::pubkey!("88fLv3iEY7ubFCjwCzfzA7FsPG8xSBFicSPS8T8fX4Kq");
    
    // Program token vault for airdrop
    pub static PROGRAM_TOKEN_VAULT: Pubkey = solana_program::pubkey!("3Y1sooTiwXUicaCB7VZroB4YDWdLpT8bRAaTtQFLetfj");
}

pub mod admin_addresses {
    use solana_program::pubkey::Pubkey;
    pub static MULTISIG_TREASURY: Pubkey = solana_program::pubkey!("QgNN4aW9hPz4ANP1LqzR2FkDPZo9MzDZxDQ4abovHYv");
    pub static AUTHORIZED_INITIALIZER: Pubkey = solana_program::pubkey!("QgNN4aW9hPz4ANP1LqzR2FkDPZo9MzDZxDQ4abovHYv");
}

// ===== ESTRUTURAS DE DADOS =====

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct WeekSnapshot {
    pub week_number: u8,
    pub total_matrices: u64,
    pub donut_distributed: u64,
    pub donut_per_matrix: u64,
    pub week_end_timestamp: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct UserWeekData {
    pub week_number: u8,
    pub matrices_completed: u64,
}

#[account]
pub struct ProgramState {
    pub owner: Pubkey,
    pub multisig_treasury: Pubkey,
    pub is_locked: bool,
    pub next_upline_id: u32,
    pub next_chain_id: u32,
    pub current_week: u8,
    pub total_matrices_this_week: u64,
    pub program_start_timestamp: i64,
    pub airdrop_active: bool,
    pub closed_weeks: Vec<WeekSnapshot>,
}

impl ProgramState {
    // TAMANHO CORRETO CALCULADO:
    // 32 (owner) + 32 (treasury) + 1 (locked) + 4 (upline_id) + 4 (chain_id) 
    // + 1 (week) + 8 (matrices) + 8 (timestamp) + 1 (active) 
    // + 4 (vec length) + (36 * 33) (snapshots) + padding
    pub const SIZE: usize = 32 + 32 + 1 + 4 + 4 + 1 + 8 + 8 + 1 + 4 + (36 * 33) + 200;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default, Debug)]
pub struct UplineEntry {
    pub pda: Pubkey,
    pub wallet: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ReferralUpline {
    pub id: u32,
    pub depth: u8,
    pub upline: Vec<UplineEntry>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ReferralChain {
    pub id: u32,
    pub slots: [Option<Pubkey>; 3],
    pub filled_slots: u8,
}

#[account]
#[derive(Default)]
pub struct UserAccount {
    pub is_registered: bool,
    pub referrer: Option<Pubkey>,
    pub owner_wallet: Pubkey,
    pub upline: ReferralUpline,
    pub chain: ReferralChain,
    pub reserved_sol: u64,
    pub reserved_tokens: u64,
    pub completed_matrices_total: u64,
    pub weekly_matrices: Vec<UserWeekData>,
    pub total_donut_earned: u64,
    pub total_donut_claimed: u64,
    pub last_processed_week: u8,
}

impl UserAccount {
    pub const SIZE: usize = 1 + 33 + 32 + 500 + 50 + 8 + 8 + 8 + 4 + (36 * 9) + 8 + 8 + 1 + 100;
    
    pub fn get_claimable_donut(&self) -> u64 {
        self.total_donut_earned.saturating_sub(self.total_donut_claimed)
    }
    
    pub fn add_weekly_data(&mut self, week_data: UserWeekData) -> Result<()> {
        if self.weekly_matrices.len() >= 36 {
            return Ok(());
        }
        
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

// ===== CÓDIGOS DE ERRO =====

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid vault B address")]
    InvalidVaultBAddress,
    #[msg("Referrer account is not registered")]
    ReferrerNotRegistered,
    #[msg("Not authorized")]
    NotAuthorized,
    #[msg("Insufficient deposit amount")]
    InsufficientDeposit,
    #[msg("Failed to process deposit to pool")]
    DepositToPoolFailed,
    #[msg("Failed to process SOL reserve")]
    SolReserveFailed,
    #[msg("Failed to process referrer payment")]
    ReferrerPaymentFailed,
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
    #[msg("Invalid vault program address")]
    InvalidVaultProgram,
    #[msg("Invalid program token vault address")]
    InvalidProgramTokenVault,
    #[msg("Deposit was not fully processed - registration aborted")]
    DepositNotProcessed,
    #[msg("Transaction locked to prevent reentrancy")]
    ReentrancyLock,
    #[msg("Airdrop program has finished (36 weeks completed)")]
    AirdropProgramFinished,
    #[msg("Nothing to claim - no DONUT available")]
    NothingToClaim,
    #[msg("Arithmetic overflow detected")]
    ArithmeticOverflow,
    #[msg("No matrices completed in the week")]
    NoMatricesCompleted,
    #[msg("Failed to swap SOL to DONUT")]
    SwapFailed,
    #[msg("Failed to burn DONUT tokens")]
    BurnFailed,
    #[msg("Invalid Meteora AMM program")]
    InvalidMeteoraAmmProgram,
    #[msg("Week calculation failed")]
    WeekCalculationFailed,
    #[msg("Invalid slot")]
    InvalidSlot,
    #[msg("Recursion depth exceeded")]
    RecursionDepthExceeded,
    #[msg("Upline processing failed")]
    UplineProcessingFailed,
    #[msg("Failed to wrap SOL to WSOL")]
    WrapSolFailed,
    #[msg("Failed to unwrap WSOL to SOL")]
    UnwrapSolFailed,
    #[msg("Invalid protocol fee account")]
    InvalidProtocolFeeAccount,
    #[msg("Meteora pool calculation overflow")]
    MeteoraCalculationOverflow,
    #[msg("Failed to read Meteora pool data")]
    PriceMeteoraReadFailed,
}

// ===== EVENTOS =====

#[event]
pub struct SlotFilled {
    pub slot_idx: u8,
    pub chain_id: u32,
    pub user: Pubkey,
    pub owner: Pubkey,
}

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

// ===== FUNÇÕES AUXILIARES =====

fn calculate_current_week(start_timestamp: i64) -> Result<u8> {
    let clock = Clock::get()?;
    let current_timestamp = clock.unix_timestamp;
    
    if current_timestamp < start_timestamp {
        return Ok(0);
    }
    
    let elapsed_seconds = current_timestamp - start_timestamp;
    let elapsed_weeks = (elapsed_seconds / (7 * 24 * 60 * 60)) + 1;
    
    if elapsed_weeks > 36 {
        return Ok(0);
    }
    
    Ok(elapsed_weeks as u8)
}

fn check_and_process_week_change(state: &mut ProgramState) -> Result<bool> {
    let new_week = calculate_current_week(state.program_start_timestamp)?;
    
    if new_week == 0 && state.current_week > 0 {
        state.airdrop_active = false;
        state.current_week = 0;
        return Ok(true);
    }
    
    if new_week != state.current_week && new_week > 0 {
        if state.current_week > 0 && state.total_matrices_this_week > 0 {
            let week_donut = get_week_distribution(state.current_week);
            let donut_per_matrix = week_donut
                .checked_div(state.total_matrices_this_week)
                .ok_or(ErrorCode::NoMatricesCompleted)?;
            
            let snapshot = WeekSnapshot {
                week_number: state.current_week,
                total_matrices: state.total_matrices_this_week,
                donut_distributed: week_donut,
                donut_per_matrix,
                week_end_timestamp: Clock::get()?.unix_timestamp,
            };
            
            if state.closed_weeks.len() < 36 {
                state.closed_weeks.push(snapshot.clone());
                
                emit!(WeekClosed {
                    week_number: snapshot.week_number,
                    total_matrices: snapshot.total_matrices,
                    donut_distributed: snapshot.donut_distributed,
                    donut_per_matrix: snapshot.donut_per_matrix,
                });
            }
        }
        
        state.current_week = new_week;
        state.total_matrices_this_week = 0;
        
        return Ok(true);
    }
    
    Ok(false)
}

fn process_user_pending_weeks(
    user: &mut UserAccount, 
    state: &ProgramState
) -> Result<()> {
    let mut total_earned = 0u64;
    
    for week_snapshot in &state.closed_weeks {
        if week_snapshot.week_number > user.last_processed_week {
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
            }
        }
    }
    
    if total_earned > 0 {
        user.total_donut_earned = user.total_donut_earned
            .checked_add(total_earned)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
    }
    
    user.last_processed_week = state.current_week;
    
    Ok(())
}

fn record_matrix_completion(
    user: &mut UserAccount, 
    state: &mut ProgramState
) -> Result<()> {
    if !state.airdrop_active || state.current_week == 0 {
        return Ok(());
    }
    
    state.total_matrices_this_week = state.total_matrices_this_week
        .checked_add(1)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    
    user.completed_matrices_total = user.completed_matrices_total
        .checked_add(1)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    
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
    
    // Apply 99% slippage tolerance
    let minimum_out = result
        .checked_mul(1)  
        .and_then(|n| n.checked_div(100))
        .ok_or(error!(ErrorCode::MeteoraCalculationOverflow))?;
    
    msg!("Expected output: {} DONUT, Minimum accepted (99% slippage): {} DONUT", result, minimum_out);
    
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

fn get_donut_balance_after_swap<'info>(
    user_donut_account: &AccountInfo<'info>,
) -> Result<u64> {
    let data = user_donut_account.try_borrow_data()?;
    
    if data.len() < 72 {
        return Ok(0);
    }
    
    let amount = u64::from_le_bytes([
        data[64], data[65], data[66], data[67],
        data[68], data[69], data[70], data[71]
    ]);
    
    Ok(amount)
}

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

fn verify_address_strict(provided: &Pubkey, expected: &Pubkey, error_code: ErrorCode) -> Result<()> {
    if provided != expected {
        msg!("Address verification failed: provided={}, expected={}", provided, expected);
        return Err(error!(error_code));
    }
    Ok(())
}

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
    ).map_err(|_| error!(ErrorCode::SolReserveFailed))?;
    
    Ok(())
}

fn process_pay_referrer<'info>(
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    amount: u64,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let ix = solana_program::system_instruction::transfer(
        &from.key(),
        &to.key(),
        amount
    );
    
    solana_program::program::invoke_signed(
        &ix,
        &[from.clone(), to.clone()],
        signer_seeds,
    ).map_err(|_| error!(ErrorCode::ReferrerPaymentFailed))?;
    
    Ok(())
}

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

// ===== CONTAS PARA INSTRUÇÕES =====

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
    /// CHECK: PDA authority for token vault operations
    #[account(
        seeds = [b"token_vault_authority"],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

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
    
    /// User's WSOL account
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
    
    // METEORA ACCOUNTS
    #[account(mut)]
    /// CHECK: Pool account
    pub pool: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: Vault A
    pub a_vault: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: Vault B (SOL)
    pub b_vault: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: Token vault A
    pub a_token_vault: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: Token vault B
    pub b_token_vault: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: LP mint A
    pub a_vault_lp_mint: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: LP mint B
    pub b_vault_lp_mint: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: LP token A
    pub a_vault_lp: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: LP token B
    pub b_vault_lp: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: Protocol fee account
    pub protocol_token_fee: UncheckedAccount<'info>,
    
    #[account(mut)]
    /// CHECK: Token mint
    pub token_mint: AccountInfo<'info>,
    /// CHECK: Vault program
    pub vault_program: AccountInfo<'info>,
    /// CHECK: AMM program
    pub amm_program: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(deposit_amount: u64)]
pub struct RegisterWithSolDeposit<'info> {
    #[account(mut)]
    pub state: Account<'info, ProgramState>,
    #[account(mut)]
    pub user_wallet: Signer<'info>,
    #[account(mut)]
    pub referrer: Account<'info, UserAccount>,
    #[account(mut)]
    pub referrer_wallet: SystemAccount<'info>,
    #[account(
        init,
        payer = user_wallet,
        space = 8 + UserAccount::SIZE,
        seeds = [b"user_account", user_wallet.key().as_ref()],
        bump
    )]
    pub user: Account<'info, UserAccount>,
    
    /// User's WSOL account
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
    
    // METEORA ACCOUNTS
    #[account(mut)]
    /// CHECK: Pool account
    pub pool: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: Vault A
    pub a_vault: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: Vault B (SOL)
    pub b_vault: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: Token vault A
    pub a_token_vault: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: Token vault B
    pub b_token_vault: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: LP mint A
    pub a_vault_lp_mint: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: LP mint B
    pub b_vault_lp_mint: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: LP token A
    pub a_vault_lp: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: LP token B
    pub b_vault_lp: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: Protocol fee account
    pub protocol_token_fee: UncheckedAccount<'info>,
    
    #[account(
        mut,
        seeds = [b"program_sol_vault"],
        bump
    )]
    pub program_sol_vault: SystemAccount<'info>,
    #[account(mut)]
    /// CHECK: Token mint
    pub token_mint: AccountInfo<'info>,
    #[account(mut)]
    /// CHECK: Referrer's token account
    pub referrer_token_account: AccountInfo<'info>,
    /// CHECK: Vault program
    pub vault_program: AccountInfo<'info>,
    /// CHECK: AMM program
    pub amm_program: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

// ===== PROGRAMA PRINCIPAL =====

#[program]
pub mod referral_system {
    use super::*;

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
        state.current_week = 1;
        state.total_matrices_this_week = 0;
        state.program_start_timestamp = Clock::get()?.unix_timestamp;
        state.airdrop_active = true;
        state.closed_weeks = Vec::new();

        msg!("Program initialized with airdrop system");
        Ok(())
    }

    pub fn register_without_referrer_deposit<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, RegisterWithoutReferrerDeposit<'info>>, 
        deposit_amount: u64
    ) -> Result<()> {
        if ctx.accounts.state.is_locked {
            return Err(error!(ErrorCode::ReentrancyLock));
        }
        ctx.accounts.state.is_locked = true;

        if ctx.accounts.owner.key() != ctx.accounts.state.multisig_treasury {
            ctx.accounts.state.is_locked = false;
            return Err(error!(ErrorCode::NotAuthorized));
        }

        check_and_process_week_change(&mut ctx.accounts.state)?;

        // VALIDAÇÕES DE SEGURANÇA
        verify_all_fixed_addresses(
            &ctx.accounts.pool.key(),
            &ctx.accounts.b_vault.key(),
            &ctx.accounts.b_token_vault.key(),
            &ctx.accounts.b_vault_lp_mint.key(),
            &ctx.accounts.b_vault_lp.key(),
            &ctx.accounts.token_mint.key(),
            &ctx.accounts.wsol_mint.key(),
        )?;

        verify_address_strict(&ctx.accounts.a_vault.key(), &verified_addresses::A_VAULT, ErrorCode::InvalidVaultAddress)?;
        verify_address_strict(&ctx.accounts.a_vault_lp.key(), &verified_addresses::A_VAULT_LP, ErrorCode::InvalidVaultAddress)?;
        verify_address_strict(&ctx.accounts.a_vault_lp_mint.key(), &verified_addresses::A_VAULT_LP_MINT, ErrorCode::InvalidVaultAddress)?;
        verify_address_strict(&ctx.accounts.a_token_vault.key(), &verified_addresses::A_TOKEN_VAULT, ErrorCode::InvalidVaultAddress)?;

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
            &ctx.accounts.protocol_token_fee.key(),
            &verified_addresses::PROTOCOL_TOKEN_B_FEE,
            ErrorCode::InvalidProtocolFeeAccount
        )?;

        // Validação Chainlink
        if ctx.remaining_accounts.len() < 2 {
            ctx.accounts.state.is_locked = false;
            return Err(error!(ErrorCode::MissingVaultAAccounts));
        }

        let chainlink_feed = &ctx.remaining_accounts[0];
        let chainlink_program = &ctx.remaining_accounts[1];

        verify_address_strict(&chainlink_program.key(), &verified_addresses::CHAINLINK_PROGRAM, ErrorCode::InvalidChainlinkProgram)?;
        verify_address_strict(&chainlink_feed.key(), &verified_addresses::SOL_USD_FEED, ErrorCode::InvalidPriceFeed)?;

        let minimum_deposit = calculate_minimum_sol_deposit(chainlink_feed, chainlink_program)?;

        if deposit_amount < minimum_deposit {
            ctx.accounts.state.is_locked = false;
            return Err(error!(ErrorCode::InsufficientDeposit));
        }

        // Inicializa usuário
        let state = &mut ctx.accounts.state;
        let upline_id = state.next_upline_id;
        let chain_id = state.next_chain_id;
        let current_week = state.current_week;

        state.next_upline_id += 1;
        state.next_chain_id += 1;

        let user = &mut ctx.accounts.user;
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
        user.reserved_sol = 0;
        user.reserved_tokens = 0;
        user.completed_matrices_total = 0;
        user.weekly_matrices = Vec::new();
        user.total_donut_earned = 0;
        user.total_donut_claimed = 0;
        user.last_processed_week = 0;

        // WRAP SOL TO WSOL
        manage_wsol_operation(
            &ctx.accounts.user_wallet.to_account_info(),
            &ctx.accounts.user_wsol_account.to_account_info(),
            &ctx.accounts.token_program,
            "wrap",
            Some(deposit_amount),
        )?;

        // Calculate minimum DONUT expected
        let minimum_donut_out = calculate_swap_amount_out(
            &ctx.accounts.pool.to_account_info(),
            &ctx.accounts.a_vault.to_account_info(),
            &ctx.accounts.b_vault.to_account_info(),
            &ctx.accounts.a_vault_lp.to_account_info(),
            &ctx.accounts.b_vault_lp.to_account_info(),
            &ctx.accounts.a_vault_lp_mint.to_account_info(),
            &ctx.accounts.b_vault_lp_mint.to_account_info(),
            deposit_amount,
        )?;

        // Execute swap
        process_swap_wsol_to_donut(
            &ctx.accounts.pool.to_account_info(),
            &ctx.accounts.user_wallet.to_account_info(),
            &ctx.accounts.user_wsol_account.to_account_info(),
            &ctx.accounts.user_donut_account.to_account_info(),
            &ctx.accounts.a_vault.to_account_info(),
            &ctx.accounts.b_vault.to_account_info(),
            &ctx.accounts.a_token_vault.to_account_info(),
            &ctx.accounts.b_token_vault.to_account_info(),
            &ctx.accounts.a_vault_lp_mint.to_account_info(),
            &ctx.accounts.b_vault_lp_mint.to_account_info(),
            &ctx.accounts.a_vault_lp.to_account_info(),
            &ctx.accounts.b_vault_lp.to_account_info(),
            &ctx.accounts.protocol_token_fee.to_account_info(),
            &ctx.accounts.vault_program.to_account_info(),
            &ctx.accounts.token_program.to_account_info(),
            &ctx.accounts.amm_program.to_account_info(),
            deposit_amount,
            minimum_donut_out,
        )?;

        // Get DONUT balance after swap
        let donut_balance = get_donut_balance_after_swap(&ctx.accounts.user_donut_account.to_account_info())?;
        msg!("DONUT balance after swap: {}", donut_balance);

        // Burn 100% of DONUT tokens received
        if donut_balance > 0 {
            msg!("Burning {} DONUT tokens...", donut_balance);
            
            let burn_ix = spl_token::instruction::burn(
                &ctx.accounts.token_program.key(),
                &ctx.accounts.user_donut_account.key(),
                &ctx.accounts.token_mint.key(),
                &ctx.accounts.user_wallet.key(),
                &[],
                donut_balance,
            ).map_err(|_| error!(ErrorCode::BurnFailed))?;
            
            solana_program::program::invoke(
                &burn_ix,
                &[
                    ctx.accounts.user_donut_account.to_account_info(),
                    ctx.accounts.token_mint.to_account_info(),
                    ctx.accounts.user_wallet.to_account_info(),
                ],
            ).map_err(|e| {
                msg!("Burn failed: {:?}", e);
                error!(ErrorCode::BurnFailed)
            })?;
            
            msg!("✅ Successfully burned {} DONUT tokens", donut_balance);
        } else {
            msg!("⚠️ No DONUT balance to burn");
        }

        emit!(DonutSwappedAndBurned {
            user: ctx.accounts.user_wallet.key(),
            sol_amount: deposit_amount,
            donut_amount: donut_balance,
            week_number: current_week,
        });

        ctx.accounts.state.is_locked = false;
        msg!("Base user registered with swap+burn: {} SOL -> {} DONUT", deposit_amount, donut_balance);
        Ok(())
    }
    pub fn register_with_sol_deposit<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, RegisterWithSolDeposit<'info>>, 
        deposit_amount: u64
    ) -> Result<()> {
        if ctx.accounts.state.is_locked {
            return Err(error!(ErrorCode::ReentrancyLock));
        }
        ctx.accounts.state.is_locked = true;

        check_and_process_week_change(&mut ctx.accounts.state)?;
        process_user_pending_weeks(&mut ctx.accounts.referrer, &ctx.accounts.state)?;

        // VALIDAÇÕES
        verify_all_fixed_addresses(
            &ctx.accounts.pool.key(),
            &ctx.accounts.b_vault.key(),
            &ctx.accounts.b_token_vault.key(),
            &ctx.accounts.b_vault_lp_mint.key(),
            &ctx.accounts.b_vault_lp.key(),
            &ctx.accounts.token_mint.key(),
            &ctx.accounts.wsol_mint.key(),
        )?;

        verify_address_strict(&ctx.accounts.a_vault.key(), &verified_addresses::A_VAULT, ErrorCode::InvalidVaultAddress)?;
        verify_address_strict(&ctx.accounts.a_vault_lp.key(), &verified_addresses::A_VAULT_LP, ErrorCode::InvalidVaultAddress)?;
        verify_address_strict(&ctx.accounts.a_vault_lp_mint.key(), &verified_addresses::A_VAULT_LP_MINT, ErrorCode::InvalidVaultAddress)?;
        verify_address_strict(&ctx.accounts.a_token_vault.key(), &verified_addresses::A_TOKEN_VAULT, ErrorCode::InvalidVaultAddress)?;

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
            &ctx.accounts.protocol_token_fee.key(),
            &verified_addresses::PROTOCOL_TOKEN_B_FEE,
            ErrorCode::InvalidProtocolFeeAccount
        )?;

        if !ctx.accounts.referrer.is_registered {
            ctx.accounts.state.is_locked = false;
            return Err(error!(ErrorCode::ReferrerNotRegistered));
        }

        // Validação Chainlink
        if ctx.remaining_accounts.len() < 2 {
            ctx.accounts.state.is_locked = false;
            return Err(error!(ErrorCode::MissingVaultAAccounts));
        }

        let chainlink_feed = &ctx.remaining_accounts[0];
        let chainlink_program = &ctx.remaining_accounts[1];

        verify_address_strict(&chainlink_program.key(), &verified_addresses::CHAINLINK_PROGRAM, ErrorCode::InvalidChainlinkProgram)?;
        verify_address_strict(&chainlink_feed.key(), &verified_addresses::SOL_USD_FEED, ErrorCode::InvalidPriceFeed)?;

        let minimum_deposit = calculate_minimum_sol_deposit(chainlink_feed, chainlink_program)?;
        if deposit_amount < minimum_deposit {
            ctx.accounts.state.is_locked = false;
            return Err(error!(ErrorCode::InsufficientDeposit));
        }

        // Cria usuário
        let referrer_entry = UplineEntry {
            pda: ctx.accounts.referrer.key(),
            wallet: ctx.accounts.referrer_wallet.key(),
        };

        let mut new_upline = Vec::new();
        if ctx.accounts.referrer.upline.upline.len() >= MAX_UPLINE_DEPTH {
            let start_idx = ctx.accounts.referrer.upline.upline.len() - (MAX_UPLINE_DEPTH - 1);
            new_upline.extend_from_slice(&ctx.accounts.referrer.upline.upline[start_idx..]);
        } else {
            new_upline.extend_from_slice(&ctx.accounts.referrer.upline.upline);
        }
        new_upline.push(referrer_entry);

        // Captura valores antes de emprestar state como mut
        let upline_id = ctx.accounts.state.next_upline_id;
        let chain_id = ctx.accounts.state.next_chain_id;
        let current_week = ctx.accounts.state.current_week;
        
        ctx.accounts.state.next_chain_id += 1;

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

        // Lógica dos slots
        let slot_idx = ctx.accounts.referrer.chain.filled_slots as usize;

        match slot_idx {
            0 => { // SLOT 1: SWAP + BURN
                manage_wsol_operation(
                    &ctx.accounts.user_wallet.to_account_info(),
                    &ctx.accounts.user_wsol_account.to_account_info(),
                    &ctx.accounts.token_program,
                    "wrap",
                    Some(deposit_amount),
                )?;

                let minimum_donut_out = calculate_swap_amount_out(
                    &ctx.accounts.pool.to_account_info(),
                    &ctx.accounts.a_vault.to_account_info(),
                    &ctx.accounts.b_vault.to_account_info(),
                    &ctx.accounts.a_vault_lp.to_account_info(),
                    &ctx.accounts.b_vault_lp.to_account_info(),
                    &ctx.accounts.a_vault_lp_mint.to_account_info(),
                    &ctx.accounts.b_vault_lp_mint.to_account_info(),
                    deposit_amount,
                )?;

                process_swap_wsol_to_donut(
                    &ctx.accounts.pool.to_account_info(),
                    &ctx.accounts.user_wallet.to_account_info(),
                    &ctx.accounts.user_wsol_account.to_account_info(),
                    &ctx.accounts.user_donut_account.to_account_info(),
                    &ctx.accounts.a_vault.to_account_info(),
                    &ctx.accounts.b_vault.to_account_info(),
                    &ctx.accounts.a_token_vault.to_account_info(),
                    &ctx.accounts.b_token_vault.to_account_info(),
                    &ctx.accounts.a_vault_lp_mint.to_account_info(),
                    &ctx.accounts.b_vault_lp_mint.to_account_info(),
                    &ctx.accounts.a_vault_lp.to_account_info(),
                    &ctx.accounts.b_vault_lp.to_account_info(),
                    &ctx.accounts.protocol_token_fee.to_account_info(),
                    &ctx.accounts.vault_program.to_account_info(),
                    &ctx.accounts.token_program.to_account_info(),
                    &ctx.accounts.amm_program.to_account_info(),
                    deposit_amount,
                    minimum_donut_out,
                )?;

                let donut_balance = get_donut_balance_after_swap(&ctx.accounts.user_donut_account.to_account_info())?;

                if donut_balance > 0 {
                    let burn_ix = spl_token::instruction::burn(
                        &ctx.accounts.token_program.key(),
                        &ctx.accounts.user_donut_account.key(),
                        &ctx.accounts.token_mint.key(),
                        &ctx.accounts.user_wallet.key(),
                        &[],
                        donut_balance,
                    ).map_err(|_| error!(ErrorCode::BurnFailed))?;
                    
                    solana_program::program::invoke(
                        &burn_ix,
                        &[
                            ctx.accounts.user_donut_account.to_account_info(),
                            ctx.accounts.token_mint.to_account_info(),
                            ctx.accounts.user_wallet.to_account_info(),
                        ],
                    ).map_err(|_| error!(ErrorCode::BurnFailed))?;
                }

                emit!(DonutSwappedAndBurned {
                    user: ctx.accounts.user_wallet.key(),
                    sol_amount: deposit_amount,
                    donut_amount: donut_balance,
                    week_number: current_week,
                });
            },

            1 => { // SLOT 2: RESERVA SOL
                process_reserve_sol(
                    &ctx.accounts.user_wallet.to_account_info(),
                    &ctx.accounts.program_sol_vault.to_account_info(),
                    deposit_amount
                )?;
                ctx.accounts.referrer.reserved_sol = deposit_amount;
            },

            2 => { // SLOT 3: PAGAMENTO
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
                    ctx.accounts.referrer.reserved_sol = 0;
                }
            },

            _ => {
                ctx.accounts.state.is_locked = false;
                return Err(error!(ErrorCode::InvalidSlot));
            }
        }

        // Captura next_chain_id antes da atualização
        let next_chain_id_for_referrer = ctx.accounts.state.next_chain_id;

        // Processa matriz do referrer
        let (chain_completed, upline_pubkey) = process_referrer_chain(
            &ctx.accounts.user.key(),
            &mut ctx.accounts.referrer,
            next_chain_id_for_referrer,
        )?;

        if chain_completed {
            record_matrix_completion(&mut ctx.accounts.referrer, &mut ctx.accounts.state)?;
            ctx.accounts.state.next_chain_id += 1;
        }

        // ===== RECURSÃO =====
        if chain_completed && slot_idx == 2 {
            let mut current_user_pubkey = upline_pubkey;
            let mut current_deposit = deposit_amount;
            let mut all_slots_were_slot3 = true;
            let mut processed_count = 0;

            // Verifica se tem uplines para processar
            if ctx.remaining_accounts.len() > 2 {
                let upline_accounts = &ctx.remaining_accounts[2..]; // Pula Chainlink accounts
                
                if upline_accounts.len() % 2 == 0 { // PDA + wallet para cada upline
                    let upline_count = upline_accounts.len() / 2;
                    
                    for i in 0..upline_count {
                        if i >= MAX_UPLINE_DEPTH || current_deposit == 0 {
                            break;
                        }
                        
                        let upline_pda = &upline_accounts[i * 2];
                        let upline_wallet = &upline_accounts[i * 2 + 1];
                        
                        // Deserializa a conta da upline
                        let data = upline_pda.try_borrow_data()?;
                        if data.len() <= 8 {
                            break;
                        }
                        
                        let mut account_slice = &data[8..];
                        let mut upline_data = UserAccount::deserialize(&mut account_slice)?;
                        
                        if !upline_data.is_registered {
                            break;
                        }
                        
                        let upline_slot_idx = upline_data.chain.filled_slots as usize;
                        if upline_slot_idx >= 3 {
                            break;
                        }
                        
                        // Marca que processou algo
                        processed_count += 1;
                        
                        // Adiciona usuário atual no slot da upline
                        upline_data.chain.slots[upline_slot_idx] = Some(current_user_pubkey);
                        upline_data.chain.filled_slots += 1;
                        
                        emit!(SlotFilled {
                            slot_idx: upline_slot_idx as u8,
                            chain_id: upline_data.chain.id,
                            user: current_user_pubkey,
                            owner: *upline_pda.key,
                        });
                        
                        // Processa conforme o slot
                        match upline_slot_idx {
                            0 => { // Slot 1: Swap + Burn
                                all_slots_were_slot3 = false;
                                
                                manage_wsol_operation(
                                    &ctx.accounts.user_wallet.to_account_info(),
                                    &ctx.accounts.user_wsol_account.to_account_info(),
                                    &ctx.accounts.token_program,
                                    "wrap",
                                    Some(current_deposit),
                                )?;
                                
                                let minimum_donut_out = calculate_swap_amount_out(
                                    &ctx.accounts.pool.to_account_info(),
                                    &ctx.accounts.a_vault.to_account_info(),
                                    &ctx.accounts.b_vault.to_account_info(),
                                    &ctx.accounts.a_vault_lp.to_account_info(),
                                    &ctx.accounts.b_vault_lp.to_account_info(),
                                    &ctx.accounts.a_vault_lp_mint.to_account_info(),
                                    &ctx.accounts.b_vault_lp_mint.to_account_info(),
                                    current_deposit,
                                )?;
                                
                                process_swap_wsol_to_donut(
                                    &ctx.accounts.pool.to_account_info(),
                                    &ctx.accounts.user_wallet.to_account_info(),
                                    &ctx.accounts.user_wsol_account.to_account_info(),
                                    &ctx.accounts.user_donut_account.to_account_info(),
                                    &ctx.accounts.a_vault.to_account_info(),
                                    &ctx.accounts.b_vault.to_account_info(),
                                    &ctx.accounts.a_token_vault.to_account_info(),
                                    &ctx.accounts.b_token_vault.to_account_info(),
                                    &ctx.accounts.a_vault_lp_mint.to_account_info(),
                                    &ctx.accounts.b_vault_lp_mint.to_account_info(),
                                    &ctx.accounts.a_vault_lp.to_account_info(),
                                    &ctx.accounts.b_vault_lp.to_account_info(),
                                    &ctx.accounts.protocol_token_fee.to_account_info(),
                                    &ctx.accounts.vault_program.to_account_info(),
                                    &ctx.accounts.token_program.to_account_info(),
                                    &ctx.accounts.amm_program.to_account_info(),
                                    current_deposit,
                                    minimum_donut_out,
                                )?;
                                
                                let donut_balance = get_donut_balance_after_swap(&ctx.accounts.user_donut_account.to_account_info())?;
                                
                                if donut_balance > 0 {
                                    let burn_ix = spl_token::instruction::burn(
                                        &ctx.accounts.token_program.key(),
                                        &ctx.accounts.user_donut_account.key(),
                                        &ctx.accounts.token_mint.key(),
                                        &ctx.accounts.user_wallet.key(),
                                        &[],
                                        donut_balance,
                                    ).map_err(|_| error!(ErrorCode::BurnFailed))?;
                                    
                                    solana_program::program::invoke(
                                        &burn_ix,
                                        &[
                                            ctx.accounts.user_donut_account.to_account_info(),
                                            ctx.accounts.token_mint.to_account_info(),
                                            ctx.accounts.user_wallet.to_account_info(),
                                        ],
                                    ).map_err(|_| error!(ErrorCode::BurnFailed))?;
                                }
                                
                                emit!(DonutSwappedAndBurned {
                                    user: ctx.accounts.user_wallet.key(),
                                    sol_amount: current_deposit,
                                    donut_amount: donut_balance,
                                    week_number: current_week,
                                });
                                
                                current_deposit = 0;
                            },
                            
                            1 => { // Slot 2: Reserva SOL
                                all_slots_were_slot3 = false;
                                
                                process_reserve_sol(
                                    &ctx.accounts.user_wallet.to_account_info(),
                                    &ctx.accounts.program_sol_vault.to_account_info(),
                                    current_deposit
                                )?;
                                
                                upline_data.reserved_sol = current_deposit;
                                current_deposit = 0;
                            },
                            
                            2 => { // Slot 3: Paga upline e continua
                                if upline_data.reserved_sol > 0 {
                                    let ix = solana_program::system_instruction::transfer(
                                        &ctx.accounts.program_sol_vault.key(),
                                        &upline_wallet.key(),
                                        upline_data.reserved_sol
                                    );
                                    
                                    solana_program::program::invoke_signed(
                                        &ix,
                                        &[
                                            ctx.accounts.program_sol_vault.to_account_info(),
                                            upline_wallet.clone()
                                        ],
                                        &[&[
                                            b"program_sol_vault".as_ref(),
                                            &[ctx.bumps.program_sol_vault]
                                        ]],
                                    ).map_err(|_| error!(ErrorCode::ReferrerPaymentFailed))?;
                                    
                                    upline_data.reserved_sol = 0;
                                }
                                // Deposito continua para próxima upline
                            },
                            
                            _ => {}
                        }
                        
                        // Verifica se completou matriz
                        if upline_data.chain.filled_slots == 3 {
                            record_matrix_completion(&mut upline_data, &mut ctx.accounts.state)?;
                            
                            upline_data.chain.id = ctx.accounts.state.next_chain_id;
                            ctx.accounts.state.next_chain_id += 1;
                            upline_data.chain.slots = [None, None, None];
                            upline_data.chain.filled_slots = 0;
                            
                            current_user_pubkey = *upline_pda.key;
                        } else {
                            // Se não completou, para a recursão
                            break;
                        }
                        
                        // Salva as mudanças
                        let mut data = upline_pda.try_borrow_mut_data()?;
                        let mut write_data = &mut data[8..];
                        upline_data.serialize(&mut write_data)?;
                    }
                }
            }
            
            // IMPORTANTE: Se todas foram slot 3 ou não processou nenhuma, faz swap+burn
            if current_deposit > 0 && (all_slots_were_slot3 || processed_count == 0) {
                manage_wsol_operation(
                    &ctx.accounts.user_wallet.to_account_info(),
                    &ctx.accounts.user_wsol_account.to_account_info(),
                    &ctx.accounts.token_program,
                    "wrap",
                    Some(current_deposit),
                )?;
                
                let minimum_donut_out = calculate_swap_amount_out(
                    &ctx.accounts.pool.to_account_info(),
                    &ctx.accounts.a_vault.to_account_info(),
                    &ctx.accounts.b_vault.to_account_info(),
                    &ctx.accounts.a_vault_lp.to_account_info(),
                    &ctx.accounts.b_vault_lp.to_account_info(),
                    &ctx.accounts.a_vault_lp_mint.to_account_info(),
                    &ctx.accounts.b_vault_lp_mint.to_account_info(),
                    current_deposit,
                )?;
                
                process_swap_wsol_to_donut(
                    &ctx.accounts.pool.to_account_info(),
                    &ctx.accounts.user_wallet.to_account_info(),
                    &ctx.accounts.user_wsol_account.to_account_info(),
                    &ctx.accounts.user_donut_account.to_account_info(),
                    &ctx.accounts.a_vault.to_account_info(),
                    &ctx.accounts.b_vault.to_account_info(),
                    &ctx.accounts.a_token_vault.to_account_info(),
                    &ctx.accounts.b_token_vault.to_account_info(),
                    &ctx.accounts.a_vault_lp_mint.to_account_info(),
                    &ctx.accounts.b_vault_lp_mint.to_account_info(),
                    &ctx.accounts.a_vault_lp.to_account_info(),
                    &ctx.accounts.b_vault_lp.to_account_info(),
                    &ctx.accounts.protocol_token_fee.to_account_info(),
                    &ctx.accounts.vault_program.to_account_info(),
                    &ctx.accounts.token_program.to_account_info(),
                    &ctx.accounts.amm_program.to_account_info(),
                    current_deposit,
                    minimum_donut_out,
                )?;
                
                let donut_balance = get_donut_balance_after_swap(&ctx.accounts.user_donut_account.to_account_info())?;
                
                if donut_balance > 0 {
                    let burn_ix = spl_token::instruction::burn(
                        &ctx.accounts.token_program.key(),
                        &ctx.accounts.user_donut_account.key(),
                        &ctx.accounts.token_mint.key(),
                        &ctx.accounts.user_wallet.key(),
                        &[],
                        donut_balance,
                    ).map_err(|_| error!(ErrorCode::BurnFailed))?;
                    
                    solana_program::program::invoke(
                        &burn_ix,
                        &[
                            ctx.accounts.user_donut_account.to_account_info(),
                            ctx.accounts.token_mint.to_account_info(),
                            ctx.accounts.user_wallet.to_account_info(),
                        ],
                    ).map_err(|_| error!(ErrorCode::BurnFailed))?;
                }
                
                emit!(DonutSwappedAndBurned {
                    user: ctx.accounts.user_wallet.key(),
                    sol_amount: current_deposit,
                    donut_amount: donut_balance,
                    week_number: current_week,
                });
            }
        }

        ctx.accounts.state.is_locked = false;
        msg!("Registration completed: slot={}, matrix_completed={}", slot_idx + 1, chain_completed);
        Ok(())
    }

    pub fn claim_airdrop(ctx: Context<ClaimAirdrop>) -> Result<()> {
        check_and_process_week_change(&mut ctx.accounts.state)?;
        process_user_pending_weeks(&mut ctx.accounts.user, &ctx.accounts.state)?;

        let available = ctx.accounts.user.get_claimable_donut();
        if available == 0 {
            return Err(error!(ErrorCode::NothingToClaim));
        }

        // Verificar se o program_token_vault é o endereço correto
        verify_address_strict(
            &ctx.accounts.program_token_vault.key(),
            &verified_addresses::PROGRAM_TOKEN_VAULT,
            ErrorCode::InvalidProgramTokenVault
        )?;

        let transfer_instruction = spl_token::instruction::transfer(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.program_token_vault.key(),
            &ctx.accounts.user_token_account.key(),
            &ctx.accounts.vault_authority.key(),
            &[],
            available,
        ).map_err(|_| error!(ErrorCode::BurnFailed))?;

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
        ).map_err(|_| error!(ErrorCode::BurnFailed))?;

        ctx.accounts.user.total_donut_claimed = ctx.accounts.user.total_donut_claimed
            .checked_add(available)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        emit!(AirdropClaimed {
            user: ctx.accounts.user_wallet.key(),
            amount: available,
            total_earned: ctx.accounts.user.total_donut_earned,
            total_claimed: ctx.accounts.user.total_donut_claimed,
        });

        msg!("Claimed {} DONUT", available);
        Ok(())
    }
}