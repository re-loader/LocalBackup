# One-time setup on the Windows Server (run in PowerShell as Administrator).
# Installs Git, clones the repo, deploys once, and schedules deploy.ps1 every 5 minutes.
$ErrorActionPreference = 'Stop'
$repoUrl = 'https://github.com/re-loader/LocalBackup.git'
$repo    = 'C:\web-repo'

# 1. Git
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "Installing Git..."
    winget install --id Git.Git -e --silent --accept-source-agreements --accept-package-agreements
    $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
}

# 2. Clone (private repo -> Git will prompt once for GitHub login via browser; credential is cached)
if (-not (Test-Path "$repo\.git")) {
    git clone $repoUrl $repo
}
git -C $repo config --global --add safe.directory $repo

# 3. First deploy
& "$repo\deploy\deploy.ps1"

# 4. Scheduled task every 5 minutes as SYSTEM
$action  = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File $repo\deploy\deploy.ps1"
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 4) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'web-deploy' -Action $action -Trigger $trigger -Settings $settings -User 'SYSTEM' -RunLevel Highest -Force | Out-Null

Write-Host "`nDone. Site deploys from GitHub every 5 minutes. Log: $repo\deploy.log"
