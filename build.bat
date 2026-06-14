@echo off
:: 切换代码页为 UTF-8，支持中文显示
chcp 65001 >nul 2>&1

echo ========================================
echo    NAS Indexer - 编译构建
echo ========================================
echo.

:: 检查 Node.js 是否已安装
where node >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Node.js！
    echo 请先安装 Node.js: https://nodejs.org/
    pause
    exit /b 1
)

:: 检查 npm 是否可用
where npm >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 npm！
    echo 请确保 Node.js 安装完整
    pause
    exit /b 1
)

echo [编译] TypeScript → JavaScript
echo.

call npm run build

if errorlevel 1 (
    echo.
    echo ========================================
    echo [错误] 编译失败！
    echo ========================================
    pause
    exit /b 1
)

echo.
echo ========================================
echo [完成] 编译成功！
echo ========================================
echo.
echo 输出目录: dist/
echo.
echo 运行 start.bat 可启动服务
echo 或使用 npm run dev 启动开发模式
echo.

pause