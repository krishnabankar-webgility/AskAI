# Skill: SQL Server local database operations

## §1 Speed rules — FOLLOW THESE FIRST

1. **Do NOT re-read this file or logs every invocation** — the agent files already have the known environment cached. Only re-read if something fails.
2. **Combine commands** — use `Invoke-Sqlcmd` pipeline style where possible. Avoid running 6 separate commands for a simple restore.
3. **Skip prereq checks** when the session already proved connectivity. Only check on first use or after errors.
4. **Use known facts** from the "Known environment" section — do not re-query data folder or logical file names unless RESTORE fails.
5. **No unnecessary confirmations** — if the user says "restore X at DB Y", they already confirmed. Only ask for confirmation if the user did NOT mention the target DB name (ambiguity risk).

## §2 Known environment (proven working)

| Fact | Value |
|------|-------|
| Server | `WGIN-NTB-276\SQLEXPRESS` |
| SQL Server | 2022 Express, MSSQL16 |
| Auth | **Windows Auth** (Trusted Connection) — use `Invoke-Sqlcmd` without `-Username`/`-Password` |
| PowerShell cmdlet | `Invoke-Sqlcmd` (SqlServer module) |
| Data folder | `C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\DATA\` |
| Backup location | Usually `D:\HubSpotDBs\` |

### §2.1 Known backup logical-file patterns

| Backup source | Logical data file | Logical log file |
|---------------|-------------------|------------------|
| HubSpotDB / UnifyDB backups | `UnifyDB` | `UnifyDB_log` |
| UD-DEV / Shopify / Recon backups | `UD-DEV` | `UD-DEV_log` |

When unsure which pattern, run `RESTORE FILELISTONLY` first (§4).

## §3 Standard restore procedure

### §3.1 Inputs (always required from user)

1. **Database name** — target DB to create or replace (never cached between sessions)
2. **Backup file path** — full `.BAK` path (never cached between sessions)

### §3.2 Step-by-step

```
Step 1: Verify backup file exists
  Test-Path '<backup_path>'

Step 2: Get logical file names from backup
  Invoke-Sqlcmd -ServerInstance '<server>' -Query "RESTORE FILELISTONLY FROM DISK = '<backup_path>'"

Step 3: Check if target DB exists and get current file paths
  Invoke-Sqlcmd -ServerInstance '<server>' -Query "SELECT name, physical_name FROM sys.master_files WHERE database_id = DB_ID('<db_name>')"

Step 4: If DB is in use, set SINGLE_USER
  Invoke-Sqlcmd -ServerInstance '<server>' -Query "ALTER DATABASE [<db_name>] SET SINGLE_USER WITH ROLLBACK IMMEDIATE"

Step 5: Restore with REPLACE and MOVE
  Invoke-Sqlcmd -ServerInstance '<server>' -Query "RESTORE DATABASE [<db_name>] FROM DISK = '<backup_path>' WITH REPLACE, MOVE '<logical_data>' TO '<data_folder><db_name>.mdf', MOVE '<logical_log>' TO '<data_folder><db_name>_log.ldf', STATS = 10" -QueryTimeout 300

Step 6: Set back to MULTI_USER (if SINGLE_USER was used)
  Invoke-Sqlcmd -ServerInstance '<server>' -Query "ALTER DATABASE [<db_name>] SET MULTI_USER"

Step 7: Verify restore
  - Check state: SELECT name, state_desc FROM sys.databases WHERE name = '<db_name>'
  - Count tables: USE [<db_name>]; SELECT COUNT(*) AS TableCount FROM sys.tables
```

### §3.3 Fast-path (when you know the logical file names)

Skip step 2 if the backup source is in the §2.1 table. Go straight from step 1 to step 3.

## §4 Ad-hoc SQL queries

The agent also supports running arbitrary SQL queries against any database on the server.

```powershell
Invoke-Sqlcmd -ServerInstance 'WGIN-NTB-276\SQLEXPRESS' -Database '<db_name>' -Query '<sql>' | Format-Table -AutoSize
```

For wide result sets, use `Format-List` instead of `Format-Table`.

## §5 Constraints

- **Never** write credentials into repo files.
- **Never** expose passwords — mask with `***`.
- **Never** restore over system databases (`master`, `msdb`, `model`, `tempdb`).
- Only ask DROP/REPLACE confirmation when the user's intent is ambiguous.

## §6 Troubleshooting (only consult on errors)

| Error | Fix |
|-------|-----|
| Database in use | `ALTER DATABASE [X] SET SINGLE_USER WITH ROLLBACK IMMEDIATE` then retry |
| Exclusive access could not be obtained | Same as above — set SINGLE_USER first |
| Access denied (OS error 5) | SQL Server service account needs read on backup path |
| Logical file mismatch | Run `RESTORE FILELISTONLY` and use actual logical names in MOVE |
| Invoke-Sqlcmd not found | `Install-Module SqlServer` or use `sqlcmd` CLI as fallback |
| Login failed | Check Windows Auth; try SQL Auth with env vars as fallback |

### §6.1 Fallback: go-sqlcmd (SQL Auth)

If `Invoke-Sqlcmd` is unavailable, use `sqlcmd` CLI with SQL Auth env vars:

```powershell
$env:SQLCMD_SERVER=[System.Environment]::GetEnvironmentVariable('SQLCMD_SERVER','User')
$env:SQLCMD_USER=[System.Environment]::GetEnvironmentVariable('SQLCMD_USER','User')
$env:SQLCMD_PASSWORD=[System.Environment]::GetEnvironmentVariable('SQLCMD_PASSWORD','User')
sqlcmd -S "$env:SQLCMD_SERVER" -U "$env:SQLCMD_USER" -P "$env:SQLCMD_PASSWORD" -C -Q "<sql>"
```

Env vars should already be configured on the machine (one-time setup).

## §7 Output format

End every restore with a summary:
- Status: pass/fail
- Database name and state (ONLINE / etc.)
- Table count
- Backup file used
- Server instance
