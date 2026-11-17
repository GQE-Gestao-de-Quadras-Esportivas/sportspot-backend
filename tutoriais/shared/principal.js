import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

/** true quando o módulo foi executado diretamente (node arquivo.js), e não importado. */
export const ehPrincipal = (metaUrl) => Boolean(process.argv[1]) && metaUrl === pathToFileURL(resolve(process.argv[1])).href;
