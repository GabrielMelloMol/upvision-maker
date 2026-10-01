use tauri::Manager;

mod backup;
mod diagnostics;
mod lan;
mod bambu;
mod slicer;
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
            // a janela nasce escondida e a abertura mostra depois do 1º paint (#150); se o JS falhar, aparece igual
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(3));
                if !window.is_visible().unwrap_or(false) {
                    let _ = window.show();
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            vibrancy::window_style,
            stock::apply_stock,
            backup::backup_default_dir,
            backup::backup_write,
            backup::backup_list,
            backup::backup_read,
            sync::sync_read,
            sync::sync_write,
            sync::sync_remove,
            sync::sync_conflict,
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
