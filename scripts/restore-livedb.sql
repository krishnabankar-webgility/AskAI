/*
    Restore LiveDB from D:\HubSpotDBs\LiveDB.bak
    Target: WGIN-NTB-276\SQLEXPRESS
    Auth:   Windows Integrated (-E)

    Run from a Command Prompt / PowerShell on the target machine:

      sqlcmd -S "WGIN-NTB-276\SQLEXPRESS" -E -i "scripts\restore-livedb.sql"

    Alternatively open this file in SSMS connected to WGIN-NTB-276\SQLEXPRESS
    and execute (F5).
*/

-- ============================================================
-- Step 1: Inspect backup — list logical file names
-- ============================================================
RESTORE FILELISTONLY FROM DISK = N'D:\HubSpotDBs\LiveDB.bak';
GO

-- ============================================================
-- Step 2: Drop existing database (if any)
--         SET SINGLE_USER first to kick out active connections
-- ============================================================
IF DB_ID('LiveDB') IS NOT NULL
BEGIN
    ALTER DATABASE [LiveDB] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE [LiveDB];
END
GO

-- ============================================================
-- Step 3: Restore
--
--   *** IMPORTANT ***
--   After running Step 1 (RESTORE FILELISTONLY), note the
--   LogicalName values for the data (.mdf) and log (.ldf) files.
--   Replace <logical_data> and <logical_log> below with those
--   exact logical names before executing this block.
--
--   The MOVE paths assume MSSQL16.SQLEXPRESS — adjust the
--   version folder if your instance differs. You can verify the
--   correct DATA folder with:
--
--     SELECT physical_name FROM sys.master_files
--     WHERE database_id = DB_ID('master');
--
-- ============================================================
/*
RESTORE DATABASE [LiveDB]
FROM DISK = N'D:\HubSpotDBs\LiveDB.bak'
WITH
    MOVE N'<logical_data>' TO N'C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\DATA\LiveDB.mdf',
    MOVE N'<logical_log>'  TO N'C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\DATA\LiveDB_log.ldf',
    REPLACE,
    RECOVERY,
    STATS = 10;
GO
*/

-- ============================================================
-- Step 4: Verification
-- ============================================================
-- 4a. Table listing
SELECT TABLE_SCHEMA, TABLE_NAME
FROM [LiveDB].INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_SCHEMA, TABLE_NAME;
GO

-- 4b. Table count
SELECT COUNT(*) AS TableCount
FROM [LiveDB].INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE = 'BASE TABLE';
GO

-- 4c. Row counts per table (top tables by size)
SELECT s.name  AS SchemaName,
       t.name  AS TableName,
       p.rows  AS RowCount
FROM   [LiveDB].sys.tables      t
JOIN   [LiveDB].sys.schemas     s ON t.schema_id  = s.schema_id
JOIN   [LiveDB].sys.partitions  p ON t.object_id  = p.object_id
                                  AND p.index_id IN (0, 1)
ORDER BY p.rows DESC;
GO

-- 4d. Database properties
EXEC sp_helpdb N'LiveDB';
GO
