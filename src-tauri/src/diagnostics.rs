//! Registro de erros local com rotação (#7): `upvision.log` + `upvision.1.log` na pasta de logs do app.
//! O front já manda as linhas sem dados pessoais (sanitize.ts); aqui só se grava, gira e lê.
//! Panics do Rust também vão para o registro (hook instalado no setup).

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::{AppHandle, Manager};

const CURRENT: &str = "upvision.log";
const PREVIOUS: &str = "upvision.1.log";
/// Tamanho máximo de cada arquivo; com a rotação o registro nunca passa de ~2× isso.
const MAX_BYTES: u64 = 256 * 1024;
const MAX_LINE: usize = 2000;

static LOG_DIR: OnceLock<PathBuf> = OnceLock::new();

fn one_line(s: &str) -> String {
    let flat: String = s.chars().map(|c| if c == '\n' || c == '\r' { ' ' } else { c }).collect();
    flat.chars().take(MAX_LINE).collect()
}

fn append_in(dir: &Path, line: &str) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let cur = dir.join(CURRENT);
    if fs::metadata(&cur).map(|m| m.len() >= MAX_BYTES).unwrap_or(false) {
        fs::rename(&cur, dir.join(PREVIOUS)).map_err(|e| e.to_string())?;
    }
    let mut f = OpenOptions::new().create(true).append(true).open(&cur).map_err(|e| e.to_string())?;
    writeln!(f, "{}", one_line(line)).map_err(|e| e.to_string())
}

fn read_in(dir: &Path) -> String {
    let read = |n: &str| fs::read_to_string(dir.join(n)).unwrap_or_default();
    format!("{}{}", read(PREVIOUS), read(CURRENT))
}

fn dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_log_dir().map_err(|e| e.to_string())
}

/// Grava panics do Rust no registro (sem derrubar o hook padrão).
pub fn install_panic_hook(app: &AppHandle) {
    let Ok(d) = dir(app) else { return };
    let _ = LOG_DIR.set(d);
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        if let Some(d) = LOG_DIR.get() {
            let _ = append_in(d, &format!("{} [panic] rust: {info}", chrono_like_now()));
        }
        default(info);
    }));
}

/// Data/hora UTC em ISO sem dependência extra (segundos desde a época → AAAA-MM-DDTHH:MM:SSZ).
fn chrono_like_now() -> String {
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let (days, rem) = (secs / 86_400, secs % 86_400);
    // algoritmo de Howard Hinnant (civil_from_days)
    let z = days as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z", rem / 3600, rem % 3600 / 60, rem % 60)
}

#[tauri::command]
pub fn log_append(app: AppHandle, line: String) -> Result<(), String> {
    append_in(&dir(&app)?, &line)
}

#[tauri::command]
pub fn log_read(app: AppHandle) -> Result<String, String> {
    Ok(read_in(&dir(&app)?))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmpdir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("upvision-log-test-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        d
    }

    #[test]
    fn grava_em_uma_linha_e_le_na_ordem() {
        let d = tmpdir("ordem");
        append_in(&d, "primeira").unwrap();
        append_in(&d, "segunda\ncom quebra").unwrap();
        assert_eq!(read_in(&d), "primeira\nsegunda com quebra\n");
        fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn gira_quando_passa_do_limite_e_nunca_cresce_sem_fim() {
        let d = tmpdir("gira");
        let big = "x".repeat(MAX_LINE);
        for _ in 0..400 {
            append_in(&d, &big).unwrap();
        }
        let cur = fs::metadata(d.join(CURRENT)).unwrap().len();
        let prev = fs::metadata(d.join(PREVIOUS)).unwrap().len();
        assert!(cur <= MAX_BYTES + MAX_LINE as u64 + 1);
        assert!(prev <= MAX_BYTES + MAX_LINE as u64 + 1);
        fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn linha_gigante_e_cortada() {
        let d = tmpdir("corta");
        append_in(&d, &"y".repeat(10_000)).unwrap();
        assert_eq!(read_in(&d).trim_end().len(), MAX_LINE);
        fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn data_no_formato_iso() {
        let s = chrono_like_now();
        assert_eq!(s.len(), 20);
        assert!(s.ends_with('Z') && s.as_bytes()[10] == b'T');
    }
}
