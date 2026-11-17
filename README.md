# SportSpot — API REST e mensageria (Partes 1 e 2)

API de gestão de quadras esportivas: proprietários cadastram quadras e jogadores reservam horários.
Express 5 + TypeScript + TypeORM + PostgreSQL.

## Pré-requisitos

- Node.js 22 ou superior
- Docker Desktop em execução (para o RabbitMQ)
- PostgreSQL 14 ou superior, com um banco chamado `sportspot`
  - com Docker: `docker run -d --name sportspot-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=sportspot -p 5432:5432 postgres:16`

## Como executar

```bash
docker compose up -d        # RabbitMQ; painel em http://localhost:15672 (guest / guest)

npm install
cp .env.example .env        # no Windows: copy .env.example .env
npm start                   # API em http://127.0.0.1:3000/v1/api

cd mensageria && npm install && cd ..
```

Em mais dois terminais, suba os consumidores:

```bash
cd mensageria && npm run notificacoes
cd mensageria && npm run faturamento
```

| Processo | Comando | Porta |
|---|---|---|
| RabbitMQ | `docker compose up -d` | 5672 (AMQP), 15672 (painel) |
| PostgreSQL | já instalado ou via Docker | 5432 |
| API REST | `npm start` | 3000, só em 127.0.0.1 |
| Consumidor de notificações | `cd mensageria && npm run notificacoes` | não abre porta |
| Consumidor de faturamento | `cd mensageria && npm run faturamento` | não abre porta |

As tabelas são criadas automaticamente na primeira execução (`synchronize: true`).

Em outro terminal, rode o roteiro de evidência:

```bash
npm run cliente
```

Ele cadastra um usuário, faz login, cria, lê, altera e remove quadras, faz reservas e provoca os erros 400, 401, 404, 409 e 422.

## Endpoints

Todas as rotas, exceto `/auth/*`, exigem `Authorization: Bearer <token>` (obtido em `POST /auth/login`).
A especificação completa está em [`openapi.yaml`](./openapi.yaml).

| Método | Rota | Sucesso | Erros |
|---|---|---|---|
| POST | `/auth/register` | 201 | 400, 409, 422 |
| POST | `/auth/login` | 200 | 400, 401 |
| GET | `/users/me` | 200 | 401 |
| GET | `/courts?sport=&groundType=&city=&state=&minPrice=&maxPrice=&owner=me&sort=&order=&page=&limit=` | 200 | 400, 401 |
| POST | `/courts` | 201 + `Location` | 400, 401, 422 |
| GET | `/courts/:id` | 200 | 401, 404 |
| PUT | `/courts/:id` | 200 | 400, 401, 403, 404, 422 |
| PATCH | `/courts/:id` | 200 | 400, 401, 403, 404, 422 |
| DELETE | `/courts/:id` | 204 | 401, 403, 404, 409 |
| GET | `/courts/:id/appointments` | 200 | 401, 404 |
| POST | `/courts/:id/appointments` | 201 + `Location` | 400, 401, 404, 409, 422 |
| GET | `/appointments?role=landlord\|customer` | 200 | 400, 401 |
| GET | `/appointments/:id` | 200 | 401, 404 |
| DELETE | `/appointments/:id` | 204 | 401, 403, 404, 422 |

Paginação: `limit` padrão 10 e teto de 50. Pedir `limit=100` devolve 50 itens por página.

## Regras de negócio

| Regra | Status | `type` |
|---|---|---|
| Não reservar horário no passado | 422 | `/problemas/agendamento-no-passado` |
| Término deve ser depois do início | 422 | `/problemas/intervalo-invalido` |
| Reserva entre 30 minutos e 4 horas | 422 | `/problemas/duracao-invalida` |
| Horário já ocupado na mesma quadra | 409 | `/problemas/horario-ocupado` |
| Cancelar só com 24 h de antecedência | 422 | `/problemas/cancelamento-fora-do-prazo` |
| Não remover quadra com reservas futuras | 409 | `/problemas/quadra-com-reservas` |
| Só o proprietário altera ou remove a quadra | 403 | `/problemas/acesso-negado` |

O preço da reserva é calculado pela API: preço por hora da quadra × duração.

A verificação de horário ocupado e a gravação acontecem na mesma transação, com a linha da quadra
travada (`SELECT ... FOR UPDATE`). Assim, duas reservas simultâneas para o mesmo horário não passam as duas.

## Erros

Todos os erros seguem Problem Details (RFC 9457), com `Content-Type: application/problem+json`:

```json
{
  "type": "/problemas/horario-ocupado",
  "title": "Horário já ocupado",
  "status": 409,
  "detail": "A quadra já tem uma reserva de 2026-12-01T22:00:00.000Z a 2026-12-02T00:00:00.000Z.",
  "instance": "/v1/api/courts/3f2c.../appointments",
  "requestId": "6b1d..."
}
```

Convenção: **400** para requisição malformada (campo ausente, tipo errado, JSON inválido) e
**422** para valor bem formado que viola uma regra do domínio.

## Rastreamento

A API lê o cabeçalho `X-Request-Id` (gerado pelo gateway) ou cria um, devolve-o na resposta e o
registra em cada linha de log:

```
[rest] [cliente-1794873610629] POST /v1/api/courts -> 201 (12 ms)
```

## Mensageria (Parte 2)

Depois de gravar uma reserva no banco, a API publica um evento na exchange topic `sportspot.eventos`
e responde ao cliente **sem esperar** os consumidores.

| Chave de roteamento | Quando |
|---|---|
| `agendamento.criado` | `POST /courts/:id/appointments` |
| `agendamento.cancelado` | `DELETE /appointments/:id` |

Formato do evento (mensagem `persistent`, `messageId` = `eventId`, cabeçalho `x-request-id`):

```json
{
  "eventId": "12fa6bf9-...",
  "type": "agendamento.criado",
  "occurredAt": "2026-11-17T00:18:19.000Z",
  "requestId": "cliente-1794874699256",
  "data": { "appointmentId": "...", "courtId": "...", "courtName": "Arena Central",
            "customerEmail": "...", "landlordEmail": "...", "startTime": "...", "endTime": "...", "price": 240 }
}
```

| Consumidor | Fila | Ligação | Efeito |
|---|---|---|---|
| Notificações | `notificacoes` | `agendamento.*` (todos) | "envia" e-mail ao jogador e ao dono (log + `mensageria/dados/emails-enviados.log`) |
| Faturamento | `faturamento` | `agendamento.criado` (só parte) | soma a receita prevista por quadra em `mensageria/dados/faturamento.json` |

Em todos os consumidores:
- filas `durable`, mensagens `persistent`, confirmação manual (`ack`) e `prefetch` 10;
- **nova tentativa limitada**: em caso de erro, a mensagem vai para `<fila>.retry`, espera 2 s e volta.
  Na 3ª falha, sofre `nack` sem requeue e a DLX `sportspot.dlx` a entrega em `<fila>.dlq`;
- **idempotência**: o `eventId` processado é registrado em `mensageria/dados/processados-<fila>.json`.
  Uma segunda entrega do mesmo evento é confirmada sem repetir o efeito;
- o `X-Request-Id` aparece em cada linha de log.

### Demonstração

```bash
npm run cliente            # cena 3: reservas reais disparam os eventos; veja os logs dos dois consumidores
npm run evento:falha       # cena 4: e-mail inválido → 3 tentativas → notificacoes.dlq
npm run evento:duplicado   # cena 4: mesma mensagem 2 vezes → efeito uma vez só
```

### Riscos conhecidos

- **Publicação fora da transação:** se o RabbitMQ estiver fora do ar, a reserva é gravada, a API responde 201,
  e o evento se perde (fica só registrado no log da API). O padrão Outbox resolveria isso.
- **Consistência eventual:** logo depois do 201, o e-mail ainda pode não ter saído.
- **Idempotência em arquivo:** se o processo cair entre aplicar o efeito e registrar o `eventId`, o efeito pode se repetir.
  Em produção, efeito e registro iriam na mesma transação do banco do consumidor.
- O faturamento não recebe `agendamento.cancelado` (ligação parcial, de propósito). Por isso, a receita é bruta.

## Segurança da porta

A API escuta só em `127.0.0.1` (variável `HOST`). De fora da máquina, ela só será alcançada pelo gateway (Parte 4).
