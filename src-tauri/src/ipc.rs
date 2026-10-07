//! Comandos que recebem e devolvem arquivos grandes (o 3MF) como bytes crus: um `Vec<u8>` pelo IPC normal vira um
//! array JSON de números, de 8 a 12 vezes o tamanho do arquivo, na ida e na volta (M21). Os outros parâmetros vão em
//! cabeçalhos da chamada.

use tauri::ipc::{InvokeBody, Request};

/// Os bytes do corpo da chamada.
pub fn raw_body<'a>(req: &'a Request<'_>) -> Result<&'a [u8], String> {
    match req.body() {
        InvokeBody::Raw(bytes) => Ok(bytes),
        InvokeBody::Json(_) => Err("Arquivo inválido: esperava os bytes do arquivo.".into()),
    }
}

/// Um cabeçalho da chamada, como texto.
pub fn header<'a>(req: &'a Request<'_>, name: &str) -> Result<&'a str, String> {
    req.headers().get(name).and_then(|v| v.to_str().ok()).ok_or_else(|| format!("Faltou o parâmetro \"{name}\"."))
}

/// Texto que o front codificou com `encodeURIComponent` (cabeçalho só aceita ASCII; nomes têm acento).
pub fn decode_text(raw: &str) -> Result<String, String> {
    percent_encoding::percent_decode_str(raw).decode_utf8().map(|s| s.into_owned()).map_err(|_| "Texto inválido.".to_string())
}

/// Alturas de pausa (JSON `[2, 3.5]`): números finitos e positivos.
pub fn parse_pauses(json: &str) -> Result<Vec<f64>, String> {
    let pauses: Vec<f64> = serde_json::from_str(json).map_err(|_| "Alturas de pausa inválidas.".to_string())?;
    if pauses.iter().any(|z| !(z.is_finite() && *z > 0.0)) {
        return Err("Altura de pausa inválida.".into());
    }
    Ok(pauses)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nome_com_acento_e_emoji_volta_inteiro_do_cabecalho() {
        assert_eq!(decode_text("Chaveiro%20a%C3%A7a%C3%AD%20%F0%9F%98%80%20%2F%20Ana").unwrap(), "Chaveiro açaí 😀 / Ana");
        assert_eq!(decode_text("simples").unwrap(), "simples");
        assert!(decode_text("%FF%FE").is_err(), "bytes que não são UTF-8");
    }

    #[test]
    fn pausas_do_cabecalho_so_numeros_positivos() {
        assert_eq!(parse_pauses("[2,3.5]").unwrap(), vec![2.0, 3.5]);
        assert_eq!(parse_pauses("[]").unwrap(), Vec::<f64>::new());
        assert!(parse_pauses("[0]").is_err());
        assert!(parse_pauses("[-1]").is_err());
        assert!(parse_pauses("[\"2\"]").is_err());
        assert!(parse_pauses("lixo").is_err());
    }
}
