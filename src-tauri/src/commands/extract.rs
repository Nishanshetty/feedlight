use scraper::{Html, Selector};
use serde::Serialize;

#[derive(Serialize)]
pub struct ArticleResult {
    pub title: String,
    pub content: String,
    pub byline: Option<String>,
    pub site_name: Option<String>,
}

/// Returns the `content` attribute of the first <meta> matching property or name.
fn meta_content(doc: &Html, value: &str) -> Option<String> {
    for attr in &["property", "name"] {
        let sel_str = format!("meta[{attr}='{value}']");
        let sel = match Selector::parse(&sel_str) {
            Ok(s) => s,
            Err(_) => continue,
        };
        if let Some(el) = doc.select(&sel).next() {
            if let Some(content) = el.value().attr("content") {
                let s = content.trim().to_string();
                if !s.is_empty() {
                    return Some(s);
                }
            }
        }
    }
    None
}

/// Returns the trimmed text content of the first element matching the selector.
fn first_text(doc: &Html, selector: &str) -> Option<String> {
    let sel = Selector::parse(selector).ok()?;
    let text = doc
        .select(&sel)
        .next()?
        .text()
        .collect::<String>();
    let trimmed = text.trim().to_string();
    if trimmed.is_empty() { None } else { Some(trimmed) }
}

/// Walks a priority list of candidate selectors and returns the inner HTML of the
/// first element that contains at least 200 characters of markup.
fn extract_main_content(doc: &Html) -> String {
    let candidates = [
        "article",
        "main",
        "[role='main']",
        "#article",
        "#content",
        ".article-body",
        ".post-content",
        ".entry-content",
        ".content",
        "body",
    ];
    for candidate in candidates {
        if let Ok(sel) = Selector::parse(candidate) {
            if let Some(el) = doc.select(&sel).next() {
                let html = el.inner_html();
                if html.len() >= 200 {
                    return html;
                }
            }
        }
    }
    String::new()
}

#[tauri::command]
pub async fn extract_article(url: String) -> Result<ArticleResult, String> {
    let client = reqwest::Client::builder()
        .user_agent(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) \
             AppleWebKit/537.36 (KHTML, like Gecko) \
             Chrome/124.0.0.0 Safari/537.36",
        )
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch article: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Article server returned HTTP {}", response.status()));
    }

    let html = response
        .text()
        .await
        .map_err(|e| format!("Failed to read article body: {e}"))?;

    let doc = Html::parse_document(&html);

    let title = meta_content(&doc, "og:title")
        .or_else(|| first_text(&doc, "title"))
        .or_else(|| first_text(&doc, "h1"))
        .unwrap_or_default();

    let byline = meta_content(&doc, "author")
        .or_else(|| meta_content(&doc, "article:author"));

    let site_name = meta_content(&doc, "og:site_name");

    let content = extract_main_content(&doc);

    Ok(ArticleResult {
        title,
        content,
        byline,
        site_name,
    })
}
