# Skill: SQL Server local database restore

## Speed rules — FOLLOW THESE FIRST

1. **Do NOT re-read this file or logs every invocation** — the agent files already have the known environment cached. Only re-read if something fails.
2. **Combine commands** — load env vars + drop + restore in **one** terminal call when possible. Do not run 6 separate commands for a simple restore.
3. **Skip prereq checks** when env vars are already loaded in the session. Only check sqlcmd/connectivity on first use or after errors.
4. **Use known facts** from the "Known environment" section — do not re-query data folder or logical file names for HubSpotDB backups unless RESTORE fails.
5. **No unnecessary confirmations** — if the user says "restore X at DB Y", they already confirmed. Only ask for DROP confirmation if the user did NOT mention the target DB name (ambiguity risk).

## Known environment (proven working)

| Fact | Value |
|------|-------|
| Server | `$env:SQLCMD_SERVER` → `WGIN-NTB-276\SQLEXPRESS` |
| SQL Server | 2022 Express, MSSQL16 |
| Auth | SQL Auth: `$env:SQLCMD_USER` (sa) / `$env:SQLCMD_PASSWORD` (***) |
| sqlcmd | go-sqlcmd v1.9.0, always use `-C` flag |
| Data folder | `C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\DATA\` |
| HubSpotDB logical files | `UnifyDB` (data), `UnifyDB_log` (log) — same for all HubSpot `.BAK` files |
| Backup location | Usually `D:\HubSpotDBs\` |

## Fast-path restore (use this for HubSpotDB .BAK files)

When the user provides **DB name** and **backup path**, run this in **one terminal call**:

```powershell
$env:SQLCMD_SERVER=[System.Environment]::GetEnvironmentVariable('SQLCMD_SERVER','User'); $env:SQLCMD_USER=[System.Environment]::GetEnvironmentVariable('SQLCMD_USER','User'); $env:SQLCMD_PASSWORD=[System.Environment]::GetEnvironmentVariable('SQLCMD_PASSWORD','User'); sqlcmd -S "$env:SQLCMD_SERVER" -U "$env:SQLCMD_USER" -P "$env:SQLCMD_PASSWORD" -C -Q "IF DB_ID('<db_name>') IS NOT NULL BEGIN ALTER DATABASE [<db_name>] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [<db_name>]; END"; sqlcmd -S "$env:SQLCMD_SERVER" -U "$env:SQLCMD_USER" -P "$env:SQLCMD_PASSWORD" -C -Q "RESTORE DATABASE [<db_name>] FROM DISK = N'<backup_path>' WITH MOVE N'UnifyDB' TO N'C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\DATA\<db_name>.mdf', MOVE N'UnifyDB_log' TO N'C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\DATA\<db_name>_log.ldf', REPLACE, RECOVERY, STATS = 10"; sqlcmd -S "$env:SQLCMD_SERVER" -U "$env:SQLCMD_USER" -P "$env:SQLCMD_PASSWORD" -C -d <db_name> -Q "SELECT COUNT(*) AS TableCount FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'"
```

That's **one command**: load env vars → drop if exists → restore with MOVE → verify table count. Done.

## When fast-path won't work

If the backup is **not** a HubSpotDB backup (logical files might differ), run `RESTORE FILELISTONLY` first:

```powershell
sqlcmd -S "$env:SQLCMD_SERVER" -U "$env:SQLCMD_USER" -P "$env:SQLCMD_PASSWORD" -C -Q "RESTORE FILELISTONLY FROM DISK = N'<backup_path>'"
```

Then use the actual logical names in the MOVE clause instead of `UnifyDB` / `UnifyDB_log`.

## Always ask the user for

1. **Database name** — never cache between sessions
2. **Backup file path** — never cache between sessions

Everything else comes from env vars and known environment above.

## Env var setup (one-time, already done on this machine)

```powershell
[System.Environment]::SetEnvironmentVariable("SQLCMD_SERVER", "<instance>", "User")
[System.Environment]::SetEnvironmentVariable("SQLCMD_USER", "<login>", "User")
[System.Environment]::SetEnvironmentVariable("SQLCMD_PASSWORD", "<password>", "User")
```

## Constraints

- **Never** write credentials into repo files — use `$env:SQLCMD_*`.
- **Never** expose passwords — use `***`.
- **Never** restore over system databases (`master`, `msdb`, `model`, `tempdb`).
- Only ask DROP confirmation when the user's intent is ambiguous.

## Troubleshooting (only consult on errors)

| Error | Fix |
|-------|-----|
| `SQLCMD.rll` missing | `winget install sqlcmd` (go-sqlcmd) |
| Login failed | Check `$env:SQLCMD_USER` / `$env:SQLCMD_PASSWORD`; ensure Mixed Mode |
| Database in use | `ALTER DATABASE [X] SET SINGLE_USER WITH ROLLBACK IMMEDIATE` |
| Access denied (OS error 5) | SQL Server service account needs read on backup path |
| Logical file mismatch | Run `RESTORE FILELISTONLY` and use actual names |

## Output format

End with: status (pass/fail), table count, connection string (password masked).
