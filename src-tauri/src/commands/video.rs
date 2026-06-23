use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

/// Opens a YouTube video as a top-level page in its own window.
///
/// The embedded iframe player fails in the production app: on macOS the app is
/// served from the `tauri://` scheme, so the browser strips the referrer and
/// YouTube refuses to play (error 153). Loading the watch page top-level in a
/// dedicated webview avoids the embed restriction entirely.
///
/// Synchronous on purpose: Tauri runs sync commands on the main thread, which
/// macOS requires for window creation.
#[tauri::command]
pub fn open_video_window(app: AppHandle, url: String, title: Option<String>) -> Result<(), String> {
    let parsed = url::Url::parse(&url).map_err(|e| format!("Invalid URL: {e}"))?;
    let host = parsed.host_str().unwrap_or("");
    if !(host == "youtu.be" || host == "youtube.com" || host.ends_with(".youtube.com")) {
        return Err("Only YouTube URLs can be opened this way".into());
    }

    let label = format!("video-{}", uuid::Uuid::new_v4());
    WebviewWindowBuilder::new(&app, label, WebviewUrl::External(parsed))
        .title(title.as_deref().unwrap_or("Video"))
        .inner_size(960.0, 600.0)
        .build()
        .map_err(|e| format!("Failed to open video window: {e}"))?;
    Ok(())
}
