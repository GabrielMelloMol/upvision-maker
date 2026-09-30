/** Contrato entre a página do celular e o app do computador (#16). Só tipos: a página não carrega o banco. */
export type PhoneOrder = { id: number; customer: string; dueDate: string | null; status: string; late: boolean; items: string; canFinish: boolean };
export type PhoneFilament = { id: number; name: string; stockG: number; minG: number; low: boolean };
export type PhoneSummary = { orders: PhoneOrder[]; filaments: PhoneFilament[] };
