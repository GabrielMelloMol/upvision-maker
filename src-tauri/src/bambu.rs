//! Projeto do Bambu Studio com pausa (issue #11).
//!
//! O Bambu Studio só lê a pausa (`custom_gcode_per_layer.xml`) de projetos gerados por ele, com as
//! configurações completas da impressora. Então rodamos o CLI do Bambu Studio instalado na máquina:
//! ele importa o 3MF do app, aplica a pausa (`--load-custom-gcodes`) e os presets que o usuário está
//! usando agora (lidos do BambuStudio.conf), e exporta um projeto que abre com a pausa pronta.
//!
//! Os perfis JSON herdam uns dos outros (`inherits`); o CLI não resolve isso sozinho (sairia com
//! `machine_pause_gcode` vazio e mesa errada), por isso achatamos a herança antes.

use serde_json::{json, Map, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

const DEFAULT_MACHINE: &str = "Bambu Lab A1 0.4 nozzle";
const DEFAULT_PROCESS: &str = "0.20mm Standard @BBL A1";
const DEFAULT_FILAMENT: &str = "Bambu PLA Basic @BBL A1";
const MAX_INHERITS: usize = 16;
const MAX_FILAMENTS: u32 = 16;

fn home() -> Option<PathBuf> {
    std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from)
}

/// Executável do Bambu Studio e a pasta `profiles` que vem com ele.
fn install() -> Option<(PathBuf, PathBuf)> {
    let mut apps: Vec<PathBuf> = vec![PathBuf::from("/Applications/BambuStudio.app")];
    if let Some(h) = home() {
        apps.push(h.join("Applications/BambuStudio.app"));
    }
    for app in apps {
        let exe = app.join("Contents/MacOS/BambuStudio");
        if exe.is_file() {
            return Some((exe, app.join("Contents/Resources/profiles")));
        }
    }
    for var in ["ProgramFiles", "ProgramW6432", "LOCALAPPDATA"] {
        if let Some(base) = std::env::var_os(var) {
            let dir = PathBuf::from(base).join("Bambu Studio");
            let exe = dir.join("bambu-studio.exe");
            if exe.is_file() {
                return Some((exe, dir.join("resources/profiles")));
            }
        }
    }
    for dir in ["/usr/bin", "/usr/local/bin", "/opt/bambu-studio/bin"] {
        let exe = Path::new(dir).join("bambu-studio");
        if exe.is_file() {
            return Some((exe, PathBuf::from("/usr/share/bambu-studio/profiles")));
        }
    }
    None
}

/// Pasta de dados do Bambu Studio (BambuStudio.conf, perfis atualizados e do usuário).
fn data_dir() -> Option<PathBuf> {
    if cfg!(target_os = "macos") {
        home().map(|h| h.join("Library/Application Support/BambuStudio"))
    } else if cfg!(windows) {
        std::env::var_os("APPDATA").map(|a| PathBuf::from(a).join("BambuStudio"))
    } else {
        home().map(|h| h.join(".config/BambuStudio"))
    }
}

/// Presets selecionados agora no Bambu Studio (impressora, processo, filamentos).
fn current_presets(data: Option<&Path>) -> (String, String, Vec<String>) {
    let conf: Value = data
        .and_then(|d| fs::read_to_string(d.join("BambuStudio.conf")).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(Value::Null);
    let p = &conf["presets"];
    let text = |k: &str, d: &str| p[k].as_str().filter(|s| !s.is_empty()).unwrap_or(d).to_string();
    let filaments: Vec<String> = p["filaments"]
        .as_array()
        .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();
    let filaments = if filaments.is_empty() { vec![DEFAULT_FILAMENT.to_string()] } else { filaments };
    (text("machine", DEFAULT_MACHINE), text("process", DEFAULT_PROCESS), filaments)
}

/// Pastas onde procurar perfis de um tipo: do usuário, sistema atualizado e os que vêm com o app.
fn profile_dirs(kind: &str, data: Option<&Path>, bundled: &Path) -> Vec<PathBuf> {
    let mut roots = vec![];
    if let Some(d) = data {
        roots.push(d.join("user"));
        roots.push(d.join("system"));
    }
    roots.push(bundled.to_path_buf());
    let mut out = vec![];
    for root in roots {
        // <root>/<vendor ou id do usuário>/<kind>[/base]
        for entry in fs::read_dir(&root).into_iter().flatten().flatten() {
            let dir = entry.path().join(kind);
            if dir.is_dir() {
                out.push(dir.join("base"));
                out.push(dir);
            }
        }
    }
    out
}

fn find_profile(name: &str, dirs: &[PathBuf]) -> Option<Map<String, Value>> {
    let file = format!("{name}.json");
    dirs.iter()
        .map(|d| d.join(&file))
        .find(|p| p.is_file())
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .and_then(|v| v.as_object().cloned())
}

/// Perfil com a herança (`inherits`) resolvida: os campos do filho sobrescrevem os do pai.
fn flatten(name: &str, dirs: &[PathBuf]) -> Result<Map<String, Value>, String> {
    let mut chain = vec![];
    let mut next = Some(name.to_string());
    while let Some(n) = next {
        if chain.len() >= MAX_INHERITS {
            return Err(format!("Perfil \"{name}\" com herança circular."));
        }
        let p = find_profile(&n, dirs).ok_or_else(|| format!("Perfil \"{n}\" não encontrado no Bambu Studio."))?;
        next = p.get("inherits").and_then(Value::as_str).filter(|s| !s.is_empty()).map(String::from);
        chain.push(p);
    }
    let mut out = Map::new();
    for p in chain.into_iter().rev() {
        out.extend(p);
    }
    out.remove("inherits");
    out.insert("name".into(), json!(name));
    Ok(out)
}

/// JSON do `--load-custom-gcodes`: uma pausa por altura (topo da camada antes da qual pausa).
fn pause_json(pauses: &[f64], filaments: u32) -> Value {
    let gcodes: Vec<Value> = pauses
        .iter()
        .map(|z| json!({ "type": "PausePrint", "print_z": z, "color": "", "extruder": 1, "extra": "" }))
        .collect();
    json!({ "mode": if filaments > 1 { "MultiAsSingle" } else { "SingleExtruder" }, "gcodes": gcodes })
}

fn run(model: &[u8], pauses: &[f64], filaments: u32) -> Result<Vec<u8>, String> {
    let (exe, bundled) = install().ok_or("Bambu Studio não encontrado. Instale-o ou abra o 3MF no OrcaSlicer, que já lê a pausa.")?;
    let data = data_dir();
    let (machine, process, fils) = current_presets(data.as_deref());
    let dirs = |kind| profile_dirs(kind, data.as_deref(), &bundled);

    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let tmp = std::env::temp_dir().join(format!("upvision-bambu-{}-{stamp}", std::process::id()));
    fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
    let result = (|| {
        let write = |file: &str, v: &Value| fs::write(tmp.join(file), v.to_string()).map_err(|e| e.to_string());
        write("machine.json", &Value::Object(flatten(&machine, &dirs("machine"))?))?;
        write("process.json", &Value::Object(flatten(&process, &dirs("process"))?))?;
        let mut fil_args = vec![];
        for i in 0..filaments {
            let file = format!("filament{i}.json");
            write(&file, &Value::Object(flatten(&fils[i as usize % fils.len()], &dirs("filament"))?))?;
            fil_args.push(tmp.join(file).to_string_lossy().into_owned());
        }
        write("pause.json", &pause_json(pauses, filaments))?;
        fs::write(tmp.join("modelo.3mf"), model).map_err(|e| e.to_string())?;

        let arg = |f: &str| tmp.join(f).to_string_lossy().into_owned();
        let out = Command::new(&exe)
            .arg("--load-settings")
            .arg(format!("{};{}", arg("machine.json"), arg("process.json")))
            .arg("--load-filaments")
            .arg(fil_args.join(";"))
            .arg("--load-custom-gcodes")
            .arg(arg("pause.json"))
            .arg("--outputdir")
            .arg(&tmp)
            .arg("--export-3mf")
            .arg("projeto.3mf")
            .arg(arg("modelo.3mf"))
            .output()
            .map_err(|e| format!("Não consegui rodar o Bambu Studio: {e}"))?;
        fs::read(tmp.join("projeto.3mf")).map_err(|_| {
            let log = String::from_utf8_lossy(&out.stderr);
            let last = log.lines().filter(|l| !l.trim().is_empty()).last().unwrap_or("");
            format!("O Bambu Studio não gerou o projeto (código {:?}). {last}", out.status.code())
        })
    })();
    let _ = fs::remove_dir_all(&tmp);
    result
}

/// 3MF do app → projeto do Bambu Studio com as pausas, usando os presets atuais do usuário.
#[tauri::command]
pub async fn bambu_project(model: Vec<u8>, pauses: Vec<f64>, filaments: u32) -> Result<Vec<u8>, String> {
    if pauses.iter().any(|z| !(z.is_finite() && *z > 0.0)) {
        return Err("Altura de pausa inválida.".into());
    }
    let n = filaments.clamp(1, MAX_FILAMENTS);
    tauri::async_runtime::spawn_blocking(move || run(&model, &pauses, n)).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dir_with(tag: &str, files: &[(&str, &str)]) -> PathBuf {
        let d = std::env::temp_dir().join(format!("bambu-test-{}-{tag}", std::process::id()));
        fs::create_dir_all(&d).unwrap();
        for (n, c) in files {
            fs::write(d.join(format!("{n}.json")), c).unwrap();
        }
        d
    }

    #[test]
    fn flatten_resolve_heranca_filho_sobrescreve() {
        let d = dir_with("heranca", &[
            ("base", r#"{"a":1,"machine_pause_gcode":"M400 U1","b":1}"#),
            ("meio", r#"{"inherits":"base","b":2}"#),
            ("A1", r#"{"inherits":"meio","c":3}"#),
        ]);
        let f = flatten("A1", &[d]).unwrap();
        assert_eq!(f["machine_pause_gcode"], "M400 U1");
        assert_eq!(f["b"], 2);
        assert_eq!(f["c"], 3);
        assert_eq!(f["name"], "A1");
        assert!(!f.contains_key("inherits"));
    }

    #[test]
    fn flatten_erro_quando_falta_perfil_ou_ha_ciclo() {
        let d = dir_with("erros", &[("x", r#"{"inherits":"y"}"#), ("y", r#"{"inherits":"x"}"#), ("z", r#"{"inherits":"nada"}"#)]);
        assert!(flatten("x", &[d.clone()]).unwrap_err().contains("circular"));
        assert!(flatten("z", &[d]).unwrap_err().contains("\"nada\" não encontrado"));
    }

    #[test]
    fn pause_json_no_formato_do_cli() {
        let j = pause_json(&[2.0], 1);
        assert_eq!(j["mode"], "SingleExtruder");
        assert_eq!(j["gcodes"][0]["type"], "PausePrint");
        assert_eq!(j["gcodes"][0]["print_z"], 2.0);
        assert_eq!(pause_json(&[2.0], 2)["mode"], "MultiAsSingle");
    }

    #[test]
    fn presets_padrao_sem_conf() {
        let (m, p, f) = current_presets(None);
        assert_eq!((m.as_str(), p.as_str(), f), (DEFAULT_MACHINE, DEFAULT_PROCESS, vec![DEFAULT_FILAMENT.to_string()]));
    }

    /// Ponta a ponta com o Bambu Studio instalado: `BAMBU_3MF=/caminho/modelo.3mf cargo test -- --ignored`.
    #[test]
    #[ignore]
    fn cli_real_gera_projeto_com_pausa() {
        let model = fs::read(std::env::var("BAMBU_3MF").unwrap()).unwrap();
        let out = run(&model, &[2.0], 2).unwrap();
        let s = String::from_utf8_lossy(&out);
        assert!(s.contains("custom_gcode_per_layer.xml") && s.contains("project_settings.config"));
        fs::write(std::env::temp_dir().join("bambu-projeto-teste.3mf"), out).unwrap();
    }
}
