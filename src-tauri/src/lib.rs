use tauri::{Emitter, Manager, RunEvent};

mod backup;
mod diagnostics;
mod lan;
mod reveal;
mod bambu;
mod slicer;
mod sqlbatch;
mod stock;
mod sync;
mod vibrancy;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(lan::Lan::default())
        .setup(|app| {
            diagnostics::install_panic_hook(app.handle());
            let window = app.get_webview_window("main").expect("janela principal");
            app.manage(vibrancy::Applied(vibrancy::apply(&window)));
            // a janela nasce escondida e a abertura mostra depois do 1º paint (#150, #153)
            reveal::prepare(window);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            vibrancy::window_style,
            reveal::reveal_window,
            stock::apply_stock,
            sqlbatch::sql_batch,
            backup::backup_default_dir,
            backup::backup_write,
            backup::backup_safety_write,
            backup::backup_export,
            backup::backup_list,
            backup::backup_read,
            sync::sync_read,
            sync::sync_write,
            sync::sync_remove,
            sync::sync_conflict,
            sync::sync_adopt_strays,
            sync::device_name,
            lan::lan_start,
            lan::lan_stop,
            lan::lan_status,
            lan::lan_new_code,
            lan::lan_disconnect_all,
            lan::lan_respond,
            diagnostics::log_append,
            diagnostics::log_read,
            bambu::bambu_project,
            slicer::slicers_installed,
            slicer::open_in_slicer
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(on_run_event);
}

/// Se o app ainda não saiu depois disso, sai (rede de segurança do `exit-requested`).
const EXIT_FALLBACK: std::time::Duration = std::time::Duration::from_secs(25);

/// Cmd+Q no Mac (e sair pelo menu) encerra o app sem fechar a janela antes: o backup e a sincronização de
/// fechamento nunca rodavam (M3). Aqui o fechamento é adiado: o front faz o trabalho e sai por conta própria. Se o
/// front não responder, sai sozinho depois de 25 s: o app nunca fica preso sem conseguir fechar.
fn on_run_event(app: &tauri::AppHandle, event: RunEvent) {
    let RunEvent::ExitRequested { code, api, .. } = event else { return };
    // `code` preenchido = o próprio app pediu para sair (já fez o trabalho); sem janela = o fechamento da janela já o fez
    if code.is_some() || app.webview_windows().is_empty() {
        return;
    }
    api.prevent_exit();
    let _ = app.emit("exit-requested", ());
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(EXIT_FALLBACK);
        app.exit(0);
    });
}
