import { customersRepo, loadCompany } from "../../db/customersRepo";
import { ordersRepo } from "../../db/ordersRepo";
import type { Db } from "../../db/types";
import { DEFAULT_COMPANY, type Company, type Customer } from "../../domain/customers";
import type { Order } from "../../domain/orders";
import { EMPTY_DATA, loadProductsData, type ProductsData } from "../products/data";

export type OrdersData = ProductsData & { orders: Order[]; customers: Customer[]; company: Company };

export const loadOrdersData = async (db: Db): Promise<OrdersData> => ({
  ...(await loadProductsData(db)),
  orders: await ordersRepo.list(db),
  customers: await customersRepo.list(db),
  company: await loadCompany(db),
});

export const EMPTY_ORDERS: OrdersData = { ...EMPTY_DATA, orders: [], customers: [], company: DEFAULT_COMPANY };
