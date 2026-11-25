# Deploy na AWS: ECS Express Mode + RDS PostgreSQL

Este projeto usa um container Next.js na porta `3000` e PostgreSQL para o catálogo e o painel administrativo. Para novos clientes, o AWS App Runner não está mais disponível; o equivalente recomendado é o ECS Express Mode.

## Pré-requisitos

- AWS CLI autenticado (`aws sts get-caller-identity`).
- Docker Desktop em execução.
- VPC default com duas subnets públicas na região escolhida.
- Permissões para ECR, ECS, IAM, RDS, EC2, Secrets Manager e CloudWatch Logs.

## Deploy automatizado

No PowerShell, a partir da raiz do projeto:

```powershell
.\deploy\aws\deploy-ecs-express.ps1 -Region us-east-2 -ApproveCharges
```

O script cria o RDS PostgreSQL, aplica as migrações de `deploy/migrations/`, envia a imagem para o ECR e cria o serviço ECS Express Mode com HTTPS, health check em `/api/health`, logs e Secrets Manager. Ele solicita o token inicial do administrador e a senha do PostgreSQL sem gravá-los no Git.

O parâmetro `-ApproveCharges` é obrigatório porque RDS, Fargate, ALB, ECR e CloudWatch podem gerar cobrança.

## Deploy automático pelo GitHub

Para não depender do Docker Desktop local, execute uma única vez no PowerShell autenticado:

```powershell
.\deploy\aws\bootstrap-github-actions.ps1 -Region us-east-2
```

Depois faça commit e push da pasta `.github/workflows` na branch `main`. Cada push na `main` executará o workflow `Deploy MotorDeck`, construirá a imagem no runner do GitHub, publicará no ECR e criará ou atualizará o serviço ECS Express Mode.

Se o workflow informar `Not authorized to perform sts:AssumeRoleWithWebIdentity`, corrija somente a confiança OIDC sem repetir o setup do RDS:

```powershell
.\deploy\aws\repair-github-oidc.ps1 -Region us-east-2
```

Se o push da imagem falhar com `403 Forbidden` ao consultar um manifesto no ECR, após integrar a correção à `main`, execute novamente o bootstrap atualizado da `main` para aplicar a permissão `ecr:BatchGetImage` ao role de deploy. Use o mesmo token inicial do administrador e a mesma senha do PostgreSQL, pois o bootstrap atualiza o secret de produção. Depois execute o workflow novamente.

O workflow usa GitHub OIDC com credenciais AWS temporárias; nenhuma access key permanente fica no GitHub.

## Variáveis do serviço

O script configura no serviço, sem commitar valores reais:

```text
APP_ENV=production
APP_ORIGIN=https://motordeck.ecs.us-east-2.on.aws
DATABASE_URL=postgresql://...
DATABASE_SSL=
ADMIN_SETUP_TOKEN=<token aleatório com pelo menos 24 caracteres>
```

O serviço escuta na porta `3000`. O ECS Express Mode fornece a URL HTTPS `https://<service-name>.ecs.<region>.on.aws` e gerencia o balanceador, TLS, auto scaling e monitoramento.

## Publicação

1. Execute o script na mesma máquina onde o `aws login` foi feito.
2. Aguarde o RDS e o ECS Express Mode concluírem.
3. Aguarde o health check em `/api/health` retornar HTTP 200.
4. Acesse `/login` e use o `ADMIN_SETUP_TOKEN` uma única vez para criar o primeiro administrador.

Não coloque senhas, tokens, chaves de API ou a `DATABASE_URL` real neste arquivo ou no Git. O script usa o Secrets Manager para os valores sensíveis.

## Migrações e clientes (multi-tenant)

O banco é versionado por arquivos SQL em `deploy/migrations/` (`NNN_nome.sql`). A própria aplicação aplica as migrações pendentes ao iniciar (`deploy/start.mjs`), com trava no banco para que duas tasks não migrem ao mesmo tempo; o RDS só aceita conexões das tasks, por isso o deploy do GitHub Actions não consegue rodá-las. A tabela `schema_migrations` registra o que já foi aplicado. Uma migração nova entra como um arquivo novo, nunca editando um já aplicado.

Cada cliente é um registro em `tenants`, com um ou mais domínios em `tenant_domains`; o cliente de cada requisição é decidido pelo cabeçalho `Host`. Ao iniciar, o domínio de `APP_ORIGIN` é associado ao cliente inicial (`BOOTSTRAP_TENANT_SLUG`, padrão `mesquiatti`). Para rodar os testes de isolamento: `npm test`.

## Painel da plataforma (dono)

- Endereço: `/plataforma` nos domínios listados em `PLATFORM_HOSTS` (padrão: o host de `APP_ORIGIN`). Quando existir um domínio próprio, defina `PLATFORM_HOSTS=painel.motordeck.com.br`.
- Primeiro acesso: em `/plataforma/login`, enquanto não existir nenhum superadmin, a tela pede o `ADMIN_SETUP_TOKEN` (só o dono da plataforma usa esse código). Depois disso o cadastro fecha sozinho.
- Cadastro de cliente: nome, identificador, domínio e administrador. O administrador recebe um convite por e-mail (Resend: `RESEND_API_KEY` e `AUTH_FROM_EMAIL`); sem e-mail configurado, o painel mostra o link para repassar.
- Não existe cadastro aberto nos sites dos clientes: só login, definir senha pelo convite, esqueci a senha e troca de senha. Usuários secundários também entram por convite.
- Cada domínio de cliente precisa apontar para o serviço e ter certificado HTTPS no balanceador; o cadastro no painel só diz ao sistema qual cliente atende aquele domínio.
