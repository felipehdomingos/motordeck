import type { Vehicle } from './data';
export type LocalVehicle = Vehicle & { local: true; plate: string; manufactureYear: number; fipe?: number; fipeReference?: string; fipeCode?: string; draft: boolean; createdAt: string };
