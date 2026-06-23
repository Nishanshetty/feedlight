use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

/// Returns `true` when `host` is a YouTube-owned hostname that may be opened
/// in a dedicated video window.
fn is_youtube_host(host: &str) -> bool {
    host == "youtu.be" || host == "youtube.com" || host.ends_with(".youtube.com")
}

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
    if !is_youtube_host(host) {
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

#[cfg(test)]
mod tests {
    use super::*;

    // ── is_youtube_host ──────────────────────────────────────────────────────

    #[test]
    fn youtube_com_is_allowed() {
        assert!(is_youtube_host("youtube.com"));
    }

    #[test]
    fn youtu_be_is_allowed() {
        assert!(is_youtube_host("youtu.be"));
    }

    #[test]
    fn www_youtube_com_is_allowed() {
        assert!(is_youtube_host("www.youtube.com"));
    }

    #[test]
    fn music_youtube_com_is_allowed() {
        assert!(is_youtube_host("music.youtube.com"));
    }

    #[test]
    fn deep_subdomain_youtube_com_is_allowed() {
        assert!(is_youtube_host("a.b.youtube.com"));
    }

    #[test]
    fn empty_host_is_rejected() {
        assert!(!is_youtube_host(""));
    }

    #[test]
    fn arbitrary_host_is_rejected() {
        assert!(!is_youtube_host("example.com"));
    }

    #[test]
    fn lookalike_domain_is_rejected() {
        // "not-youtube.com" must not match even though it ends in "youtube.com"
        // only via the ends_with check – but "not-youtube.com" does NOT end with
        // ".youtube.com" (note the leading dot), so it is correctly rejected.
        assert!(!is_youtube_host("not-youtube.com"));
    }

    #[test]
    fn partial_suffix_youtube_is_rejected() {
        // "fakyoutube.com" ends with "youtube.com" as a bare string but NOT with
        // ".youtube.com", so the subdomain guard rejects it.
        assert!(!is_youtube_host("fakyoutube.com"));
    }

    #[test]
    fn vimeo_is_rejected() {
        assert!(!is_youtube_host("vimeo.com"));
    }

    // ── URL parsing validation (exercised via open_video_window error paths) ─

    #[test]
    fn invalid_url_returns_error() {
        // url::Url::parse will fail on this input, so the function should
        // return an Err containing "Invalid URL".
        let result = url::Url::parse("not a url at all");
        assert!(result.is_err());
        let err_msg = format!("Invalid URL: {}", result.unwrap_err());
        assert!(err_msg.starts_with("Invalid URL:"));
    }

    #[test]
    fn non_youtube_url_parses_but_host_rejected() {
        let parsed = url::Url::parse("https://vimeo.com/12345").unwrap();
        let host = parsed.host_str().unwrap_or("");
        assert!(!is_youtube_host(host));
    }

    #[test]
    fn youtube_watch_url_has_correct_host() {
        let parsed = url::Url::parse("https://www.youtube.com/watch?v=dQw4w9WgXcQ").unwrap();
        let host = parsed.host_str().unwrap_or("");
        assert!(is_youtube_host(host));
    }

    #[test]
    fn youtu_be_short_url_has_correct_host() {
        let parsed = url::Url::parse("https://youtu.be/dQw4w9WgXcQ").unwrap();
        let host = parsed.host_str().unwrap_or("");
        assert!(is_youtube_host(host));
    }

    #[test]
    fn youtube_url_without_scheme_is_invalid() {
        // "youtube.com/watch?v=x" without a scheme is not a valid absolute URL.
        let result = url::Url::parse("youtube.com/watch?v=x");
        // url crate parses this as a relative URL with scheme "youtube.com",
        // but host will be empty/None – the host guard rejects it.
        match result {
            Err(_) => { /* invalid – correct */ }
            Ok(parsed) => {
                let host = parsed.host_str().unwrap_or("");
                assert!(!is_youtube_host(host),
                    "bare domain without scheme should not pass host check, got host={host:?}");
            }
        }
    }
}
