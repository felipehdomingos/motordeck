[CmdletBinding()]
param(
  [string]$ResourceGroup = 'rg-motordeck',
  [string]$Location = 'brazilsouth',
  [string]$AppName = 'motordeck-app',
  [string]$DatabaseServer = 'motordeck-db',
  [string]$DatabaseName = 'motordeck',
  [string]$DatabaseAdmin = 'motordeckadmin',
  [string]$SubscriptionId = '',
  [string]$AdminSetupToken = '',
  [string]$DatabasePassword = '',
  [string]$PlacaEfipeApiKey = '',
  [string]$ResendApiKey = '',
  [string]$AuthFromEmail = ''
)

$ErrorActionPreference = 'Stop'
$env:AZURE_CONFIG_DIR = Join-Path $env:TEMP 'motordeck-azure-cli'
New-Item -ItemType Directory -Force $env:AZURE_CONFIG_DIR | Out-Null

function Assert-Success([string]$Step) {
  if ($LASTEXITCODE -ne 0) { throw "Azure falhou em: $Step" }
}

function Read-Secret([string]$Prompt, [string]$Current) {
  if ($Current) { return $Current }
  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

if (-not $AdminSetupToken) { $AdminSetupToken = Read-Secret 'Código inicial para criar o primeiro administrador' '' }
if (-not $DatabasePassword) { $DatabasePassword = Read-Secret 'Senha do administrador PostgreSQL' '' }
if ($AdminSetupToken.Length -lt 24) { throw 'O código inicial precisa ter pelo menos 24 caracteres.' }
if ($DatabasePassword.Length -lt 8) { throw 'A senha do PostgreSQL precisa ter pelo menos 8 caracteres.' }

if ($SubscriptionId) {
  az account set --subscription $SubscriptionId
  Assert-Success 'selecionar a assinatura'
}

az group create --name $ResourceGroup --location $Location --output none
Assert-Success 'criar o resource group'

$acrName = ($AppName -replace '[^a-z0-9]', '').ToLower() + 'acr'
$planName = "$AppName-plan"

az acr create --resource-group $ResourceGroup --name $acrName --sku Basic --admin-enabled true --output none
Assert-Success 'criar o Azure Container Registry'

az postgres flexible-server create `
  --resource-group $ResourceGroup `
  --name $DatabaseServer `
  --location $Location `
  --admin-user $DatabaseAdmin `
  --admin-password $DatabasePassword `
  --sku-name Standard_B1ms `
  --tier Burstable `
  --storage-size 32 `
  --version 16 `
  --public-access 0.0.0.0 `
  --output none
Assert-Success 'criar o Azure Database for PostgreSQL'

az postgres flexible-server db create `
  --resource-group $ResourceGroup `
  --server-name $DatabaseServer `
  --database-name $DatabaseName `
  --output none
Assert-Success 'criar o banco da aplicação'

az postgres flexible-server firewall-rule create `
  --resource-group $ResourceGroup `
  --name $DatabaseServer `
  --rule-name AllowAzureServices `
  --start-ip-address 0.0.0.0 `
  --end-ip-address 0.0.0.0 `
  --output none
Assert-Success 'permitir o acesso dos serviços Azure ao PostgreSQL'

$connectionPassword = [Uri]::EscapeDataString($DatabasePassword)
$connectionUser = [Uri]::EscapeDataString($DatabaseAdmin)
$databaseUrl = "postgresql://$connectionUser`:$connectionPassword@$DatabaseServer.postgres.database.azure.com:5432/$DatabaseName?sslmode=require"

az postgres flexible-server execute `
  --resource-group $ResourceGroup `
  --name $DatabaseServer `
  --admin-user $DatabaseAdmin `
  --admin-password $DatabasePassword `
  --database-name $DatabaseName `
  --file-path (Join-Path $PSScriptRoot '001_motordeck.sql')
Assert-Success 'aplicar a migração PostgreSQL'

az appservice plan create `
  --resource-group $ResourceGroup `
  --name $planName `
  --is-linux `
  --sku B1 `
  --output none
Assert-Success 'criar o App Service Plan'

$acrLoginServer = az acr show --resource-group $ResourceGroup --name $acrName --query loginServer --output tsv
Assert-Success 'obter o endereço do registry'
$acrUsername = az acr credential show --name $acrName --query username --output tsv
$acrPassword = az acr credential show --name $acrName --query 'passwords[0].value' --output tsv

az acr build --registry $acrName --image motordeck:latest (Join-Path $PSScriptRoot '../..')
Assert-Success 'compilar e enviar a imagem para o Azure Container Registry'

az webapp create `
  --resource-group $ResourceGroup `
  --plan $planName `
  --name $AppName `
  --deployment-container-image-name "$acrLoginServer/motordeck:latest" `
  --output none
Assert-Success 'criar o Web App'

$appOrigin = "https://$AppName.azurewebsites.net"
$settings = [ordered]@{
  APP_ENV = 'production'
  APP_ORIGIN = $appOrigin
  DATABASE_URL = $databaseUrl
  DATABASE_SSL = ''
  ADMIN_SETUP_TOKEN = $AdminSetupToken
  RESEND_API_KEY = $ResendApiKey
  AUTH_FROM_EMAIL = $AuthFromEmail
  PLACAEFIPE_API_KEY = $PlacaEfipeApiKey
  WEBSITES_PORT = '3000'
  WEBSITES_CONTAINER_START_TIME_LIMIT = '1800'
}
$settingsPath = Join-Path $env:TEMP "motordeck-settings-$([Guid]::NewGuid()).json"
$settings | ConvertTo-Json | Set-Content -LiteralPath $settingsPath -Encoding utf8
try {
  az webapp config appsettings set `
    --resource-group $ResourceGroup `
    --name $AppName `
    --settings "@$settingsPath" `
    --output none
  Assert-Success 'configurar os segredos do Web App'
}
finally {
  Remove-Item -LiteralPath $settingsPath -Force -ErrorAction SilentlyContinue
}

az webapp config container set `
  --resource-group $ResourceGroup `
  --name $AppName `
  --docker-custom-image-name "$acrLoginServer/motordeck:latest" `
  --docker-registry-server-url "https://$acrLoginServer" `
  --docker-registry-server-user $acrUsername `
  --docker-registry-server-password $acrPassword `
  --output none
Assert-Success 'configurar o acesso ao registry'

Write-Output "Aplicação: $appOrigin"
Write-Output "Health check: $appOrigin/api/health"
Write-Output "Resource group: $ResourceGroup"
