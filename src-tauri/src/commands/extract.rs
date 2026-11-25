use std::net::IpAddr;
use url::Url;

fn is_private_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(ipv4) => {
            let o = ipv4.octets();
            o[0] == 127
                || o[0] == 10
                || o[0] == 0
                || (o[0] == 172 && o[1] >= 16 && o[1] <= 31)
                || (o[0] == 192 && o[1] == 168)
                || (o[0] == 169 && o[1] == 254)
        }
        IpAddr::V6(ipv6) => {
            // `http://[::ffff:127.0.0.1]/` parses as IPv6, and `is_loopback()`
            // does not look through the IPv4-mapped prefix. Send those through
            // the V4 rules instead of judging them as plain v6 segments.
            if let Some(mapped) = ipv6.to_ipv4_mapped() {
                return is_private_ip(&IpAddr::V4(mapped));
            }

            ipv6.is_loopback()
                || ipv6.is_unspecified()
                || (ipv6.segments()[0] & 0xfe00) == 0xfc00
                || (ipv6.segments()[0] & 0xffc0) == 0xfe80
        }
    }
}

fn validate_url(raw: &str) -> Result<(), String> {
    let parsed = Url::parse(raw).map_err(|_| "Invalid URL".to_string())?;

    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("Only http and https URLs are allowed".to_string());
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| "URL has no host".to_string())?
        .to_lowercase();

    // `Url::host_str()` keeps the brackets around IPv6 literals (`"[::1]"`),
    // which would otherwise slip past both the name check and IpAddr parsing.
    let host = host.strip_prefix('[').and_then(|h| h.strip_suffix(']')).unwrap_or(&host);

    if host == "localhost" || host == "::1" {
        return Err("Access to local addresses is not allowed".to_string());
    }

    if let Ok(ip) = host.parse::<IpAddr>() {
        if is_private_ip(&ip) {
            return Err("Access to private IP addresses is not allowed".to_string());
        }
    }

    Ok(())
}

/// Fetches raw HTML from the given URL, bypassing CORS restrictions in the WebView.
/// The frontend processes the HTML with @mozilla/readability for clean article extraction.
#[tauri::command]
pub async fn fetch_article_html(url: String) -> Result<String, String> {
    validate_url(&url)?;

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
        return Err(format!("Server returned HTTP {}", response.status()));
    }

    response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {e}"))
}

#[derive(serde::Serialize)]
pub struct ImageData {
    pub mime: String,
    pub data: String,
}

/// Fetches an image and returns it base64-encoded, bypassing CORS so the
/// frontend can draw it to a canvas without tainting it.
#[tauri::command]
pub async fn fetch_image_base64(url: String) -> Result<ImageData, String> {
    use base64::Engine as _;

    validate_url(&url)?;

    let client = reqwest::Client::builder()
        .user_agent(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) \
             AppleWebKit/537.36 (KHTML, like Gecko) \
             Chrome/124.0.0.0 Safari/537.36",
        )
        .redirect(reqwest::redirect::Policy::limited(5))
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch image: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Server returned HTTP {}", response.status()));
    }

    let mime = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/jpeg")
        .to_string();

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read image: {e}"))?;

    if bytes.len() > 10 * 1024 * 1024 {
        return Err("Image too large".to_string());
    }

    Ok(ImageData {
        mime,
        data: base64::engine::general_purpose::STANDARD.encode(&bytes),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_plain_http_and_https_urls() {
        assert!(validate_url("https://example.com/article").is_ok());
        assert!(validate_url("http://example.com/a/b?c=1").is_ok());
    }

    #[test]
    fn rejects_non_http_schemes() {
        for url in ["file:///etc/passwd", "ftp://example.com/x", "tauri://localhost", "javascript:alert(1)"] {
            assert!(validate_url(url).is_err(), "should reject {url}");
        }
    }

    #[test]
    fn rejects_malformed_urls_and_missing_hosts() {
        assert!(validate_url("not a url").is_err());
        assert!(validate_url("https://").is_err());
    }

    #[test]
    fn rejects_loopback_hostnames_case_insensitively() {
        assert!(validate_url("http://localhost:11434/api").is_err());
        assert!(validate_url("http://LOCALHOST/").is_err());
        assert!(validate_url("http://[::1]/").is_err());
    }

    #[test]
    fn rejects_private_and_link_local_ip_literals() {
        for url in [
            "http://127.0.0.1/",
            "http://10.1.2.3/",
            "http://192.168.1.1/",
            "http://172.16.0.1/",
            "http://172.31.255.255/",
            "http://169.254.1.1/",
            "http://0.0.0.0/",
            "http://[::1]/",
            "http://[fd00::1]/",
            "http://[fe80::1]/",
            "http://[::]/",
            "http://[::ffff:127.0.0.1]/",
            "http://[::ffff:10.1.2.3]/",
            "http://[::ffff:192.168.1.1]/",
        ] {
            assert!(validate_url(url).is_err(), "should reject {url}");
        }
    }

    #[test]
    fn allows_public_ip_literals_and_public_ranges_that_look_similar() {
        assert!(validate_url("http://8.8.8.8/").is_ok());
        // Just outside the private ranges.
        assert!(validate_url("http://172.15.0.1/").is_ok());
        assert!(validate_url("http://172.32.0.1/").is_ok());
        assert!(validate_url("http://100.1.1.1/").is_ok());
        // An IPv4-mapped literal of a public address is still public.
        assert!(validate_url("http://[::ffff:8.8.8.8]/").is_ok());
    }
}
