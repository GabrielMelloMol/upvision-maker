//! Conector de IA (MCP, #304): deixa uma IA no mesmo computador (Claude Code, Claude Desktop) consultar e criar
//! rascunhos no app. Segurança: desligado por padrão; escuta só 127.0.0.1 numa porta fixa (para a configuração da IA
//! não mudar a cada abertura); exige a chave secreta no cabeçalho `Authorization`; recusa qualquer pedido com `Origin`
//! (vindo de um site aberto no navegador) e Host diferente do próprio endereço (contra DNS rebinding).
//! Os pedidos vão para a janela do app (evento `mcp-request`), que responde com os mesmos repositórios do computador.

use crate::lan::{error, header, lock, same};
use serde::Serialize;
use std::collections::HashMap;
use std::io::Read;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tiny_http::{Request, Response, Server};

pub const PORT: u16 = 47821;
const MAX_BODY: u64 = 64 * 1024;
const APP_TIMEOUT: Duration = Duration::from_secs(20);
const MAX_INFLIGHT: usize = 8;

#[derive(Default)]
pub struct Mcp {
    running: Mutex<Option<Running>>,
    pending: Mutex<HashMap<u64, Sender<String>>>,
    next_id: AtomicU64,
    inflight: AtomicUsize,
}

struct Running {
    server: Arc<Server>,
    token: String,
}

#[derive(Serialize)]
pub struct McpStatus {
    running: bool,
    url: String,
}

/// Tudo o que vem antes de ler o corpo. A chave é conferida antes do método: sem ela, ninguém descobre nada.
pub fn gate(method: &str, path: &str, host: Option<&str>, origin: Option<&str>, auth: Option<&str>, token: &str) -> Result<(), (u16, &'static str)> {
    if path != "/mcp" {
        return Err((404, "Não encontrado."));
    }
    let host_ok = host.is_some_and(|h| [format!("127.0.0.1:{PORT}"), format!("localhost:{PORT}")].iter().any(|ok| ok.eq_ignore_ascii_case(h.trim())));
    if !host_ok || origin.is_some() {
        return Err((403, "Pedido recusado."));
    }
    let given = auth.and_then(|a| a.trim().strip_prefix("Bearer ")).unwrap_or_default().trim();
    if token.is_empty() || !same(given, token) {
        return Err((401, "Chave inválida. Copie a configuração de novo em Preferências → Dados → IA no app."));
    }
    // só respostas diretas em JSON: sem fluxo SSE (GET) e sem sessão para encerrar (DELETE)
    if method != "POST" {
        return Err((405, "Método não aceito."));
    }
    Ok(())
}

fn handle(app: &AppHandle, mut req: Request) {
    let mcp = app.state::<Mcp>();
    let Some(token) = lock(&mcp.running).as_ref().map(|r| r.token.clone()) else { return };
    if !req.remote_addr().is_some_and(|a| a.ip().is_loopback()) {
        return error(req, 403, "Só deste computador.");
    }
    let path = req.url().split('?').next().unwrap_or("/").to_string();
    let method = req.method().as_str().to_string();
    if let Err((status, message)) = gate(&method, &path, header(&req, "Host"), header(&req, "Origin"), header(&req, "Authorization"), &token) {
        return error(req, status, message);
    }
    let mut body = String::new();
    if (&mut req.as_reader()).take(MAX_BODY + 1).read_to_string(&mut body).is_err() || body.len() as u64 > MAX_BODY {
        return error(req, 413, "Pedido grande demais.");
    }
    let id = mcp.next_id.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = channel();
    lock(&mcp.pending).insert(id, tx);
    let _ = app.emit("mcp-request", serde_json::json!({ "id": id, "body": body }));
    let answer = rx.recv_timeout(APP_TIMEOUT);
    lock(&mcp.pending).remove(&id);
    match answer {
        // resposta vazia = era só um aviso (notificação JSON-RPC): 202 sem corpo, como pede o protocolo
        Ok(body) if body.is_empty() => {
            let _ = req.respond(Response::empty(202));
        }
        Ok(body) => crate::lan::json(req, 200, &body),
        Err(_) => error(req, 504, "O app demorou para responder."),
    }
}

fn status_of(mcp: &Mcp) -> McpStatus {
    let running = lock(&mcp.running).is_some();
    McpStatus { running, url: if running { format!("http://127.0.0.1:{PORT}/mcp") } else { String::new() } }
}

/// Liga (ou troca a chave, se já estava ligado). A chave vem da janela, que a guarda no banco local.
#[tauri::command]
pub fn mcp_start(app: AppHandle, mcp: State<'_, Mcp>, token: String) -> Result<McpStatus, String> {
    if token.len() < 32 {
        return Err("Chave curta demais.".into());
    }
    if let Some(r) = lock(&mcp.running).as_mut() {
        r.token = token;
        return Ok(status_of(&mcp));
    }
    let server = Arc::new(Server::http(("127.0.0.1", PORT)).map_err(|e| format!("A porta {PORT} está ocupada por outro programa ({e}).", ))?);
    *lock(&mcp.running) = Some(Running { server: server.clone(), token });
    std::thread::spawn(move || {
        for req in server.incoming_requests() {
            let app = app.clone();
            std::thread::spawn(move || {
                let mcp = app.state::<Mcp>();
                if mcp.inflight.fetch_add(1, Ordering::SeqCst) >= MAX_INFLIGHT {
                    error(req, 503, "Muitos pedidos ao mesmo tempo.");
                } else {
                    handle(&app, req);
                }
                mcp.inflight.fetch_sub(1, Ordering::SeqCst);
            });
        }
    });
    Ok(status_of(&mcp))
}

#[tauri::command]
pub fn mcp_stop(mcp: State<'_, Mcp>) {
    if let Some(r) = lock(&mcp.running).take() {
        r.server.unblock();
    }
}

#[tauri::command]
pub fn mcp_status(mcp: State<'_, Mcp>) -> McpStatus {
    status_of(&mcp)
}

/// Resposta da janela do app para um `mcp-request` (texto JSON-RPC; vazio para notificação).
#[tauri::command]
pub fn mcp_respond(mcp: State<'_, Mcp>, id: u64, body: String) {
    if let Some(tx) = lock(&mcp.pending).remove(&id) {
        let _ = tx.send(body);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const T: &str = "0123456789abcdef0123456789abcdef";
    const HOST: Option<&str> = Some("127.0.0.1:47821");
    const AUTH: Option<&str> = Some("Bearer 0123456789abcdef0123456789abcdef");

    #[test]
    fn so_com_a_chave_certa_do_proprio_computador() {
        assert_eq!(gate("POST", "/mcp", HOST, None, AUTH, T), Ok(()));
        assert_eq!(gate("POST", "/mcp", Some("localhost:47821"), None, AUTH, T), Ok(()));
        assert_eq!(gate("POST", "/mcp", HOST, None, Some("Bearer errada"), T).unwrap_err().0, 401);
        assert_eq!(gate("POST", "/mcp", HOST, None, None, T).unwrap_err().0, 401);
        assert_eq!(gate("POST", "/mcp", HOST, None, Some(""), "").unwrap_err().0, 401, "sem chave guardada ninguém entra");
    }

    #[test]
    fn site_aberto_no_navegador_nao_entra() {
        assert_eq!(gate("POST", "/mcp", HOST, Some("https://ataque.com"), AUTH, T).unwrap_err().0, 403, "Origin = veio de uma página");
        assert_eq!(gate("POST", "/mcp", Some("ataque.com:47821"), None, AUTH, T).unwrap_err().0, 403, "DNS rebinding");
        assert_eq!(gate("POST", "/mcp", None, None, AUTH, T).unwrap_err().0, 403);
    }

    #[test]
    fn so_post_no_caminho_mcp() {
        assert_eq!(gate("GET", "/mcp", HOST, None, AUTH, T).unwrap_err().0, 405);
        assert_eq!(gate("DELETE", "/mcp", HOST, None, AUTH, T).unwrap_err().0, 405);
        assert_eq!(gate("POST", "/", HOST, None, AUTH, T).unwrap_err().0, 404);
        assert_eq!(gate("GET", "/mcp", HOST, None, None, T).unwrap_err().0, 401, "sem chave nem o método é revelado");
    }
}
