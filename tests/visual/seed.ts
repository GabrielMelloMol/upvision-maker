/** Dados de exemplo para as telas não ficarem vazias (screens.e2e.ts e a regressão visual, #142). */
/** Cadastros básicos (impressoras, filamentos, materiais). */
export const SEED_BASE = `
  INSERT INTO printers (name, watts) VALUES ('Bambu Lab A1', 95), ('Ender 3 V3', 150);
  INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA','Preto','Voolt',99.9,1000,850,200), ('PETG','Branco','3D Fila',119,1000,120,200);
  INSERT INTO materials (name, unit, unitPrice, stock, min) VALUES ('Argola de chaveiro','un',0.35,120,20), ('Saquinho kraft','un',0.9,8,10);`;

/** Pedidos em todas as colunas do quadro, um atrasado. */
export const SEED_ORDERS = `
  INSERT INTO products (name, kind, composition, piecesPerPlate, stock, manualPrice, sku) VALUES
    ('Chaveiro com nome', 'simple', '{"filaments":[{"filamentId":1,"grams":8}],"materials":[],"items":[]}', 12, 30, 15, 'CHV-01'),
    ('Topo de bolo', 'simple', '{"filaments":[{"filamentId":2,"grams":25}],"materials":[],"items":[]}', 2, 4, 39.9, 'TOP-02');
  INSERT INTO customers (kind, name, discountPct, active, phone, city) VALUES ('pf', 'Ana Souza', 10, 1, '(21) 98888-1111', 'Niterói'), ('pj', 'Doces da Bia', 0, 1, '(21) 97777-2222', 'Rio de Janeiro');
  INSERT INTO orders (customerId, customerName, channel, status, dueDate, createdAt) VALUES
    (1, 'Ana Souza', 'WhatsApp', 'pending', '2026-10-05', '2026-09-26T10:00:00Z'),
    (2, 'Doces da Bia', 'Instagram', 'production', '2026-09-20', '2026-09-18T10:00:00Z'),
    (1, 'Ana Souza', 'Shopee', 'done', '2026-10-02', '2026-09-25T10:00:00Z'),
    (2, 'Doces da Bia', 'Presencial', 'delivered', '2026-09-22', '2026-09-15T10:00:00Z');
  INSERT INTO order_items (orderId, position, productId, description, qty, unitPrice, discountPct) VALUES
    (1, 0, 1, 'Chaveiro com nome', 20, 15, 10), (2, 0, 2, 'Topo de bolo', 2, 39.9, 0), (3, 0, 1, 'Chaveiro com nome', 5, 15, 0), (4, 0, 2, 'Topo de bolo', 1, 39.9, 0);
  UPDATE orders SET deliveredAt = '2026-09-22' WHERE id = 4;
  INSERT INTO orders (customerId, customerName, channel, status, dueDate, deliveredAt, createdAt) VALUES
    (1, 'Ana Souza', 'Shopee', 'delivered', '2026-07-10', '2026-07-09', '2026-07-01T10:00:00Z'),
    (2, 'Doces da Bia', 'Instagram', 'delivered', '2026-08-05', '2026-08-04', '2026-07-28T10:00:00Z'),
    (1, 'Ana Souza', 'WhatsApp', 'delivered', '2026-08-20', '2026-08-19', '2026-08-12T10:00:00Z'),
    (2, 'Doces da Bia', 'Presencial', 'delivered', '2026-09-12', '2026-09-11', '2026-09-03T10:00:00Z');
  INSERT INTO order_items (orderId, position, productId, description, qty, unitPrice, discountPct, unitCost) VALUES
    (5, 0, 1, 'Chaveiro com nome', 40, 15, 0, 1.2), (6, 0, 2, 'Topo de bolo', 6, 39.9, 0, 6), (7, 0, 1, 'Chaveiro com nome', 25, 15, 5, 1.2), (8, 0, 2, 'Topo de bolo', 4, 39.9, 0, 6);
  UPDATE order_items SET unitCost = 6 WHERE orderId = 4;
  INSERT INTO company (id, data) VALUES (1, '{"name":"Ateliê da Ana","tradeName":"Ateliê da Ana","city":"Niterói","pixKey":"fulano@exemplo.com","pixName":"Ana Souza","pixCity":"Niteroi","quoteValidityDays":7}');
  INSERT INTO operational_costs (description, category, amount, frequency, startDate) VALUES ('Internet', 'Contas', 120, 'monthly', '2026-01-01'), ('Aluguel do ateliê', 'Espaço', 400, 'monthly', '2026-01-01'), ('Bico 0,4 reserva', 'Manutenção', 45, 'once', '2026-08-15');`;
