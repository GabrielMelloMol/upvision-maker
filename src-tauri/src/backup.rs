//! Backup automático rotativo (#5): grava `upvision-auto-<data>.json` numa pasta, um por dia (o último do dia vale), mantém os N dias mais novos
//! e lista/lê de volta para restaurar. Fica no Rust para não abrir o escopo de arquivos do front para qualquer pasta:
//! só nomes no padrão abaixo são lidos ou apagados.

use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const PREFIX: &str = "upvision-auto-";
/// Cópias de conflito da sincronização (#16): listadas e restauráveis, mas fora do rodízio.
pub const CONFLICT_PREFIX: &str = "upvision-conflito-";
/// Cópia dos dados de antes de restaurar ou importar da sincronização (B2): listada, restauráveis e com rodízio próprio.
pub const SAFETY_PREFIX: &str = "upvision-antes-";
/// Quantas cópias de antes de restaurar ficam (cada uma leva as fotos: sem limite elas se acumulariam).
const SAFETY_KEEP: usize = 5;
const EXT: &str = ".json";
const MAX_KEEP: usize = 365;
/// Nunca menos de 2: com 1, um dia ruim apagaria o único backup bom (B3).
const MIN_KEEP: usize = 2;

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntry {
    pub name: String,
    pub path: String,
    pub bytes: u64,
}

/// `2026-09-28-153000` — data e hora, só dígitos e hífens.
pub fn valid_stamp(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 17 && b.iter().enumerate().all(|(i, c)| if [4, 7, 10].contains(&i) { *c == b'-' } else { c.is_ascii_digit() })
}

/// Nome de arquivo de backup automático ou cópia de conflito (sem caminho, sem `..`).
fn valid_name(name: &str) -> bool {
    [PREFIX, CONFLICT_PREFIX, SAFETY_PREFIX].iter().any(|p| name.strip_prefix(p).and_then(|r| r.strip_suffix(EXT)).is_some_and(valid_stamp))
}

/// A data do nome (os 17 caracteres antes do `.json`), para ordenar automáticos e conflitos juntos.
fn stamp_of(name: &str) -> &str {
    &name[name.len() - EXT.len() - 17..name.len() - EXT.len()]
}

/// Grava num temporário e renomeia: um arquivo cortado no meio nunca substitui um bom.
/// O temporário tem nome único (dois arquivos na mesma pasta de nuvem não dividem o mesmo `.tmp`, B20), vai
/// para o disco antes do rename (queda de energia não deixa o arquivo vazio, B3) e o rename tenta de novo uma
/// vez: no Windows o OneDrive/antivírus às vezes segura o arquivo por um instante.
pub fn write_atomic(path: &Path, json: &str) -> Result<(), String> {
    let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(format!(".{}.{nanos}.tmp", std::process::id()));
    let tmp = PathBuf::from(tmp);
    let fail = |e: std::io::Error| format!("Não consegui gravar: {e}");
    let mut file = fs::File::create(&tmp).map_err(fail)?;
    file.write_all(json.as_bytes()).and_then(|_| file.sync_all()).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        fail(e)
    })?;
    drop(file);
    fs::rename(&tmp, path).or_else(|_| {
        std::thread::sleep(std::time::Duration::from_millis(150));
        fs::rename(&tmp, path)
    })
    .map_err(|e| {
        let _ = fs::remove_file(&tmp);
        fail(e)
    })
}

pub fn list_in(dir: &Path) -> Result<Vec<BackupEntry>, String> {
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
    out.sort_by(|a, b| stamp_of(&b.name).cmp(stamp_of(&a.name))); // mais novo primeiro (o nome tem a data)
    Ok(out)
}

pub fn write_in(dir: &Path, stamp: &str, json: &str, keep: usize) -> Result<BackupEntry, String> {
    if !valid_stamp(stamp) {
        return Err("Data do backup inválida.".into());
    }
    let keep = keep.clamp(MIN_KEEP, MAX_KEEP);
    fs::create_dir_all(dir).map_err(|e| format!("Não consegui criar a pasta de backup: {e}"))?;
    let name = format!("{PREFIX}{stamp}{EXT}");
    let path = dir.join(&name);
    write_atomic(&path, json)?;
    // um backup por dia: o mais recente do dia substitui os anteriores do mesmo dia
    let today = format!("{PREFIX}{}", &stamp[..10]);
    for same_day in list_in(dir)?.into_iter().filter(|e| e.name.starts_with(&today) && e.name != name) {
        let _ = fs::remove_file(same_day.path);
    }
    for old in list_in(dir)?.into_iter().filter(|e| e.name.starts_with(PREFIX)).skip(keep) {
        let _ = fs::remove_file(old.path);
    }
    let bytes = json.len() as u64;
    Ok(BackupEntry { name, path: path.to_string_lossy().to_string(), bytes })
}

/// A cópia de segurança de antes de restaurar: na mesma pasta dos backups (aparece em Backups guardados) e só as
/// `SAFETY_KEEP` mais novas ficam. Não entra no rodízio dos automáticos nem o desfaz.
pub fn write_safety_in(dir: &Path, stamp: &str, json: &str) -> Result<BackupEntry, String> {
    if !valid_stamp(stamp) {
        return Err("Data da cópia inválida.".into());
    }
    fs::create_dir_all(dir).map_err(|e| format!("Não consegui criar a pasta de backup: {e}"))?;
    let name = format!("{SAFETY_PREFIX}{stamp}{EXT}");
    let path = dir.join(&name);
    write_atomic(&path, json)?;
    for old in list_in(dir)?.into_iter().filter(|e| e.name.starts_with(SAFETY_PREFIX)).skip(SAFETY_KEEP) {
        let _ = fs::remove_file(old.path);
    }
    Ok(BackupEntry { name, path: path.to_string_lossy().to_string(), bytes: json.len() as u64 })
}

/// "Salvar backup" do menu: o arquivo escolhido na janela de salvar é gravado por inteiro ou não é tocado (B6).
pub fn export_to(path: &Path, json: &str) -> Result<(), String> {
    if path.extension().and_then(|e| e.to_str()).is_none_or(|e| !e.eq_ignore_ascii_case("json")) {
        return Err("O backup precisa ser um arquivo .json.".into());
    }
    if path.is_dir() {
        return Err("Escolha um arquivo, não uma pasta.".into());
    }
    write_atomic(path, json)
}

pub fn read_in(dir: &Path, name: &str) -> Result<String, String> {
    if !valid_name(name) {
        return Err("Esse arquivo não é um backup automático do UpVision Maker.".into());
    }
    fs::read_to_string(dir.join(name)).map_err(|e| format!("Não consegui ler o backup: {e}"))
}

/// Pasta escolhida pela usuária, ou a padrão (dados do app/backups/auto).
pub fn resolve(app: &AppHandle, dir: &str) -> Result<PathBuf, String> {
    if let Some(custom) = parse_dir(dir)? {
        return Ok(custom);
    }
    app.path().app_data_dir().map(|d| d.join("backups").join("auto")).map_err(|e| e.to_string())
}

/// A pasta que o front pediu (B28): vazia = a padrão (`None`); senão precisa ser um caminho completo, sem `..`. O front
/// escolhe a pasta numa janela do sistema, então um caminho relativo ou com `..` não vem dela.
pub fn parse_dir(dir: &str) -> Result<Option<PathBuf>, String> {
    let dir = dir.trim();
    if dir.is_empty() {
        return Ok(None);
    }
    let path = PathBuf::from(dir);
    if !path.is_absolute() || path.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
        return Err("Pasta de backup inválida: use o caminho completo da pasta.".into());
    }
    Ok(Some(path))
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
pub fn backup_safety_write(app: AppHandle, dir: String, stamp: String, json: String) -> Result<BackupEntry, String> {
    write_safety_in(&resolve(&app, &dir)?, &stamp, &json)
}

#[tauri::command]
pub fn backup_export(path: String, json: String) -> Result<(), String> {
    export_to(Path::new(&path), &json)
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
    fn pasta_do_backup_so_caminho_completo_sem_pontos_pontos() {
        assert_eq!(parse_dir("").unwrap(), None);
        assert_eq!(parse_dir("  ").unwrap(), None);
        #[cfg(unix)]
        assert_eq!(parse_dir("/Users/ana/OneDrive/UpVision").unwrap(), Some(PathBuf::from("/Users/ana/OneDrive/UpVision")));
        #[cfg(windows)]
        assert!(parse_dir("C:\\Users\\ana\\OneDrive\\UpVision").unwrap().is_some());
        assert!(parse_dir("backups").is_err(), "relativo");
        assert!(parse_dir("../fora").is_err());
        #[cfg(unix)]
        assert!(parse_dir("/Users/ana/../../etc").is_err());
        #[cfg(windows)]
        assert!(parse_dir("C:\\Users\\ana\\..\\..\\Windows").is_err());
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
        let tmps = fs::read_dir(&d).unwrap().filter_map(|e| e.ok()).filter(|e| e.file_name().to_string_lossy().ends_with(".tmp")).count();
        assert_eq!(tmps, 0, "nenhum temporário sobra");
        fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn manter_1_guarda_pelo_menos_2_para_um_dia_ruim_nao_apagar_o_unico_bom() {
        let d = tmpdir("min");
        write_in(&d, "2026-09-01-100000", "bom", 1).unwrap();
        write_in(&d, "2026-09-02-100000", "ruim", 1).unwrap();
        assert_eq!(read_in(&d, "upvision-auto-2026-09-01-100000.json").unwrap(), "bom");
        fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn copia_de_antes_de_restaurar_aparece_na_lista_e_so_as_5_mais_novas_ficam() {
        let d = tmpdir("safety");
        write_in(&d, "2026-09-01-100000", "auto", 5).unwrap();
        for dia in 1..=7 {
            write_safety_in(&d, &format!("2026-09-{dia:02}-120000"), &format!("antes {dia}")).unwrap();
        }
        assert!(valid_name("upvision-antes-2026-09-01-120000.json"));
        let names: Vec<_> = list_in(&d).unwrap().into_iter().map(|e| e.name).collect();
        assert_eq!(names.iter().filter(|n| n.starts_with(SAFETY_PREFIX)).count(), 5);
        assert!(names.contains(&"upvision-antes-2026-09-07-120000.json".to_string()));
        assert!(!names.contains(&"upvision-antes-2026-09-02-120000.json".to_string()));
        assert!(names.contains(&"upvision-auto-2026-09-01-100000.json".to_string()), "o automático não é tocado");
        assert_eq!(read_in(&d, "upvision-antes-2026-09-07-120000.json").unwrap(), "antes 7");
        assert!(write_safety_in(&d, "../x", "{}").is_err());
        fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn salvar_backup_substitui_por_inteiro_e_so_aceita_json() {
        let d = tmpdir("export");
        fs::create_dir_all(&d).unwrap();
        let alvo = d.join("meu-backup.json");
        fs::write(&alvo, "antigo").unwrap();
        export_to(&alvo, "novo e maior").unwrap();
        assert_eq!(fs::read_to_string(&alvo).unwrap(), "novo e maior");
        let tmps = fs::read_dir(&d).unwrap().filter_map(|e| e.ok()).filter(|e| e.file_name().to_string_lossy().ends_with(".tmp")).count();
        assert_eq!(tmps, 0);
        assert!(export_to(&d.join("passwd"), "x").is_err());
        assert!(export_to(&d.join("a.txt"), "x").is_err());
        assert!(export_to(&d, "x").is_err());
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
