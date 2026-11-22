@echo off
setlocal
echo ===================================================
echo   SHL PRO - Budowanie instalatora Windows (.exe/.msi)
echo ===================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [BLAD] Nie znaleziono Node.js. Zainstaluj Node.js LTS ze strony https://nodejs.org/
  pause
  exit /b 1
)

where cargo >nul 2>nul
if errorlevel 1 (
  echo [BLAD] Nie znaleziono Rust / Cargo. Zainstaluj rustup ze strony https://rustup.rs/
  pause
  exit /b 1
)

echo [1/3] Instalacja zaleznosci npm...
call npm install
if errorlevel 1 exit /b 1

echo [2/3] Generowanie ikony SHL PRO (.ico)...
call npx --yes @tauri-apps/cli@^2 icon public\assets\aistudio\Metaliczny_znak_marki_SHL_PRO_cf0c8d3e.png
if errorlevel 1 exit /b 1

node -e "const fs=require('fs');const p='src-tauri/tauri.conf.json';const c=JSON.parse(fs.readFileSync(p,'utf8'));c.bundle.icon=['icons/32x32.png','icons/128x128.png','icons/128x128@2x.png','icons/icon.icns','icons/icon.ico'];fs.writeFileSync(p,JSON.stringify(c,null,2));"

echo [3/3] Kompilacja instalatora .exe (NSIS) oraz .msi...
call npx --yes @tauri-apps/cli@^2 build
if errorlevel 1 exit /b 1

echo.
echo [SUKCES] Gotowe instalatory znajduja sie w:
echo   src-tauri\target\release\bundle\nsis\
echo   src-tauri\target\release\bundle\msi\
start "" explorer.exe "src-tauri\target\release\bundle"
pause
