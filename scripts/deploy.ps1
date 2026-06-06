param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Message
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$branch = (git branch --show-current).Trim()
if (-not $branch) {
  throw "Could not detect the current git branch."
}

$commitMessage = ($Message -join " ").Trim()
if (-not $commitMessage) {
  $commitMessage = "Deploy $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
}

Write-Host "Deploying branch '$branch' from $repoRoot"

$changes = git status --porcelain
if ($changes) {
  Write-Host "Committing local changes..."
  git add -A
  git commit -m $commitMessage
}
else {
  Write-Host "No local changes to commit."
}

Write-Host "Pushing to GitHub remote: origin"
git push origin $branch

Write-Host "Pushing to Namecheap remote: namecheap"
git push namecheap $branch

Write-Host "Done. If cPanel auto deployment is enabled, Namecheap will deploy using .cpanel.yml."
