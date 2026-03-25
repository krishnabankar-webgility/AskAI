@echo off
REM ============================================================
REM  Restore LiveDB from D:\HubSpotDBs\LiveDB.bak
REM  Target: WGIN-NTB-276\SQLEXPRESS  (Windows Auth)
REM
REM  Usage:  Open a Command Prompt on the target machine and run:
REM            scripts\restore-livedb.cmd
REM
REM  Prerequisites:
REM    - sqlcmd is on PATH (ships with SSMS or SQL Server CLI Utils)
REM    - SQL Server is running on WGIN-NTB-276\SQLEXPRESS
REM    - Current Windows user has sysadmin/dbcreator rights
REM    - SQL Server service account can read D:\HubSpotDBs\LiveDB.bak
REM ============================================================

SET SQL_SERVER=WGIN-NTB-276\SQLEXPRESS
SET BAK_PATH=D:\HubSpotDBs\LiveDB.bak
SET DB_NAME=LiveDB

echo ============================================================
echo  Step 0: Prerequisites check
echo ============================================================
sqlcmd -? >nul 2>&1
if errorlevel 1 (
    echo ERROR: sqlcmd is not found on PATH.
    echo Install SQL Server Command Line Utilities or SSMS.
    exit /b 1
)
echo [OK] sqlcmd found

sqlcmd -S "%SQL_SERVER%" -E -Q "SELECT @@VERSION" -h -1
if errorlevel 1 (
    echo ERROR: Cannot connect to %SQL_SERVER%.
    echo Check that SQL Server is running and reachable.
    exit /b 1
)
echo [OK] Connected to %SQL_SERVER%

echo.
echo ============================================================
echo  Step 1: Inspect backup (RESTORE FILELISTONLY)
echo ============================================================
sqlcmd -S "%SQL_SERVER%" -E -Q "RESTORE FILELISTONLY FROM DISK = N'%BAK_PATH%'"
if errorlevel 1 (
    echo ERROR: Could not read backup file. Check path and permissions.
    exit /b 1
)

echo.
echo ============================================================
echo  Step 2: Drop existing database [%DB_NAME%] if present
echo ============================================================
sqlcmd -S "%SQL_SERVER%" -E -Q "IF DB_ID('%DB_NAME%') IS NOT NULL BEGIN ALTER DATABASE [%DB_NAME%] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [%DB_NAME%]; END"
if errorlevel 1 (
    echo WARNING: Drop step returned an error. Continuing...
)

echo.
echo ============================================================
echo  Step 3: Restore database
echo ============================================================
echo NOTE: You must replace ^<logical_data^> and ^<logical_log^>
echo       with the LogicalName values from Step 1 output above.
echo.
echo Example command (edit logical names then paste into cmd):
echo.
echo   sqlcmd -S "%SQL_SERVER%" -E -Q "RESTORE DATABASE [%DB_NAME%] FROM DISK = N'%BAK_PATH%' WITH MOVE N'^<logical_data^>' TO N'C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\DATA\%DB_NAME%.mdf', MOVE N'^<logical_log^>' TO N'C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\DATA\%DB_NAME%_log.ldf', REPLACE, RECOVERY, STATS = 10"
echo.
echo After running the RESTORE command above, press any key to continue verification...
pause >nul

echo.
echo ============================================================
echo  Step 4: Verification
echo ============================================================
echo --- Table listing ---
sqlcmd -S "%SQL_SERVER%" -E -d %DB_NAME% -Q "SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_SCHEMA, TABLE_NAME"

echo --- Table count ---
sqlcmd -S "%SQL_SERVER%" -E -d %DB_NAME% -Q "SELECT COUNT(*) AS TableCount FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'"

echo --- Row counts (top tables) ---
sqlcmd -S "%SQL_SERVER%" -E -d %DB_NAME% -Q "SELECT s.name AS SchemaName, t.name AS TableName, p.rows AS RowCount FROM sys.tables t INNER JOIN sys.schemas s ON t.schema_id = s.schema_id INNER JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0, 1) ORDER BY p.rows DESC"

echo --- Database properties ---
sqlcmd -S "%SQL_SERVER%" -E -Q "EXEC sp_helpdb N'%DB_NAME%'"

echo.
echo ============================================================
echo  Step 5: Summary
echo ============================================================
echo   Database:   %DB_NAME%
echo   Restored:   %BAK_PATH%
echo   Server:     %SQL_SERVER%
echo   Connection: Server=%SQL_SERVER%;Database=%DB_NAME%;Trusted_Connection=True;TrustServerCertificate=True;
echo ============================================================
echo Done.
