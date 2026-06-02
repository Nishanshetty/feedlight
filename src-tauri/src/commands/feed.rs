use feed_rs::parser;
use serde::Serialize;
use sha2::{Digest, Sha256};
use uuid::Uuid;

#[derive(Serialize)]
pub struct ParsedFeedItem {
    pub id: String,
    pub guid: String,
    pub title: Option<String>,
    pub link: Option<String>,
    pub content: Option<String>,
    pub content_hash: Option<String>,
    pub published_at: Option<String>,
    pub author: Option<String>,
    pub thumbnail_url: Option<String>,
}

#[derive(Serialize)]
pub struct ParsedFeed {
    pub title: Option<String>,
    pub site_url: Option<String>,
    pub items: Vec<ParsedFeedItem>,
}

fn sha256(s: &str) -> String {
    let mut h = Sha256::new();
    h.update(s.as_bytes());
    hex::encode(h.finalize())
}

/// Converts a YouTube channel/user page URL to its Atom feed URL.
/// Returns None for @handle URLs (requires YouTube API key — handled in settings flow).
fn youtube_to_feed_url(raw: &str) -> Option<String> {
    let parsed = url::Url::parse(raw).ok()?;
    let host = parsed.host_str()?;
    if !matches!(host, "youtube.com" | "www.youtube.com") {
        return None;
    }
    let path = parsed.path();
    // Already a feed URL
    if path.starts_with("/feeds/") {
        return Some(raw.to_string());
    }
    // /channel/CHANNEL_ID
    if let Some(rest) = path.strip_prefix("/channel/") {
        let id = rest.split('/').next()?;
        return Some(format!(
            "https://www.youtube.com/feeds/videos.xml?channel_id={id}"
        ));
    }
    // /user/USERNAME
    if let Some(rest) = path.strip_prefix("/user/") {
        let user = rest.split('/').next()?;
        return Some(format!(
            "https://www.youtube.com/feeds/videos.xml?user={user}"
        ));
    }
    // @handle — caller must resolve via YouTube API
    None
}

#[tauri::command]
pub async fn fetch_feed(url: String) -> Result<ParsedFeed, String> {
    let feed_url = youtube_to_feed_url(&url).unwrap_or_else(|| url.clone());

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (compatible; Focal/0.1; +https://github.com/nishanshetty/focal)")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(&feed_url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch feed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Feed server returned HTTP {}", response.status()));
    }

    let body = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read feed body: {e}"))?;

    let feed = parser::parse(body.as_ref())
        .map_err(|e| format!("Failed to parse feed: {e}"))?;

    let title = feed.title.map(|t| t.content);
    let site_url = feed.links.first().map(|l| l.href.clone());

    let items = feed
        .entries
        .into_iter()
        .map(|entry| {
            let link = entry.links.first().map(|l| l.href.clone());

            let guid = if entry.id.is_empty() {
                link.clone().unwrap_or_else(|| Uuid::new_v4().to_string())
            } else {
                entry.id.clone()
            };

            let content = entry
                .content
                .as_ref()
                .and_then(|c| c.body.clone())
                .or_else(|| entry.summary.as_ref().map(|s| s.content.clone()));

            let content_hash = content.as_deref().map(sha256);

            let published_at = entry
                .published
                .or(entry.updated)
                .map(|dt| dt.to_rfc3339());

            let author = entry.authors.first().map(|a| a.name.clone());

            let thumbnail_url = entry
                .media
                .iter()
                .flat_map(|m| m.thumbnails.iter())
                .next()
                .map(|t| t.image.uri.clone());

            ParsedFeedItem {
                id: Uuid::new_v4().to_string(),
                guid,
                title: entry.title.map(|t| t.content),
                link,
                content,
                content_hash,
                published_at,
                author,
                thumbnail_url,
            }
        })
        .collect();

    Ok(ParsedFeed { title, site_url, items })
}
