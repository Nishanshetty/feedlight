mod commands;
mod crawler;
#[cfg(target_os = "macos")]
mod macos;

#[cfg(target_os = "macos")]
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Version 2 intentionally skipped: it was a one-off cleanup applied
    // manually, never a registered migration.
    let migrations = vec![
        Migration {
            version: 1,
            description: "initial_schema",
            sql: include_str!("../migrations/001_initial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "read_progress",
            sql: include_str!("../migrations/003_read_progress.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "highlights",
            sql: include_str!("../migrations/004_highlights.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "takeaways",
            sql: include_str!("../migrations/005_takeaways.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:feedlight.db", migrations)
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
            commands::ollama::check_ollama,
            commands::ollama::summarize_article,
            commands::ollama::chat_article,
            commands::ollama::suggest_questions,
            commands::ollama::key_takeaways,
            commands::ollama::generate_digest,
            commands::ollama::generate_discover_queries,
            commands::video::open_video_window,
            crawler::refresh_feeds_now,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Feedlight");
}
