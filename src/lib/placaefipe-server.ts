import type { PlateLookup } from './plate-lookup';

export class PlateLookupError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

const asObject = (data: unknown): Record<string, unknown> =>
  data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {};
const field = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 200) : '';
const year = (value: unknown) => Number.isInteger(value) && Number(value) >= 1900 && Number(value) <= 2200 ? String(value) : '';
const amount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

export const providerErrors: Record<string, { message: string; status: number }> = {
  falha_de_conexao: { message: 'O servidor do painel não conseguiu se conectar à Placa & FIPE. Verifique a conexão e tente novamente.', status: 503 },
  sem_chave: { message: 'Configure a chave do Placa & FIPE neste ambiente.', status: 503 },
  chave_de_teste: { message: 'Configure uma chave real do Placa & FIPE.', status: 503 },
  placa_invalida: { message: 'Confira o formato da placa.', status: 400 },
  placa_nao_encontrada: { message: 'Veículo não encontrado para essa placa.', status: 404 },
  saldo_insuficiente: { message: 'Saldo insuficiente no Placa & FIPE.', status: 402 },
  limite_da_chave: { message: 'A chave do Placa & FIPE atingiu o limite de gastos.', status: 429 },
  limite_excedido: { message: 'Muitas consultas seguidas. Aguarde antes de consultar novamente.', status: 429 },
  chave_invalida: { message: 'A chave do Placa & FIPE está inválida ou foi revogada.', status: 503 },
  nao_autenticado: { message: 'Confira a chave do Placa & FIPE na hospedagem.', status: 503 },
};

export async function lookupPlate(plate: string): Promise<PlateLookup> {
  const key = process.env.PLACAEFIPE_API_KEY?.trim();
  if (!key) throw new PlateLookupError('sem_chave');
  if (key.startsWith('pf_test_')) throw new PlateLookupError('chave_de_teste');

  const base = 'https://api.placaefipe.com.br/v1';
  let rateLimitRetried = false;
  let unavailableRetries = 0;
  for (;;) {
    const response = await fetch(`${base}/placas/${plate}?tipo=basica`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
    }).catch(() => {
      throw new PlateLookupError('falha_de_conexao');
    });
    const data = asObject(await response.json());
    if (response.ok) return toPlateLookup(data, plate);

    const code = field(asObject(data.erro).codigo);
    if (code === 'limite_excedido' && !rateLimitRetried) {
      rateLimitRetried = true;
      await new Promise(resolve => setTimeout(resolve, 1_000));
    } else if (code === 'indisponivel' && unavailableRetries < 3) {
      const delay = 1_000 * 2 ** unavailableRetries;
      unavailableRetries++;
      await new Promise(resolve => setTimeout(resolve, delay));
    } else {
      throw new PlateLookupError(code);
    }
  }
}

function toPlateLookup(data: Record<string, unknown>, plate: string): PlateLookup {
  const brand = field(data.marca);
  const model = field(data.modelo);

  const fipe = asObject(data.fipe);
  const versions = (Array.isArray(fipe.versoes) ? fipe.versoes : []).flatMap((value): PlateLookup['versions'] => {
    const option = asObject(value);
    const code = field(option.codigo);
    const label = field(option.modelo);
    return code && label ? [{ code, label, value: amount(option.valor), valueText: field(option.valor_texto) }] : [];
  });
  return {
    plate, brand: brand.replace(/^VW$/i, 'Volkswagen').replace(/^GM$/i, 'Chevrolet'), model,
    version: field(data.versao), manufactureYear: year(data.ano_fabricacao),
    modelYear: year(data.ano_modelo), color: field(data.cor), fuel: field(data.combustivel),
    fipeReference: field(fipe.referencia), fipe: amount(fipe.valor), fipeCode: field(fipe.codigo), fipeText: field(fipe.valor_texto), versions,
  };
}
