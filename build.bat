@echo off
chcp 65001 >nul

echo.
echo  NAS Indexer - Build
echo.
echo  Compiling TypeScript to JavaScript...
echo.

call npm run build || goto :error

echo.
echo  Build complete! Output: dist/
echo.
pause
goto :end

:error
echo.
echo  [ERROR] Build failed! Check the output above.
pause
exit /b 1

:end