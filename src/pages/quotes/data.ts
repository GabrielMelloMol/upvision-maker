import { loadCompany } from "../../db/customersRepo";
import { quotesRepo } from "../../db/quotesRepo";
import type { Db } from "../../db/types";
import type { Company } from "../../domain/customers";
import { DEFAULT_COMPANY } from "../../domain/customers";
import type { Quote } from "../../domain/quotes";
import { EMPTY_ORDERS, loadOrdersData, type OrdersData } from "../orders/data";

export type QuotesData = OrdersData & { quotes: Quote[]; company: Company };

export const loadQuotesData = async (db: Db): Promise<QuotesData> => ({ ...(await loadOrdersData(db)), quotes: await quotesRepo.list(db), company: await loadCompany(db) });
export const EMPTY_QUOTES: QuotesData = { ...EMPTY_ORDERS, quotes: [], company: DEFAULT_COMPANY };
