//! Cofre de senhas do sistema para a chave da IA (B26). Só no Windows (Gerenciador de Credenciais, protegido pela conta
//! da pessoa, sem pedir nada). No macOS o app não tem assinatura paga (só "ad hoc"): o requisito de código do app é o
//! hash de cada build, que muda a cada versão, e o Keychain pediria a senha da pessoa para liberar o item de novo a cada
//! atualização. Lá a chave fica no banco local (fora do backup e da sincronização), com o arquivo só do usuário
//! (`secure_data_dir`). Só nomes da lista abaixo: o front nunca escolhe um nome de credencial qualquer.

use std::path::Path;

/// O sistema oferece um cofre que não incomoda a pessoa?
pub const VAULT_AVAILABLE: bool = cfg!(windows);

const UNAVAILABLE: &str = "O cofre de senhas não é usado neste sistema.";
#[cfg(windows)]
const SERVICE: &str = "com.upvision.maker";
const ALLOWED: [&str; 1] = ["anthropic_api_key"];

fn check(name: &str) -> Result<(), String> {
    if !VAULT_AVAILABLE {
        return Err(UNAVAILABLE.into());
    }
    if !ALLOWED.contains(&name) {
        return Err("Segredo desconhecido.".into());
    }
    Ok(())
}

#[cfg(windows)]
fn entry(name: &str) -> Result<keyring::Entry, String> {
    check(name)?;
    keyring::Entry::new(SERVICE, name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secret_vault_available() -> bool {
    VAULT_AVAILABLE
}

// `async`: o cofre pode demorar e comando síncrono roda na thread principal (a janela travaria)
#[tauri::command(async)]
pub fn secret_get(name: String) -> Result<Option<String>, String> {
    check(&name)?;
    #[cfg(windows)]
    return match entry(&name)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    };
    #[cfg(not(windows))]
    Err(UNAVAILABLE.into())
}

#[tauri::command(async)]
pub fn secret_set(name: String, value: String) -> Result<(), String> {
    check(&name)?;
    #[cfg(windows)]
    return entry(&name)?.set_password(&value).map_err(|e| e.to_string());
    #[cfg(not(windows))]
    {
        let _ = value;
        Err(UNAVAILABLE.into())
    }
}

#[tauri::command(async)]
pub fn secret_delete(name: String) -> Result<(), String> {
    check(&name)?;
    #[cfg(windows)]
    return match entry(&name)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    };
    #[cfg(not(windows))]
    Err(UNAVAILABLE.into())
}

/// A pasta do banco (e o banco, o -wal e o -shm) só do usuário: 700 na pasta e 600 nos arquivos. Onde a chave da IA
/// fica no banco (macOS), outras contas do computador não conseguem ler. Windows já protege a pasta pela conta.
#[cfg(unix)]
pub fn secure_data_dir(dir: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::create_dir_all(dir)?;
    std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700))?;
    for name in ["upvision.db", "upvision.db-wal", "upvision.db-shm"] {
        let file = dir.join(name);
        if file.exists() {
            std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o600))?;
        }
    }
    Ok(())
}

#[cfg(not(unix))]
pub fn secure_data_dir(_dir: &Path) -> std::io::Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn so_o_nome_da_chave_da_ia_e_so_onde_ha_cofre() {
        #[cfg(windows)]
        {
            assert!(check("anthropic_api_key").is_ok());
            assert!(secret_vault_available());
        }
        #[cfg(not(windows))]
        {
            assert!(check("anthropic_api_key").is_err(), "no Mac o Keychain nunca é tocado");
            assert!(!secret_vault_available());
            assert!(secret_get("anthropic_api_key".into()).is_err());
            assert!(secret_set("anthropic_api_key".into(), "x".into()).is_err());
            assert!(secret_delete("anthropic_api_key".into()).is_err());
        }
        assert!(check("outra_coisa").is_err());
        assert!(check("../../etc").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn banco_e_pasta_so_do_usuario() {
        use std::os::unix::fs::PermissionsExt;
        let d = std::env::temp_dir().join(format!("upvision-perm-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        for n in ["upvision.db", "upvision.db-wal", "upvision.db-shm", "outro.txt"] {
            std::fs::write(d.join(n), "x").unwrap();
            std::fs::set_permissions(d.join(n), std::fs::Permissions::from_mode(0o644)).unwrap();
        }
        std::fs::set_permissions(&d, std::fs::Permissions::from_mode(0o755)).unwrap();
        secure_data_dir(&d).unwrap();
        let mode = |p: &Path| std::fs::metadata(p).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode(&d), 0o700);
        for n in ["upvision.db", "upvision.db-wal", "upvision.db-shm"] {
            assert_eq!(mode(&d.join(n)), 0o600, "{n}");
        }
        assert_eq!(mode(&d.join("outro.txt")), 0o644, "o resto da pasta não muda");
        secure_data_dir(&d.join("nova")).unwrap(); // pasta que ainda não existe: criada já fechada
        assert_eq!(mode(&d.join("nova")), 0o700);
        std::fs::remove_dir_all(&d).unwrap();
    }
}
