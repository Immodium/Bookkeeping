#!/bin/bash

# Linux/macOS script to set up recurring invoice cron job
# This script adds a cron job to process recurring invoices every hour

echo "Setting up Slimbooks Recurring Invoice Cron Job..."

# Check if curl is available
if ! command -v curl &> /dev/null; then
    echo "ERROR: curl is not installed. Please install curl first."
    exit 1
fi

# Create the cron job entry
if [ -n "$CRON_JOB_SECRET" ]; then
    CRON_JOB="0 * * * * curl -H \"x-cron-secret: $CRON_JOB_SECRET\" -X POST http://localhost:3002/api/cron/recurring-invoices >/dev/null 2>&1"
else
    CRON_JOB="0 * * * * curl -X POST http://localhost:3002/api/cron/recurring-invoices >/dev/null 2>&1"
fi

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "api/cron/recurring-invoices"; then
    echo "Cron job already exists. Skipping..."
else
    # Add the cron job
    (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
    
    if [ $? -eq 0 ]; then
        echo "SUCCESS: Cron job added successfully!"
        echo "Recurring invoices will be processed every hour."
    else
        echo "ERROR: Failed to add cron job."
        exit 1
    fi
fi

echo ""
echo "Current cron jobs:"
crontab -l

echo ""
echo "To remove this cron job, run:"
echo "  crontab -e"
echo "Then delete the line containing 'api/cron/recurring-invoices'"

echo ""
echo "To test the endpoint manually:"
if [ -n "$CRON_JOB_SECRET" ]; then
    echo "  curl -H \"x-cron-secret: \$CRON_JOB_SECRET\" -X POST http://localhost:3002/api/cron/recurring-invoices"
else
    echo "  curl -X POST http://localhost:3002/api/cron/recurring-invoices"
fi