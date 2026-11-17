// DataLoaders (resolve o problema N+1).
// Sem eles, a tela "agenda do proprietário" faria uma chamada REST por quadra
// (agendamentos) e outra por reserva (atleta). Com eles, as chaves pedidas no
// mesmo ciclo são agrupadas em uma única chamada (ex.: /atletas?ids=a1,a2,a3).
// "semGraphQL" conta quantas chamadas REST o cliente teria de fazer sozinho
// (uma por recurso); "chamadasHttp" conta as que o GraphQL realmente fez.
import DataLoader from 'dataloader';

export function criarCarregadores(rest, metricas) {
  const porIds = (caminho) =>
    new DataLoader(async (ids) => {
      metricas.semGraphQL += ids.length;
      const lista = await rest.listarTodos(caminho, { ids: ids.join(',') });
      const mapa = new Map(lista.map((x) => [x.id, x]));
      return ids.map((id) => mapa.get(id) ?? null);
    });

  return {
    quadra: porIds('/quadras'),
    atleta: porIds('/atletas'),
    proprietario: porIds('/proprietarios'),

    // chave: JSON {quadraId, data, status}; agrupa por (data, status)
    agendamentosDaQuadra: new DataLoader(async (chaves) => {
      metricas.semGraphQL += chaves.length;
      const pedidos = chaves.map((c) => JSON.parse(c));
      const grupos = new Map();
      for (const p of pedidos) {
        const g = `${p.data ?? ''}|${p.status ?? ''}`;
        if (!grupos.has(g)) grupos.set(g, { data: p.data, status: p.status, quadras: new Set() });
        grupos.get(g).quadras.add(p.quadraId);
      }
      const resultados = new Map();
      for (const [g, { data, status, quadras }] of grupos) {
        const params = { quadraId: [...quadras].join(',') };
        if (data) params.data = data;
        if (status) params.status = status;
        resultados.set(g, await rest.listarTodos('/agendamentos', params));
      }
      return pedidos.map((p) => resultados.get(`${p.data ?? ''}|${p.status ?? ''}`).filter((a) => a.quadraId === p.quadraId));
    }),

    quadrasDoProprietario: new DataLoader(async (ids) => {
      metricas.semGraphQL += ids.length;
      return Promise.all(ids.map((id) => rest.listarTodos('/quadras', { proprietarioId: id })));
    }),

    agendamentosDoAtleta: new DataLoader(async (chaves) => {
      metricas.semGraphQL += chaves.length;
      return Promise.all(
        chaves.map((c) => {
          const { atletaId, status } = JSON.parse(c);
          return rest.listarTodos('/agendamentos', status ? { atletaId, status } : { atletaId });
        }),
      );
    }),
  };
}
