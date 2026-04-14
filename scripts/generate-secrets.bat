@echo off
echo Slimbooks Secret Generator
echo.
echo Running PowerShell script to generate secure secrets...
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0Generate-Secrets.ps1" -Force

echo.
echo Done!
pause
