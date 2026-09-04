@echo off
REM ===================================================================
REM  OSS Competency Platform - one-click start (Windows)
REM
REM    start.bat            set up if needed, then run
REM    start.bat reseed     rebuild the demo database first
REM    start.bat stop       stop whatever is running on 8000 / 5173
REM
REM  First run installs dependencies and seeds the database, so it
REM  takes a few minutes. Later runs start in a few seconds.
REM ===================================================================

setlocal
title OSS Competency Platform

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "FRONTEND=%ROOT%frontend"
set "PY=%BACKEND%\.venv\Scripts\python.exe"
set "RESEED=0"

if /i "%~1"=="reseed"   set "RESEED=1"
if /i "%~1"=="--reseed" set "RESEED=1"
if /i "%~1"=="stop"     goto :stop
if /i "%~1"=="--stop"   goto :stop

echo.
echo  OSS Competency Platform
echo  =======================
echo.

REM ---- prerequisites ------------------------------------------------
where python >nul 2>&1
if errorlevel 1 (
    echo  [X] Python was not found on your PATH.
    echo      Install Python 3.11 or newer from https://python.org
    echo      and tick "Add python.exe to PATH" during setup.
    goto :fail
)

where node >nul 2>&1
if errorlevel 1 (
    echo  [X] Node.js was not found on your PATH.
    echo      Install the LTS build from https://nodejs.org
    goto :fail
)

REM ---- backend dependencies -----------------------------------------
if not exist "%PY%" (
    echo  [1/4] Creating the Python virtual environment...
    python -m venv "%BACKEND%\.venv"
    if errorlevel 1 goto :fail
) else (
    echo  [1/4] Virtual environment present.
)

"%PY%" -c "import fastapi, sqlalchemy, jwt, pypdf, multipart" >nul 2>&1
if errorlevel 1 (
    echo  [2/4] Installing backend dependencies. This takes a few minutes...
    "%PY%" -m pip install --quiet --upgrade pip
    "%PY%" -m pip install --quiet -r "%BACKEND%\requirements.txt"
    if errorlevel 1 goto :fail
) else (
    echo  [2/4] Backend dependencies present.
)

REM ---- frontend dependencies ----------------------------------------
if not exist "%FRONTEND%\node_modules" (
    echo  [3/4] Installing frontend dependencies. This takes a few minutes...
    pushd "%FRONTEND%"
    call npm install --no-fund --no-audit
    if errorlevel 1 (
        popd
        goto :fail
    )
    popd
) else (
    echo  [3/4] Frontend dependencies present.
)

REM ---- database ------------------------------------------------------
REM  Seeding DROPS every table, so it only runs when the database is
REM  missing, or when you ask for it with "start.bat reseed".
if not exist "%BACKEND%\sih_oss.db" set "RESEED=1"

if "%RESEED%"=="1" (
    echo  [4/4] Building the demo database...
    pushd "%BACKEND%"
    "%PY%" -m seed.seed
    if errorlevel 1 (
        popd
        goto :fail
    )
    popd
) else (
    echo  [4/4] Database present. Use "start.bat reseed" to rebuild it.
)

REM ---- start the servers ---------------------------------------------
echo.
netstat -ano | findstr /r /c:"TCP.*:8000 .*LISTENING" >nul 2>&1
if errorlevel 1 (
    echo  Starting the API on port 8000...
    start "OSS API - port 8000" /D "%BACKEND%" cmd /k ".venv\Scripts\activate && python -m uvicorn app.main:app --port 8000"
) else (
    echo  Port 8000 is already serving - leaving it alone.
)

netstat -ano | findstr /r /c:"TCP.*:5173 .*LISTENING" >nul 2>&1
if errorlevel 1 (
    echo  Starting the web app on port 5173...
    start "OSS Web - port 5173" /D "%FRONTEND%" cmd /k "npm run dev"
) else (
    echo  Port 5173 is already serving - leaving it alone.
)

REM ---- wait for the API, then open the browser ------------------------
echo.
echo  Waiting for the API to answer...
set /a WAITED=0
:waitloop
curl -s -o nul http://localhost:8000/health >nul 2>&1
if not errorlevel 1 goto :ready
set /a WAITED+=1
if %WAITED% geq 90 goto :timeout
timeout /t 1 /nobreak >nul
goto :waitloop

:timeout
echo.
echo  [!] The API did not answer within 90 seconds.
echo      Check the "OSS API - port 8000" window for the error.
goto :done

:ready
echo  API is up.
echo  Waiting for the web app to build...
set /a WAITED=0
:webloop
curl -s -o nul http://localhost:5173/ >nul 2>&1
if not errorlevel 1 goto :webready
set /a WAITED+=1
if %WAITED% geq 90 goto :webtimeout
timeout /t 1 /nobreak >nul
goto :webloop

:webtimeout
echo  [!] The web app did not answer within 90 seconds.
echo      Check the "OSS Web - port 5173" window for the error.
goto :done

:webready
echo  Web app is up. Opening your browser...
start "" http://localhost:5173

:done
echo.
echo  ------------------------------------------------------------
echo   Web app    http://localhost:5173
echo   API docs   http://localhost:8000/docs
echo.
echo   Learner    pick any officer from the "Viewing as" menu.
echo   Admin      the Department view needs a sign-in:
echo                u-admin-meera  /  admin123
echo              Other officers use officer123 and are not admins.
echo.
echo   Two windows are now running the servers. Close them, or run
echo   "start.bat stop", to shut everything down.
echo  ------------------------------------------------------------
echo.
pause
exit /b 0

REM ---- stop ------------------------------------------------------------
:stop
echo.
echo  Stopping anything listening on ports 8000 and 5173...
for %%P in (8000 5173) do (
    for /f "tokens=5" %%A in ('netstat -ano ^| findstr /r /c:"TCP.*:%%P .*LISTENING"') do (
        echo   port %%P  ->  stopping process %%A
        taskkill /PID %%A /F >nul 2>&1
    )
)
echo  Done.
echo.
pause
exit /b 0

REM ---- failure ---------------------------------------------------------
:fail
echo.
echo  [X] Setup failed. The message above says why.
echo.
pause
exit /b 1
