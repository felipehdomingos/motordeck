# MotorDeck

Site para apresentar veículos particulares, serviços de intermediação de vendas e consórcio automotivo, com atendimento pelo WhatsApp.

## Objetivo

Criar uma presença digital profissional, moderna e responsiva que facilite a consulta de veículos e transforme o interesse dos visitantes em contatos comerciais.

## Escopo

- **Catálogo de veículos particulares:** listagem com fotos, informações principais e filtros; página individual com galeria, descrição, características e disponibilidade.
- **Intermediação de vendas:** apresentação do serviço e chamada para quem deseja vender seu veículo.
- **Consórcio automotivo:** página explicativa com encaminhamento para atendimento e simulação pelo WhatsApp.
- **Vídeos:** espaço para conteúdos sobre veículos e serviços.
- **Instagram:** links para o perfil na primeira versão e preparação para uma integração futura, conforme os recursos disponíveis da plataforma.
- **WhatsApp:** botões de contato nas páginas e mensagens contextualizadas para cada veículo ou serviço.
- **Painel administrativo:** acesso protegido para gerenciar veículos, fotos, vídeos e informações comerciais.
- **Experiência e visibilidade:** layout adaptado a celulares, tablets e computadores, acessibilidade, bom desempenho e estrutura otimizada para mecanismos de busca.

## Estrutura prevista

1. Início.
2. Catálogo de veículos.
3. Detalhes do veículo.
4. Intermediação de vendas.
5. Consórcio automotivo.
6. Vídeos.
7. Sobre e contato.
8. Painel administrativo com autenticação.
9. Política de privacidade, conforme os dados e serviços utilizados.

## Situação do projeto

Primeira interface implementada em Next.js (App Router), TypeScript e Tailwind CSS, com Manrope servida pelo próprio projeto. A instalação foi tentada, mas o ambiente negou acesso ao registro npm (`EACCES`). Não há execução local, build ou validação visual confirmados. Nenhum serviço externo foi criado e nenhuma publicação foi realizada.

### Executar no Windows

Na pasta do projeto MotorDeck, com acesso ao registro npm:

```powershell
npm.cmd install --cache .npm-cache
npm.cmd run dev
```

Quando o terminal confirmar que o servidor está pronto, abra `http://localhost:3000`. Esse é o endereço previsto; ainda não foi validado neste ambiente. O servidor fica limitado à própria máquina (`127.0.0.1`). Use `npm.cmd` para evitar o bloqueio de scripts PowerShell de `npm.ps1`.

Verificações antes de aprovar uma versão:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

O primeiro `npm install` bem-sucedido deve gerar o `package-lock.json`; mantenha esse arquivo versionado e passe a usar `npm.cmd ci` nas instalações seguintes. Não existe lockfile nesta entrega porque o download foi bloqueado.

### Estrutura do código

- `src/app`: páginas, layout, estilos, metadados e regras de indexação.
- `src/components`: cabeçalho, rodapé, cartões, filtros e formulário reutilizável.
- `src/lib/data.ts`: tipos de veículo e utilitários de contato.
- `.env.example`: variáveis previstas, sem credenciais.

### Implementado nesta versão

- Início, catálogo, filtros por marca/preço/ano/tipo e páginas individuais.
- Serviços de intermediação e consórcio, sobre, contato, vídeos e privacidade.
- Estados de disponibilidade, reservado e vendido nos anúncios gravados no Supabase.
- Formulários com validação HTML e preparação de mensagem revisável no WhatsApp. Não armazenam leads nem simulam envio.
- Layout responsivo, componentes compartilhados, navegação por teclado e fontes locais após instalação.
- Placeholders identificados para imagens originais; nenhuma fotografia, logotipo ou avaliação inventada.
- Painel administrativo autenticado com cadastro de veículos e fotos no Supabase.

### Pendências para uma aplicação administrável

- Aprovar e validar visualmente a interface em execução.
- Configurar os projetos PostgreSQL de stage e produção e aplicar a migração do cadastro.
- Implementar sessão segura, autorização no servidor e políticas RLS para proprietário e conteúdo publicado.
- Gerenciar textos, depoimentos e solicitações.
- Implementar recepção de formulários com validação no servidor, proteção contra abuso e persistência segura.
- Receber logotipo, fotos, anúncios, vídeos, trajetória, depoimentos autorizados e URL do Google.
- Confirmar administradora e informações comerciais do consórcio e revisar a política de privacidade.
- Criar sitemap e ativar indexação somente com conteúdo real e domínio confirmado. A prévia possui `noindex` e bloqueio em `robots.txt`.
- Executar TypeScript, lint, build, testes de filtros, formulários, autorização, uploads e revisão em celular antes de publicar.

O cadastro usa PostgreSQL no Supabase. Consulte o [guia de implantação de stage e produção](#stage-e-produção).

## Diretrizes

- Priorizar a experiência no celular e o contato pelo WhatsApp.
- Exibir informações claras e atualizadas sobre os veículos e serviços.
- Proteger o painel administrativo e validar os dados enviados.
- Preparar conteúdo, URLs e metadados para indexação no Google, sem prometer posição nos resultados.
- Usar imagens otimizadas e carregar vídeos de modo a preservar o desempenho.
- Manter credenciais e dados sensíveis fora do código público.
- Realizar alterações somente dentro da pasta do projeto MotorDeck.

## Stage e produção

Use a mesma imagem Docker em duas aplicações e crie **dois projetos PostgreSQL no Supabase**, um para cada ambiente. Cada aplicação recebe somente a URL e os segredos do próprio projeto.

| Ambiente | Configuração | Acesso |
| --- | --- | --- |
| Stage | [stage.env.example](deploy/stage.env.example) | Credenciais de stage em todo o site. A rota de saúde é pública. |
| Produção | [production.env.example](deploy/production.env.example) | Catálogo público. Painel e API de administração protegidos. |

1. Em cada projeto Supabase, habilite a Data API e execute a [migração de veículos](supabase/migrations/20261124000100_vehicles.sql) no SQL Editor. Use a URL do projeto e uma chave secreta `sb_secret_…` desse mesmo projeto. A chave é exclusiva do servidor. [Data API do Supabase](https://supabase.com/docs/guides/api/creating-routes)
2. Configure uma aplicação a partir do [Dockerfile](Dockerfile) em cada ambiente. Cadastre as variáveis do arquivo de exemplo correspondente no gerenciador de segredos da hospedagem. Use senhas administrativas diferentes, com 24 ou mais caracteres aleatórios. Configure HTTPS e informe em `APP_ORIGIN` a origem final do ambiente, sem barra no fim. Encaminhe as requisições para a porta 3000, preservando os cabeçalhos `Authorization` e `Origin`. Permita corpos de requisição de pelo menos 7 MiB para o upload de fotos.
3. Configure a verificação de prontidão HTTP em `/api/health`. Espere HTTP 200 nos dois ambientes antes de enviar tráfego. HTTP 503 indica que o esquema ou a conexão com o banco ainda precisa ser configurado.
4. No stage, abra `/admin`, salve um rascunho com foto e confirme que a URL do anúncio retorna 404. Publique, confira o anúncio e a foto no catálogo, marque como vendido e confirme que saíram do catálogo. Confira que esse veículo nunca apareceu em produção.
5. Promova a mesma imagem validada para produção, com as variáveis de produção. Teste o catálogo em uma janela anônima e confira que `/admin` e `/api/admin/vehicles` solicitam credenciais. Em produção, cadastre apenas anúncios reais. A indexação já está desativada no projeto.

### Teste local

```sh
docker build -t motordeck .
docker run --rm --env-file deploy/stage.env -p 3000:3000 motordeck
```

Para o container, use a origem HTTPS de um proxy local ou da hospedagem. Com `npm run dev`, use uma cópia de [.env.example](.env.example) em `.env.local` e configure `APP_ORIGIN` com o endereço exato aberto no navegador. Configure o Supabase também no ambiente local. O catálogo e o painel usam o banco em todos os ambientes.

### Cadastros e fotos

Para ativar **Consultar placa** no painel, gere uma [chave de API no Placa & FIPE](https://placaefipe.com.br/docs/autenticacao) e cadastre `PLACAEFIPE_API_KEY` no gerenciador de segredos do ambiente. Use uma chave `pf_live_` para consultar dados reais. Para teste local, use `.env.local`. O botão faz uma consulta básica quando clicado. Confira os dados, escolha a versão FIPE se houver opções e informe o preço de anúncio antes de salvar.

O painel grava cada veículo com até 12 fotos JPEG comprimidas em uma única operação no PostgreSQL. O catálogo só retorna anúncios publicados e disponíveis ou reservados. Placa, dados da FIPE e rascunhos ficam restritos ao painel.

### API de veículos

- `GET /api/vehicles` lista os anúncios publicados.
- `GET /api/vehicles/:slug` consulta um anúncio publicado pelo identificador.
- `GET /api/vehicle-photos/:slug/:position` recupera a foto do anúncio.
- `/api/admin/vehicles` fornece o cadastro, a consulta e a exclusão com autenticação.

As rotas e as páginas públicas acessam o Supabase pelo servidor. O ambiente de stage exige autenticação para consultar o catálogo e a API.
