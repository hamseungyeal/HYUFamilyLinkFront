@echo off
echo.
echo ========================================
echo   FamilyLink Frontend - Setup
echo ========================================
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed.
    echo Please install it from https://nodejs.org
    pause
    exit /b 1
)

echo [1/3] Node.js OK
echo.

:: Create .env file
if not exist ".env" (
    echo [2/3] Creating .env file...
    echo VITE_API_URL=http://localhost:4000 > .env
    echo VITE_SOCKET_URL=http://localhost:4000 >> .env
    echo       .env file created.
    echo       Change the URLs to your server address when deploying.
) else (
    echo [2/3] .env already exists. Skipping.
)
echo.

:: npm install
echo [3/3] Installing packages...
npm install
echo.

echo ========================================
echo   Setup complete!
echo ========================================
echo.
echo   To start dev server: start.bat
echo.
pause
