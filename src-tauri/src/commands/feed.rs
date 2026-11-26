use feed_rs::parser;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Serialize)]
pub struct ParsedFeedItem {
    pub id: String,
    pub guid: String,
    pub title: Option<String>,
    pub link: Option<String>,
    pub content: Option<String>,
    pub published_at: Option<String>,
    pub author: Option<String>,
    pub thumbnail_url: Option<String>,
}

fn strip_html(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut in_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[derive(Serialize)]
pub struct ParsedFeed {
    pub title: Option<String>,
    pub site_url: Option<String>,
    pub items: Vec<ParsedFeedItem>,
}

fn youtube_to_feed_url(raw: &str) -> Option<String> {
    let parsed = url::Url::parse(raw).ok()?;
    let host = parsed.host_str()?;
    if !matches!(host, "youtube.com" | "www.youtube.com") {
        return None;
    }
    let path = parsed.path();
    if path.starts_with("/feeds/") {
        return Some(raw.to_string());
    }
    if let Some(rest) = path.strip_prefix("/channel/") {
        let id = rest.split('/').next()?;
        return Some(format!(
            "https://www.youtube.com/feeds/videos.xml?channel_id={id}"
        ));
    }
    if let Some(rest) = path.strip_prefix("/user/") {
        let user = rest.split('/').next()?;
        return Some(format!(
            "https://www.youtube.com/feeds/videos.xml?user={user}"
        ));
    }
    None
}

/// Scans an HTML page for <link rel="alternate" type="application/rss+xml|atom+xml"> tags
/// and returns the first discovered feed URL (resolved against the base URL).
fn discover_feed_url(html: &str, base_url: &str) -> Option<String> {
    let doc = Html::parse_document(html);
    let sel = Selector::parse(
        "link[rel='alternate'][type='application/rss+xml'], \
         link[rel='alternate'][type='application/atom+xml'], \
         link[rel='alternate'][type='application/feed+json']",
    )
    .ok()?;

    let href = doc.select(&sel).next()?.value().attr("href")?;

    // Resolve relative URLs against the base
    if href.starts_with("http://") || href.starts_with("https://") {
        Some(href.to_string())
    } else {
        let base = url::Url::parse(base_url).ok()?;
        base.join(href).ok().map(|u| u.to_string())
    }
}

fn parse_feed_bytes(body: &[u8]) -> Result<ParsedFeed, String> {
    let feed = parser::parse(body).map_err(|e| format!("Failed to parse feed: {e}"))?;

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
            let content = entry.summary.as_ref().map(|s| {
                let stripped = strip_html(&s.content);
                stripped.chars().take(300).collect::<String>()
            });
            let published_at = entry.published.or(entry.updated).map(|dt| dt.to_rfc3339());
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
                published_at,
                author,
                thumbnail_url,
            }
        })
        .collect();

    Ok(ParsedFeed {
        title,
        site_url,
        items,
    })
}

#[tauri::command]
pub async fn fetch_feed(url: String) -> Result<ParsedFeed, String> {
    let feed_url = youtube_to_feed_url(&url).unwrap_or_else(|| url.clone());

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (compatible; Feedlight/0.1)")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(&feed_url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Server returned HTTP {}", response.status()));
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let body = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response: {e}"))?;

    // If the response is HTML, attempt feed autodiscovery before giving up.
    if content_type.contains("text/html") || content_type.is_empty() {
        // First try parsing as feed anyway (some servers send wrong content-type).
        if let Ok(parsed) = parse_feed_bytes(body.as_ref()) {
            return Ok(parsed);
        }

        let html = String::from_utf8_lossy(body.as_ref());
        let discovered = discover_feed_url(&html, &feed_url)
            .ok_or_else(|| "No RSS/Atom feed found at this URL. Try pasting the direct feed URL (e.g. /feed, /rss, /atom.xml).".to_string())?;

        let discovered_response = client
            .get(&discovered)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch discovered feed: {e}"))?;

        let discovered_body = discovered_response
            .bytes()
            .await
            .map_err(|e| format!("Failed to read discovered feed: {e}"))?;

        return parse_feed_bytes(discovered_body.as_ref());
    }

    parse_feed_bytes(body.as_ref())
}

/// Resolves a YouTube @handle to its Atom feed URL using the YouTube Data API v3.
#[tauri::command]
pub async fn resolve_youtube_handle(handle: String, api_key: String) -> Result<String, String> {
    #[derive(Deserialize)]
    struct Item {
        id: String,
    }
    #[derive(Deserialize)]
    struct Response {
        items: Option<Vec<Item>>,
    }

    let client = reqwest::Client::new();
    let url = format!(
        "https://www.googleapis.com/youtube/v3/channels?forHandle={}&part=id",
        handle.trim_start_matches('@'),
    );

    let resp = client
        .get(&url)
        .header("X-Goog-Api-Key", &api_key)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("YouTube API error {status}: {body}"));
    }

    let data: Response = resp.json().await.map_err(|e| e.to_string())?;
    let channel_id = data
        .items
        .and_then(|items| items.into_iter().next())
        .map(|item| item.id)
        .ok_or_else(|| format!("No YouTube channel found for @{handle}"))?;

    Ok(format!(
        "https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_html_removes_tags_and_collapses_whitespace() {
        assert_eq!(
            strip_html("<p>one  <b>two</b>   three</p>"),
            "one two three"
        );
        assert_eq!(strip_html("no markup"), "no markup");
        assert_eq!(strip_html(""), "");
    }

    #[test]
    fn strip_html_is_tag_delimited_not_quote_aware() {
        // The stripper ends a tag at the first '>' regardless of attribute
        // quoting, so a '>' inside an attribute value leaks the trailing quote.
        // Documented behaviour, not an assertion of intent: feed content is
        // plain text here, and the reader sanitises separately with DOMPurify.
        assert_eq!(strip_html("<a href=\"x\" title=\"<b>\">text</a>"), "\"text");
        assert_eq!(strip_html("<p title=\"a>b\">text</p>"), "b\"text");
    }

    #[test]
    fn youtube_channel_and_user_urls_become_feed_urls() {
        assert_eq!(
            youtube_to_feed_url("https://www.youtube.com/channel/UC123"),
            Some("https://www.youtube.com/feeds/videos.xml?channel_id=UC123".to_string())
        );
        assert_eq!(
            youtube_to_feed_url("https://youtube.com/user/someone"),
            Some("https://www.youtube.com/feeds/videos.xml?user=someone".to_string())
        );
    }

    #[test]
    fn youtube_feed_urls_pass_through_unchanged() {
        let raw = "https://www.youtube.com/feeds/videos.xml?channel_id=UC123";
        assert_eq!(youtube_to_feed_url(raw), Some(raw.to_string()));
    }

    #[test]
    fn youtube_urls_without_a_feed_mapping_are_rejected() {
        // @handle needs the API key, watch pages are not feeds.
        assert_eq!(youtube_to_feed_url("https://youtube.com/@handle"), None);
        assert_eq!(youtube_to_feed_url("https://youtube.com/watch?v=abc"), None);
    }

    #[test]
    fn non_youtube_hosts_are_not_mapped() {
        assert_eq!(
            youtube_to_feed_url("https://notyoutube.com/channel/UC1"),
            None
        );
        assert_eq!(
            youtube_to_feed_url("https://youtube.com.evil.test/channel/UC1"),
            None
        );
    }

    #[test]
    fn discover_feed_url_prefers_the_first_alternate_link() {
        let html = "<html><head>\
            <link rel='alternate' type='application/atom+xml' href='/atom.xml'>\
            <link rel='alternate' type='application/rss+xml' href='/rss.xml'>\
            </head><body></body></html>";
        assert_eq!(
            discover_feed_url(html, "https://example.com/blog/"),
            Some("https://example.com/atom.xml".to_string())
        );
    }

    #[test]
    fn discover_feed_url_resolves_relative_href_against_the_base() {
        let html = "<link rel='alternate' type='application/rss+xml' href='feed.xml'>";
        assert_eq!(
            discover_feed_url(html, "https://example.com/blog/index.html"),
            Some("https://example.com/blog/feed.xml".to_string())
        );
    }

    #[test]
    fn discover_feed_url_accepts_absolute_hrefs_and_feed_json() {
        let html = "<link rel='alternate' type='application/feed+json' href='https://cdn.example.com/f.json'>";
        assert_eq!(
            discover_feed_url(html, "https://example.com/"),
            Some("https://cdn.example.com/f.json".to_string())
        );
    }

    #[test]
    fn discover_feed_url_ignores_unrelated_link_tags() {
        let html = "<link rel='alternate' type='text/html' href='/de/index.html'>\
                    <link rel='stylesheet' type='application/rss+xml' href='/s.css'>";
        assert_eq!(discover_feed_url(html, "https://example.com/"), None);
    }

    #[test]
    fn parse_feed_bytes_reads_a_minimal_rss_document() {
        let xml = r#"<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Test Feed</title>
  <link>https://example.com</link>
  <item>
    <title>First post</title>
    <link>https://example.com/first</link>
    <guid>https://example.com/first</guid>
    <description>Hello &lt;b&gt;world&lt;/b&gt;</description>
    <pubDate>Fri, 02 Jan 2026 10:00:00 GMT</pubDate>
  </item>
</channel></rss>"#;
        let parsed = parse_feed_bytes(xml.as_bytes()).expect("feed should parse");
        assert_eq!(parsed.title.as_deref(), Some("Test Feed"));
        assert_eq!(parsed.items.len(), 1);
        assert_eq!(parsed.items[0].title.as_deref(), Some("First post"));
        assert_eq!(
            parsed.items[0].link.as_deref(),
            Some("https://example.com/first")
        );
        // 2 Jan 2026 is a Friday. feed-rs ignores the weekday, so a wrong one
        // here would go unnoticed — pin the parsed instant instead.
        assert_eq!(
            parsed.items[0].published_at.as_deref(),
            Some("2026-01-02T10:00:00+00:00")
        );
    }

    #[test]
    fn parse_feed_bytes_rejects_non_feed_content() {
        assert!(parse_feed_bytes(b"<html><body>not a feed</body></html>").is_err());
    }
}
