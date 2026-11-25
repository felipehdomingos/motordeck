[CmdletBinding()]
param(
  [string]$Region = 'us-east-2',
  [string]$GitHubRoleName = 'motordeck-github-deploy'
)

$ErrorActionPreference = 'Stop'

function Invoke-AwsJson([string[]]$Arguments) {
  $output = & aws @Arguments --no-cli-pager 2>&1
  $exitCode = $LASTEXITCODE
  $message = ($output | ForEach-Object { $_.ToString() }) -join "`n"
  if ($exitCode -ne 0) { throw "AWS CLI falhou: $message" }
  return ($message | ConvertFrom-Json)
}

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) { throw 'AWS CLI não encontrado.' }
$identity = Invoke-AwsJson @('sts', 'get-caller-identity', '--region', $Region)
$accountId = [string]$identity.Account
$providerArn = "arn:aws:iam::${accountId}:oidc-provider/token.actions.githubusercontent.com"
$githubSubject = 'repo:felipehdomingos@99370203/motordeck@1470286306:ref:refs/heads/main'

$providerArns = @(Invoke-AwsJson @('iam', 'list-open-id-connect-providers', '--region', $Region)).OpenIDConnectProviderList.Arn
if ($providerArns -notcontains $providerArn) {
  Invoke-AwsJson @('iam', 'create-open-id-connect-provider', '--url', 'https://token.actions.githubusercontent.com', '--client-id-list', 'sts.amazonaws.com', '--thumbprint-list', '6938fd4d98bab03faadb97b34396831e3780aea1', '--region', $Region) | Out-Null
}

$trustPath = Join-Path $env:TEMP "motordeck-github-trust-$([Guid]::NewGuid()).json"
$trustPolicy = @{
  Version = '2012-10-17'
  Statement = @(@{
    Effect = 'Allow'
    Principal = @{ Federated = $providerArn }
    Action = 'sts:AssumeRoleWithWebIdentity'
    Condition = @{ StringEquals = @{
      'token.actions.githubusercontent.com:aud' = 'sts.amazonaws.com'
      'token.actions.githubusercontent.com:sub' = $githubSubject
    } }
  })
} | ConvertTo-Json -Depth 8
$trustPolicy | Set-Content -LiteralPath $trustPath -Encoding ascii
try {
  Invoke-AwsJson @('iam', 'update-assume-role-policy', '--role-name', $GitHubRoleName, '--policy-document', "file://$trustPath", '--region', $Region) | Out-Null
} finally {
  Remove-Item -LiteralPath $trustPath -Force -ErrorAction SilentlyContinue
}

Write-Output "OIDC corrigido: $GitHubRoleName"
Write-Output "Conta: $accountId | Região: $Region"
Write-Output 'Agora o workflow pode ser executado na branch main.'
