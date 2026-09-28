use tauri::Manager;

mod stock;
mod vibrancy;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let window = app.get_webview_window("main").expect("janela principal");
            app.manage(vibrancy::Applied(vibrancy::apply(&window)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![vibrancy::window_style, stock::apply_stock])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
