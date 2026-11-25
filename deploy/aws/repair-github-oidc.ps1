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
$githubThumbprint = '6938fd4d98bab03faadb97b34396831e3780aea1'

$providerArns = @(Invoke-AwsJson @('iam', 'list-open-id-connect-providers', '--region', $Region)).OpenIDConnectProviderList.Arn
if ($providerArns -notcontains $providerArn) {
  Invoke-AwsJson @('iam', 'create-open-id-connect-provider', '--url', 'https://token.actions.githubusercontent.com', '--client-id-list', 'sts.amazonaws.com', '--thumbprint-list', $githubThumbprint, '--region', $Region) | Out-Null
} else {
  $provider = Invoke-AwsJson @('iam', 'get-open-id-connect-provider', '--open-id-connect-provider-arn', $providerArn, '--region', $Region)
  if (@($provider.ClientIDList) -notcontains 'sts.amazonaws.com') {
    Invoke-AwsJson @('iam', 'add-client-id-to-open-id-connect-provider', '--open-id-connect-provider-arn', $providerArn, '--client-id', 'sts.amazonaws.com', '--region', $Region) | Out-Null
  }
  if (@($provider.ThumbprintList) -notcontains $githubThumbprint) {
    Invoke-AwsJson @('iam', 'update-open-id-connect-provider-thumbprint', '--open-id-connect-provider-arn', $providerArn, '--thumbprint-list', $githubThumbprint, '--region', $Region) | Out-Null
  }
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

$repoArn = "arn:aws:ecr:$Region`:$accountId`:repository/motordeck"
$secretArn = [string](Invoke-AwsJson @('secretsmanager', 'describe-secret', '--secret-id', 'motordeck/motordeck/production', '--region', $Region)).ARN
$execRoleArn = [string](Invoke-AwsJson @('iam', 'get-role', '--role-name', 'motordeck-ecs-task-execution', '--region', $Region)).Role.Arn
$infraRoleArn = [string](Invoke-AwsJson @('iam', 'get-role', '--role-name', 'motordeck-ecs-express-infra', '--region', $Region)).Role.Arn
$policyPath = Join-Path $env:TEMP "motordeck-github-policy-$([Guid]::NewGuid()).json"
$policy = @{
  Version = '2012-10-17'
  Statement = @(
    @{ Effect = 'Allow'; Action = @('ecr:GetAuthorizationToken'); Resource = '*' },
    @{ Effect = 'Allow'; Action = @('ecr:BatchCheckLayerAvailability','ecr:BatchGetImage','ecr:CompleteLayerUpload','ecr:InitiateLayerUpload','ecr:PutImage','ecr:UploadLayerPart','ecr:DescribeRepositories'); Resource = $repoArn },
    @{ Effect = 'Allow'; Action = @('ecs:CreateCluster','ecs:CreateExpressGatewayService','ecs:UpdateExpressGatewayService','ecs:DescribeExpressGatewayService','ecs:MonitorExpressGatewayService','ecs:ListServices','ecs:DescribeServices','ecs:DescribeClusters','ecs:TagResource'); Resource = '*' },
    @{ Effect = 'Allow'; Action = @('ec2:DescribeVpcs','ec2:DescribeSubnets','ec2:DescribeSecurityGroups'); Resource = '*' },
    @{ Effect = 'Allow'; Action = @('logs:CreateLogGroup','logs:PutRetentionPolicy'); Resource = '*' },
    @{ Effect = 'Allow'; Action = @('secretsmanager:DescribeSecret'); Resource = $secretArn },
    @{ Effect = 'Allow'; Action = @('iam:PassRole'); Resource = @($execRoleArn, $infraRoleArn); Condition = @{ StringEquals = @{ 'iam:PassedToService' = @('ecs.amazonaws.com','ecs-tasks.amazonaws.com') } } }
  )
} | ConvertTo-Json -Depth 10
$policy | Set-Content -LiteralPath $policyPath -Encoding ascii
try {
  Invoke-AwsJson @('iam', 'put-role-policy', '--role-name', $GitHubRoleName, '--policy-name', 'MotorDeckGitHubDeploy', '--policy-document', "file://$policyPath", '--region', $Region) | Out-Null
} finally {
  Remove-Item -LiteralPath $policyPath -Force -ErrorAction SilentlyContinue
}

Write-Output "OIDC corrigido: $GitHubRoleName"
Write-Output "Conta: $accountId | Região: $Region"
Write-Output 'OIDC e permissões ECR/ECS corrigidas; execute novamente o workflow na branch main.'
