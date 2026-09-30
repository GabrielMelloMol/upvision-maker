//! Celular pelo Wi-Fi de casa (#16): o app serve a página leve do celular (phone.html) numa porta aleatória.
//! Segurança: desligado por padrão e nunca lembrado entre aberturas; só aceita aparelhos da rede local
//! (IP privado) e o Host do próprio endereço (contra DNS rebinding); para usar, o celular precisa do código de
//! 6 dígitos mostrado na tela (uso único, vale 10 min; 5 erros travam o pareamento até o computador gerar outro),
//! que vira um cookie de sessão HttpOnly.
//! Os pedidos da API vão para a janela do app (evento `lan-request`), que usa os mesmos repositórios do computador.

use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::net::{IpAddr, UdpSocket};
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use tiny_http::{Header, Request, Response, Server};

const CODE_TTL: Duration = Duration::from_secs(10 * 60);
const MAX_ATTEMPTS: u8 = 5;
const MAX_SESSIONS: usize = 10;
const MAX_BODY: u64 = 16 * 1024;
const APP_TIMEOUT: Duration = Duration::from_secs(15);
const COOKIE: &str = "upv";
/// Pedidos ao mesmo tempo; acima disso, 503 (um aparelho da rede não esgota as threads do app).
const MAX_INFLIGHT: usize = 32;

#[derive(Default)]
pub struct Lan {
    running: Mutex<Option<Running>>,
    pending: Mutex<HashMap<u64, Sender<(u16, String)>>>,
    next_id: AtomicU64,
    inflight: AtomicUsize,
}

struct Running {
    server: Arc<Server>,
    ip: IpAddr,
    port: u16,
    pairing: Pairing,
    sessions: HashSet<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LanStatus {
    running: bool,
    url: String,
    code: String,
    phones: usize,
    /// Errou o código 5 vezes: ninguém pareia até gerar um código novo no computador.
    locked: bool,
}

// ---------- regras puras (testadas) ----------

/// Só aparelhos da rede local: 10.x, 172.16–31.x, 192.168.x, 169.254.x, a própria máquina e IPv6 locais.
pub fn is_local(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => v4.is_private() || v4.is_loopback() || v4.is_link_local(),
        IpAddr::V6(v6) => {
            if let Some(v4) = v6.to_ipv4_mapped() {
                return is_local(IpAddr::V4(v4));
            }
            let first = v6.segments()[0];
            v6.is_loopback() || (first & 0xfe00) == 0xfc00 || (first & 0xffc0) == 0xfe80
        }
    }
}

/// O Host precisa ser o endereço deste app (um site de fora apontando o próprio domínio para cá não passa).
pub fn host_ok(host: Option<&str>, ip: IpAddr, port: u16) -> bool {
    host.is_some_and(|h| [format!("{ip}:{port}"), format!("localhost:{port}"), format!("127.0.0.1:{port}")].iter().any(|ok| ok.eq_ignore_ascii_case(h.trim())))
}

fn random_hex(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    getrandom::fill(&mut buf).expect("gerador aleatório do sistema");
    buf.iter().map(|b| format!("{b:02x}")).collect()
}

fn random_code() -> String {
    let mut buf = [0u8; 4];
    getrandom::fill(&mut buf).expect("gerador aleatório do sistema");
    format!("{:06}", u32::from_le_bytes(buf) % 1_000_000)
}

/// Comparação em tempo constante (não vaza quantos dígitos acertou).
fn same(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

#[derive(Debug, PartialEq)]
pub enum PairResult {
    Ok,
    Wrong,
    Expired,
    TooMany,
    Locked,
}

pub struct Pairing {
    code: String,
    expires: Instant,
    attempts: u8,
    locked: bool,
}

impl Pairing {
    fn new(now: Instant) -> Self {
        Pairing { code: random_code(), expires: now + CODE_TTL, attempts: 0, locked: false }
    }

    /// Código certo → uso único (troca). Vencido → troca (o novo só aparece na tela do computador).
    /// Tentativas esgotadas → trava até o computador gerar outro código (senão daria para chutar para sempre).
    pub fn check(&mut self, given: &str, now: Instant) -> PairResult {
        if self.locked {
            return PairResult::Locked;
        }
        let result = if now > self.expires {
            PairResult::Expired
        } else if same(given.trim(), &self.code) {
            PairResult::Ok
        } else {
            self.attempts += 1;
            if self.attempts >= MAX_ATTEMPTS { PairResult::TooMany } else { PairResult::Wrong }
        };
        if result != PairResult::Wrong {
            *self = Pairing::new(now);
            self.locked = result == PairResult::TooMany;
        }
        result
    }
}

pub fn cookie_token(header: Option<&str>) -> Option<&str> {
    header?.split(';').filter_map(|p| p.trim().strip_prefix(COOKIE)?.strip_prefix('=')).next()
}

/// Endereço deste computador na rede local (a rota padrão; nenhum pacote é enviado).
fn lan_ip() -> IpAddr {
    UdpSocket::bind("0.0.0.0:0")
        .and_then(|s| s.connect("192.168.0.1:9").map(|_| s))
        .and_then(|s| s.local_addr())
        .map(|a| a.ip())
        .unwrap_or(IpAddr::from([127, 0, 0, 1]))
}

// ---------- servidor ----------

fn header<'a>(req: &'a Request, name: &'static str) -> Option<&'a str> {
    req.headers().iter().find(|h| h.field.equiv(name)).map(|h| h.value.as_str())
}

fn h(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).expect("cabeçalho válido")
}

fn send(req: Request, status: u16, content_type: &str, body: Vec<u8>, extra: Vec<Header>) {
    let mut res = Response::from_data(body)
        .with_status_code(status)
        .with_header(h("Content-Type", content_type))
        .with_header(h("Cache-Control", "no-store"))
        .with_header(h("X-Content-Type-Options", "nosniff"))
        .with_header(h("Referrer-Policy", "no-referrer"))
        .with_header(h("X-Frame-Options", "DENY"))
        .with_header(h("Content-Security-Policy", "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'"));
    for x in extra {
        res.add_header(x);
    }
    let _ = req.respond(res);
}

fn json(req: Request, status: u16, body: &str) {
    send(req, status, "application/json; charset=utf-8", body.as_bytes().to_vec(), vec![]);
}

fn error(req: Request, status: u16, message: &str) {
    json(req, status, &serde_json::json!({ "error": message }).to_string());
}

fn serve_asset(app: &AppHandle, req: Request, path: &str) {
    let file = if path == "/" { "phone.html" } else { path.trim_start_matches('/') };
    match app.asset_resolver().get(file.to_string()) {
        Some(a) => {
            let mime = a.mime_type().to_string();
            send(req, 200, &mime, a.bytes, vec![]);
        }
        None => error(req, 404, "Página não encontrada."),
    }
}

fn handle_capped(app: &AppHandle, req: Request) {
    let lan = app.state::<Lan>();
    if lan.inflight.fetch_add(1, Ordering::SeqCst) >= MAX_INFLIGHT {
        lan.inflight.fetch_sub(1, Ordering::SeqCst);
        return error(req, 503, "Muitos pedidos ao mesmo tempo. Tente de novo.");
    }
    handle(app, req);
    lan.inflight.fetch_sub(1, Ordering::SeqCst);
}

fn handle(app: &AppHandle, mut req: Request) {
    let lan = app.state::<Lan>();
    let (ip, port) = match lan.running.lock().unwrap().as_ref() {
        Some(r) => (r.ip, r.port),
        None => return,
    };
    if !req.remote_addr().is_some_and(|a| is_local(a.ip())) {
        return error(req, 403, "Só aparelhos da rede de casa.");
    }
    if !host_ok(header(&req, "Host"), ip, port) {
        return error(req, 403, "Endereço inválido.");
    }
    let path = req.url().split('?').next().unwrap_or("/").to_string();
    let method = req.method().as_str().to_string();
    let is_api = path.starts_with("/api/");
    if !is_api {
        // a página e os scripts dela (não têm dados); fora isso, nada
        return if method == "GET" && (path == "/" || path.starts_with("/assets/")) && !path.contains("..") { serve_asset(app, req, &path) } else { error(req, 404, "Página não encontrada.") };
    }
    if method != "GET" && method != "POST" {
        return error(req, 405, "Método não aceito.");
    }
    // cabeçalho próprio: um site de fora não consegue mandar sem pedir permissão (CORS), e aqui ninguém dá
    if method == "POST" && header(&req, "X-UpVision") != Some("1") {
        return error(req, 403, "Pedido recusado.");
    }
    let is_pair = path == "/api/pair";
    // sessão antes de ler o corpo: quem não pareou não manda nada além do código
    let paired = cookie_token(header(&req, "Cookie")).is_some_and(|t| lan.running.lock().unwrap().as_ref().is_some_and(|r| r.sessions.contains(t)));
    if !is_pair && !paired {
        return error(req, 401, "Conecte com o código que aparece no computador.");
    }
    let mut body = String::new();
    if (&mut req.as_reader()).take(MAX_BODY + 1).read_to_string(&mut body).is_err() || body.len() as u64 > MAX_BODY {
        return error(req, 413, "Pedido grande demais.");
    }

    if is_pair {
        let given = serde_json::from_str::<serde_json::Value>(&body).ok().and_then(|v| v["code"].as_str().map(String::from)).unwrap_or_default();
        let mut guard = lan.running.lock().unwrap();
        let Some(r) = guard.as_mut() else { return };
        return match r.pairing.check(&given, Instant::now()) {
            PairResult::Ok => {
                if r.sessions.len() >= MAX_SESSIONS {
                    drop(guard);
                    return error(req, 429, "Celulares demais conectados. No computador, toque em Desconectar todos.");
                }
                let token = random_hex(32);
                r.sessions.insert(token.clone());
                drop(guard);
                let _ = app.emit("lan-changed", ());
                let cookie = h("Set-Cookie", &format!("{COOKIE}={token}; HttpOnly; SameSite=Strict; Path=/"));
                send(req, 200, "application/json; charset=utf-8", b"{\"ok\":true}".to_vec(), vec![cookie]);
            }
            PairResult::Wrong => {
                drop(guard);
                error(req, 401, "Código errado. Confira na tela do computador.");
            }
            PairResult::Expired => {
                drop(guard);
                let _ = app.emit("lan-changed", ());
                error(req, 401, "Esse código não vale mais. Use o código novo que está na tela do computador.");
            }
            PairResult::TooMany | PairResult::Locked => {
                drop(guard);
                let _ = app.emit("lan-changed", ());
                error(req, 429, "Muitas tentativas erradas. No computador, toque em Gerar código novo.");
            }
        };
    }

    let id = lan.next_id.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = channel();
    lan.pending.lock().unwrap().insert(id, tx);
    let _ = app.emit("lan-request", serde_json::json!({ "id": id, "method": method, "path": path, "body": body }));
    let answer = rx.recv_timeout(APP_TIMEOUT);
    lan.pending.lock().unwrap().remove(&id);
    match answer {
        Ok((status, body)) => json(req, status, &body),
        Err(_) => error(req, 504, "O computador demorou para responder. Toque em Atualizar e confira antes de repetir."),
    }
}

fn status_of(lan: &Lan) -> LanStatus {
    match lan.running.lock().unwrap().as_ref() {
        Some(r) => LanStatus { running: true, url: format!("http://{}:{}/", r.ip, r.port), code: r.pairing.code.clone(), phones: r.sessions.len(), locked: r.pairing.locked },
        None => LanStatus { running: false, url: String::new(), code: String::new(), phones: 0, locked: false },
    }
}

#[tauri::command]
pub fn lan_start(app: AppHandle, lan: State<'_, Lan>) -> Result<LanStatus, String> {
    if lan.running.lock().unwrap().is_none() {
        let server = Arc::new(Server::http("0.0.0.0:0").map_err(|e| format!("Não consegui ligar o acesso do celular: {e}"))?);
        let port = server.server_addr().to_ip().map(|a| a.port()).ok_or("Porta inválida.")?;
        *lan.running.lock().unwrap() = Some(Running { server: server.clone(), ip: lan_ip(), port, pairing: Pairing::new(Instant::now()), sessions: HashSet::new() });
        std::thread::spawn(move || {
            // ponytail: uma thread por pedido; na rede de casa são poucos celulares
            for req in server.incoming_requests() {
                let app = app.clone();
                std::thread::spawn(move || handle_capped(&app, req));
            }
        });
    }
    Ok(status_of(&lan))
}

#[tauri::command]
pub fn lan_stop(lan: State<'_, Lan>) {
    if let Some(r) = lan.running.lock().unwrap().take() {
        r.server.unblock();
    }
}

#[tauri::command]
pub fn lan_status(lan: State<'_, Lan>) -> LanStatus {
    status_of(&lan)
}

/// "Gerar código novo": destrava depois de tentativas erradas (os celulares já conectados continuam).
#[tauri::command]
pub fn lan_new_code(lan: State<'_, Lan>) -> LanStatus {
    if let Some(r) = lan.running.lock().unwrap().as_mut() {
        r.pairing = Pairing::new(Instant::now());
    }
    status_of(&lan)
}

#[tauri::command]
pub fn lan_disconnect_all(lan: State<'_, Lan>) -> LanStatus {
    if let Some(r) = lan.running.lock().unwrap().as_mut() {
        r.sessions.clear();
        r.pairing = Pairing::new(Instant::now());
    }
    status_of(&lan)
}

/// Resposta da janela do app para um `lan-request`.
#[tauri::command]
pub fn lan_respond(lan: State<'_, Lan>, id: u64, status: u16, body: String) {
    if let Some(tx) = lan.pending.lock().unwrap().remove(&id) {
        let _ = tx.send((status, body));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn so_rede_local() {
        for ok in ["192.168.0.10", "10.0.0.5", "172.16.3.4", "172.31.255.1", "127.0.0.1", "169.254.1.1", "::1", "fe80::1", "fd12::1", "::ffff:192.168.1.2"] {
            assert!(is_local(ok.parse().unwrap()), "{ok}");
        }
        for bad in ["8.8.8.8", "172.32.0.1", "100.64.0.1", "2001:4860::8888", "::ffff:8.8.8.8"] {
            assert!(!is_local(bad.parse().unwrap()), "{bad}");
        }
    }

    #[test]
    fn host_so_o_endereco_do_app() {
        let ip: IpAddr = "192.168.0.10".parse().unwrap();
        assert!(host_ok(Some("192.168.0.10:5123"), ip, 5123));
        assert!(host_ok(Some("localhost:5123"), ip, 5123));
        assert!(!host_ok(Some("192.168.0.10:80"), ip, 5123));
        assert!(!host_ok(Some("ataque.com:5123"), ip, 5123));
        assert!(!host_ok(None, ip, 5123));
    }

    #[test]
    fn codigo_uso_unico_vence_e_limita_tentativas() {
        let t0 = Instant::now();
        let mut p = Pairing::new(t0);
        assert_eq!(p.code.len(), 6);
        let code = p.code.clone();
        assert_eq!(p.check("000000x", t0), PairResult::Wrong);
        assert_eq!(p.check(&code, t0), PairResult::Ok);
        assert_ne!(p.code, code, "código certo é trocado (uso único)");
        let code = p.code.clone();
        assert_eq!(p.check(&code, t0 + CODE_TTL + Duration::from_secs(1)), PairResult::Expired);
        let mut p = Pairing::new(t0);
        let code = p.code.clone();
        for _ in 0..MAX_ATTEMPTS - 1 {
            assert_eq!(p.check("errado", t0), PairResult::Wrong);
        }
        assert_eq!(p.check("errado", t0), PairResult::TooMany);
        assert_ne!(p.code, code, "esgotou: código novo, o antigo não vale mais");
        let fresh = p.code.clone();
        assert_eq!(p.check(&fresh, t0), PairResult::Locked, "travado: nem o código novo vale até gerar outro no computador");
        let mut p = Pairing::new(t0);
        let code = p.code.clone();
        assert_eq!(p.check(&code, t0), PairResult::Ok, "gerar código novo destrava");
    }

    #[test]
    fn le_o_cookie_da_sessao() {
        assert_eq!(cookie_token(Some("a=1; upv=abc123; b=2")), Some("abc123"));
        assert_eq!(cookie_token(Some("upvx=1")), None);
        assert_eq!(cookie_token(None), None);
    }

    #[test]
    fn aleatorios() {
        assert_eq!(random_hex(32).len(), 64);
        assert_ne!(random_hex(32), random_hex(32));
        assert!(random_code().chars().all(|c| c.is_ascii_digit()));
    }
}
