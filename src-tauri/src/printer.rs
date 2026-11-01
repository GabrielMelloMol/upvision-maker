//! Ler as impressoras Bambu pela rede de casa (#15): só leitura, nenhum comando de impressão.
//! - Achar: as Bambu anunciam IP, número de série e nome a cada poucos segundos (UDP 2021); só escutamos.
//! - Ler: MQTT sobre TLS na porta 8883 (usuário `bblp`, senha = código de acesso da tela da impressora). Assina
//!   `device/<série>/report` e pede o estado completo uma vez (`pushall`, também só leitura).
//!
//! O certificado da impressora é próprio dela (não de uma autoridade pública): guardamos a impressão digital na primeira
//!   conexão e recusamos se mudar (alguém na rede se passando pela impressora para pegar o código de acesso).
//!
//! Cada relatório vai para a janela (evento `printer-report`), que junta os pedaços e mostra.

use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::crypto::{ring, verify_tls12_signature, verify_tls13_signature, CryptoProvider};
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::{ClientConfig, ClientConnection, DigitallySignedStruct, SignatureScheme, StreamOwned};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{ErrorKind, Read, Write};
use std::net::{IpAddr, SocketAddr, TcpStream, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

use crate::lan::{is_local, lock};

const PORT: u16 = 8883;
const MAX_PACKET: usize = 1024 * 1024;
const KEEPALIVE: Duration = Duration::from_secs(30);
const RETRY: Duration = Duration::from_secs(15);

#[derive(Default)]
pub struct Printers {
    /// Série → sinal de parar da conexão em andamento.
    watching: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Found {
    ip: String,
    serial: String,
    model: String,
    name: String,
}

// ---------- regras puras (testadas) ----------

/// Um anúncio SSDP da Bambu → a impressora (só se tiver IP e série).
pub fn parse_notify(text: &str) -> Option<Found> {
    let get = |k: &str| text.lines().find_map(|l| l.split_once(':').filter(|(a, _)| a.trim().eq_ignore_ascii_case(k)).map(|(_, v)| v.trim().to_string()));
    let ip = get("Location")?;
    let serial = get("USN")?;
    ip.parse::<IpAddr>().ok()?;
    valid_serial(&serial).then(|| Found { ip, serial, model: get("DevModel.bambu.com").unwrap_or_default(), name: get("DevName.bambu.com").unwrap_or_default() })
}

pub fn valid_serial(s: &str) -> bool {
    (8..=24).contains(&s.len()) && s.bytes().all(|b| b.is_ascii_alphanumeric())
}

pub fn valid_code(s: &str) -> bool {
    (4..=16).contains(&s.len()) && s.bytes().all(|b| b.is_ascii_alphanumeric())
}

fn put_str(out: &mut Vec<u8>, s: &[u8]) {
    out.extend_from_slice(&(s.len() as u16).to_be_bytes());
    out.extend_from_slice(s);
}

/// Pacote MQTT 3.1.1: tipo + tamanho (varint) + corpo.
fn packet(kind: u8, body: &[u8]) -> Vec<u8> {
    let mut out = vec![kind];
    let mut n = body.len();
    loop {
        let mut b = (n % 128) as u8;
        n /= 128;
        if n > 0 {
            b |= 0x80;
        }
        out.push(b);
        if n == 0 {
            break;
        }
    }
    out.extend_from_slice(body);
    out
}

pub fn connect_packet(client_id: &str, code: &str) -> Vec<u8> {
    let mut b = Vec::new();
    put_str(&mut b, b"MQTT");
    b.extend_from_slice(&[4, 0xC2]); // versão 3.1.1; usuário, senha, sessão limpa
    b.extend_from_slice(&(KEEPALIVE.as_secs() as u16 * 2).to_be_bytes());
    put_str(&mut b, client_id.as_bytes());
    put_str(&mut b, b"bblp");
    put_str(&mut b, code.as_bytes());
    packet(0x10, &b)
}

pub fn subscribe_packet(topic: &str) -> Vec<u8> {
    let mut b = vec![0, 1];
    put_str(&mut b, topic.as_bytes());
    b.push(0);
    packet(0x82, &b)
}

pub fn publish_packet(topic: &str, payload: &str) -> Vec<u8> {
    let mut b = Vec::new();
    put_str(&mut b, topic.as_bytes());
    b.extend_from_slice(payload.as_bytes());
    packet(0x30, &b)
}

/// Lê um pacote inteiro: (tipo e bandeiras, corpo).
fn read_packet(r: &mut impl Read) -> std::io::Result<(u8, Vec<u8>)> {
    let mut h = [0u8; 1];
    r.read_exact(&mut h)?;
    let (mut len, mut mult) = (0usize, 1usize);
    for _ in 0..4 {
        let mut b = [0u8; 1];
        r.read_exact(&mut b)?;
        len += (b[0] & 0x7F) as usize * mult;
        if b[0] & 0x80 == 0 {
            if len > MAX_PACKET {
                return Err(std::io::Error::new(ErrorKind::InvalidData, "pacote grande demais"));
            }
            let mut body = vec![0u8; len];
            r.read_exact(&mut body)?;
            return Ok((h[0], body));
        }
        mult *= 128;
    }
    Err(std::io::Error::new(ErrorKind::InvalidData, "tamanho inválido"))
}

/// O conteúdo de um PUBLISH (pula o tópico e, com QoS > 0, o id).
pub fn publish_payload(flags: u8, body: &[u8]) -> Option<&[u8]> {
    let tlen = u16::from_be_bytes([*body.first()?, *body.get(1)?]) as usize;
    let skip = 2 + tlen + if flags & 0x06 != 0 { 2 } else { 0 };
    body.get(skip..)
}

pub fn connack_error(rc: u8) -> Option<&'static str> {
    match rc {
        0 => None,
        4 | 5 => Some("Código de acesso errado. Confira na tela da impressora (Configurações → Rede/WLAN)."),
        _ => Some("A impressora recusou a conexão."),
    }
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

// ---------- certificado: confia no primeiro e guarda (TOFU) ----------

#[derive(Debug)]
struct Pin {
    want: String,
    seen: Mutex<String>,
    provider: Arc<CryptoProvider>,
}

impl ServerCertVerifier for Pin {
    fn verify_server_cert(&self, end_entity: &CertificateDer<'_>, _: &[CertificateDer<'_>], _: &ServerName<'_>, _: &[u8], _: UnixTime) -> Result<ServerCertVerified, rustls::Error> {
        let got = hex(&Sha256::digest(end_entity.as_ref()));
        *lock(&self.seen) = got.clone();
        if !self.want.is_empty() && self.want != got {
            return Err(rustls::Error::General("certificado diferente".into()));
        }
        Ok(ServerCertVerified::assertion())
    }
    fn verify_tls12_signature(&self, m: &[u8], c: &CertificateDer<'_>, d: &DigitallySignedStruct) -> Result<HandshakeSignatureValid, rustls::Error> {
        verify_tls12_signature(m, c, d, &self.provider.signature_verification_algorithms)
    }
    fn verify_tls13_signature(&self, m: &[u8], c: &CertificateDer<'_>, d: &DigitallySignedStruct) -> Result<HandshakeSignatureValid, rustls::Error> {
        verify_tls13_signature(m, c, d, &self.provider.signature_verification_algorithms)
    }
    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.provider.signature_verification_algorithms.supported_schemes()
    }
}

type Conn = StreamOwned<ClientConnection, TcpStream>;

fn open(ip: IpAddr, serial: &str, code: &str, pin: &str) -> Result<(Conn, String), String> {
    let provider = Arc::new(ring::default_provider());
    let verifier = Arc::new(Pin { want: pin.to_string(), seen: Mutex::new(String::new()), provider: provider.clone() });
    let config = ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .map_err(|e| e.to_string())?
        .dangerous() // a verificação é a impressão digital guardada (acima), não uma autoridade pública
        .with_custom_certificate_verifier(verifier.clone())
        .with_no_client_auth();
    let tcp = TcpStream::connect_timeout(&SocketAddr::new(ip, PORT), Duration::from_secs(5)).map_err(|_| "A impressora não respondeu. Ela está ligada e no mesmo Wi-Fi? Confira o endereço IP.".to_string())?;
    tcp.set_read_timeout(Some(Duration::from_secs(8))).map_err(|e| e.to_string())?;
    let conn = ClientConnection::new(Arc::new(config), ServerName::IpAddress(ip.into())).map_err(|e| e.to_string())?;
    let mut s = StreamOwned::new(conn, tcp);
    let mut id = [0u8; 6];
    getrandom::fill(&mut id).map_err(|e| e.to_string())?;
    let handshake = s.write_all(&connect_packet(&format!("upvision-{}", hex(&id)), code));
    let fingerprint = lock(&verifier.seen).clone();
    if let Err(e) = handshake {
        return Err(if !pin.is_empty() && fingerprint != pin && !fingerprint.is_empty() {
            "A impressora respondeu com outro certificado. Se ela foi atualizada, toque em Esquecer e conecte de novo; se não, alguém na rede pode estar se passando por ela.".into()
        } else {
            format!("Não consegui uma conexão segura com a impressora ({e}).")
        });
    }
    let (kind, body) = read_packet(&mut s).map_err(|_| "A impressora não confirmou a conexão.".to_string())?;
    if kind >> 4 != 2 || body.len() < 2 {
        return Err("Resposta inesperada da impressora.".into());
    }
    if let Some(msg) = connack_error(body[1]) {
        return Err(msg.into());
    }
    s.write_all(&subscribe_packet(&format!("device/{serial}/report"))).map_err(|e| e.to_string())?;
    s.write_all(&publish_packet(&format!("device/{serial}/request"), r#"{"pushing":{"sequence_id":"0","command":"pushall"}}"#)).map_err(|e| e.to_string())?;
    s.sock.set_read_timeout(Some(Duration::from_secs(1))).map_err(|e| e.to_string())?;
    Ok((s, fingerprint))
}

/// Lê até cair ou mandarem parar. Ok(()) = parou de propósito.
fn pump(app: &AppHandle, serial: &str, mut s: Conn, stop: &AtomicBool) -> Result<(), String> {
    let mut last_ping = Instant::now();
    while !stop.load(Ordering::Relaxed) {
        if last_ping.elapsed() >= KEEPALIVE {
            s.write_all(&[0xC0, 0]).map_err(|e| e.to_string())?;
            last_ping = Instant::now();
        }
        match read_packet(&mut s) {
            Ok((kind, body)) if kind >> 4 == 3 => {
                if let Some(p) = publish_payload(kind, &body) {
                    let _ = app.emit("printer-report", serde_json::json!({ "serial": serial, "report": String::from_utf8_lossy(p) }));
                }
            }
            Ok(_) => {}
            Err(e) if matches!(e.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(())
}

/// Procura impressoras Bambu na rede por alguns segundos (elas anunciam sozinhas).
#[tauri::command]
pub async fn printer_discover() -> Result<Vec<Found>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let sock = UdpSocket::bind("0.0.0.0:2021").map_err(|e| format!("Não consegui escutar a rede ({e}). Feche o Bambu Studio e tente de novo."))?;
        sock.set_read_timeout(Some(Duration::from_millis(500))).map_err(|e| e.to_string())?;
        let mut found: Vec<Found> = Vec::new();
        let end = Instant::now() + Duration::from_secs(6);
        let mut buf = [0u8; 2048];
        while Instant::now() < end {
            if let Ok((n, from)) = sock.recv_from(&mut buf) {
                if let Some(f) = parse_notify(&String::from_utf8_lossy(&buf[..n])).filter(|f| is_local(from.ip()) && !found.iter().any(|x| x.serial == f.serial)) {
                    found.push(f);
                }
            }
        }
        Ok(found)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Conecta (devolve a impressão digital do certificado para guardar) e segue lendo em segundo plano; se cair, tenta
/// de novo a cada 15 s e avisa a janela (`printer-offline`).
#[tauri::command]
pub async fn printer_watch(app: AppHandle, printers: State<'_, Printers>, ip: String, serial: String, code: String, pin: String) -> Result<String, String> {
    let addr: IpAddr = ip.trim().parse().map_err(|_| "Endereço IP inválido (ex.: 192.168.0.20).".to_string())?;
    if !is_local(addr) {
        return Err("Só impressoras da rede de casa.".into());
    }
    if !valid_serial(&serial) || !valid_code(code.trim()) || !(pin.is_empty() || pin.len() == 64) {
        return Err("Número de série ou código de acesso inválido.".into());
    }
    let code = code.trim().to_string();
    let (s, fingerprint) = {
        let (serial, code, pin) = (serial.clone(), code.clone(), pin.clone());
        tauri::async_runtime::spawn_blocking(move || open(addr, &serial, &code, &pin)).await.map_err(|e| e.to_string())??
    };
    let stop = Arc::new(AtomicBool::new(false));
    if let Some(old) = lock(&printers.watching).insert(serial.clone(), stop.clone()) {
        old.store(true, Ordering::Relaxed);
    }
    let pin = fingerprint.clone();
    std::thread::spawn(move || {
        let mut conn = Some(s);
        while !stop.load(Ordering::Relaxed) {
            let result = match conn.take() {
                Some(s) => pump(&app, &serial, s, &stop),
                None => open(addr, &serial, &code, &pin).and_then(|(s, _)| {
                    let _ = app.emit("printer-online", serde_json::json!({ "serial": serial }));
                    pump(&app, &serial, s, &stop)
                }),
            };
            if let Err(e) = result {
                let _ = app.emit("printer-offline", serde_json::json!({ "serial": serial, "error": e }));
                let until = Instant::now() + RETRY;
                while Instant::now() < until && !stop.load(Ordering::Relaxed) {
                    std::thread::sleep(Duration::from_millis(250));
                }
            }
        }
    });
    Ok(fingerprint)
}

#[tauri::command]
pub fn printer_unwatch(printers: State<'_, Printers>, serial: String) {
    if let Some(stop) = lock(&printers.watching).remove(&serial) {
        stop.store(true, Ordering::Relaxed);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn le_o_anuncio_da_bambu() {
        let msg = "NOTIFY * HTTP/1.1\r\nHOST: 239.255.255.250:1990\r\nLocation: 192.168.68.59\r\nUSN: 03900D611528416\r\nDevModel.bambu.com: N2S\r\nDevName.bambu.com: A1 combo ( primeira )\r\n";
        assert_eq!(parse_notify(msg), Some(Found { ip: "192.168.68.59".into(), serial: "03900D611528416".into(), model: "N2S".into(), name: "A1 combo ( primeira )".into() }));
        assert_eq!(parse_notify("NOTIFY\r\nLocation: nada\r\nUSN: 03900D611528416"), None);
        assert_eq!(parse_notify("NOTIFY\r\nLocation: 10.0.0.2\r\nUSN: ../etc"), None);
    }

    #[test]
    fn valida_serie_e_codigo() {
        assert!(valid_serial("03900D611528416"));
        assert!(!valid_serial("03900D61/528416"));
        assert!(valid_code("12345678"));
        assert!(!valid_code("123 456"));
        assert!(!valid_code(""));
    }

    #[test]
    fn pacotes_mqtt() {
        let c = connect_packet("upvision-1", "abc123");
        assert_eq!(c[0], 0x10);
        assert_eq!(c[1] as usize, c.len() - 2);
        assert!(c.windows(4).any(|w| w == b"bblp") && c.windows(6).any(|w| w == b"abc123"));
        let s = subscribe_packet("device/X/report");
        assert_eq!(&s[..2], &[0x82, (s.len() - 2) as u8]);
        let big = publish_packet("t", &"x".repeat(300));
        assert_eq!(&big[..3], &[0x30, 0xAF, 0x02], "tamanho 303 em varint");
        let (kind, body) = read_packet(&mut &big[..]).unwrap();
        assert_eq!(kind, 0x30);
        assert_eq!(publish_payload(kind, &body).unwrap().len(), 300);
        assert_eq!(publish_payload(0x32, &[0, 1, b't', 0, 9, b'{', b'}']).unwrap(), b"{}", "QoS 1 pula o id");
        assert!(read_packet(&mut &[0x30u8, 0xFF, 0xFF, 0xFF, 0x7F][..]).is_err(), "tamanho absurdo não aloca");
    }

    #[test]
    fn codigo_errado_explica() {
        assert_eq!(connack_error(0), None);
        assert!(connack_error(5).unwrap().contains("Código de acesso"));
    }

    /// Teste com a impressora de verdade (a pessoa roda, com o código dela):
    /// `BAMBU_IP=… BAMBU_SERIAL=… BAMBU_CODE=… cargo test printer_real -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn printer_real() {
        let var = |k: &str| std::env::var(k).unwrap_or_else(|_| panic!("falta {k}"));
        let (ip, serial, code) = (var("BAMBU_IP").parse().unwrap(), var("BAMBU_SERIAL"), var("BAMBU_CODE"));
        let (mut s, pin) = open(ip, &serial, &code, "").expect("conectar");
        println!("conectou; impressão digital {pin}");
        open(ip, &serial, &code, &pin).expect("reconectar com a impressão digital guardada");
        assert!(open(ip, &serial, &code, &"0".repeat(64)).is_err(), "impressão digital errada é recusada");
        let end = Instant::now() + Duration::from_secs(15);
        while Instant::now() < end {
            if let Ok((kind, body)) = read_packet(&mut s) {
                if kind >> 4 == 3 {
                    let v: serde_json::Value = serde_json::from_slice(publish_payload(kind, &body).unwrap()).unwrap();
                    let p = &v["print"];
                    println!("estado={} peça={} %={} faltam={}min bico={} mesa={} ams={}", p["gcode_state"], p["subtask_name"], p["mc_percent"], p["mc_remaining_time"], p["nozzle_temper"], p["bed_temper"], p["ams"]["ams"].as_array().map_or(0, |a| a.len()));
                    if p.get("gcode_state").is_some() {
                        return;
                    }
                }
            }
        }
        panic!("a impressora não mandou o estado em 15 s");
    }
}
