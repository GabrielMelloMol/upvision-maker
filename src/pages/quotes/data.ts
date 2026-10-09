import { consignmentsRepo } from "../../db/consignmentsRepo";
import { quotesRepo } from "../../db/quotesRepo";
import type { Db } from "../../db/types";
import type { Consignment } from "../../domain/consignments";
import type { Quote } from "../../domain/quotes";
import { EMPTY_ORDERS, loadOrdersData, type OrdersData } from "../orders/data";

export type QuotesData = OrdersData & { quotes: Quote[]; consignments: Consignment[] };

export const loadQuotesData = async (db: Db): Promise<QuotesData> => ({ ...(await loadOrdersData(db)), quotes: await quotesRepo.list(db), consignments: await consignmentsRepo.list(db) });
export const EMPTY_QUOTES: QuotesData = { ...EMPTY_ORDERS, quotes: [], consignments: [] };
