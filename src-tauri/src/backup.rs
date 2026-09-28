//! Backup automático rotativo (#5): grava `upvision-auto-<data>.json` numa pasta, um por dia (o último do dia vale), mantém os N dias mais novos
//! e lista/lê de volta para restaurar. Fica no Rust para não abrir o escopo de arquivos do front para qualquer pasta:
//! só nomes no padrão abaixo são lidos ou apagados.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const PREFIX: &str = "upvision-auto-";
const EXT: &str = ".json";
const MAX_KEEP: usize = 365;

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntry {
    pub name: String,
    pub path: String,
    pub bytes: u64,
}

/// `2026-09-28-153000` — data e hora, só dígitos e hífens.
fn valid_stamp(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 17 && b.iter().enumerate().all(|(i, c)| if [4, 7, 10].contains(&i) { *c == b'-' } else { c.is_ascii_digit() })
}

/// Nome de arquivo de backup automático (sem caminho, sem `..`).
fn valid_name(name: &str) -> bool {
    name.strip_prefix(PREFIX).and_then(|r| r.strip_suffix(EXT)).is_some_and(valid_stamp)
}

fn list_in(dir: &Path) -> Result<Vec<BackupEntry>, String> {
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut out: Vec<BackupEntry> = fs::read_dir(dir)
        .map_err(|e| format!("Não consegui ler a pasta de backup: {e}"))?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            let meta = e.metadata().ok()?;
            (meta.is_file() && valid_name(&name)).then(|| BackupEntry { path: e.path().to_string_lossy().to_string(), name, bytes: meta.len() })
        })
        .collect();
    out.sort_by(|a, b| b.name.cmp(&a.name)); // mais novo primeiro (o nome tem a data)
    Ok(out)
}

fn write_in(dir: &Path, stamp: &str, json: &str, keep: usize) -> Result<BackupEntry, String> {
    if !valid_stamp(stamp) {
        return Err("Data do backup inválida.".into());
    }
    let keep = keep.clamp(1, MAX_KEEP);
    fs::create_dir_all(dir).map_err(|e| format!("Não consegui criar a pasta de backup: {e}"))?;
    let name = format!("{PREFIX}{stamp}{EXT}");
    let path = dir.join(&name);
    // grava num temporário e renomeia: um backup cortado no meio nunca substitui um bom
    let tmp = dir.join(format!("{name}.tmp"));
    fs::write(&tmp, json).map_err(|e| format!("Não consegui gravar o backup: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("Não consegui gravar o backup: {e}"))?;
    // um backup por dia: o mais recente do dia substitui os anteriores do mesmo dia
    let today = format!("{PREFIX}{}", &stamp[..10]);
    for same_day in list_in(dir)?.into_iter().filter(|e| e.name.starts_with(&today) && e.name != name) {
        let _ = fs::remove_file(same_day.path);
    }
    for old in list_in(dir)?.into_iter().skip(keep) {
        let _ = fs::remove_file(old.path);
    }
    let bytes = json.len() as u64;
    Ok(BackupEntry { name, path: path.to_string_lossy().to_string(), bytes })
}

fn read_in(dir: &Path, name: &str) -> Result<String, String> {
    if !valid_name(name) {
        return Err("Esse arquivo não é um backup automático do UpVision Maker.".into());
    }
    fs::read_to_string(dir.join(name)).map_err(|e| format!("Não consegui ler o backup: {e}"))
}

/// Pasta escolhida pela usuária, ou a padrão (dados do app/backups/auto).
fn resolve(app: &AppHandle, dir: &str) -> Result<PathBuf, String> {
    if !dir.trim().is_empty() {
        return Ok(PathBuf::from(dir));
    }
    app.path().app_data_dir().map(|d| d.join("backups").join("auto")).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn backup_default_dir(app: AppHandle) -> Result<String, String> {
    resolve(&app, "").map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn backup_write(app: AppHandle, dir: String, stamp: String, json: String, keep: usize) -> Result<BackupEntry, String> {
    write_in(&resolve(&app, &dir)?, &stamp, &json, keep)
}

#[tauri::command]
pub fn backup_list(app: AppHandle, dir: String) -> Result<Vec<BackupEntry>, String> {
    list_in(&resolve(&app, &dir)?)
}

#[tauri::command]
pub fn backup_read(app: AppHandle, dir: String, name: String) -> Result<String, String> {
    read_in(&resolve(&app, &dir)?, &name)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmpdir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("upvision-backup-test-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        d
    }

    #[test]
    fn nomes_validos_so_no_padrao() {
        assert!(valid_name("upvision-auto-2026-09-28-153000.json"));
        assert!(!valid_name("upvision-auto-2026-09-28.json"));
        assert!(!valid_name("../upvision-auto-2026-09-28-153000.json"));
        assert!(!valid_name("upvision-auto-2026-09-28-15300a.json"));
        assert!(!valid_name("outro.json"));
    }

    #[test]
    fn grava_lista_e_mantem_so_os_mais_novos() {
        let d = tmpdir("rot");
        for s in ["2026-09-01-100000", "2026-09-02-100000", "2026-09-03-100000", "2026-09-04-100000"] {
            write_in(&d, s, "{}", 2).unwrap();
        }
        fs::write(d.join("nota.txt"), "não mexer").unwrap();
        let names: Vec<_> = list_in(&d).unwrap().into_iter().map(|e| e.name).collect();
        assert_eq!(names, vec!["upvision-auto-2026-09-04-100000.json", "upvision-auto-2026-09-03-100000.json"]);
        assert!(d.join("nota.txt").exists(), "arquivos que não são backup ficam intactos");
        assert!(!d.join("upvision-auto-2026-09-04-100000.json.tmp").exists());
        fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn um_por_dia_o_ultimo_do_dia_vale() {
        let d = tmpdir("dia");
        write_in(&d, "2026-09-27-180000", "ontem", 10).unwrap();
        write_in(&d, "2026-09-28-090000", "manhã", 10).unwrap();
        write_in(&d, "2026-09-28-180000", "noite", 10).unwrap();
        let names: Vec<_> = list_in(&d).unwrap().into_iter().map(|e| e.name).collect();
        assert_eq!(names, vec!["upvision-auto-2026-09-28-180000.json", "upvision-auto-2026-09-27-180000.json"]);
        assert_eq!(read_in(&d, "upvision-auto-2026-09-28-180000.json").unwrap(), "noite");
        fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn le_de_volta_e_recusa_nome_fora_do_padrao() {
        let d = tmpdir("read");
        write_in(&d, "2026-09-28-153000", r#"{"app":"upvision-maker"}"#, 5).unwrap();
        assert_eq!(read_in(&d, "upvision-auto-2026-09-28-153000.json").unwrap(), r#"{"app":"upvision-maker"}"#);
        assert!(read_in(&d, "../../etc/passwd").is_err());
        assert!(write_in(&d, "../x", "{}", 5).is_err());
        fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn pasta_inexistente_lista_vazio() {
        assert_eq!(list_in(Path::new("/nao/existe/upvision")).unwrap(), vec![]);
    }
}
