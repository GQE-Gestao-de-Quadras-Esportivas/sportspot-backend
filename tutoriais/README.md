# SportSpot: tutoriais em funcionamento (API REST, RabbitMQ, GraphQL e API Gateway)

> **Grupo [NN]**: Bruno Perez · Gustavo Andriani · Pedro Riva · Matheus Becassi · Luccas Julio
> Disciplina: Modelagem de Padrões de Projeto · Entrega final do bimestre (17/11/2026)

---

## 1. Tema e núcleo implementado

O **SportSpot** é a plataforma do nosso projeto Fio-condutor para **aluguel de quadras esportivas**: o proprietário (locador) cadastra suas quadras (esporte, tipo de piso, preço por hora, endereço, recursos como iluminação e vestiário) e acompanha a agenda; o atleta encontra uma quadra e reserva um horário. Ao longo do semestre o grupo construiu um frontend Angular (painel do proprietário: cadastro de quadra e grade de agendamentos) e um backend Express + TypeORM + PostgreSQL com autenticação JWT, entidades `Courts`, `Appointments`, `AuthUsers` e `UserDetails`. Esses dois repositórios são a referência deste trabalho.

O **núcleo escolhido** para demonstrar as quatro tecnologias é o ciclo **quadra → reserva → reação à reserva**: os recursos `quadras` (CRUD completo) e `agendamentos` (reservar, consultar, cancelar), mais `atletas` e `proprietarios` (leitura). Deixamos de fora cadastro de usuários, pagamento e avaliações, porque não acrescentam nada técnico novo aos tutoriais. A reserva é onde estão as regras mais ricas do tema (conflito de horário, horário de funcionamento, iluminação noturna, prazo de cancelamento) e é ela que dispara o evento `agendamento.criado`, que alimenta as notificações, o faturamento do proprietário e a auditoria. A tela "Agendamentos" do painel Angular virou a consulta GraphQL *Agenda do proprietário*, e o card de uma quadra com a agenda do dia virou a rota agregada `/api/painel/quadras/:id`.

## 2. Pré-requisitos

- **Node.js 22 ou superior** (`node --version`)
- **Docker Desktop em execução** (o motor precisa estar ligado: `docker info` deve mostrar a seção *Server*)
- Portas livres: **3000** (gateway), **3001** (API REST), **3002** (GraphQL), **5672** e **15672** (RabbitMQ)
- No Windows, use o **PowerShell** e chame o curl como `curl.exe` (no PowerShell, `curl` é outro comando)

## 3. Como executar (passo a passo, nesta ordem)

Todos os comandos são executados dentro da pasta `tutoriais/`.

**Passo 1. Instalar as dependências (uma vez só)**

```bash
npm install
```

**Passo 2. Subir o RabbitMQ (Docker Desktop aberto)**

```bash
docker compose up -d
```

Espere uns 15 segundos e confira o painel em http://localhost:15672 (usuário `guest`, senha `guest`, que são os padrões locais da imagem oficial).

**Passo 3. Abrir 4 terminais na pasta `tutoriais/` e rodar um comando em cada um, nesta ordem:**

| Terminal | Comando | Processo | Endereço | Acesso |
|---|---|---|---|---|
| 1 | `npm run rest` | API REST (Parte 1) + publicador de eventos | `127.0.0.1:3001` | só interno |
| 2 | `npm run consumidores` | 3 consumidores RabbitMQ (Parte 2) | sem porta | só interno |
| 3 | `npm run graphql` | Servidor GraphQL, Apollo (Parte 3) | `127.0.0.1:3002` | só interno |
| 4 | `npm run gateway` | API Gateway (Parte 4) | `0.0.0.0:3000` | **público (único)** |
| (Docker) | `docker compose up -d` | RabbitMQ 4 + painel | `127.0.0.1:5672` e `127.0.0.1:15672` | local |

Se preferir um terminal por consumidor: `npm run consumidor:notificacoes`, `npm run consumidor:faturamento` e `npm run consumidor:auditoria`.

**Passo 4. Um 5º terminal para os scripts de demonstração** (seção 5). Teste rápido:

```bash
curl.exe -i -H "X-API-Key: chave-painel-proprietario-456" http://localhost:3000/api/quadras
```

**Testes automatizados** (não precisam do RabbitMQ nem dos serviços no ar):

```bash
npm test
```

**Ambiente completo com um só comando (opcional).** O `compose.yaml` tem um perfil que sobe RabbitMQ, API REST, GraphQL, consumidores e gateway em contêineres, e só o gateway fica exposto (porta 3000):

```bash
docker compose --profile completo up -d --build
```

Para encerrar: `Ctrl+C` em cada terminal e `docker compose down` (use `docker compose down -v` para apagar também as filas e mensagens guardadas).

## 4. Chaves e usuários de teste (todos fictícios)

| Cliente (ator) | Chave `X-API-Key` | Plano | O que pode fazer |
|---|---|---|---|
| `app-atleta`: aplicativo do atleta | `chave-app-atleta-123` | 10 req/min | ler quadras, atletas e reservas; reservar e cancelar; GraphQL |
| `painel-proprietario`: painel web do dono | `chave-painel-proprietario-456` | 60 req/min | tudo, inclusive cadastrar/alterar/remover quadras e a rota agregada |
| `parceiro-marketplace`: parceiro externo | `chave-parceiro-789` | 30 req/min | só ler o catálogo (`GET /api/quadras`, `/api/proprietarios`) |

Variante com JWT: `POST /api/auth/token` com `{"email": "...", "senha": "..."}` devolve um token de 15 minutos para usar em `Authorization: Bearer <token>`.

| Usuário | E-mail | Senha | Papel |
|---|---|---|---|
| Ana Beatriz Souza (atleta `a1`) | `ana.souza@email-exemplo.test` | `senha-demo-atleta` | atleta (plano app-atleta) |
| Carla Menezes (proprietária `p1`) | `carla.menezes@arena-exemplo.test` | `senha-demo-proprietario` | proprietário (plano painel) |

Dados carregados ao iniciar a API (em memória): proprietários `p1` e `p2`; quadras `q1` a `q5` em Araraquara-SP; atletas `a1` a `a4` (o `a4` tem o e-mail digitado errado de propósito, para a cena da DLQ); 6 reservas para **amanhã**.

## 5. Roteiro da demonstração (8 cenas)

Antes de começar: Docker Desktop aberto, `docker compose up -d` feito, os 4 terminais rodando e o painel do RabbitMQ aberto no navegador.

| Cena | Comando (5º terminal) | O que mostrar |
|---|---|---|
| **1. Ambiente no ar** | `curl.exe http://localhost:3000/health` e `netstat -ano \| findstr ":300"` (Linux/macOS: `lsof -iTCP -sTCP:LISTEN \| grep node`) | os 4 terminais e a tabela de portas; 3001 e 3002 aparecem em `127.0.0.1`, só a 3000 em `0.0.0.0` |
| **2. API REST pelo gateway** | `npm run cena:cliente` | 201 com `Location` (`/api/quadras/q6`, reescrito pelo gateway), GET/PUT/PATCH/DELETE (200/204/404), filtro, ordenação e teto de paginação; 422 RN01 (futebol em areia), 400, 415, 409 RN08 e 403, todos em Problem Details |
| **3. Evento** | `npm run cena:agendamento` | 201 na reserva, regras RN02 (409), RN03-RN06 (422), cancelamento RN07. No terminal dos consumidores: `agendamento.criado` chega a **notificacoes**, **faturamento** e **auditoria**; `quadra.*` (cena 2) chega só à auditoria |
| **4. Falha e duplicidade** | `npm run cena:falha` e depois `npm run cena:duplicidade` | reserva do atleta `a4` (e-mail inválido): 3 tentativas com 2 s de espera, depois `sportspot.notificacoes.dlq` (ver no painel); a mesma mensagem publicada 2 vezes: "mensagem duplicada ignorada" e receita somada uma vez só |
| **5. GraphQL** | `npm run cena:graphql` | consulta *Agenda do proprietário* (proprietário > quadras > reservas > atleta): **1 chamada** do cliente no lugar de **8** chamadas REST; o GraphQL faz só 4 graças ao DataLoader. Filtro, mutation `agendarQuadra` e erros com `code` |
| **6. Proteções do gateway** | `npm run cena:gateway` | 200, 401, 403, JWT, **429** com `Retry-After`, **504** (timeout). Quando o script pedir, dê `Ctrl+C` na API REST: **502**, 502 e **503** (o disjuntor abre na 3ª falha seguida; o 504 logo antes já contou como a 1ª). Religue com `npm run rest`: depois de até 15 s volta o 200 |
| **7. Rota agregada** | `npm run cena:painel` | `/api/painel/quadras/q1`: completa (`parcial: false`); quando o script pedir, dê `Ctrl+C` no GraphQL: resposta **parcial** (`parcial: true`, agenda `null`, aviso). Religue com `npm run graphql` |
| **8. Fechamento** | `npm run cena:rastreio` | o mesmo `X-Request-Id` nos logs do **gateway**, da **API REST** (requisição e publicação do evento) e dos **consumidores**. Mostrar o diagrama (relatório, seção 2) e 2 decisões da seção 6 |

Comandos longos prontos para copiar (PowerShell):

```powershell
# Criar uma reserva (o corpo vai em arquivo para evitar problemas de aspas)
'{"quadraId":"q1","atletaId":"a2","inicio":"2026-12-01T10:00:00-03:00","duracaoMinutos":60}' | Out-File -Encoding ascii reserva.json
curl.exe -i -X POST http://localhost:3000/api/agendamentos -H "X-API-Key: chave-app-atleta-123" -H "Content-Type: application/json" -d "@reserva.json"

# Rota agregada (sem ?data= mostra o dia de hoje; as reservas de exemplo são de AMANHÃ, então informe a data de amanhã)
curl.exe -i -H "X-API-Key: chave-painel-proprietario-456" "http://localhost:3000/api/painel/quadras/q1?data=2026-11-18"

# Sem chave (401)
curl.exe -i http://localhost:3000/api/quadras
```

O Apollo Sandbox pode ser aberto localmente em http://127.0.0.1:3002 (só na máquina da demonstração; de fora, o GraphQL só é acessível pelo gateway em `/api/graphql`).

## 6. Decisões e limitações (resumo; detalhes no relatório)

**Decisões**

- **Um único ponto de entrada.** O gateway é o único processo em `0.0.0.0`. Ele gera o `X-Request-Id`, autentica, aplica o plano do cliente, autoriza a rota e só repassa os cabeçalhos da lista de permissão. API REST e GraphQL ouvem em `127.0.0.1`.
- **A API REST é a dona dos dados e das regras.** O GraphQL não tem banco: busca tudo na API REST, com DataLoader para evitar o N+1. Assim as regras RN01 a RN08 ficam em um lugar só.
- **Evento depois da gravação, com Outbox.** A reserva e o evento são gravados juntos; um publicador com *publisher confirms* envia para a exchange `topic` `sportspot.eventos`. A API responde 201 sem esperar os consumidores e continua aceitando reservas mesmo com o RabbitMQ fora do ar.
- **Consumidores independentes.** Cada um tem fila durável própria, padrões de ligação próprios (`agendamento.*`, `agendamento.criado` + `agendamento.cancelado`, `#`), ack manual, prefetch 5, até 3 tentativas via fila de espera (TTL) e DLQ. A idempotência usa o `eventId`, gravado em disco junto com o efeito.
- **Erros padronizados.** Problem Details (RFC 9457) na API e no gateway: 400 (malformado), 415, 422 (validação/regra), 409 (conflito).

**Limitações do protótipo**

- Dados da API REST **em memória**: reiniciar a API volta ao estado inicial (em produção: PostgreSQL, como no backend original, com a outbox em tabela na mesma transação).
- Limite de uso e disjuntor **em memória de um único gateway**: com três cópias, cada uma contaria separado (em produção: Redis ou um gateway gerenciado).
- O `X-Cliente-Id`/`X-Usuario-Id` repassado aos serviços **não é assinado**: os serviços confiam na rede interna (em produção: mTLS ou token assinado entre serviços).
- Gateway como **ponto único de falha** (em produção: várias réplicas atrás de um balanceador).
- Consistência eventual: o faturamento e as notificações podem ficar alguns instantes atrás da API.

## 7. Divisão de responsabilidades

Todos participaram de todas as partes; a tabela indica o **responsável principal**.

| Parte | Responsável principal | Pastas/arquivos |
|---|---|---|
| Parte 1: API REST e OpenAPI | Bruno Perez | `rest/`, `openapi.yaml`, `testes/cliente.js` |
| Parte 2: Mensageria | Gustavo Andriani | `mensageria/`, `rest/publicador.js`, `compose.yaml`, `testes/falha-dlq.js`, `testes/duplicidade.js` |
| Parte 3: GraphQL | Pedro Riva | `graphql/`, `testes/graphql.js` |
| Parte 4: API Gateway | Matheus Becassi | `gateway/`, `testes/teste-gateway.js`, `testes/painel.js` |
| Parte 5: Integração, relatório e slides | Luccas Julio | `relatorio-tutoriais.pdf`, `apresentacao.pdf`, `testes/rastreio.js`, `testes/rotas.test.js` |
| Documentação do semestre e índice | Luccas Julio (com apoio de todos) | `documentacao/`, `00-indice.pdf` |

## 8. Uso de ferramentas de IA

| Ferramenta | Para quê | Como foi verificado |
|---|---|---|
| Claude (Anthropic), via Claude Code | rascunho do código das quatro partes a partir dos tutoriais e dos repositórios do grupo, do `openapi.yaml`, deste README, do relatório e dos slides | o grupo executou os scripts de demonstração e o `npm test`, revisou e ajustou o código e os textos, e cada responsável sabe explicar a sua parte |
| [outras ferramentas usadas pelo grupo, se houver] | [finalidade] | [como foi verificado] |

## 9. Repositório e vídeo de reserva

- Repositório Git: **[link do GitHub/GitLab]**. Tags: `etapa-1-rest`, `etapa-2-mensageria`, `etapa-3-graphql`, `etapa-4-gateway`, `entrega-final`
- Vídeo de reserva (até 10 min, demonstração completa): **[link do vídeo]**

## 10. Estrutura

```
tutoriais/
├── README.md            este arquivo
├── compose.yaml         RabbitMQ (e, no perfil "completo", todo o ambiente)
├── Dockerfile           imagem usada pelo perfil "completo"
├── openapi.yaml         contrato da API REST (vista pelo gateway)
├── package.json         dependências e scripts (npm run ...)
├── .env.example         variáveis opcionais, com valores de exemplo
├── shared/              configuração, logger com X-Request-Id, Problem Details
├── rest/                Parte 1: app.js (rotas), dominio.js (regras), dados.js (memória + outbox), publicador.js
├── mensageria/          Parte 2: consumidor-base.js, notificacoes, faturamento, auditoria, todos.js
├── graphql/             Parte 3: schema.js, resolvers.js, carregadores.js (DataLoader), rest-cliente.js
├── gateway/             Parte 4: app.js, clientes.js (chaves e planos), disjuntor.js
└── testes/              scripts das cenas e rotas.test.js (node --test)
```

Gerados durante a execução (fora do Git): `logs/` (um arquivo por componente, em JSON), `mensageria/dados/` (ids processados e estado dos consumidores) e `mensageria/saida/` (e-mails simulados e trilha de auditoria).

## 11. Problemas conhecidos

| Sintoma | Solução |
|---|---|
| `docker: error during connect` | abra o Docker Desktop e espere o motor iniciar |
| consumidores repetem "RabbitMQ indisponível" | rode `docker compose up -d` e espere o broker subir; eles reconectam sozinhos |
| `PRECONDITION_FAILED` | uma fila `sportspot.*` já existe com outros argumentos: apague-a no painel ou rode `docker compose down -v` |
| `EADDRINUSE` | a porta já está em uso: feche o processo anterior (Ctrl+C) |
| 502 no gateway | o serviço de destino não está rodando: suba a API REST e o GraphQL antes do gateway |
| 415 ao enviar corpo | faltou `-H "Content-Type: application/json"` |
| 429 durante os scripts | o plano `app-atleta` permite 10 req/min: espere o `Retry-After` |
| a reserva de exemplo dá 409 ou 422 | os scripts procuram sozinhos um horário livre; nos comandos manuais, troque a data por uma futura |

## 12. Referências

- FIELDING, R. T. *Architectural Styles and the Design of Network-based Software Architectures*. 2000. Tese (Doutorado), University of California, Irvine.
- NOTTINGHAM, M.; WILDE, E.; DALAL, S. *RFC 9457: Problem Details for HTTP APIs*. IETF, 2023.
- FIELDING, R.; NOTTINGHAM, M.; RESCHKE, J. *RFC 9110: HTTP Semantics*. IETF, 2022.
- OPENAPI INITIATIVE. *OpenAPI Specification 3.1.0*. 2021.
- RABBITMQ. *Documentation: Reliability Guide, Dead Letter Exchanges, Consumer Acknowledgements and Publisher Confirms*. Broadcom, 2025.
- THE GRAPHQL FOUNDATION. *GraphQL Specification* e *DataLoader*. 2021.
- APOLLO GRAPH. *Apollo Server 5 Documentation*. 2025.
- RICHARDSON, C. *Microservices Patterns*. Shelter Island: Manning, 2018 (API Gateway, Transactional Outbox, Circuit Breaker).
- NYGARD, M. T. *Release It!*. 2. ed. Raleigh: Pragmatic Bookshelf, 2018.
- Tutoriais da disciplina: API REST, Mensageria, GraphQL e API Gateway.
