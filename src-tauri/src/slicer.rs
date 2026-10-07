//! Abrir no fatiador com 1 clique (issue #160).
//!
//! Acha o Bambu Studio, o OrcaSlicer e o PrusaSlicer instalados, grava o 3MF numa pasta do app e abre o
//! fatiador com o arquivo (macOS: `open -a`; Windows e Linux: o executável com o arquivo).

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Manager;

const MAX_MODEL_BYTES: usize = 512 * 1024 * 1024;
const MAX_NAME_CHARS: usize = 80;
const FOLDER: &str = "abrir-no-fatiador";

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Slicer {
    pub id: &'static str,
    pub name: &'static str,
    pub path: String,
}

/// (id, nome, app do macOS, executável no Windows (pasta, exe), executável no Linux)
type Known = (&'static str, &'static str, &'static [&'static str], &'static [(&'static str, &'static str)], &'static str);
const KNOWN: [Known; 3] = [
    ("bambu", "Bambu Studio", &["BambuStudio.app"], &[("Bambu Studio", "bambu-studio.exe")], "bambu-studio"),
    ("orca", "OrcaSlicer", &["OrcaSlicer.app"], &[("OrcaSlicer", "orca-slicer.exe")], "orca-slicer"),
    ("prusa", "PrusaSlicer", &["PrusaSlicer.app", "Original Prusa Drivers/PrusaSlicer.app"], &[("Prusa3D/PrusaSlicer", "prusa-slicer.exe")], "prusa-slicer"),
];

fn home() -> Option<PathBuf> {
    std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from)
}

/// Onde procurar cada fatiador neste sistema (só caminhos; quem confere se existe é `installed`).
fn candidates(os: &str, home: Option<&Path>, program_dirs: &[PathBuf]) -> Vec<(&'static str, &'static str, PathBuf)> {
    let mut out = vec![];
    for (id, name, mac, win, linux) in KNOWN {
        match os {
            "macos" => {
                for app in mac {
                    out.push((id, name, Path::new("/Applications").join(app)));
                    if let Some(h) = home {
                        out.push((id, name, h.join("Applications").join(app)));
                    }
                }
            }
            "windows" => {
                for base in program_dirs {
                    for (dir, exe) in win {
                        out.push((id, name, base.join(dir).join(exe)));
                    }
                }
            }
            _ => {
                for dir in ["/usr/bin", "/usr/local/bin", "/opt/bin"] {
                    out.push((id, name, Path::new(dir).join(linux)));
                }
            }
        }
    }
    out
}

fn os() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(windows) {
        "windows"
    } else {
        "linux"
    }
}

/// Fatiadores instalados, um por id (o primeiro caminho que existe).
pub fn installed() -> Vec<Slicer> {
    let program_dirs: Vec<PathBuf> = ["ProgramFiles", "ProgramW6432", "LOCALAPPDATA"].iter().filter_map(|v| std::env::var_os(v).map(PathBuf::from)).collect();
    let mut out: Vec<Slicer> = vec![];
    for (id, name, path) in candidates(os(), home().as_deref(), &program_dirs) {
        if out.iter().all(|s| s.id != id) && path.exists() {
            out.push(Slicer { id, name, path: path.to_string_lossy().into_owned() });
        }
    }
    out
}

/// Comando que abre `file` no fatiador: no macOS pelo app (`open -a`), nos outros pelo executável.
fn launch_command(os: &str, slicer_path: &str, file: &str) -> (String, Vec<String>) {
    if os == "macos" {
        ("open".into(), vec!["-a".into(), slicer_path.into(), file.into()])
    } else {
        (slicer_path.into(), vec![file.into()])
    }
}

/// Nome de arquivo seguro: letras, números, espaço, - _ e ponto; sem caminho; sempre .3mf.
fn safe_name(name: &str) -> String {
    let stem: String = name.trim().trim_end_matches(".3mf").chars().filter(|c| c.is_alphanumeric() || " -_.".contains(*c)).take(MAX_NAME_CHARS).collect();
    let stem = stem.trim_matches(|c: char| c == '.' || c == ' ');
    let stem = if stem.is_empty() { "modelo".to_string() } else { stem.to_string() };
    // No Windows, CON, PRN, AUX, NUL, COM1–9 e LPT1–9 são nomes de dispositivo, com ou sem extensão ("con.svg.3mf"):
    // o arquivo não é criado direito (B23).
    let first = stem.split('.').next().unwrap_or("").trim_end().to_ascii_uppercase();
    let reserved = matches!(first.as_str(), "CON" | "PRN" | "AUX" | "NUL") || ["COM", "LPT"].iter().any(|p| first.strip_prefix(p).is_some_and(|n| n.len() == 1 && n != "0" && n.chars().all(|c| c.is_ascii_digit())));
    format!("{}{stem}.3mf", if reserved { "modelo-" } else { "" })
}

#[tauri::command]
pub fn slicers_installed() -> Vec<Slicer> {
    installed()
}

/// Grava o 3MF na pasta do app e abre no fatiador `slicer` (id). Devolve o caminho do arquivo.
#[tauri::command]
pub fn open_in_slicer(app: tauri::AppHandle, request: tauri::ipc::Request<'_>) -> Result<String, String> {
    // o 3MF vem como bytes crus; o nome (codificado, pode ter acento) e o fatiador, em cabeçalhos (M21)
    let model = crate::ipc::raw_body(&request)?;
    let name = crate::ipc::decode_text(crate::ipc::header(&request, "x-name")?)?;
    let slicer = crate::ipc::header(&request, "x-slicer")?.to_string();
    if model.is_empty() || model.len() > MAX_MODEL_BYTES {
        return Err("Arquivo vazio ou grande demais para abrir no fatiador.".into());
    }
    let target = installed().into_iter().find(|s| s.id == slicer).ok_or_else(|| format!("Fatiador \"{slicer}\" não encontrado neste computador."))?;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join(FOLDER);
    fs::create_dir_all(&dir).map_err(|e| format!("Não consegui criar a pasta do app: {e}"))?;
    let file = dir.join(safe_name(&name));
    fs::write(&file, model).map_err(|e| format!("Não consegui gravar o arquivo: {e}"))?;
    let file_str = file.to_string_lossy().into_owned();
    let (program, args) = launch_command(os(), &target.path, &file_str);
    Command::new(program).args(args).spawn().map_err(|e| format!("Não consegui abrir o {}: {e}", target.name))?;
    Ok(file_str)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn comando_por_sistema() {
        assert_eq!(launch_command("macos", "/Applications/BambuStudio.app", "/d/a.3mf"), ("open".into(), vec!["-a".into(), "/Applications/BambuStudio.app".into(), "/d/a.3mf".into()]));
        assert_eq!(launch_command("windows", "C:\\PF\\OrcaSlicer\\orca-slicer.exe", "C:\\d\\a.3mf"), ("C:\\PF\\OrcaSlicer\\orca-slicer.exe".into(), vec!["C:\\d\\a.3mf".into()]));
        assert_eq!(launch_command("linux", "/usr/bin/prusa-slicer", "/d/a.3mf"), ("/usr/bin/prusa-slicer".into(), vec!["/d/a.3mf".into()]));
    }

    #[test]
    fn onde_procura_cada_fatiador() {
        let mac = candidates("macos", Some(Path::new("/Users/ana")), &[]);
        assert!(mac.contains(&("bambu", "Bambu Studio", PathBuf::from("/Applications/BambuStudio.app"))));
        assert!(mac.contains(&("orca", "OrcaSlicer", PathBuf::from("/Users/ana/Applications/OrcaSlicer.app"))));
        assert!(mac.contains(&("prusa", "PrusaSlicer", PathBuf::from("/Applications/Original Prusa Drivers/PrusaSlicer.app"))));
        let win = candidates("windows", None, &[PathBuf::from("C:/Program Files")]);
        assert!(win.contains(&("bambu", "Bambu Studio", PathBuf::from("C:/Program Files/Bambu Studio/bambu-studio.exe"))));
        assert!(win.contains(&("prusa", "PrusaSlicer", PathBuf::from("C:/Program Files/Prusa3D/PrusaSlicer/prusa-slicer.exe"))));
        let linux = candidates("linux", None, &[]);
        assert!(linux.contains(&("orca", "OrcaSlicer", PathBuf::from("/usr/bin/orca-slicer"))));
    }

    #[test]
    fn acha_o_bambu_studio_instalado_nesta_maquina() {
        // só confere onde o app existe (no CI sem fatiador, a lista vem vazia e está certo)
        if Path::new("/Applications/BambuStudio.app").exists() {
            assert!(installed().iter().any(|s| s.id == "bambu" && s.name == "Bambu Studio"));
        }
        assert!(installed().iter().all(|s| Path::new(&s.path).exists()));
    }

    #[test]
    fn nome_de_arquivo_seguro() {
        assert_eq!(safe_name("Chaveiro Ana"), "Chaveiro Ana.3mf");
        assert_eq!(safe_name("../../etc/passwd"), "etcpasswd.3mf");
        assert_eq!(safe_name("medalha.3mf"), "medalha.3mf");
        assert_eq!(safe_name("  "), "modelo.3mf");
        // nomes reservados do Windows ganham um prefixo, com ou sem extensão (B23)
        assert_eq!(safe_name("con"), "modelo-con.3mf");
        assert_eq!(safe_name("CON.svg"), "modelo-CON.svg.3mf");
        assert_eq!(safe_name("Nul"), "modelo-Nul.3mf");
        assert_eq!(safe_name("com1"), "modelo-com1.3mf");
        assert_eq!(safe_name("LPT9.x"), "modelo-LPT9.x.3mf");
        assert_eq!(safe_name("com10"), "com10.3mf");
        assert_eq!(safe_name("console"), "console.3mf");
        assert_eq!(safe_name("aux "), "modelo-aux.3mf");
        assert_eq!(safe_name(&"x".repeat(200)).len(), MAX_NAME_CHARS + 4);
    }
}
