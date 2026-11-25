use std::fs;
use std::path::Path;

fn sanitize_filename(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') {
                ' '
            } else {
                c
            }
        })
        .collect();
    let trimmed = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    let truncated: String = trimmed.chars().take(120).collect();
    if truncated.is_empty() {
        "Untitled".to_string()
    } else {
        truncated
    }
}

/// Writes a markdown file into the given folder (e.g. an Obsidian vault).
/// Returns the full path of the written file.
#[tauri::command]
pub async fn export_markdown(dir: String, filename: String, content: String) -> Result<String, String> {
    let dir_path = Path::new(&dir);
    if !dir_path.is_dir() {
        return Err(format!("Folder does not exist: {dir}"));
    }
    let path = dir_path.join(format!("{}.md", sanitize_filename(&filename)));
    fs::write(&path, content).map_err(|e| format!("Failed to write file: {e}"))?;
    Ok(path.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_ordinary_titles_untouched() {
        assert_eq!(sanitize_filename("A Good Title"), "A Good Title");
    }

    #[test]
    fn replaces_path_and_shell_metacharacters_with_spaces() {
        assert_eq!(
            sanitize_filename(r#"a/b\c:d*e?f"g<h>i|j"#),
            "a b c d e f g h i j"
        );
    }

    #[test]
    fn collapses_whitespace_and_trims() {
        assert_eq!(sanitize_filename("  many   spaces \n here "), "many spaces here");
    }

    #[test]
    fn falls_back_to_untitled_when_nothing_survives() {
        assert_eq!(sanitize_filename("///"), "Untitled");
        assert_eq!(sanitize_filename(""), "Untitled");
    }

    #[test]
    fn truncates_to_120_characters() {
        let long = "x".repeat(400);
        assert_eq!(sanitize_filename(&long).chars().count(), 120);
    }

    #[test]
    fn keeps_non_ascii_titles() {
        assert_eq!(sanitize_filename("Übertragung — Artikel"), "Übertragung — Artikel");
    }
}
