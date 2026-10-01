//! Janela sem quadro vazio na abertura (#153). O WKWebView só pinta janela que está na tela: escondida, o 1º quadro
//! chegava ~0,5 s depois do `show()` e a janela aparecia vazia. No macOS a janela entra na tela invisível (alpha 0), a
//! abertura pinta e o JS chama `reveal_window`. Nos outros sistemas o JS usa o `show()` de sempre.
//! Se o JS falhar, a janela aparece sozinha depois de FALLBACK.
use std::time::Duration;
use tauri::{Runtime, WebviewWindow};

const FALLBACK: Duration = Duration::from_secs(3);

#[cfg(target_os = "macos")]
fn set_alpha<R: Runtime>(window: &WebviewWindow<R>, alpha: f64) {
    let w = window.clone();
    let _ = window.run_on_main_thread(move || {
        if let Ok(ptr) = w.ns_window() {
            // SAFETY: `ns_window` é o NSWindow vivo desta janela, usado na thread principal.
            let ns = unsafe { &*(ptr as *const objc2_app_kit::NSWindow) };
            ns.setAlphaValue(alpha);
        }
    });
}

/// Na criação: macOS entra invisível na tela (para pintar); trava de segurança em todos os sistemas.
pub fn prepare<R: Runtime>(window: WebviewWindow<R>) {
    #[cfg(target_os = "macos")]
    {
        set_alpha(&window, 0.0);
        let _ = window.show();
    }
    std::thread::spawn(move || {
        std::thread::sleep(FALLBACK);
        reveal(&window);
    });
}

fn reveal<R: Runtime>(window: &WebviewWindow<R>) {
    #[cfg(target_os = "macos")]
    set_alpha(window, 1.0);
    if !window.is_visible().unwrap_or(false) {
        let _ = window.show();
    }
}

/// A abertura já está pintada: mostra a janela.
#[tauri::command]
pub fn reveal_window<R: Runtime>(window: WebviewWindow<R>) {
    reveal(&window);
}
