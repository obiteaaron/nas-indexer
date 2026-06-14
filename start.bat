@echo off
chcp 65001 >nul

echo.
echo  NAS Indexer - Quick Build & Start
echo.
echo  Step 1: Compiling TypeScript...
echo.

call npm run build || goto :error

echo.
echo  Step 2: Starting server...
echo.

call npm run dev

goto :end

:error
echo.
echo  [ERROR] Build failed! Check the output above.
pause
exit /b 1

:end
pause