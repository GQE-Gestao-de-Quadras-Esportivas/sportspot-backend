// Sobe a API REST em 127.0.0.1:3001 (rede interna: só o gateway chama).
import { criarApp } from './app.js';
import { criarBanco } from './dados.js';
import { iniciarPublicador } from './publicador.js';
import { criarLogger } from '../shared/logger.js';
import { config } from '../shared/config.js';

const logger = criarLogger('rest');
const banco = criarBanco();
const app = criarApp({ banco, logger });
const publicador = iniciarPublicador({ banco, logger });

const servidor = app.listen(config.rest.porta, config.rest.host, () => {
  logger.info(`API REST ouvindo em http://${config.rest.host}:${config.rest.porta} (somente rede interna)`);
});
servidor.on('error', (e) => {
  logger.erro(`não foi possível abrir a porta ${config.rest.porta}: ${e.code}`);
  process.exit(1);
});

for (const sinal of ['SIGINT', 'SIGTERM']) {
  process.on(sinal, async () => {
    logger.info('encerrando a API REST');
    await publicador.encerrar();
    servidor.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  });
}
