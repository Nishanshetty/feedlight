use security_framework::passwords::{delete_generic_password, get_generic_password, set_generic_password};

const SERVICE: &str = "app.feedlight";
const ERR_NOT_FOUND: i32 = -25300; // errSecItemNotFound
const ERR_DUPLICATE: i32 = -25299; // errSecDuplicateItem

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
    if value.is_empty() {
        return match delete_generic_password(SERVICE, &key) {
            Ok(()) | Err(_) => Ok(()), // ignore not-found on delete
        };
    }
    match set_generic_password(SERVICE, &key, value.as_bytes()) {
        Ok(()) => Ok(()),
        Err(e) if e.code() == ERR_DUPLICATE => {
            delete_generic_password(SERVICE, &key).map_err(|e| e.to_string())?;
            set_generic_password(SERVICE, &key, value.as_bytes()).map_err(|e| e.to_string())
        }
        Err(e) => Err(e.to_string()),
    }
}
