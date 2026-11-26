//! SQLite schema migrations, applied by `tauri-plugin-sql` at startup.
//!
//! Append-only: never edit, rename or delete a migration that has shipped
//! (CI's "Migration guard" job fails if you do). Add a new numbered file
//! instead, and never reuse a version number. See the migrations section of
//! docs/ARCHITECTURE.md.

use tauri_plugin_sql::{Migration, MigrationKind};

pub fn all() -> Vec<Migration> {
    // Version 2 intentionally skipped: it was a one-off cleanup applied
    // manually, never a registered migration.
    vec![
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
        Migration {
            version: 6,
            description: "tags",
            sql: include_str!("../migrations/006_tags.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;

    /// Versions taken from the `NNN_name.sql` files on disk.
    fn file_versions() -> BTreeSet<i64> {
        let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/migrations");
        std::fs::read_dir(dir)
            .expect("read migrations dir")
            .map(|entry| entry.unwrap().file_name().into_string().unwrap())
            .filter(|name| name.ends_with(".sql"))
            .map(|name| {
                let prefix = name.split('_').next().unwrap();
                prefix
                    .parse()
                    .unwrap_or_else(|_| panic!("{name}: expected a NNN_name.sql file name"))
            })
            .collect()
    }

    #[test]
    fn versions_are_unique_and_increasing() {
        let versions: Vec<i64> = all().iter().map(|m| m.version).collect();
        for pair in versions.windows(2) {
            assert!(
                pair[0] < pair[1],
                "migration versions must be unique and increasing, got {} then {}; \
                 never reuse a version number",
                pair[0],
                pair[1]
            );
        }
    }

    #[test]
    fn every_file_is_registered_and_every_registration_has_a_file() {
        let registered: BTreeSet<i64> = all().iter().map(|m| m.version).collect();
        let on_disk = file_versions();
        assert_eq!(
            registered, on_disk,
            "migrations registered in migrations.rs must match the .sql files in \
             src-tauri/migrations/"
        );
    }

    #[tokio::test]
    async fn all_migrations_apply_to_an_empty_database() {
        use sqlx::sqlite::SqlitePoolOptions;
        use sqlx::Row;

        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("open in-memory database");

        for m in all() {
            sqlx::raw_sql(m.sql)
                .execute(&pool)
                .await
                .unwrap_or_else(|e| {
                    panic!("migration {} ({}) failed: {e}", m.version, m.description)
                });
        }

        let tables: BTreeSet<String> =
            sqlx::query("SELECT name FROM sqlite_master WHERE type = 'table'")
                .fetch_all(&pool)
                .await
                .unwrap()
                .iter()
                .map(|row| row.get::<String, _>("name"))
                .collect();
        for expected in [
            "feeds",
            "feed_items",
            "subscriptions",
            "item_states",
            "highlights",
            "item_content",
            "item_takeaways",
            "tags",
            "item_tags",
            "feed_default_tags",
        ] {
            assert!(
                tables.contains(expected),
                "table {expected} missing after migrations"
            );
        }

        let has_read_progress: bool = sqlx::query_scalar(
            "SELECT COUNT(*) > 0 FROM pragma_table_info('item_states') WHERE name = 'read_progress'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert!(
            has_read_progress,
            "item_states.read_progress missing after migrations"
        );
    }
}
