# Skill: SQL Server local database restore

Use this skill when restoring `.bak` / `.sql` / `.sql.gz` backups to SQL Server for debugging, testing, or customer data investigation.

## Preferred sqlcmd client

Use the **Go-based sqlcmd** (`winget install sqlcmd`, v1.9+). The legacy ODBC-based `sqlcmd` fails with **`SQLCMD.rll`** missing on some machines. If `sqlcmd --version` shows `go-sqlcmd`, you are on the correct binary. Always pass **`-C`** (trust server certificate) for local/dev instances with self-signed certs.

## SQL Server connection — environment variables first

Connection parameters are stored in **user-level environment variables** so credentials never appear in repo files:

| Env var | Purpose | Example |
|---------|---------|---------|
| `SQLCMD_SERVER` | SQL Server instance (`-S`) | `WGIN-NTB-276\SQLEXPRESS` |
| `SQLCMD_USER` | SQL auth login (`-U`) | `sa` |
| `SQLCMD_PASSWORD` | SQL auth password (`-P`) | *(set by user, never logged)* |

**Setup (run once per machine — PowerShell):**

```powershell
[System.Environment]::SetEnvironmentVariable("SQLCMD_SERVER", "<instance>", "User")
[System.Environment]::SetEnvironmentVariable("SQLCMD_USER", "<login>", "User")
[System.Environment]::SetEnvironmentVariable("SQLCMD_PASSWORD", "<password>", "User")
```

**Reload into current session:**

```powershell
$env:SQLCMD_SERVER   = [System.Environment]::GetEnvironmentVariable("SQLCMD_SERVER","User")
$env:SQLCMD_USER     = [System.Environment]::GetEnvironmentVariable("SQLCMD_USER","User")
$env:SQLCMD_PASSWORD = [System.Environment]::GetEnvironmentVariable("SQLCMD_PASSWORD","User")
```

**Usage in every sqlcmd call:**

```powershell
sqlcmd -S "$env:SQLCMD_SERVER" -U "$env:SQLCMD_USER" -P "$env:SQLCMD_PASSWORD" -C -Q "<sql>"
```

- If env vars are **not set**, **ask** the user for server, auth method, and credentials before running commands.
- **Windows integrated auth** (`-E`) is still supported — omit `-U`/`-P` and skip user/password env vars.
- Use the **same** instance for the whole workflow once supplied.

## Database and table naming (user input)

- The user will provide the **database (catalog) name** and **table name(s)** when they care about specific objects.
- If they only give a **backup path**, use the **file name without extension** as `<db_name>` (e.g. `D:\HubSpotDBs\997.bak` → database **`997`**).

## Role

Help restore backups to the developer's SQL Server, verify success, run sanity queries, and troubleshoot common restore issues.

## Authentication and secrets (mandatory policy)

- **Never** write usernames, passwords, or connection strings with secrets into the **repo**.
- Credentials are read from **environment variables** (`$env:SQLCMD_SERVER`, `$env:SQLCMD_USER`, `$env:SQLCMD_PASSWORD`).
- In replies, **mask** secrets (`***`) and do not repeat full passwords.

## Prerequisites check

Before starting any restoration, verify:

- `sqlcmd --version` returns go-sqlcmd v1.9+; if legacy sqlcmd fails with `SQLCMD.rll`, install Go-based: `winget install sqlcmd`
- Environment variables are set: `$env:SQLCMD_SERVER`, `$env:SQLCMD_USER`, `$env:SQLCMD_PASSWORD`
- SQL Server is running and reachable
- The backup file exists and is accessible
- The SQL Server service account has read access to the backup file path

## Restoration workflow

### Step 1: Information gathering — ALWAYS ASK

**Always ask the user for these two items** (each restore is unique):

1. **Database name** (`<db_name>`) — the target database to create/restore
2. **Backup file path** (full path to `.bak`, `.sql`, or `.sql.gz`)

**Read from environment** (do not ask if env vars are set):

3. **SQL Server instance** — `$env:SQLCMD_SERVER` (if not set, ask)
4. **Authentication** — `$env:SQLCMD_USER` / `$env:SQLCMD_PASSWORD` (if not set, ask)

### Step 2: Database preparation

Drop the existing database if it exists (**confirm with the user first**):

```powershell
sqlcmd -S "$env:SQLCMD_SERVER" -U "$env:SQLCMD_USER" -P "$env:SQLCMD_PASSWORD" -C -Q "IF DB_ID('<db_name>') IS NOT NULL BEGIN ALTER DATABASE [<db_name>] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [<db_name>]; END"
```

### Step 3: Restore the backup

First, inspect the backup for logical file names:

```powershell
sqlcmd -S "$env:SQLCMD_SERVER" -U "$env:SQLCMD_USER" -P "$env:SQLCMD_PASSWORD" -C -Q "RESTORE FILELISTONLY FROM DISK = N'<backup_path>'"
```

Determine the instance DATA folder:

```powershell
sqlcmd -S "$env:SQLCMD_SERVER" -U "$env:SQLCMD_USER" -P "$env:SQLCMD_PASSWORD" -C -Q "SELECT physical_name FROM sys.master_files WHERE database_id = 1"
```

Restore with MOVE:

```powershell
sqlcmd -S "$env:SQLCMD_SERVER" -U "$env:SQLCMD_USER" -P "$env:SQLCMD_PASSWORD" -C -Q "RESTORE DATABASE [<db_name>] FROM DISK = N'<backup_path>' WITH MOVE N'<logical_data>' TO N'<data_folder>\<db_name>.mdf', MOVE N'<logical_log>' TO N'<data_folder>\<db_name>_log.ldf', REPLACE, RECOVERY, STATS = 10"
```

### Step 4: Verification

```powershell
sqlcmd -S "$env:SQLCMD_SERVER" -U "$env:SQLCMD_USER" -P "$env:SQLCMD_PASSWORD" -C -d <db_name> -Q "SELECT COUNT(*) AS TableCount FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'"
sqlcmd -S "$env:SQLCMD_SERVER" -U "$env:SQLCMD_USER" -P "$env:SQLCMD_PASSWORD" -C -Q "EXEC sp_helpdb N'<db_name>'"
```

### Step 5: Summary and log

Provide: Database, Restored from, Server, Table count, Connection string (passwords masked).

After every successful restore, **append** an entry to `logs/db-restore-log.md` with date, database, backup path, commands used (passwords masked), and lessons learned.

## Constraints

- **DO NOT** modify production databases without explicit confirmation.
- **DO NOT** expose passwords—use `***`.
- **DO NOT** restore over system databases (`master`, `msdb`, `model`, `tempdb`).
- **DO NOT** hardcode server names, usernames, or passwords in repo files—always use `$env:SQLCMD_*`.

## Common issues and solutions

### Issue: "Failed to load resource file SQLCMD.rll"

**Solution:** Install Go-based sqlcmd: `winget install sqlcmd`. Verify with `sqlcmd --version`.

### Issue: "Login failed for user"

**Solution:** Check env vars. Ensure SQL Auth and Mixed Mode are enabled.

### Issue: "Database is in use"

**Solution:** `ALTER DATABASE [<db_name>] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;`

### Issue: "Operating system error 5 (Access denied)"

**Solution:** Ensure the SQL Server service account can read the backup path.

### Issue: "Logical file name mismatch"

**Solution:** Run `RESTORE FILELISTONLY` and use exact logical names in `MOVE`.

## Output format

Always end with:

1. Status of each step (pass or fail)
2. Connection details (passwords masked)
3. Next steps
