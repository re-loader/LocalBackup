# Pulls the latest www/ from GitHub into IIS wwwroot.
# Runs every 5 minutes via Scheduled Task "web-deploy" (see setup-server.ps1).
$ErrorActionPreference = 'Stop'
$repo   = 'C:\web-repo'
$wwwroot = 'C:\inetpub\wwwroot'
$log    = 'C:\web-repo\deploy.log'

function Log($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $m" | Add-Content $log }

try {
    Set-Location $repo
    $before = git rev-parse HEAD
    git fetch --quiet origin main
    $after = git rev-parse origin/main
    if ($before -eq $after) { exit 0 }   # nothing new

    git reset --hard --quiet origin/main
    # Mirror www/ -> wwwroot (deletes files removed from repo, keeps web.config if present in repo)
    robocopy "$repo\www" $wwwroot /MIR /NFL /NDL /NJH /NJS /R:2 /W:2 | Out-Null
    Log "Deployed $($after.Substring(0,7))  (was $($before.Substring(0,7)))"
} catch {
    Log "ERROR: $_"
}
