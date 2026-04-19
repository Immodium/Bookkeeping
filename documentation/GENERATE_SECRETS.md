# Slimbooks Scripts

This directory contains utility scripts for setting up and managing your Slimbooks application.

## Secret Generation Scripts

### For Windows Users

#### Option 1: PowerShell Script (Recommended)
```powershell
# Run from project root directory
.\scripts\Generate-Secrets.ps1
```

**Features:**
- Generates cryptographically secure secrets using .NET RNG
- Creates .env file from .env.example template
- Automatically backs up existing .env files
- Provides colored output and helpful guidance
- Cross-platform (works on Windows, macOS, Linux with PowerShell Core)

**Parameters:**
- `-Force`: Overwrites existing .env without prompting
- `-SecretLength`: Specify custom secret length (default: 64)

**Examples:**
```powershell
# Basic usage
.\scripts\Generate-Secrets.ps1

# Force overwrite without backup prompt
.\scripts\Generate-Secrets.ps1 -Force

# Generate shorter secrets (32 characters)
.\scripts\Generate-Secrets.ps1 -SecretLength 32
```

#### Option 2: Batch File Wrapper
```cmd
# Run from project root directory
.\scripts\generate-secrets.bat
```

This is a simple wrapper that calls the PowerShell script and handles execution policy issues.

### For Linux/macOS Users

#### Bash Script
```bash
# Run from project root directory
./scripts/generate-secrets.sh
```

The original bash script that works on Unix-like systems.

## What These Scripts Do

1. **Generate Secure Secrets**: Creates cryptographically secure random strings for:
   - JWT_SECRET (64 characters)
   - JWT_REFRESH_SECRET (64 characters) 
   - SESSION_SECRET (64 characters)

2. **Create .env File**: Uses .env.example as a template and replaces placeholder secrets with generated ones

3. **Backup Existing Files**: Automatically creates timestamped backups of existing .env files

4. **Security Guidance**: Provides important security notes and next steps

## Security Notes

- ⚠️ **Never commit .env files to version control**
- 🔐 Generated secrets use cryptographically secure random number generators
- 📁 Backup files are created with timestamps for safety
- 🔒 Review all configuration values before production deployment

## Troubleshooting

### PowerShell Execution Policy Issues
If you get execution policy errors, you can:

1. **Temporary bypass** (recommended):
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\Generate-Secrets.ps1
   ```

2. **Change execution policy** (requires admin):
   ```powershell
   Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```

### Missing PowerShell
- **Windows 10/11**: PowerShell is included by default
- **Older Windows**: Download from [Microsoft PowerShell GitHub](https://github.com/PowerShell/PowerShell)
- **Cross-platform**: Install PowerShell Core for Linux/macOS

### Manual Setup
If scripts don't work, you can manually:
1. Copy `.env.example` to `.env`
2. Replace the placeholder secrets with secure random strings
3. Use online generators or tools like `openssl rand -base64 64`

## File Structure

```
scripts/
├── Generate-Secrets.ps1      # PowerShell script (cross-platform)
├── generate-secrets.bat      # Windows batch wrapper
└── generate-secrets.sh       # Original bash script (Unix/Linux)
```
