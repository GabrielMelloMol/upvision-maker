//! Material nativo da janela: Mica no Windows 11, "sidebar" no macOS.
//! Windows 10 (sem Mica) ou `UPVISION_NO_VIBRANCY=1` → janela opaca (o CSS usa fundos sólidos).

use serde::Serialize;
use tauri::{State, WebviewWindow};

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Effect {
    #[cfg_attr(not(target_os = "windows"), allow(dead_code))]
    Mica,
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    Sidebar,
    None,
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowStyle {
    pub effect: Effect,
    /// macOS: barra de título sobreposta (semáforos por cima da sidebar).
    pub overlay_titlebar: bool,
}

/// `UPVISION_NO_VIBRANCY=1` (ou true/yes) desliga o efeito, para testar o visual de fallback.
pub fn disabled_by_env(value: Option<&str>) -> bool {
    matches!(value.map(|v| v.trim().to_ascii_lowercase()).as_deref(), Some("1" | "true" | "yes"))
}

pub fn apply(window: &WebviewWindow) -> WindowStyle {
    let overlay_titlebar = cfg!(target_os = "macos");
    if disabled_by_env(std::env::var("UPVISION_NO_VIBRANCY").ok().as_deref()) {
        return WindowStyle { effect: Effect::None, overlay_titlebar };
    }
    WindowStyle { effect: apply_native(window), overlay_titlebar }
}

#[cfg(target_os = "windows")]
fn apply_native(window: &WebviewWindow) -> Effect {
    // None = segue o tema do sistema. No Windows 10 retorna erro e ficamos com a janela opaca.
    match window_vibrancy::apply_mica(window, None) {
        Ok(()) => Effect::Mica,
        Err(e) => {
            eprintln!("Mica indisponível, usando fundo opaco: {e}");
            Effect::None
        }
    }
}

#[cfg(target_os = "macos")]
fn apply_native(window: &WebviewWindow) -> Effect {
    use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};
    match apply_vibrancy(window, NSVisualEffectMaterial::Sidebar, Some(NSVisualEffectState::FollowsWindowActiveState), None) {
        Ok(()) => Effect::Sidebar,
        Err(e) => {
            eprintln!("Vibrancy indisponível, usando fundo opaco: {e}");
            Effect::None
        }
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn apply_native(_: &WebviewWindow) -> Effect {
    Effect::None
}

pub struct Applied(pub WindowStyle);

#[tauri::command]
pub fn window_style(state: State<'_, Applied>) -> WindowStyle {
    state.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn env_desliga_so_com_valor_afirmativo() {
        assert!(disabled_by_env(Some("1")));
        assert!(disabled_by_env(Some(" TRUE ")));
        assert!(disabled_by_env(Some("yes")));
        assert!(!disabled_by_env(Some("0")));
        assert!(!disabled_by_env(Some("")));
        assert!(!disabled_by_env(None));
    }

    #[test]
    fn serializa_como_o_front_espera() {
        let s = serde_json::to_string(&WindowStyle { effect: Effect::Mica, overlay_titlebar: false }).unwrap();
        assert_eq!(s, r#"{"effect":"mica","overlayTitlebar":false}"#);
    }
}
