@echo off
title BlueTalk - Push to GitHub (jyotvaghasia156-rgb)
color 0B

echo ==========================================================
echo        BLUETALK - PUSH PROJECT TO GITHUB REPOSITORY
echo ==========================================================
echo.
echo Target GitHub: https://github.com/jyotvaghasia156-rgb/bluetooth-talk-
echo.

:: Initialize Git repository if not already done
if not exist ".git" (
    echo [*] Initializing local Git repository...
    git init -b main
)

:: Add all project files
echo [*] Adding project files...
git add .

:: Commit files
echo [*] Creating commit...
git commit -m "Initial commit - BlueTalk Pro Walkie-Talkie & Live Communicator"

:: Set remote origin
echo [*] Configuring GitHub remote origin...
git remote remove origin >nul 2>&1
git remote add origin https://github.com/jyotvaghasia156-rgb/bluetooth-talk-.git

:: Push to GitHub
echo [*] Pushing to main branch on GitHub...
echo (If prompted, please enter your GitHub credentials or Personal Access Token)
echo.
git push -u origin main

echo.
echo ==========================================================
echo   Done! View your repository at:
echo   https://github.com/jyotvaghasia156-rgb/bluetooth-talk-
echo ==========================================================
pause
