[CmdletBinding()]
param(
  [string]$Region = 'us-east-2',
  [string]$ServiceName = 'motordeck',
  [string]$RepositoryName = 'motordeck',
  [string]$DbInstanceIdentifier = 'motordeck-db',
  [string]$DbUsername = 'motordeck_admin',
  [string]$AdminSetupToken = '',
  [switch]$ApproveCharges
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path

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

function Invoke-AwsText([string[]]$Arguments) {
  $previousErrorAction = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $output = & aws @Arguments --no-cli-pager 2>&1 }
  finally { $ErrorActionPreference = $previousErrorAction }
  $exitCode = $LASTEXITCODE
  $message = ($output | ForEach-Object { $_.ToString() }) -join "`n"
  if ($exitCode -ne 0) { throw "AWS CLI falhou: $message" }
  return $message.Trim()
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

function Test-DockerDaemon {
  $previousErrorAction = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & docker version --format '{{.Server.Version}}' 2>&1 | Out-Null; $exitCode = $LASTEXITCODE }
  finally { $ErrorActionPreference = $previousErrorAction }
  return ($exitCode -eq 0)
}

function Ensure-DockerDaemon {
  if (Test-DockerDaemon) { return }
  Write-Output 'Docker Desktop instalado, mas o engine não respondeu. Reiniciando Docker Desktop...'
  $previousErrorAction = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & docker desktop restart --timeout 120 2>&1 | Out-Null } finally { $ErrorActionPreference = $previousErrorAction }
  for ($attempt = 1; $attempt -le 60; $attempt++) {
    Start-Sleep -Seconds 5
    if (Test-DockerDaemon) {
      Write-Output 'Docker engine disponível.'
      return
    }
  }
  throw 'O Docker Desktop não conseguiu iniciar o engine Linux. Abra Docker Desktop e verifique o status do WSL 2.'
}

if (-not $ApproveCharges) { throw 'Este deploy cria recursos cobrados. Execute novamente com -ApproveCharges depois de revisar o script.' }
if (-not (Get-Command aws -ErrorAction SilentlyContinue)) { throw 'AWS CLI não encontrado.' }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker não encontrado ou não está no PATH.' }
Ensure-DockerDaemon

$identity = Invoke-AwsJson @('sts', 'get-caller-identity', '--region', $Region)
$accountId = [string]$identity.Account
Write-Output "Conta AWS: $accountId | Região: $Region"

$AdminSetupToken = Read-SecretValue 'Token inicial do administrador (mínimo 24 caracteres)' $AdminSetupToken
if ($AdminSetupToken.Length -lt 24) { throw 'ADMIN_SETUP_TOKEN precisa ter pelo menos 24 caracteres.' }
$dbPassword = Read-SecretValue 'Senha do usuário PostgreSQL (mínimo 8 caracteres)' ''
if ($dbPassword.Length -lt 8) { throw 'A senha do PostgreSQL precisa ter pelo menos 8 caracteres.' }
if ($dbPassword -notmatch '^[A-Za-z0-9]+$') { throw 'A senha do PostgreSQL deve usar somente letras e números, sem espaços ou símbolos.' }

$vpc = Invoke-AwsJson @('ec2', 'describe-vpcs', '--filters', 'Name=isDefault,Values=true', '--region', $Region)
$vpcId = $vpc.Vpcs[0].VpcId
if (-not $vpcId) { throw "Nenhuma VPC default encontrada em $Region." }
$subnets = Invoke-AwsJson @('ec2', 'describe-subnets', '--filters', "Name=vpc-id,Values=$vpcId", 'Name=map-public-ip-on-launch,Values=true', '--region', $Region)
$subnetIds = @($subnets.Subnets | Sort-Object AvailabilityZone | Select-Object -First 2 -ExpandProperty SubnetId)
if ($subnetIds.Count -lt 2) { throw 'A VPC default precisa ter pelo menos duas subnets públicas.' }

try { $serviceSg = (Invoke-AwsJson @('ec2', 'describe-security-groups', '--filters', "Name=vpc-id,Values=$vpcId", 'Name=group-name,Values=motordeck-ecs', '--region', $Region)).SecurityGroups[0].GroupId } catch { $serviceSg = $null }
if (-not $serviceSg) { $serviceSg = (Invoke-AwsJson @('ec2', 'create-security-group', '--group-name', 'motordeck-ecs', '--description', 'MotorDeck ECS Express tasks', '--vpc-id', $vpcId, '--region', $Region)).GroupId }
try { $dbSg = (Invoke-AwsJson @('ec2', 'describe-security-groups', '--filters', "Name=vpc-id,Values=$vpcId", 'Name=group-name,Values=motordeck-rds', '--region', $Region)).SecurityGroups[0].GroupId } catch { $dbSg = $null }
if (-not $dbSg) { $dbSg = (Invoke-AwsJson @('ec2', 'create-security-group', '--group-name', 'motordeck-rds', '--description', 'MotorDeck PostgreSQL', '--vpc-id', $vpcId, '--region', $Region)).GroupId }
try { & aws ec2 authorize-security-group-ingress --group-id $dbSg --protocol tcp --port 5432 --source-group $serviceSg --region $Region --no-cli-pager 2>$null | Out-Null } catch { }

$myIp = (Invoke-RestMethod -Uri 'https://checkip.amazonaws.com').Trim()
try { & aws ec2 authorize-security-group-ingress --group-id $dbSg --protocol tcp --port 5432 --cidr "$myIp/32" --region $Region --no-cli-pager 2>$null | Out-Null } catch { }

$subnetGroupName = 'motordeck-db-subnets'
try { Invoke-AwsJson @('rds', 'describe-db-subnet-groups', '--db-subnet-group-name', $subnetGroupName, '--region', $Region) | Out-Null } catch {
  Invoke-AwsJson @('rds', 'create-db-subnet-group', '--db-subnet-group-name', $subnetGroupName, '--db-subnet-group-description', 'MotorDeck RDS subnets', '--subnet-ids', $subnetIds[0], $subnetIds[1], '--region', $Region) | Out-Null
}
try { Invoke-AwsJson @('rds', 'describe-db-instances', '--db-instance-identifier', $DbInstanceIdentifier, '--region', $Region) | Out-Null } catch {
  Invoke-AwsJson @('rds', 'create-db-instance', '--db-instance-identifier', $DbInstanceIdentifier, '--db-instance-class', 'db.t3.micro', '--engine', 'postgres', '--allocated-storage', '20', '--storage-type', 'gp3', '--db-name', 'motordeck', '--master-username', $DbUsername, '--master-user-password', $dbPassword, '--db-subnet-group-name', $subnetGroupName, '--vpc-security-group-ids', $dbSg, '--backup-retention-period', '1', '--publicly-accessible', '--no-deletion-protection', '--region', $Region) | Out-Null
  Write-Output 'RDS criado; aguardando ficar disponível (pode levar 10–15 minutos)...'
}
& aws rds wait db-instance-available --db-instance-identifier $DbInstanceIdentifier --region $Region --no-cli-pager
if ($LASTEXITCODE -ne 0) { throw 'RDS não ficou disponível.' }
$dbEndpoint = Invoke-AwsText @('rds', 'describe-db-instances', '--db-instance-identifier', $DbInstanceIdentifier, '--query', 'DBInstances[0].Endpoint.Address', '--output', 'text', '--region', $Region)

$encodedUser = [Uri]::EscapeDataString($DbUsername)
$encodedPassword = [Uri]::EscapeDataString($dbPassword)
$databaseUrl = "postgresql://$encodedUser`:$encodedPassword@$dbEndpoint`:5432/motordeck?sslmode=require"
$env:DATABASE_URL = $databaseUrl
try { & node (Join-Path $projectRoot 'deploy/aws/migrate.mjs') } finally { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue }
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível aplicar o schema PostgreSQL.' }
& aws ec2 revoke-security-group-ingress --group-id $dbSg --protocol tcp --port 5432 --cidr "$myIp/32" --region $Region --no-cli-pager | Out-Null

try { Invoke-AwsJson @('ecr', 'describe-repositories', '--repository-names', $RepositoryName, '--region', $Region) | Out-Null } catch {
  Invoke-AwsJson @('ecr', 'create-repository', '--repository-name', $RepositoryName, '--image-tag-mutability', 'IMMUTABLE', '--image-scanning-configuration', 'scanOnPush=true', '--region', $Region) | Out-Null
}
$dockerConfig = Join-Path $env:TEMP "motordeck-docker-config-$([Guid]::NewGuid())"
New-Item -ItemType Directory -Force -Path $dockerConfig | Out-Null
'{"auths":{}}' | Set-Content -LiteralPath (Join-Path $dockerConfig 'config.json') -Encoding ascii
$previousDockerConfig = $env:DOCKER_CONFIG
$env:DOCKER_CONFIG = $dockerConfig
try {
  $registry = "$accountId.dkr.ecr.$Region.amazonaws.com"
  $loginPassword = & aws ecr get-login-password --region $Region
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao obter o token temporário do ECR.' }
  $authText = "AWS:$($loginPassword -join '')"
  $authValue = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($authText))
  @{ auths = @{ $registry = @{ auth = $authValue } } } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $dockerConfig 'config.json') -Encoding ascii
  $imageTag = "deploy-$([DateTime]::UtcNow.ToString('yyyyMMddHHmmss'))"
  $image = "$registry/${RepositoryName}:$imageTag"
  & docker --config $dockerConfig build -t $image $projectRoot
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao construir a imagem Docker.' }
  & docker --config $dockerConfig push $image
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao enviar a imagem para o ECR.' }
} finally {
  if ($null -eq $previousDockerConfig) { Remove-Item Env:DOCKER_CONFIG -ErrorAction SilentlyContinue } else { $env:DOCKER_CONFIG = $previousDockerConfig }
  Remove-Item -LiteralPath $dockerConfig -Recurse -Force -ErrorAction SilentlyContinue
}

$execTrust = Join-Path $env:TEMP "motordeck-exec-trust-$([Guid]::NewGuid()).json"
$infraTrust = Join-Path $env:TEMP "motordeck-infra-trust-$([Guid]::NewGuid()).json"
'{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}' | Set-Content -LiteralPath $execTrust -Encoding utf8
'{"Version":"2012-10-17","Statement":[{"Sid":"AllowAccessInfrastructureForECSExpressServices","Effect":"Allow","Principal":{"Service":"ecs.amazonaws.com"},"Action":"sts:AssumeRole"}]}' | Set-Content -LiteralPath $infraTrust -Encoding utf8
$execRoleName = 'motordeck-ecs-task-execution'
$infraRoleName = 'motordeck-ecs-express-infra'
$execRoleArn = Ensure-Role $execRoleName $execTrust 'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy'
$infraRoleArn = Ensure-Role $infraRoleName $infraTrust 'arn:aws:iam::aws:policy/service-role/AmazonECSInfrastructureRoleforExpressGatewayServices'
Write-Output 'Aguardando a propagação dos IAM roles...'
Start-Sleep -Seconds 45

$secretName = "motordeck/$ServiceName/production"
$secretJson = @{ DATABASE_URL = $databaseUrl; ADMIN_SETUP_TOKEN = $AdminSetupToken } | ConvertTo-Json -Compress
# Windows PowerShell 5.1 drops the inner double quotes of an inline argument to a native exe; pass the JSON by file.
$secretFile = Join-Path $env:TEMP "motordeck-secret-$([Guid]::NewGuid()).json"
[IO.File]::WriteAllText($secretFile, $secretJson, (New-Object Text.UTF8Encoding $false))
try { $secretArn = (Invoke-AwsJson @('secretsmanager', 'describe-secret', '--secret-id', $secretName, '--region', $Region)).ARN; Invoke-AwsJson @('secretsmanager', 'put-secret-value', '--secret-id', $secretName, '--secret-string', "file://$secretFile", '--region', $Region) | Out-Null } catch { $secretArn = (Invoke-AwsJson @('secretsmanager', 'create-secret', '--name', $secretName, '--secret-string', "file://$secretFile", '--region', $Region)).ARN } finally { Remove-Item -LiteralPath $secretFile -Force -ErrorAction SilentlyContinue }
$policyPath = Join-Path $env:TEMP "motordeck-secret-policy-$([Guid]::NewGuid()).json"
@{ Version = '2012-10-17'; Statement = @(@{ Effect = 'Allow'; Action = @('secretsmanager:GetSecretValue'); Resource = $secretArn }) } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $policyPath -Encoding utf8
Invoke-AwsJson @('iam', 'put-role-policy', '--role-name', $execRoleName, '--policy-name', 'ReadMotorDeckSecrets', '--policy-document', "file://$policyPath", '--region', $Region) | Out-Null

$appOrigin = "https://$ServiceName.ecs.$Region.on.aws"
$logGroup = "/ecs/$ServiceName"
try { Invoke-AwsJson @('logs', 'create-log-group', '--log-group-name', $logGroup, '--region', $Region) | Out-Null } catch { }
try { & aws logs put-retention-policy --log-group-name $logGroup --retention-in-days 14 --region $Region --no-cli-pager | Out-Null } catch { }
$primaryContainer = @{
  image = $image
  containerPort = 3000
  awsLogsConfiguration = @{ logGroup = $logGroup; logStreamPrefix = 'ecs' }
  environment = @(@{ name = 'APP_ENV'; value = 'production' }, @{ name = 'APP_ORIGIN'; value = $appOrigin })
  secrets = @(@{ name = 'DATABASE_URL'; valueFrom = "${secretArn}:DATABASE_URL::" }, @{ name = 'ADMIN_SETUP_TOKEN'; valueFrom = "${secretArn}:ADMIN_SETUP_TOKEN::" })
}
$request = @{
  serviceName = $ServiceName
  executionRoleArn = $execRoleArn
  infrastructureRoleArn = $infraRoleArn
  healthCheckPath = '/api/health'
  primaryContainer = $primaryContainer
  networkConfiguration = @{ securityGroups = @($serviceSg); subnets = $subnetIds }
  cpu = '512'
  memory = '1024'
  scalingTarget = @{ minTaskCount = 1; maxTaskCount = 2; autoScalingMetric = 'AVERAGE_CPU'; autoScalingTargetValue = 60 }
  tags = @(@{ key = 'Project'; value = 'MotorDeck' }, @{ key = 'ManagedBy'; value = 'deploy-ecs-express.ps1' })
}
$requestPath = Join-Path $env:TEMP "motordeck-express-request-$([Guid]::NewGuid()).json"
$request | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $requestPath -Encoding utf8
$created = Invoke-AwsJson @('ecs', 'create-express-gateway-service', '--cli-input-json', "file://$requestPath", '--monitor-resources', 'DEPLOYMENT', '--monitor-mode', 'TEXT-ONLY', '--region', $Region)

Remove-Item -LiteralPath $execTrust,$infraTrust,$policyPath,$requestPath -Force -ErrorAction SilentlyContinue
$serviceArn = $created.service.serviceArn
Write-Output "Deploy concluído. Serviço: $serviceArn"
Write-Output "URL: https://$ServiceName.ecs.$Region.on.aws"
Write-Output "Health: https://$ServiceName.ecs.$Region.on.aws/api/health"
Write-Output "RDS: $DbInstanceIdentifier ($dbEndpoint)"
Write-Output 'A regra temporária do seu IP no RDS foi removida; somente o security group do ECS acessa a porta 5432.'
