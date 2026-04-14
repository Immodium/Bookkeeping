# Setting Up Recurring Invoice Cron Job

This document explains how to set up a cron job to automatically process recurring invoices every hour.

## Cron Endpoint

The server provides a cron endpoint at:
```
POST http://localhost:3002/api/cron/recurring-invoices
```

## Setup Instructions

### Linux/macOS

1. Open crontab for editing:
   ```bash
   crontab -e
   ```

2. Add the following line to run every hour:
   ```bash
   0 * * * * curl -X POST http://localhost:3002/api/cron/recurring-invoices
   ```

3. Save and exit. The cron job is now active.

### Windows (Task Scheduler)

1. Open Task Scheduler (`taskschd.msc`)

2. Click "Create Basic Task..."

3. Set the following:
   - **Name**: "Slimbooks Recurring Invoices"
   - **Description**: "Process recurring invoices hourly"
   - **Trigger**: Daily
   - **Start**: Set to current date
   - **Recur every**: 1 day
   - **Advanced settings**: Check "Repeat task every" and set to "1 hour"

4. Set the Action:
   - **Action**: Start a program
   - **Program/script**: `powershell`
   - **Arguments**: `-Command "Invoke-RestMethod -Uri 'http://localhost:3002/api/cron/recurring-invoices' -Method POST"`

5. Click Finish to save the task.

### Docker/Container Environments

If running in a container, add this to your docker-compose.yml or container setup:

```yaml
version: '3.8'
services:
  slimbooks-cron:
    image: curlimages/curl:latest
    restart: unless-stopped
    command: >
      sh -c "
        echo '0 * * * * curl -X POST http://slimbooks:3002/api/cron/recurring-invoices' > /tmp/crontab &&
        crond -f
      "
    depends_on:
      - slimbooks
```

### Using wget instead of curl

If curl is not available, you can use wget:

**Linux/macOS:**
```bash
0 * * * * wget --post-data="" http://localhost:3002/api/cron/recurring-invoices -O /dev/null
```

**Windows PowerShell:**
```powershell
Invoke-WebRequest -Uri "http://localhost:3002/api/cron/recurring-invoices" -Method POST
```

## Testing the Cron Job

You can test the endpoint manually:

```bash
curl -X POST http://localhost:3002/api/cron/recurring-invoices
```

Expected response:
```json
{
  "success": true,
  "data": {
    "processed": 0,
    "timestamp": "2024-01-01T12:00:00.000Z"
  },
  "message": "Processed 0 recurring invoices"
}
```

## Health Check

Check if the cron service is running:

```bash
curl http://localhost:3002/api/cron/health
```

## Monitoring

- Check your server logs to see when recurring invoices are processed
- The endpoint returns the number of invoices processed
- Set up monitoring alerts if the endpoint fails

## Troubleshooting

1. **Connection refused**: Make sure the Slimbooks server is running
2. **No templates processed**: Check that you have recurring invoice templates set up
3. **Permission denied**: Ensure the cron job has network access to the server
4. **Timeout**: Increase timeout settings if you have many templates to process

## Security Considerations

- The cron endpoint does not require authentication by design for automation
- Consider restricting access to this endpoint using firewall rules
- Run the cron job from the same machine as the server when possible