# Accounts, roles and passwords

## Accounts

The company roster is in `src/shared/swk-staff-access.ts`. Owner and Admin have full access; the Manager (Haseeb) has broad operational access; everyone else is Staff (attendance and general work). Staff use `@swk.properties` or `@swk.rent` addresses; the old `@swk.properties` address of the `@swk.rent` staff keeps working as an alias.

## Who can do what

| Action | Owner | Admin | Manager | Staff |
|---|:-:|:-:|:-:|:-:|
| Change the Owner account | Yes | No | No | No |
| Lock or change the office Wi-Fi (Settings, Attendance Wi-Fi) | No | **Yes** | No | No |
| See the reception code screen and print the QR | Yes | Yes | Yes | No |
| Open the CRM Vault and dispatch leads | Yes | Yes | Yes | No (masked queue only) |
| Open employee records | Yes | Yes | Yes | No |
| Employee "Access & usage" tab, handover custody, release to Manager | Yes | Yes | No | No |
| Approve deletions and withdrawals | Final approver | Yes | Reviews | No |

The reception QR is visible only to `shabib@`, `admin@` and `haseeb@swk.properties`. This list is fixed in code (`QR_VIEWER_EMAILS`); nobody can widen it from the screen.

## Passwords

- **Owner, Admin and Manager:** set by `OWNER_PASSWORD`, `ADMIN_SWK_PASSWORD` (or `ADMIN_PASSWORD`), and `MANAGER_PASSWORD` in `.env` on the server. If not set at first start in production, a random password is generated and printed once in the log. These accounts never use a name-based pattern on fresh installs.
- **Staff:** start on a temporary pattern password (first name, capitalised, plus `@swk2026`) and **must choose their own password at first sign-in**. Until they do, they cannot check in. The pattern is readable in the repository, so keep the repository private and have staff change their password on day one.
- A new value of `OWNER_PASSWORD`, `ADMIN_SWK_PASSWORD`, or `MANAGER_PASSWORD` is applied once at the next start, unlocks the account, and signs that user out. Later restarts leave personal passwords alone. Steps: [OPERATIONS-RUNBOOK.md](OPERATIONS-RUNBOOK.md).
- Staff who lose their password are reset by the Admin or Owner in Administration, Users.

## Rules

- Never paste passwords, tokens or keys into chat, tickets or the repository. Use the hidden prompt in the runbook.
- Use strong, unique passwords for Owner and Admin and keep them in a password manager. Turn on the authenticator (TOTP) for both.
- Sign-in attempts are rate limited and accounts lock after repeated failures.
