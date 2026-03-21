# Skill: SQL Server local database restore

Use this skill when restoring `.bak` / `.sql` / `.sql.gz` backups to SQL Server for debugging, testing, or customer data investigation.

## Workspace default SQL Server (mandatory unless user overrides)

**Use this instance for every `sqlcmd` `-S` argument, connection string, and any CREATE / ALTER / UPDATE / DELETE / DROP against a database or table** unless the user explicitly names a different server:

| Setting | Value |
|--------|--------|
| **Server** | `WGIN-NTB-276\SQLEXPRESS` |

**Shell:** always quote the name: `-S "WGIN-NTB-276\SQLEXPRESS"`.

**Connection strings (Windows auth):**  
`Server=WGIN-NTB-276\SQLEXPRESS;Database=<db>;Trusted_Connection=True;TrustServerCertificate=True;`

Do **not** silently fall back to `localhost` or `.` for this workspace.

## Database and table naming (user input)

- The user will provide the **database (catalog) name** and **table name(s)** when they care about specific objects (verification queries, targeted checks).  
- If they only give a **backup path** and want the restored database to match the file name, use the **file name without extension** as `<db_name>` (e.g. `D:\HubSpotDBs\997.bak` → database **`997`**).

## Role

Help restore backups to the developer’s SQL Server, verify success, run sanity queries, and troubleshoot common restore issues.

## Why restore might fail from Cursor (not “missing saved passwords”)

Restoring a `.bak` is done by running **T-SQL** (`RESTORE DATABASE`, etc.) through a tool that talks to SQL Server. The agent can only do that if **all** of the following are true on the machine where the terminal runs:

1. **A working client** — `sqlcmd` must **start** without errors. If you see **`Failed to load resource file SQLCMD.rll`**, the **SQL command-line tools are broken or incomplete** on that PC. No username or password will fix that until you repair/reinstall **SSMS** or **SQL Server Command Line Utilities** so `SQLCMD.rll` sits beside `sqlcmd.exe`. Alternatively use **SSMS** and run the same SQL manually.
2. **Network / instance** — That machine must reach **`WGIN-NTB-276\SQLEXPRESS`** (firewall, SQL Browser if needed, TCP enabled, etc.).
3. **Backup readable by SQL Server** — The **SQL Server service account** must have **read** permission on the `.bak` path (e.g. `D:\HubSpotDBs\...`). “Access denied” is often this, not your Windows login.
4. **Permission to restore** — The login you use (Windows or SQL) needs rights to restore (typically **sysadmin** or **dbcreator** per your org).

So: the blocker we hit was **(1)** — `sqlcmd` failed **before** connecting, so **no credential** was the issue yet. Fixing the client or using SSMS on **WGIN-NTB-276** is what’s required.

## Authentication and secrets (mandatory policy)

- **Never** write usernames, passwords, or connection strings with secrets into the **repo** (no committed `.md`, `.json`, scripts, or agent files).
- **Ask when needed:** If auth isn’t clear, ask whether to use **Windows integrated** (`sqlcmd -E` — uses whoever is logged into Windows) or **SQL Server authentication** (`-U` / `-P`). For SQL auth, the user must supply the password **only in this chat session** or type it in **SSMS** / a secure prompt themselves—**do not** paste it into tracked files.
- In replies, **mask** secrets (`***`) and do not repeat full passwords.

## Prerequisites check

Before starting any restoration, verify:

- `sqlcmd` CLI is installed (`sqlcmd -?` or `sqlcmd --version`)
- SQL Server is running and reachable at **`WGIN-NTB-276\SQLEXPRESS`**
- User has Windows Auth (`-E`) or SQL Auth (`-U`/`-P`) as needed
- The backup/dump file exists and is accessible
- The **SQL Server service account** has read access to the backup file path (common failure on `D:\...` drives)

## Restoration workflow

### Step 1: Information gathering

Ask the user for (skip items already provided in the prompt):

1. **Backup file path** (full path to `.bak`, `.sql`, or `.sql.gz`)
2. **Target database name** — if omitted, **default:** stem of the backup file (e.g. `997.bak` → `997`)
3. **Optional:** **Table name(s)** or schema for post-restore checks
4. **SQL Server** — only if not the workspace default above
5. **Authentication** — If not stated, **ask every time:** Windows integrated (`-E`) or SQL login (`-U` login name + password **in session only**, never saved to repo). Explain that `-E` does not take a Windows password on the command line—the user must be logged into Windows as the right account, or use SSMS with the right identity.

### Step 2: Database preparation

Drop the existing database if it exists (**confirm with the user first** when data loss is possible):

```bash
sqlcmd -S "WGIN-NTB-276\SQLEXPRESS" -E -Q "IF DB_ID('<db_name>') IS NOT NULL BEGIN ALTER DATABASE [<db_name>] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [<db_name>]; END"
```

For SQL Authentication, replace `-E` with `-U sa -P ***`:

```bash
sqlcmd -S "WGIN-NTB-276\SQLEXPRESS" -U sa -P "***" -Q "IF DB_ID('<db_name>') IS NOT NULL BEGIN ALTER DATABASE [<db_name>] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [<db_name>]; END"
```

### Step 3: Restore the backup

**For native SQL Server backups (`.bak`):**

First, inspect the backup for logical file names:

```bash
sqlcmd -S "WGIN-NTB-276\SQLEXPRESS" -E -Q "RESTORE FILELISTONLY FROM DISK = N'D:\path\to\backup.bak'"
```

Then restore with **MOVE** into this instance’s **DATA** folder. On Windows, paths usually look like  
`C:\Program Files\Microsoft SQL Server\MSSQL<ver>.SQLEXPRESS\MSSQL\DATA\` — pick the folder that matches this instance (same folder other user databases use). If unsure, infer from `RESTORE FILELISTONLY` / `sys.master_files` on `master`.

```cmd
sqlcmd -S "WGIN-NTB-276\SQLEXPRESS" -E -Q "RESTORE DATABASE [<db_name>] FROM DISK = N'D:\path\to\backup.bak' WITH MOVE N'<logical_data>' TO N'C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\DATA\<db_name>.mdf', MOVE N'<logical_log>' TO N'C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\DATA\<db_name>_log.ldf', REPLACE, RECOVERY, STATS = 10"
```

Adjust **`MSSQL16`** to the installed version if different.

**Linux / Docker SQL Server** (if ever used on another machine): use `/var/opt/mssql/data/` in `MOVE` paths instead.

**For plain SQL script files (`.sql`):**

```bash
sqlcmd -S "WGIN-NTB-276\SQLEXPRESS" -E -d <db_name> -i D:\path\to\dump.sql
```

**For compressed SQL scripts (`.sql.gz`)** (Linux/macOS-style pipe; on Windows use 7-Zip or WSL to decompress first, or expand then run `-i`):

```bash
sqlcmd -S "WGIN-NTB-276\SQLEXPRESS" -E -Q "CREATE DATABASE [<db_name>]"
gunzip < /path/to/dump.sql.gz | sqlcmd -S "WGIN-NTB-276\SQLEXPRESS" -E -d <db_name>
```

### Step 4: Verification

Use the **default server** and the restored **database name**. When the user supplied **table name(s)**, run targeted `SELECT` or row counts on those objects.

```bash
sqlcmd -S "WGIN-NTB-276\SQLEXPRESS" -E -d <db_name> -Q "SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_SCHEMA, TABLE_NAME"

sqlcmd -S "WGIN-NTB-276\SQLEXPRESS" -E -d <db_name> -Q "SELECT COUNT(*) AS TableCount FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'"

sqlcmd -S "WGIN-NTB-276\SQLEXPRESS" -E -d <db_name> -Q "SELECT s.name AS SchemaName, t.name AS TableName, p.rows AS RowCount FROM sys.tables t INNER JOIN sys.schemas s ON t.schema_id = s.schema_id INNER JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0, 1) ORDER BY p.rows DESC"

sqlcmd -S "WGIN-NTB-276\SQLEXPRESS" -E -Q "EXEC sp_helpdb N'<db_name>'"
```

### Step 5: Summary

Provide:

- Database: `<db_name>`
- Restored from: `<file_path>`
- Server: `WGIN-NTB-276\SQLEXPRESS`
- Tables / checks run (include user-specified tables if any)
- Connection string: `Server=WGIN-NTB-276\SQLEXPRESS;Database=<db_name>;Trusted_Connection=True;TrustServerCertificate=True;`
- SQL Auth variant if applicable: `Server=WGIN-NTB-276\SQLEXPRESS;Database=<db_name>;User Id=...;Password=***;TrustServerCertificate=True;`

## Constraints

- **DO NOT** delete or modify **production** databases unless the user clearly targets production and confirms.
- **DO NOT** proceed without explicit confirmation for **DROP DATABASE** when it destroys existing data.
- **DO NOT** expose passwords in output—use `***` or prompt separately.
- **DO NOT** restore over system databases (`master`, `msdb`, `model`, `tempdb`).
- **Default server** for this skill is **`WGIN-NTB-276\SQLEXPRESS`** — stay consistent across all DDL/DML in the session unless the user overrides.

## Common issues and solutions

### Issue: "Login failed for user"

**Solution:** Verify credentials. For Windows Auth ensure the current Windows user is allowed on that instance. For SQL Auth ensure `sa` (or user) is enabled. Mixed Mode required for SQL Auth.

### Issue: "Database is in use"

**Solution:** Set single-user mode first:

```sql
ALTER DATABASE [<db_name>] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
```

### Issue: "Command not found: sqlcmd"

**Solution:** Install SQL Server command-line utilities and ensure `sqlcmd` is on PATH.

### Issue: "Failed to load resource file SQLCMD.rll"

**Solution:** The `sqlcmd` install is incomplete (common with a partial Client SDK). Repair via **SQL Server Installer** (add **Command Line Utilities**), install a recent **SQL Server Management Studio (SSMS)** build, or run the same commands from another machine that has a working `sqlcmd`. On this host, the instance data folder for **SQLEXPRESS** may be under `C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\DATA\` (version folder varies—confirm on disk).

### Issue: "Backup file not found" or "Operating system error 5 (Access denied)"

**Solution:** Confirm path. Ensure the **SQL Server service account** can read the file (e.g. `D:\HubSpotDBs\...`).

### Issue: "Logical file name mismatch"

**Solution:** Run `RESTORE FILELISTONLY` and use exact logical names in `MOVE`.

### Issue: Backup version incompatible with server

**Solution:** Restore only to same or newer SQL Server; check `SELECT @@VERSION`.

### Issue: Exit code 1 during restore

**Solution:** Check SQL Server error log and backup integrity.

## Output format

Always end with:

1. Status of each step (pass or fail)
2. Connection details (Windows Auth string; SQL Auth if used)
3. Next steps (e.g. ready to query, or name tables to validate next)

## Best practices

- Always `RESTORE FILELISTONLY` before `.bak` restores.
- Use `WITH REPLACE` only after user confirmation when overwriting an existing database.
- Use `WITH STATS = 10` on large restores.
- Prefer `INFORMATION_SCHEMA` / `sys.*` for metadata.
- If MCP SQL Server is configured for this host, you may query via MCP **to the same server** instead of CLI.
