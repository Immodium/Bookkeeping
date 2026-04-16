@echo off
REM Windows batch script to set up recurring invoice cron job using Task Scheduler
REM Run as Administrator for best results

echo Setting up Slimbooks Recurring Invoice Task...

REM Create the scheduled task
schtasks /create ^
    /tn "Slimbooks Recurring Invoices" ^
    /tr "powershell.exe -Command \"Invoke-RestMethod -Uri 'http://localhost:3002/api/cron/recurring-invoices' -Method POST\"" ^
    /sc hourly ^
    /mo 1 ^
    /ru "SYSTEM" ^
    /f

if %errorlevel% == 0 (
    echo SUCCESS: Recurring invoice task created successfully!
    echo The task will run every hour to process recurring invoices.
    echo.
    echo To check the task status:
    echo   schtasks /query /tn "Slimbooks Recurring Invoices"
    echo.
    echo To delete the task:
    echo   schtasks /delete /tn "Slimbooks Recurring Invoices" /f
) else (
    echo ERROR: Failed to create scheduled task. 
    echo Make sure you're running as Administrator.
)

pause