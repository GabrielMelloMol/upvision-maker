//! Lote de comandos SQL numa única transação, no mesmo pool do tauri-plugin-sql (C1, A1).
//! O plugin não garante a mesma conexão entre chamadas do front, então restaurar um backup ou rodar uma
//! migração comando a comando deixava o banco pela metade se algo falhasse ou o app fechasse no meio.

use serde::Deserialize;
use serde_json::Value;
use sqlx::{sqlite::SqliteArguments, query::Query, Pool, Sqlite};
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool};

#[derive(Debug, Deserialize)]
pub struct Stmt {
    pub sql: String,
    #[serde(default)]
    pub params: Vec<Value>,
}

/// Mesma conversão do plugin (números como f64), com booleano como 0/1 e objeto/lista como texto JSON.
fn bind<'q>(q: Query<'q, Sqlite, SqliteArguments<'q>>, v: &'q Value) -> Query<'q, Sqlite, SqliteArguments<'q>> {
    match v {
        Value::Null => q.bind(None::<String>),
        Value::Bool(b) => q.bind(*b as i64),
        Value::Number(n) => q.bind(n.as_f64().unwrap_or_default()),
        Value::String(s) => q.bind(s.as_str()),
        other => q.bind(other.to_string()),
    }
}

/// Tudo ou nada: o primeiro erro desfaz o lote inteiro.
pub async fn run(pool: &Pool<Sqlite>, stmts: &[Stmt]) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    for s in stmts {
        let q = s.params.iter().fold(sqlx::query(&s.sql), bind);
        q.execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())
}

/// O pool SQLite que o plugin abriu para `db_url`.
pub async fn pool_of(db: &State<'_, DbInstances>, db_url: &str) -> Result<Pool<Sqlite>, String> {
    match db.0.read().await.get(db_url) {
        Some(DbPool::Sqlite(p)) => Ok(p.clone()),
        _ => Err("Banco de dados não carregado.".into()),
    }
}

#[tauri::command]
pub async fn sql_batch(db: State<'_, DbInstances>, db_url: String, statements: Vec<Stmt>) -> Result<(), String> {
    run(&pool_of(&db, &db_url).await?, &statements).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn db() -> Pool<Sqlite> {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::query("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT NOT NULL, qty REAL, flag INTEGER)").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO t VALUES (1, 'antigo', 1, 0)").execute(&pool).await.unwrap();
        pool
    }

    fn st(sql: &str, params: Vec<Value>) -> Stmt {
        Stmt { sql: sql.into(), params }
    }

    #[tokio::test]
    async fn aplica_tudo_com_os_tipos_certos() {
        let pool = db().await;
        let stmts = [st("DELETE FROM t", vec![]), st("INSERT INTO t VALUES (?, ?, ?, ?)", vec![json!(2), json!("novo"), json!(1.5), json!(true)]), st("PRAGMA user_version = 7", vec![])];
        run(&pool, &stmts).await.unwrap();
        let row: (i64, String, f64, i64) = sqlx::query_as("SELECT id, name, qty, flag FROM t").fetch_one(&pool).await.unwrap();
        assert_eq!(row, (2, "novo".into(), 1.5, 1));
        let v: i64 = sqlx::query_scalar("PRAGMA user_version").fetch_one(&pool).await.unwrap();
        assert_eq!(v, 7);
    }

    #[tokio::test]
    async fn erro_no_meio_desfaz_o_lote_inteiro() {
        let pool = db().await;
        let stmts = [st("DELETE FROM t", vec![]), st("INSERT INTO t VALUES (2, ?, 1, 0)", vec![Value::Null]), st("PRAGMA user_version = 7", vec![])];
        let err = run(&pool, &stmts).await.unwrap_err();
        assert!(err.contains("NOT NULL"), "{err}");
        let names: Vec<String> = sqlx::query_scalar("SELECT name FROM t").fetch_all(&pool).await.unwrap();
        assert_eq!(names, ["antigo"]); // o DELETE foi desfeito
        let v: i64 = sqlx::query_scalar("PRAGMA user_version").fetch_one(&pool).await.unwrap();
        assert_eq!(v, 0);
    }
}
