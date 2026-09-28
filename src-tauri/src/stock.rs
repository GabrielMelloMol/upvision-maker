//! Movimentação de estoque atômica: todas as baixas/estornos de um pedido (ou de uma produção)
//! acontecem numa única transação SQLite, usando o mesmo pool do tauri-plugin-sql.

use serde::Deserialize;
use sqlx::{Pool, Sqlite};
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool};

/// Variação de estoque de um item. `delta` negativo = baixa.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Movement {
    pub kind: String, // "filament" | "material" | "product"
    pub id: i64,
    pub delta: f64,
}

/// Mudança de status do pedido junto com a movimentação (evita baixa dupla).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderChange {
    pub order_id: i64,
    /// Valor que `stockApplied` precisa ter agora; se não tiver, nada é feito (já aplicado/estornado).
    pub expect_applied: bool,
    pub set_applied: bool,
    pub status: String,
    pub note: String,
}

/// Tabela e coluna de estoque por tipo: lista fechada, nada vindo do front vira SQL.
fn target(kind: &str) -> Result<(&'static str, &'static str), String> {
    match kind {
        "filament" => Ok(("filaments", "stockG")),
        "material" => Ok(("materials", "stock")),
        "product" => Ok(("products", "stock")),
        other => Err(format!("tipo de estoque desconhecido: {other}")),
    }
}

pub async fn apply(pool: &Pool<Sqlite>, movements: &[Movement], order: Option<&OrderChange>) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    if let Some(o) = order {
        let applied: Option<i64> = sqlx::query_scalar("SELECT stockApplied FROM orders WHERE id = ?")
            .bind(o.order_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        match applied {
            None => return Err("Pedido não encontrado.".into()),
            Some(v) if (v != 0) != o.expect_applied => return Err("O estoque deste pedido já foi atualizado por outra ação.".into()),
            _ => {}
        }
    }
    for m in movements {
        let (table, col) = target(&m.kind)?;
        let sql = format!("UPDATE {table} SET {col} = {col} + ? WHERE id = ?");
        let r = sqlx::query(&sql).bind(m.delta).bind(m.id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
        if r.rows_affected() == 0 {
            return Err(format!("Item de estoque não encontrado ({table} #{}).", m.id));
        }
    }
    if let Some(o) = order {
        sqlx::query("UPDATE orders SET stockApplied = ?, status = ? WHERE id = ?")
            .bind(o.set_applied as i64)
            .bind(&o.status)
            .bind(o.order_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        sqlx::query("INSERT INTO order_history (orderId, status, note, at) VALUES (?, ?, ?, datetime('now'))")
            .bind(o.order_id)
            .bind(&o.status)
            .bind(&o.note)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn apply_stock(db: State<'_, DbInstances>, db_url: String, movements: Vec<Movement>, order: Option<OrderChange>) -> Result<(), String> {
    let pool = {
        let map = db.0.read().await;
        match map.get(&db_url) {
            Some(DbPool::Sqlite(p)) => p.clone(),
            _ => return Err("Banco de dados não carregado.".into()),
        }
    };
    apply(&pool, &movements, order.as_ref()).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn db() -> Pool<Sqlite> {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        for sql in [
            "CREATE TABLE filaments (id INTEGER PRIMARY KEY, stockG REAL)",
            "CREATE TABLE materials (id INTEGER PRIMARY KEY, stock REAL)",
            "CREATE TABLE products (id INTEGER PRIMARY KEY, stock REAL)",
            "CREATE TABLE orders (id INTEGER PRIMARY KEY, status TEXT, stockApplied INTEGER)",
            "CREATE TABLE order_history (id INTEGER PRIMARY KEY, orderId INTEGER, status TEXT, note TEXT, at TEXT)",
            "INSERT INTO filaments VALUES (1, 1000)",
            "INSERT INTO materials VALUES (1, 10)",
            "INSERT INTO products VALUES (1, 5)",
            "INSERT INTO orders VALUES (1, 'pending', 0)",
        ] {
            sqlx::query(sql).execute(&pool).await.unwrap();
        }
        pool
    }

    fn mv(kind: &str, id: i64, delta: f64) -> Movement {
        Movement { kind: kind.into(), id, delta }
    }

    async fn stock(pool: &Pool<Sqlite>, sql: &str) -> f64 {
        sqlx::query_scalar(sql).fetch_one(pool).await.unwrap()
    }

    fn confirm(expect: bool, set: bool) -> OrderChange {
        OrderChange { order_id: 1, expect_applied: expect, set_applied: set, status: "production".into(), note: "".into() }
    }

    #[tokio::test]
    async fn baixa_tudo_e_marca_o_pedido() {
        let pool = db().await;
        apply(&pool, &[mv("filament", 1, -120.0), mv("material", 1, -2.0), mv("product", 1, -1.0)], Some(&confirm(false, true))).await.unwrap();
        assert_eq!(stock(&pool, "SELECT stockG FROM filaments").await, 880.0);
        assert_eq!(stock(&pool, "SELECT stock FROM materials").await, 8.0);
        assert_eq!(stock(&pool, "SELECT stock FROM products").await, 4.0);
        let applied: i64 = sqlx::query_scalar("SELECT stockApplied FROM orders").fetch_one(&pool).await.unwrap();
        assert_eq!(applied, 1);
        let hist: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM order_history").fetch_one(&pool).await.unwrap();
        assert_eq!(hist, 1);
    }

    #[tokio::test]
    async fn nao_baixa_duas_vezes() {
        let pool = db().await;
        apply(&pool, &[mv("filament", 1, -100.0)], Some(&confirm(false, true))).await.unwrap();
        let err = apply(&pool, &[mv("filament", 1, -100.0)], Some(&confirm(false, true))).await.unwrap_err();
        assert!(err.contains("já foi atualizado"));
        assert_eq!(stock(&pool, "SELECT stockG FROM filaments").await, 900.0);
    }

    #[tokio::test]
    async fn erro_no_meio_desfaz_tudo() {
        let pool = db().await;
        let err = apply(&pool, &[mv("filament", 1, -100.0), mv("material", 99, -1.0)], Some(&confirm(false, true))).await.unwrap_err();
        assert!(err.contains("não encontrado"));
        assert_eq!(stock(&pool, "SELECT stockG FROM filaments").await, 1000.0);
        let applied: i64 = sqlx::query_scalar("SELECT stockApplied FROM orders").fetch_one(&pool).await.unwrap();
        assert_eq!(applied, 0);
    }

    #[tokio::test]
    async fn tipo_desconhecido_e_recusado() {
        let pool = db().await;
        assert!(apply(&pool, &[mv("orders; DROP TABLE x", 1, 1.0)], None).await.is_err());
    }
}
