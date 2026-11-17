// Sobe o gateway na porta pública 3000 (0.0.0.0): o único acessível de fora.
import { criarGateway } from './app.js';
import { criarLogger } from '../shared/logger.js';
import { config } from '../shared/config.js';

const logger = criarLogger('gateway');
if (!process.env.JWT_SEGREDO) logger.warn('JWT_SEGREDO não definido: usando o segredo de desenvolvimento (não use em produção)');

const app = criarGateway({ config, logger });
const servidor = app.listen(config.gateway.porta, config.gateway.host, () => {
  logger.info(`API Gateway ouvindo em http://${config.gateway.host}:${config.gateway.porta} -> api-rest ${config.rest.url}, graphql ${config.graphql.url}`);
});
servidor.on('error', (e) => {
  logger.erro(`não foi possível abrir a porta ${config.gateway.porta}: ${e.code}`);
  process.exit(1);
});
