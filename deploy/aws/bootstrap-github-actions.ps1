[CmdletBinding()]
param(
  [string]$Region = 'us-east-2',
  [string]$GitHubRepository = 'felipehdomingos/motordeck',
  [string]$GitHubBranch = 'main',
  [string]$ServiceName = 'motordeck',
  [string]$RepositoryName = 'motordeck',
  [string]$DbInstanceIdentifier = 'motordeck-db',
  [string]$DbUsername = 'motordeck_admin',
  [string]$GitHubRoleName = 'motordeck-github-deploy',
  [string]$AdminSetupToken = ''
)

$ErrorActionPreference = 'Stop'

function Invoke-AwsJson([string[]]$Arguments) {
  $previousErrorAction = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $output = & aws @Arguments --no-cli-pager 2>&1 }
  finally { $ErrorActionPreference = $previousErrorAction }
  $exitCode = $LASTEXITCODE
  $message = ($output | ForEach-Object { $_.ToString() }) -join "`n"
  if ($exitCode -ne 0) { throw "AWS CLI falhou: $message" }
  return ($message | ConvertFrom-Json)
}

function Read-SecretValue([string]$Prompt, [string]$Current) {
  if ($Current) { return $Current }
  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Ensure-Role([string]$RoleName, [string]$TrustPolicyPath, [string]$ManagedPolicyArn) {
  try {
    $role = Invoke-AwsJson @('iam', 'get-role', '--role-name', $RoleName, '--region', $Region)
    $arn = $role.Role.Arn
  } catch {
    $role = Invoke-AwsJson @('iam', 'create-role', '--role-name', $RoleName, '--assume-role-policy-document', "file://$TrustPolicyPath", '--region', $Region)
    $arn = $role.Role.Arn
  }
  & aws iam attach-role-policy --role-name $RoleName --policy-arn $ManagedPolicyArn --region $Region --no-cli-pager | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Não foi possível anexar a política ao role $RoleName" }
  return $arn
}

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) { throw 'AWS CLI não encontrado.' }
$identity = Invoke-AwsJson @('sts', 'get-caller-identity', '--region', $Region)
$accountId = [string]$identity.Account
Write-Output "Conta AWS: $accountId | Região: $Region"

$AdminSetupToken = Read-SecretValue 'Token inicial do administrador (mínimo 24 caracteres)' $AdminSetupToken
if ($AdminSetupToken.Length -lt 24) { throw 'ADMIN_SETUP_TOKEN precisa ter pelo menos 24 caracteres.' }
$dbPassword = Read-SecretValue 'Mesma senha PostgreSQL usada na criação do RDS' ''
if ($dbPassword -notmatch '^[A-Za-z0-9]+$') { throw 'A senha PostgreSQL deve usar somente letras e números.' }

$db = Invoke-AwsJson @('rds', 'describe-db-instances', '--db-instance-identifier', $DbInstanceIdentifier, '--region', $Region)
$dbEndpoint = [string]$db.DBInstances[0].Endpoint.Address
if (-not $dbEndpoint) { throw "RDS $DbInstanceIdentifier não encontrado ou ainda sem endpoint." }
$databaseUrl = "postgresql://$([Uri]::EscapeDataString($DbUsername))`:$([Uri]::EscapeDataString($dbPassword))@$dbEndpoint`:5432/motordeck?sslmode=require"

try { Invoke-AwsJson @('ecr', 'describe-repositories', '--repository-names', $RepositoryName, '--region', $Region) | Out-Null } catch {
  Invoke-AwsJson @('ecr', 'create-repository', '--repository-name', $RepositoryName, '--image-tag-mutability', 'IMMUTABLE', '--image-scanning-configuration', 'scanOnPush=true', '--region', $Region) | Out-Null
}

$execTrust = Join-Path $env:TEMP "motordeck-exec-trust-$([Guid]::NewGuid()).json"
$infraTrust = Join-Path $env:TEMP "motordeck-infra-trust-$([Guid]::NewGuid()).json"
'{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}' | Set-Content -LiteralPath $execTrust -Encoding ascii
'{"Version":"2012-10-17","Statement":[{"Sid":"AllowAccessInfrastructureForECSExpressServices","Effect":"Allow","Principal":{"Service":"ecs.amazonaws.com"},"Action":"sts:AssumeRole"}]}' | Set-Content -LiteralPath $infraTrust -Encoding ascii
$execRoleName = 'motordeck-ecs-task-execution'
$infraRoleName = 'motordeck-ecs-express-infra'
$execRoleArn = Ensure-Role $execRoleName $execTrust 'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy'
$infraRoleArn = Ensure-Role $infraRoleName $infraTrust 'arn:aws:iam::aws:policy/service-role/AmazonECSInfrastructureRoleforExpressGatewayServices'

$secretName = "motordeck/$ServiceName/production"
$secretJson = @{ DATABASE_URL = $databaseUrl; ADMIN_SETUP_TOKEN = $AdminSetupToken } | ConvertTo-Json -Compress
try {
  $secretArn = (Invoke-AwsJson @('secretsmanager', 'describe-secret', '--secret-id', $secretName, '--region', $Region)).ARN
  Invoke-AwsJson @('secretsmanager', 'put-secret-value', '--secret-id', $secretName, '--secret-string', $secretJson, '--region', $Region) | Out-Null
} catch {
  $secretArn = (Invoke-AwsJson @('secretsmanager', 'create-secret', '--name', $secretName, '--secret-string', $secretJson, '--region', $Region)).ARN
}
$secretPolicyPath = Join-Path $env:TEMP "motordeck-secret-policy-$([Guid]::NewGuid()).json"
@{ Version = '2012-10-17'; Statement = @(@{ Effect = 'Allow'; Action = @('secretsmanager:GetSecretValue'); Resource = $secretArn }) } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $secretPolicyPath -Encoding ascii
Invoke-AwsJson @('iam', 'put-role-policy', '--role-name', $execRoleName, '--policy-name', 'ReadMotorDeckSecrets', '--policy-document', "file://$secretPolicyPath", '--region', $Region) | Out-Null

$providerArn = "arn:aws:iam::${accountId}:oidc-provider/token.actions.githubusercontent.com"
$githubThumbprint = '6938fd4d98bab03faadb97b34396831e3780aea1'
$providers = @(Invoke-AwsJson @('iam', 'list-open-id-connect-providers', '--region', $Region)).OpenIDConnectProviderList.Arn
if ($providers -notcontains $providerArn) {
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

$githubTrustPath = Join-Path $env:TEMP "motordeck-github-trust-$([Guid]::NewGuid()).json"
$githubTrust = @{
  Version = '2012-10-17'
  Statement = @(@{
    Effect = 'Allow'
    Principal = @{ Federated = $providerArn }
    Action = 'sts:AssumeRoleWithWebIdentity'
    # GitHub uses immutable subject claims for this repository. The numeric
    # owner/repository IDs are part of the subject and must be matched exactly.
    Condition = @{
      StringEquals = @{
        'token.actions.githubusercontent.com:aud' = 'sts.amazonaws.com'
        'token.actions.githubusercontent.com:sub' = 'repo:felipehdomingos@99370203/motordeck@1470286306:ref:refs/heads/main'
      }
    }
  })
} | ConvertTo-Json -Depth 8
$githubTrust | Set-Content -LiteralPath $githubTrustPath -Encoding ascii
try {
  $githubRoleArn = (Invoke-AwsJson @('iam', 'get-role', '--role-name', $GitHubRoleName, '--region', $Region)).Role.Arn
  Invoke-AwsJson @('iam', 'update-assume-role-policy', '--role-name', $GitHubRoleName, '--policy-document', "file://$githubTrustPath", '--region', $Region) | Out-Null
} catch {
  $githubRoleArn = (Invoke-AwsJson @('iam', 'create-role', '--role-name', $GitHubRoleName, '--assume-role-policy-document', "file://$githubTrustPath", '--region', $Region)).Role.Arn
}

$repoArn = "arn:aws:ecr:$Region`:$accountId`:repository/$RepositoryName"
$githubPolicyPath = Join-Path $env:TEMP "motordeck-github-policy-$([Guid]::NewGuid()).json"
$githubPolicy = @{
  Version = '2012-10-17'
  Statement = @(
    @{ Effect = 'Allow'; Action = @('ecr:GetAuthorizationToken'); Resource = '*' },
    @{ Effect = 'Allow'; Action = @('ecr:BatchCheckLayerAvailability','ecr:BatchGetImage','ecr:CompleteLayerUpload','ecr:InitiateLayerUpload','ecr:PutImage','ecr:UploadLayerPart','ecr:DescribeRepositories'); Resource = $repoArn },
    @{ Effect = 'Allow'; Action = @('ecs:CreateCluster','ecs:CreateGateway','ecs:AssociateGatewayWithCluster','ecs:RegisterTaskDefinition','ecs:CreateExpressGatewayService','ecs:UpdateExpressGatewayService','ecs:DescribeExpressGatewayService','ecs:MonitorExpressGatewayService','ecs:ListServices','ecs:DescribeServices','ecs:DescribeClusters','ecs:TagResource'); Resource = '*' },
    @{ Effect = 'Allow'; Action = @('ec2:DescribeVpcs','ec2:DescribeSubnets','ec2:DescribeSecurityGroups'); Resource = '*' },
    @{ Effect = 'Allow'; Action = @('logs:CreateLogGroup','logs:PutRetentionPolicy','logs:FilterLogEvents'); Resource = '*' },
    @{ Effect = 'Allow'; Action = @('secretsmanager:DescribeSecret','secretsmanager:GetSecretValue'); Resource = $secretArn },
    @{ Effect = 'Allow'; Action = @('iam:CreateServiceLinkedRole'); Resource = '*'; Condition = @{ StringEquals = @{ 'iam:AWSServiceName' = 'ecs.amazonaws.com' } } },
    @{ Effect = 'Allow'; Action = @('iam:PassRole'); Resource = @($execRoleArn, $infraRoleArn); Condition = @{ StringEquals = @{ 'iam:PassedToService' = @('ecs.amazonaws.com','ecs-tasks.amazonaws.com') } } }
  )
} | ConvertTo-Json -Depth 10
$githubPolicy | Set-Content -LiteralPath $githubPolicyPath -Encoding ascii
Invoke-AwsJson @('iam', 'put-role-policy', '--role-name', $GitHubRoleName, '--policy-name', 'MotorDeckGitHubDeploy', '--policy-document', "file://$githubPolicyPath", '--region', $Region) | Out-Null

Remove-Item -LiteralPath $execTrust,$infraTrust,$secretPolicyPath,$githubTrustPath,$githubPolicyPath -Force -ErrorAction SilentlyContinue
Write-Output "GitHub role: $githubRoleArn"
Write-Output "Secret: $secretArn"
Write-Output "Depois deste bootstrap, faça push na branch $GitHubBranch para o workflow publicar a aplicação."
