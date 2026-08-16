use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("Cy1dnHEkJAw7HXBHLAwxVMCnVjX286jYPkKyzp3oRHF9");

#[program]
pub mod doge_vault {
    use super::*;

    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        max_total_spend: u64,
        max_single_spend: u64,
        treasury: Pubkey,
    ) -> Result<()> {
        require!(max_single_spend > 0, DogeVaultError::InvalidLimits);
        require!(
            max_total_spend >= max_single_spend,
            DogeVaultError::InvalidLimits
        );

        let vault = &mut ctx.accounts.vault;
        vault.owner = ctx.accounts.owner.key();
        vault.usdc_mint = ctx.accounts.usdc_mint.key();
        vault.token_account = ctx.accounts.vault_token_account.key();
        vault.treasury = treasury;
        vault.max_total_spend = max_total_spend;
        vault.max_single_spend = max_single_spend;
        vault.spent_total = 0;
        vault.bump = ctx.bumps.vault;
        vault.token_bump = ctx.bumps.vault_token_account;

        emit!(VaultInitialized {
            vault: vault.key(),
            owner: vault.owner,
            treasury: vault.treasury,
            max_total_spend,
            max_single_spend,
        });

        Ok(())
    }

    pub fn approve_spend(ctx: Context<ApproveSpend>, amount: u64, product_id: String) -> Result<()> {
        require!(amount > 0, DogeVaultError::InvalidAmount);
        require!(product_id.len() <= 64, DogeVaultError::ProductIdTooLong);

        let vault_authority = ctx.accounts.vault.to_account_info();
        let vault = &mut ctx.accounts.vault;
        require_keys_eq!(
            vault.owner,
            ctx.accounts.owner.key(),
            DogeVaultError::Unauthorized
        );
        require!(
            amount <= vault.max_single_spend,
            DogeVaultError::ExceedsSingleSpendLimit
        );

        let new_spent_total = vault
            .spent_total
            .checked_add(amount)
            .ok_or(DogeVaultError::MathOverflow)?;
        require!(
            new_spent_total <= vault.max_total_spend,
            DogeVaultError::ExceedsTotalSpendLimit
        );

        let owner_key = vault.owner;
        let bump = [vault.bump];
        let signer_seeds: &[&[u8]] = &[b"vault", owner_key.as_ref(), &bump];
        let signer_sets = [signer_seeds];
        let cpi_accounts = Transfer {
            from: ctx.accounts.vault_token_account.to_account_info(),
            to: ctx.accounts.treasury_token_account.to_account_info(),
            authority: vault_authority,
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, &signer_sets);

        token::transfer(cpi_ctx, amount)?;
        vault.spent_total = new_spent_total;

        emit!(SpendApproved {
            vault: vault.key(),
            owner: vault.owner,
            treasury: vault.treasury,
            product_id,
            amount,
            spent_total: vault.spent_total,
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = owner,
        space = 8 + Vault::INIT_SPACE,
        seeds = [b"vault", owner.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,
    #[account(
        init,
        payer = owner,
        seeds = [b"vault-token", vault.key().as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = vault
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ApproveSpend<'info> {
    pub owner: Signer<'info>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [b"vault", owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner,
        has_one = usdc_mint,
        constraint = vault.token_account == vault_token_account.key() @ DogeVaultError::InvalidTreasuryTokenAccount
    )]
    pub vault: Account<'info, Vault>,
    #[account(
        mut,
        seeds = [b"vault-token", vault.key().as_ref()],
        bump = vault.token_bump,
        token::mint = usdc_mint,
        token::authority = vault
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = treasury_token_account.owner == vault.treasury @ DogeVaultError::InvalidTreasuryTokenAccount,
        constraint = treasury_token_account.mint == usdc_mint.key() @ DogeVaultError::InvalidTreasuryTokenAccount
    )]
    pub treasury_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub owner: Pubkey,
    pub usdc_mint: Pubkey,
    pub token_account: Pubkey,
    pub treasury: Pubkey,
    pub max_total_spend: u64,
    pub max_single_spend: u64,
    pub spent_total: u64,
    pub bump: u8,
    pub token_bump: u8,
}

#[event]
pub struct VaultInitialized {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub treasury: Pubkey,
    pub max_total_spend: u64,
    pub max_single_spend: u64,
}

#[event]
pub struct SpendApproved {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub treasury: Pubkey,
    pub product_id: String,
    pub amount: u64,
    pub spent_total: u64,
}

#[error_code]
pub enum DogeVaultError {
    #[msg("Invalid vault spending limits")]
    InvalidLimits,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Product id cannot exceed 64 characters")]
    ProductIdTooLong,
    #[msg("Only the vault owner can approve spending")]
    Unauthorized,
    #[msg("Amount exceeds the single item spend limit")]
    ExceedsSingleSpendLimit,
    #[msg("Amount exceeds the total vault spend limit")]
    ExceedsTotalSpendLimit,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Treasury token account does not match the configured treasury and mint")]
    InvalidTreasuryTokenAccount,
}