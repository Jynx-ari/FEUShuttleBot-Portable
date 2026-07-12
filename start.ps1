Set-StrictMode -Version Latest
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $scriptDir
if (-Not (Test-Path .env)) {
    Copy-Item .env.example .env
    Write-Host 'Created .env from .env.example. Please edit .env before running.'
}
npm install
npm start
