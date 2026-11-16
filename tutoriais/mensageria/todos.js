// Sobe os três consumidores em um único terminal (cada um com sua própria
// conexão, fila, DLQ e log). Para a demonstração, isso economiza terminais;
// também é possível rodar cada um separado (npm run consumidor:notificacoes ...).
import { consumidorNotificacoes } from './consumidor-notificacoes.js';
import { consumidorFaturamento } from './consumidor-faturamento.js';
import { consumidorAuditoria } from './consumidor-auditoria.js';

await Promise.all([consumidorNotificacoes(), consumidorFaturamento(), consumidorAuditoria()]);
