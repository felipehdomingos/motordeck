type FipeVersion = { code: string; label: string; value: number | null; valueText: string };

export type PlateLookup = {
  plate: string;
  brand: string;
  model: string;
  version: string;
  manufactureYear: string;
  modelYear: string;
  color: string;
  fuel: string;
  fipeReference: string;
  fipe: number | null;
  fipeCode: string;
  fipeText: string;
  versions: FipeVersion[];
};

export function normalizePlate(value: string) {
  return value.toUpperCase().replace(/[\s-]/g, '');
}
