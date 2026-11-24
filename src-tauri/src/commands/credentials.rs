use security_framework::passwords::{delete_generic_password, get_generic_password, set_generic_password};

const SERVICE: &str = "app.feedlight";
const ERR_NOT_FOUND: i32 = -25300; // errSecItemNotFound
const ERR_DUPLICATE: i32 = -25299; // errSecDuplicateItem

/// Sentinel the frontend matches on to point the user at Settings. Kept stable:
/// `SettingsPage.tsx` and `tts.rs` both look for this exact string.
pub const ERR_NO_KEY: &str = "no_api_key";

/// Reads a keychain secret for Rust-side callers — the key never travels over
/// IPC, the command that needs it looks it up itself.
///
/// `Err(ERR_NO_KEY)` separates "nothing stored yet" from a keychain failure, so
/// the caller can show "save a key in Settings" instead of "Keychain error".
pub fn read_secret(key: &str) -> Result<String, String> {
    match get_generic_password(SERVICE, key) {
        Ok(bytes) => {
            let value =
                String::from_utf8(bytes).map_err(|e| format!("Key encoding error: {e}"))?;
            // Trim before the emptiness check, not just before the use: a pasted
            // key with a trailing newline would otherwise reach the request
            // verbatim and come back as an opaque auth failure.
            let value = value.trim().to_string();
            if value.is_empty() {
                Err(ERR_NO_KEY.to_string())
            } else {
                Ok(value)
            }
        }
        Err(e) if e.code() == ERR_NOT_FOUND => Err(ERR_NO_KEY.to_string()),
        Err(e) => Err(format!("Keychain error: {e}")),
    }
}

/// Writes a keychain secret, replacing whatever was there. Empty clears it.
pub fn write_secret(key: &str, value: &str) -> Result<(), String> {
    if value.is_empty() {
        return delete_secret(key);
    }
    match set_generic_password(SERVICE, key, value.as_bytes()) {
        Ok(()) => Ok(()),
        Err(e) if e.code() == ERR_DUPLICATE => {
            delete_generic_password(SERVICE, key).map_err(|e| e.to_string())?;
            set_generic_password(SERVICE, key, value.as_bytes()).map_err(|e| e.to_string())
        }
        Err(e) => Err(e.to_string()),
    }
}

/// Removes a secret. Not-found is success: the caller wanted it gone.
pub fn delete_secret(key: &str) -> Result<(), String> {
    match delete_generic_password(SERVICE, key) {
        Ok(()) => Ok(()),
        Err(e) if e.code() == ERR_NOT_FOUND => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Reads a secret under its current name, and if only the old name exists,
/// moves it forward and returns it. Renaming a keychain entry otherwise drops
/// the key silently: the user would have to paste it again, with no hint why.
///
/// One-shot — after the first read the current name exists and this never runs
/// again. A failed copy leaves the old entry alone.
pub fn read_secret_renamed(legacy: &str, current: &str) -> Result<String, String> {
    match read_secret(current) {
        Err(e) if e == ERR_NO_KEY => {}
        other => return other,
    }
    let value = read_secret(legacy)?;
    write_secret(current, &value)?;
    delete_secret(legacy)?;
    Ok(value)
}

#[tauri::command]
pub fn get_credential(key: String) -> Result<Option<String>, String> {
    match get_generic_password(SERVICE, &key) {
        Ok(bytes) => String::from_utf8(bytes).map(Some).map_err(|e| e.to_string()),
        Err(e) if e.code() == ERR_NOT_FOUND => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn set_credential(key: String, value: String) -> Result<(), String> {
    write_secret(&key, &value)
}
