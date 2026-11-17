# SportSpot — Grupo 03

**Modelagem de Padrões de Projeto · Entrega final do bimestre · Projeto Fio-Condutor**

Integrantes:
- Bruno Klein de Avellar Perez
- Gustavo José Andriani
- Luccas Henrique Romano Júlio
- Matheus Alessandro Becassi
- Pedro Henrique Riva

---

## 1. Tema e núcleo implementado

O **SportSpot** é uma plataforma de locação de quadras poliesportivas. Ela conecta atletas que procuram
um lugar e um horário para jogar a proprietários que querem divulgar e gerenciar seus espaços. No semestre,
o grupo identificou como requisito mais crítico a **prevenção de reserva duplicada** (ASR 4, ligado ao
atributo de qualidade nº 1, Confiabilidade): chegar à quadra e encontrar outro time jogando é a falha que mais
destrói a confiança no produto.

Do tema completo, implementamos o **núcleo de quadras e reservas**:
- cadastro e busca de quadras (RF03 e RF06);
- reserva de horário com bloqueio de conflito (RF08 e ASR 4);
- cancelamento sem exclusão física, conforme o caderno de restrições;
- notificação assíncrona de jogador e proprietário (RF10);
- faturamento previsto;
- painel do proprietário (RF05), servido por GraphQL e por uma rota agregada no gateway.

Ficaram de fora o pagamento via Stripe, a pré-reserva com TTL no Redis, as avaliações, o upload de fotos e o
chat. Eles não são necessários para demonstrar as quatro tecnologias e dependem de serviços externos; a
justificativa está no relatório (seção "Relação com a documentação do semestre").

## 2. Arquitetura

```
                        ┌──────────── só 127.0.0.1 ──────────────────────────────────┐
 Jogador / Painel  ──►  │  Gateway :8080 ──► API REST :3000 ──► PostgreSQL :5432     │
 (X-API-Key + JWT)      │      │   │              │                                  │
                        │      │   └──► GraphQL :4000 ──(HTTP)──► API REST            │
                        │      │                  │ publica eventos                   │
                        │      │                  ▼                                   │
                        │      │          RabbitMQ :5672 (exchange topic)             │
                        │      │             │                   │                    │
                        │      │      notificacoes         faturamento ──► :3100      │
                        │      └──── rota agregada (painel) ◄──────────────┘          │
                        └────────────────────────────────────────────────────────────┘
```

- **Fluxo síncrono:** cliente → gateway → API REST ou GraphQL → API REST.
- **Fluxo assíncrono:** API REST → RabbitMQ → consumidores.
- **Porta pública:** só a do gateway. Os demais serviços escutam apenas em `127.0.0.1`.

## 3. Pré-requisitos

- **Node.js 22 ou superior** (`node -v`)
- **Docker Desktop em execução**, para o RabbitMQ (`docker info` deve mostrar a seção *Server*)
- **PostgreSQL 14 ou superior**, com um banco vazio chamado `sportspot`. Sem Postgres instalado:
  ```bash
  docker run -d --name sportspot-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=sportspot -p 127.0.0.1:5432:5432 postgres:16
  ```

## 4. Como executar

Todos os comandos rodam a partir **desta pasta** (`tutoriais/`). No `cmd` do Windows, use `cd /d` para trocar de unidade.

**1. Subir o RabbitMQ**

```bash
docker compose up -d
```

O painel fica em http://localhost:15672 (usuário `guest`, senha `guest`).

**2. Instalar as dependências**

```bash
npm run instalar
```

Ele roda `npm install` na raiz, em `rest/`, `mensageria/`, `graphql/` e `gateway/`.

**3. Configurar a API**

```bash
copy rest\.env.example rest\.env        # Windows
cp rest/.env.example rest/.env          # Linux/macOS
```

Ajuste `DB_URL` no `rest/.env` se o seu Postgres tiver outra senha.

**4. Subir os processos, cada um em um terminal e nesta ordem**

| # | Processo | Comando | Porta | Sinal de que subiu |
|---|---|---|---|---|
| 1 | API REST | `npm run rest` | 3000 (só 127.0.0.1) | `🚀 API REST em http://127.0.0.1:3000/v1/api` |
| 2 | Consumidor de notificações | `npm run notificacoes` | nenhuma | `aguardando eventos na fila "notificacoes"` |
| 3 | Consumidor de faturamento | `npm run faturamento` | 3100 (só 127.0.0.1) | `consulta HTTP em http://127.0.0.1:3100` |
| 4 | Servidor GraphQL | `npm run graphql` | 4000 (só 127.0.0.1) | `🔷 GraphQL em http://127.0.0.1:4000/` |
| 5 | API Gateway | `npm run gateway` | **8080 (pública)** | `🚪 Gateway em http://localhost:8080` |
| — | RabbitMQ | `docker compose up -d` | 5672 e 15672 (só 127.0.0.1) | painel abre no navegador |
| — | PostgreSQL | já instalado ou via Docker | 5432 | — |

As tabelas são criadas automaticamente na primeira execução da API.

**5. Conferir o ambiente e criar os usuários de teste**

```bash
npm run status
npm run seed
```

O `status` mostra o que está no ar e o que é acessível de fora. O `seed` cria os usuários e as quadras de teste.

## 5. Chaves e usuários de teste (todos fictícios)

| Cliente (aplicativo) | Cabeçalho `X-API-Key` | Plano |
|---|---|---|
| `app-jogador`: aplicativo do atleta | `chave-app-jogador-123` | 10 requisições por minuto |
| `painel-locador`: painel do proprietário | `chave-painel-locador-456` | 120 requisições por minuto |

| Usuário (criado por `npm run seed`) | E-mail | Senha |
|---|---|---|
| Proprietária, com 2 quadras | `locador@sportspot.dev` | `senha-demo-123` |
| Jogador | `jogador@sportspot.dev` | `senha-demo-123` |

A **chave de API identifica o aplicativo** e é conferida no gateway. O **JWT identifica o usuário** e é conferido
na API REST, que decide quem é dono de cada quadra. O token sai de `POST /api/rest/auth/login` e vale 15 minutos;
o `npm run seed` imprime um token de cada usuário.

Os scripts de teste criam usuários novos a cada execução, então podem ser repetidos à vontade.

## 6. Roteiro da demonstração (8 cenas)

| Cena | Comando | O que mostrar |
|---|---|---|
| 1. Ambiente no ar | `npm run status` | os processos no ar e a tabela de portas: só a 8080 é acessível pela rede |
| 2. API REST pelo gateway | `npm run cliente:gateway` | 201 com `Location: /api/rest/...`; 422 e 409 das regras de negócio, em Problem Details |
| 3. Evento | (terminais 2 e 3, durante a cena 2) | os dois consumidores reagem com o mesmo `X-Request-Id`; o faturamento recebe só `agendamento.criado` |
| 4. Falha e duplicidade | `npm run evento:falha` e depois `npm run evento:duplicado` | 3 tentativas e depois `notificacoes.dlq` (mostrar no painel do RabbitMQ); a segunda entrega aparece como "já processado: ignorado" |
| 5. GraphQL | `npm run teste:graphql` | a consulta da tela do painel; "sem GraphQL, faria 5 chamadas REST"; erros `HORARIO_OCUPADO`; DataLoader |
| 6. Proteções do gateway | `npm run teste:gateway` | 401, 429 e 504; na pausa, **Ctrl+C na API** → 502, 502, 502, 503; na segunda pausa, `npm run rest` → 200 e disjuntor `FECHADO` |
| 7. Rota agregada | `npm run teste:painel` | resposta completa; na pausa, **Ctrl+C no faturamento** → `"parcial": true` com aviso |
| 8. Fechamento | diagrama (seção 2) + logs | o mesmo `X-Request-Id` (`cliente-...`) no log do gateway, da API e de um consumidor; 2 decisões da seção 7 |

> **Atenção no Windows:** depois do Ctrl+C, responda **S** em "Deseja finalizar o arquivo em lotes?".
> Se o serviço continuar respondendo, encerre pelo PID: `netstat -ano | findstr :3000` e `taskkill /PID <pid> /F`.

## 7. Decisões e limitações (resumo; o detalhe está no relatório)

| Tecnologia | Por que está no SportSpot | Sem ela | Alternativa considerada | O que se perde |
|---|---|---|---|---|
| API REST | dona das regras (horário ocupado, 24 h, histórico) e dos dados | cada cliente reimplementaria as regras | acesso direto ao banco pelo GraphQL | um salto de rede a mais para o GraphQL |
| Mensageria | notificar e faturar sem atrasar a reserva (ASR 5, RF10) | o 201 esperaria o e-mail; uma falha no e-mail derrubaria a reserva | chamada HTTP síncrona aos serviços | consistência eventual: o e-mail chega depois |
| GraphQL | o painel (RF05) precisa de usuário + quadras + reservas numa tela | 5 ou mais idas e voltas do celular à API | rota agregada em REST | cache HTTP simples; mais uma peça para operar |
| Gateway | ponto único de entrada, controle de uso por aplicativo, resiliência | cada serviço exposto e protegido separadamente | proteção dentro de cada serviço | ponto único de falha; latência extra |

**Restrições do caderno EARS que o código cumpre:**
- **Reservas nunca são apagadas.** O cancelamento é lógico, com `status: cancelada`, e uma quadra com histórico de reservas não pode ser removida.
- **Busca que passe de 4 s é abortada.** O gateway devolve 504 em Problem Details.
- **Nenhum dado de cartão é armazenado.** Não há fluxo de pagamento no protótipo.

**Limitações:**
- O evento é publicado fora da transação: se o RabbitMQ estiver fora, ele se perde (o padrão Outbox resolveria).
- O limite de uso fica em memória, por instância do gateway.
- O `X-Cliente-Id` não é verificado pela API REST.
- A idempotência é registrada em arquivo.
- O gateway é ponto único de falha.
- Não há pagamento nem pré-reserva com Redis.

## 8. Divisão de responsabilidades

| Parte | Responsável principal | Pasta |
|---|---|---|
| 1. API REST | Bruno Klein de Avellar Perez | `rest/`, `openapi.yaml`, `testes/cliente.js` |
| 2. Mensageria | Gustavo José Andriani | `mensageria/`, `compose.yaml`, `testes/evento-*.js` |
| 3. GraphQL | Pedro Henrique Riva | `graphql/`, `testes/teste-graphql.js` |
| 4. API Gateway | Matheus Alessandro Becassi | `gateway/`, `testes/teste-gateway.js`, `testes/teste-painel.js` |
| 5. Integração e decisões | Luccas Henrique Romano Júlio | relatório, diagrama, este README, `testes/status.js` |

Todos os integrantes participaram de todas as partes e sabem explicar o conjunto.

## 9. Uso de ferramentas de IA

> ⚠️ **O grupo deve revisar e completar esta seção** com o que de fato foi feito por cada integrante.

| Ferramenta | Finalidade | O que o grupo fez com o resultado |
|---|---|---|
| Claude (Anthropic) | gerar o rascunho do código das Partes 1 a 4 (API REST, consumidores, GraphQL, gateway), dos scripts de teste e deste README; sugerir correções de erros de execução | *(completar: o que cada responsável revisou, testou, alterou e rejeitou)* |
| Google Gemini | auditar os diagramas C4 e padronizar o caderno de restrições EARS (Entrega 2) | aceitou as frases de responsabilidade e o ajuste de métricas; rejeitou componentes fora da stack |

O código foi executado e testado pelo grupo em cada etapa, com os scripts da pasta `testes/`.

## 10. Links

- Repositório: https://github.com/GQE-Gestao-de-Quadras-Esportivas/sportspot-backend (tags `etapa-1-rest` a `etapa-4-gateway`)
- Vídeo de reserva da demonstração: *(adicionar o link depois do ensaio)*

## 11. Referências

INTERNATIONAL ORGANIZATION FOR STANDARDIZATION. **ISO/IEC 25010:2023**: Systems and software engineering — Systems and software Quality Requirements and Evaluation (SQuaRE) — Product quality model. Genebra: ISO, 2023.

BASS, L.; CLEMENTS, P.; KAZMAN, R. **Software Architecture in Practice**. 4. ed. Boston: Addison-Wesley Professional, 2021.

FIELDING, R.; NOTTINGHAM, M.; RESCHKE, J. **RFC 9110**: HTTP Semantics. IETF, 2022. Disponível em: https://www.rfc-editor.org/rfc/rfc9110. Acesso em: 16 nov. 2026.

NOTTINGHAM, M.; WILDE, E.; DALAL, S. **RFC 9457**: Problem Details for HTTP APIs. IETF, 2023. Disponível em: https://www.rfc-editor.org/rfc/rfc9457. Acesso em: 16 nov. 2026.

APOLLO GRAPH INC. **Apollo Server documentation**. Disponível em: https://www.apollographql.com/docs/apollo-server. Acesso em: 16 nov. 2026.

BROADCOM. **RabbitMQ documentation**: Dead Letter Exchanges; Consumer Acknowledgements and Publisher Confirms. Disponível em: https://www.rabbitmq.com/docs. Acesso em: 16 nov. 2026.

OPENJS FOUNDATION. **Express 5.x API reference**. Disponível em: https://expressjs.com/en/5x/api.html. Acesso em: 16 nov. 2026.

TYPEORM. **TypeORM documentation**. Disponível em: https://typeorm.io. Acesso em: 16 nov. 2026.

Tutoriais da disciplina: Tutorial de API REST, Tutorial de Mensageria, Tutorial de GraphQL e Tutorial de API Gateway.

---

# Detalhes técnicos

## API REST (`rest/`)

Express 5 + TypeScript + TypeORM + PostgreSQL. Especificação completa em [`openapi.yaml`](./openapi.yaml).
Pelo gateway, troque `/v1/api` por `/api/rest`.

| Método | Rota | Sucesso | Erros |
|---|---|---|---|
| POST | `/auth/register` | 201 | 400, 409, 422 |
| POST | `/auth/login` | 200 | 400, 401 |
| GET | `/users/me` | 200 | 401 |
| GET | `/courts?sport=&groundType=&city=&state=&minPrice=&maxPrice=&owner=me&ids=&sort=&order=&page=&limit=` | 200 | 400, 401 |
| POST | `/courts` | 201 + `Location` | 400, 401, 422 |
| GET | `/courts/:id` | 200 | 401, 404 |
| PUT / PATCH | `/courts/:id` | 200 | 400, 401, 403, 404, 422 |
| DELETE | `/courts/:id` | 204 | 401, 403, 404, 409 |
| GET | `/courts/:id/appointments` | 200 | 401, 404 |
| POST | `/courts/:id/appointments` | 201 + `Location` | 400, 401, 404, 409, 422 |
| GET | `/appointments?role=landlord\|customer` | 200 | 400, 401 |
| GET | `/appointments/:id` | 200 | 401, 404 |
| DELETE | `/appointments/:id` (cancela) | 204 | 401, 403, 404, 409, 422 |

Paginação: `limit` padrão 10, teto 50. Convenção de erros: **400** para requisição malformada e **422** para valor
bem formado que viola regra do domínio. Todos os erros seguem Problem Details (RFC 9457).

**Regras de negócio:**

| Regra | Status | `type` |
|---|---|---|
| Não reservar no passado | 422 | `/problemas/agendamento-no-passado` |
| Término depois do início | 422 | `/problemas/intervalo-invalido` |
| Reserva entre 30 min e 4 h | 422 | `/problemas/duracao-invalida` |
| Horário já ocupado (reserva confirmada sobreposta) | 409 | `/problemas/horario-ocupado` |
| Cancelar só com 24 h de antecedência | 422 | `/problemas/cancelamento-fora-do-prazo` |
| Não cancelar duas vezes | 409 | `/problemas/reserva-ja-cancelada` |
| Não remover quadra com histórico de reservas | 409 | `/problemas/quadra-com-historico` |
| Só o proprietário altera ou remove a quadra | 403 | `/problemas/acesso-negado` |

**Detalhes de implementação:**
- **Horário ocupado:** a verificação e a gravação acontecem na mesma transação, com a linha da quadra
  travada (`SELECT ... FOR UPDATE`). Testado com 5 reservas simultâneas no mesmo horário: 1 recebe 201 e 4 recebem 409.
- **Preço da reserva:** calculado pela API, como preço por hora × duração.
- **Cancelamento:** é lógico. O `DELETE` tira a reserva de uso e libera o horário, mas o registro fica no banco,
  com `status` e `cancelled_at`. A RFC 9110 permite que o DELETE arquive em vez de excluir.

## Mensageria (`mensageria/`)

Depois de gravar, a API publica na exchange topic `sportspot.eventos` e responde **sem esperar** os consumidores.

| Chave de roteamento | Quando |
|---|---|
| `agendamento.criado` | `POST /courts/:id/appointments` |
| `agendamento.cancelado` | `DELETE /appointments/:id` |

Cada mensagem é `persistent`, tem `messageId` igual ao `eventId` e leva o cabeçalho `x-request-id`. O corpo
traz `eventId`, `type`, `occurredAt`, `requestId` e `data`.

| Consumidor | Fila | Ligação | Efeito |
|---|---|---|---|
| Notificações | `notificacoes` | `agendamento.*` (todos) | "envia" e-mail ao jogador e ao proprietário (log + `mensageria/dados/emails-enviados.log`) |
| Faturamento | `faturamento` | `agendamento.criado` (só parte) | soma a receita prevista por quadra (`mensageria/dados/faturamento.json`) e a expõe em `127.0.0.1:3100` |

**Garantias em todos os consumidores:**
- **Entrega:** filas `durable`, `ack` manual e `prefetch` 10.
- **Nova tentativa:** um erro manda a mensagem para `<fila>.retry`, onde ela espera 2 s (TTL) e volta. Na 3ª falha,
  ela recebe `nack` e a DLX `sportspot.dlx` a entrega em `<fila>.dlq`.
- **Idempotência:** o `eventId` processado é registrado, e uma nova entrega é confirmada sem repetir o efeito.
- **Reconexão:** o consumidor reconecta sozinho se o RabbitMQ ainda não estiver no ar ou cair.

## GraphQL (`graphql/`)

Apollo Server 5, sem banco próprio. Os resolvers chamam a API REST e repassam o `X-Request-Id`, o `Authorization`
e o `X-Cliente-Id` que a função `context` lê dos cabeçalhos.

**Schema:**
- tipos `Usuario`, `Quadra`, `Reserva`, `Endereco` e `PaginaQuadras`;
- enums `Esporte`, `TipoPiso`, `Recurso`, `StatusReserva`, `PapelReserva` e `OrdemQuadras`;
- inputs `FiltroQuadras` e `NovaReservaInput`.

**Operações:**
- **Queries:** `quadras(filtro, ordenarPor, pagina, limite)`, `quadra(id)`, `eu { quadras { reservas } }` e `minhasReservas(papel)`.
- **Mutations:** `criarReserva(input)` e `cancelarReserva(id)`. Os erros da API viram `GraphQLError` com `code`
  (`HORARIO_OCUPADO`, `AGENDAMENTO_NO_PASSADO`, `BAD_USER_INPUT`, `UNAUTHENTICATED`...).

**Tela do painel:** a consulta `eu { quadras { reservas } }` substitui `GET /users/me` + `GET /courts?owner=me` + um
`GET /courts/:id/appointments` por quadra. A resposta traz a contagem em `extensions.chamadasRest`.

**DataLoader (ponto extra):** em `minhasReservas { quadra { ... } }`, N reservas viram **uma** chamada
`GET /courts?ids=a,b,c`, em vez de N chamadas (o problema N+1).

O Apollo Sandbox abre em http://127.0.0.1:4000, na própria máquina. Em **Headers**, adicione `Authorization: Bearer <token>`.

## API Gateway (`gateway/`)

| Rota pública | Destino interno |
|---|---|
| `/api/rest/*` | `http://127.0.0.1:3000/v1/api/*` |
| `/api/graphql` | `http://127.0.0.1:4000/` |
| `/api/painel/quadras/:id` | agregação: API REST (quadra + reservas) + faturamento (receita) |
| `/gateway/status` | estado dos disjuntores (sem chave) |

| Situação | Resposta |
|---|---|
| Sem chave ou chave inválida | 401 |
| Passou do limite do plano | 429 + `Retry-After` |
| Serviço não respondeu em 4 s (restrição EARS) | 504 |
| Serviço fora do ar | 502 |
| 3 falhas seguidas | disjuntor abre por 15 s → 503 + `Retry-After` |

**Comportamento:**
- **`X-Request-Id`:** o gateway gera o id (ou mantém o do cliente, se tiver formato seguro), repassa aos serviços e registra no log.
- **Cabeçalhos:** só os de uma lista de permissão são repassados.
- **Reescrita:** o `Location` e o `instance` dos erros voltam com o caminho público.
- **Erros:** os erros do próprio gateway saem em Problem Details, com `"origem": "gateway"`.
- **Rota agregada:** se o faturamento ou a lista de reservas falhar, ela responde com `"parcial": true` e `avisos`.
  Sem a quadra (a fonte essencial), responde 502, 503 ou 504.
