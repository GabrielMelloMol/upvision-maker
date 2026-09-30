//! Sincronizar 2 computadores por uma pasta na nuvem (#16): na pasta do backup automático ficam só
//! `upvision-sync.json` (os dados), `upvision-sync.lock` (quem está usando) e as cópias de conflito
//! `upvision-conflito-<data>.json` (aparecem em Backups guardados). Nomes fixos: o front nunca escolhe caminho.

use crate::backup::{resolve, valid_stamp, write_atomic, BackupEntry, CONFLICT_PREFIX};
use std::fs;
use std::path::Path;
use tauri::AppHandle;

fn file_name(kind: &str) -> Result<&'static str, String> {
    match kind {
        "data" => Ok("upvision-sync.json"),
        "lock" => Ok("upvision-sync.lock"),
        _ => Err("Arquivo de sincronização desconhecido.".into()),
    }
}

fn read_in(dir: &Path, kind: &str) -> Result<Option<String>, String> {
    let path = dir.join(file_name(kind)?);
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(path).map(Some).map_err(|e| format!("Não consegui ler a sincronização: {e}"))
}

fn write_in(dir: &Path, kind: &str, json: &str) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| format!("Não consegui criar a pasta: {e}"))?;
    write_atomic(&dir.join(file_name(kind)?), json)
}

fn remove_in(dir: &Path, kind: &str) -> Result<(), String> {
    let path = dir.join(file_name(kind)?);
    match fs::remove_file(path) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(format!("Não consegui apagar a trava: {e}")),
        _ => Ok(()),
    }
}

fn conflict_in(dir: &Path, stamp: &str, json: &str) -> Result<BackupEntry, String> {
    if !valid_stamp(stamp) {
        return Err("Data da cópia inválida.".into());
    }
    fs::create_dir_all(dir).map_err(|e| format!("Não consegui criar a pasta: {e}"))?;
    let name = format!("{CONFLICT_PREFIX}{stamp}.json");
    let path = dir.join(&name);
    write_atomic(&path, json)?;
    Ok(BackupEntry { name, path: path.to_string_lossy().to_string(), bytes: json.len() as u64 })
}

#[tauri::command]
pub fn sync_read(app: AppHandle, dir: String, kind: String) -> Result<Option<String>, String> {
    read_in(&resolve(&app, &dir)?, &kind)
}

#[tauri::command]
pub fn sync_write(app: AppHandle, dir: String, kind: String, json: String) -> Result<(), String> {
    write_in(&resolve(&app, &dir)?, &kind, &json)
}

#[tauri::command]
pub fn sync_remove(app: AppHandle, dir: String, kind: String) -> Result<(), String> {
    remove_in(&resolve(&app, &dir)?, &kind)
}

#[tauri::command]
pub fn sync_conflict(app: AppHandle, dir: String, stamp: String, json: String) -> Result<BackupEntry, String> {
    conflict_in(&resolve(&app, &dir)?, &stamp, &json)
}

/// Nome do computador para a trava ("em uso no computador NOTE-ANA").
#[tauri::command]
pub fn device_name() -> String {
    let from_env = std::env::var("COMPUTERNAME").or_else(|_| std::env::var("HOSTNAME")).ok();
    #[cfg(target_os = "macos")]
    let from_env = from_env.or_else(|| {
        std::process::Command::new("scutil").args(["--get", "ComputerName"]).output().ok().and_then(|o| String::from_utf8(o.stdout).ok())
    });
    from_env.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).unwrap_or_else(|| "outro computador".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn tmpdir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("upvision-sync-test-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        d
    }

    #[test]
    fn grava_le_e_apaga_so_os_nomes_fixos() {
        let d = tmpdir("rw");
        assert_eq!(read_in(&d, "data").unwrap(), None);
        write_in(&d, "data", "{\"a\":1}").unwrap();
        write_in(&d, "lock", "{}").unwrap();
        assert_eq!(read_in(&d, "data").unwrap().as_deref(), Some("{\"a\":1}"));
        assert!(d.join("upvision-sync.lock").exists());
        remove_in(&d, "lock").unwrap();
        remove_in(&d, "lock").unwrap(); // já apagada: sem erro
        assert!(!d.join("upvision-sync.lock").exists());
        assert!(read_in(&d, "../../etc/passwd").is_err());
        assert!(write_in(&d, "outro", "x").is_err());
        fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn copia_de_conflito_entra_na_lista_de_backups_e_nao_roda_com_os_automaticos() {
        let d = tmpdir("conf");
        conflict_in(&d, "2026-09-29-143200", "{}").unwrap();
        assert!(conflict_in(&d, "../x", "{}").is_err());
        crate::backup::write_in(&d, "2026-09-29-150000", "{}", 1).unwrap();
        crate::backup::write_in(&d, "2026-09-30-150000", "{}", 1).unwrap();
        let names: Vec<_> = crate::backup::list_in(&d).unwrap().into_iter().map(|e| e.name).collect();
        assert_eq!(names, vec!["upvision-auto-2026-09-30-150000.json", "upvision-conflito-2026-09-29-143200.json"]);
        assert_eq!(crate::backup::read_in(&d, "upvision-conflito-2026-09-29-143200.json").unwrap(), "{}");
        fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn nome_do_computador_nunca_vazio() {
        assert!(!device_name().is_empty());
    }
}
