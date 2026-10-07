//! Cofre de senhas do sistema (Keychain no macOS, Gerenciador de Credenciais no Windows) para a chave da IA (B26): no
//! banco ela era texto puro, legível por qualquer programa do mesmo usuário. Só nomes da lista abaixo: o front nunca
//! escolhe um nome de credencial qualquer.

use keyring::Entry;

const SERVICE: &str = "com.upvision.maker";
const ALLOWED: [&str; 1] = ["anthropic_api_key"];

fn entry(name: &str) -> Result<Entry, String> {
    if !ALLOWED.contains(&name) {
        return Err("Segredo desconhecido.".into());
    }
    Entry::new(SERVICE, name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secret_get(name: String) -> Result<Option<String>, String> {
    match entry(&name)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn secret_set(name: String, value: String) -> Result<(), String> {
    entry(&name)?.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secret_delete(name: String) -> Result<(), String> {
    match entry(&name)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn so_o_nome_da_chave_da_ia() {
        assert!(entry("anthropic_api_key").is_ok());
        assert!(entry("outra_coisa").is_err());
        assert!(entry("../../etc").is_err());
        assert!(secret_get("backup_dir".into()).is_err());
        assert!(secret_set("x".into(), "y".into()).is_err());
        assert!(secret_delete("x".into()).is_err());
    }

    /// Com o cofre de verdade (pede permissão no Mac): `cargo test -- --ignored`.
    #[test]
    #[ignore]
    fn guarda_le_e_apaga_no_cofre_do_sistema() {
        secret_delete("anthropic_api_key".into()).unwrap();
        assert_eq!(secret_get("anthropic_api_key".into()).unwrap(), None);
        secret_set("anthropic_api_key".into(), "sk-ant-teste".into()).unwrap();
        assert_eq!(secret_get("anthropic_api_key".into()).unwrap().as_deref(), Some("sk-ant-teste"));
        secret_delete("anthropic_api_key".into()).unwrap();
    }
}
