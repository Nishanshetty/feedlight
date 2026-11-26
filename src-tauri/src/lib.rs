mod commands;
mod crawler;
#[cfg(target_os = "macos")]
mod macos;
mod migrations;

#[cfg(target_os = "macos")]
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        // In-app updates: checks latest.json on GitHub and verifies each update
        // against the public key in tauri.conf.json. Process restarts afterwards.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:feedlight.db", migrations::all())
                .build(),
        )
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                // Always install the hardening; only the log path is conditional.
                let log_path = match app.path().app_data_dir() {
                    Ok(dir) => {
                        let _ = std::fs::create_dir_all(&dir);
                        dir.join("crash.log")
                    }
                    Err(_) => std::env::temp_dir().join("feedlight-crash.log"),
                };
                macos::install(log_path);
            }
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(crawler::run_crawler(handle));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::credentials::get_credential,
            commands::credentials::set_credential,
            commands::feed::fetch_feed,
            commands::feed::resolve_youtube_handle,
            commands::extract::fetch_article_html,
            commands::extract::fetch_image_base64,
            commands::export::export_markdown,
            commands::tts::synthesize_speech,
            commands::tts::list_tts_voices,
            commands::tts::synthesize_speech_elevenlabs,
            commands::tts::list_elevenlabs_voices,
            commands::ai::list_local_models,
            commands::ai::check_gemini,
            commands::ai::summarize_article,
            commands::ai::chat_article,
            commands::ai::suggest_questions,
            commands::ai::key_takeaways,
            commands::ai::generate_digest,
            commands::ai::generate_discover_queries,
            commands::video::open_video_window,
            commands::pdf::extract_pdf_text,
            crawler::refresh_feeds_now,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Feedlight");
}
