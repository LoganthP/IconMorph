//! Embedded SQLite store: original-icon backups, customizations, operation journal, settings.

use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use crate::error::Result;

const MIGRATIONS: &[&str] = &[
    // v1
    r#"
    CREATE TABLE icon_assets (
        hash        TEXT PRIMARY KEY,
        format      TEXT NOT NULL,
        path        TEXT NOT NULL,
        bytes       INTEGER NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE TABLE original_backups (
        target_path TEXT PRIMARY KEY,
        platform    TEXT NOT NULL,
        state_json  TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE TABLE customizations (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        target_path TEXT NOT NULL,
        target_name TEXT NOT NULL,
        icon_hash   TEXT NOT NULL REFERENCES icon_assets(hash),
        spec_json   TEXT NOT NULL,
        preview_png BLOB NOT NULL,
        active      INTEGER NOT NULL DEFAULT 1,
        applied_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX idx_custom_target ON customizations(target_path, active);
    CREATE TABLE operation_journal (
        id              TEXT PRIMARY KEY,
        op              TEXT NOT NULL,
        target_path     TEXT NOT NULL,
        status          TEXT NOT NULL CHECK (status IN ('pending','committed','rolled_back','failed')),
        pre_state_json  TEXT,
        detail          TEXT,
        started_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        finished_at     TEXT
    );
    CREATE INDEX idx_journal_status ON operation_journal(status);
    CREATE TABLE activity_history (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        action      TEXT NOT NULL,
        target_path TEXT NOT NULL,
        target_name TEXT NOT NULL,
        outcome     TEXT NOT NULL,
        message     TEXT,
        icon_hash   TEXT,
        at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    "#,
    // v2: desktop snapshots (a named set of applied designs that can be put back later)
    r#"
    CREATE TABLE desktop_snapshots (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE TABLE snapshot_items (
        snapshot_id      INTEGER NOT NULL REFERENCES desktop_snapshots(id) ON DELETE CASCADE,
        target_path      TEXT NOT NULL,
        target_name      TEXT NOT NULL,
        customization_id INTEGER NOT NULL,
        icon_hash        TEXT NOT NULL,
        PRIMARY KEY (snapshot_id, target_path)
    );
    CREATE INDEX idx_snapshot_items_hash ON snapshot_items(icon_hash);
    "#,
];

pub struct Store {
    conn: Connection,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomizationRow {
    pub id: i64,
    pub target_path: String,
    pub target_name: String,
    pub icon_hash: String,
    pub spec_json: String,
    pub applied_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryRow {
    pub id: i64,
    pub action: String,
    pub target_path: String,
    pub target_name: String,
    pub outcome: String,
    pub message: Option<String>,
    pub icon_hash: Option<String>,
    pub at: String,
}

#[derive(Debug, Clone)]
pub struct PendingOp {
    pub id: String,
    pub op: String,
    pub target_path: String,
    pub pre_state_json: Option<String>,
}

impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        Self::init(conn)
    }

    pub fn open_in_memory() -> Result<Self> {
        Self::init(Connection::open_in_memory()?)
    }

    fn init(conn: Connection) -> Result<Self> {
        conn.execute_batch(
            "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;",
        )?;
        let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        for (i, sql) in MIGRATIONS.iter().enumerate().skip(version as usize) {
            let tx = conn.unchecked_transaction()?;
            tx.execute_batch(sql)?;
            tx.execute_batch(&format!("PRAGMA user_version = {}", i + 1))?;
            tx.commit()?;
        }
        Ok(Self { conn })
    }

    pub fn schema_version(&self) -> Result<i64> {
        Ok(self
            .conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))?)
    }

    // ---- assets ----
    pub fn upsert_asset(&self, hash: &str, format: &str, path: &str, bytes: u64) -> Result<()> {
        self.conn.execute(
            "INSERT OR IGNORE INTO icon_assets(hash, format, path, bytes) VALUES (?1, ?2, ?3, ?4)",
            params![hash, format, path, bytes as i64],
        )?;
        Ok(())
    }

    /// Assets not referenced by any active customization.
    pub fn unreferenced_assets(&self) -> Result<Vec<(String, String)>> {
        let mut st = self.conn.prepare(
            "SELECT hash, path FROM icon_assets a WHERE NOT EXISTS
             (SELECT 1 FROM customizations c WHERE c.icon_hash = a.hash AND c.active = 1)
             AND NOT EXISTS (SELECT 1 FROM snapshot_items s WHERE s.icon_hash = a.hash)",
        )?;
        let rows = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    pub fn delete_asset(&self, hash: &str) -> Result<()> {
        // Inactive designs whose icon file is gone can no longer be re-applied.
        self.conn.execute(
            "DELETE FROM customizations WHERE icon_hash = ?1 AND active = 0",
            [hash],
        )?;
        self.conn
            .execute("DELETE FROM icon_assets WHERE hash = ?1", [hash])?;
        Ok(())
    }

    // ---- backups ----
    pub fn backup(&self, target: &str) -> Result<Option<String>> {
        Ok(self
            .conn
            .query_row(
                "SELECT state_json FROM original_backups WHERE target_path = ?1",
                [target],
                |r| r.get(0),
            )
            .optional()?)
    }

    /// Stores the original state only the first time a target is customized.
    pub fn insert_backup_if_absent(
        &self,
        target: &str,
        platform: &str,
        state_json: &str,
    ) -> Result<bool> {
        let n = self.conn.execute(
            "INSERT OR IGNORE INTO original_backups(target_path, platform, state_json) VALUES (?1, ?2, ?3)",
            params![target, platform, state_json],
        )?;
        Ok(n > 0)
    }

    pub fn delete_backup(&self, target: &str) -> Result<()> {
        self.conn.execute(
            "DELETE FROM original_backups WHERE target_path = ?1",
            [target],
        )?;
        Ok(())
    }

    pub fn backed_up_targets(&self) -> Result<Vec<String>> {
        let mut st = self
            .conn
            .prepare("SELECT target_path FROM original_backups ORDER BY created_at")?;
        let rows = st.query_map([], |r| r.get(0))?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    // ---- customizations ----
    pub fn record_customization(
        &self,
        target: &str,
        name: &str,
        hash: &str,
        spec_json: &str,
        preview_png: &[u8],
    ) -> Result<i64> {
        let tx = self.conn.unchecked_transaction()?;
        tx.execute(
            "UPDATE customizations SET active = 0 WHERE target_path = ?1",
            [target],
        )?;
        tx.execute(
            "INSERT INTO customizations(target_path, target_name, icon_hash, spec_json, preview_png)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![target, name, hash, spec_json, preview_png],
        )?;
        let id = tx.last_insert_rowid();
        tx.commit()?;
        Ok(id)
    }

    pub fn deactivate(&self, target: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE customizations SET active = 0 WHERE target_path = ?1",
            [target],
        )?;
        Ok(())
    }

    pub fn active_customization(&self, target: &str) -> Result<Option<CustomizationRow>> {
        Ok(self
            .conn
            .query_row(
                "SELECT id, target_path, target_name, icon_hash, spec_json, applied_at FROM customizations
                 WHERE target_path = ?1 AND active = 1 ORDER BY id DESC LIMIT 1",
                [target],
                map_custom,
            )
            .optional()?)
    }

    pub fn active_customizations(&self) -> Result<Vec<CustomizationRow>> {
        let mut st = self.conn.prepare(
            "SELECT id, target_path, target_name, icon_hash, spec_json, applied_at FROM customizations
             WHERE active = 1 ORDER BY id DESC",
        )?;
        let rows = st.query_map([], map_custom)?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    pub fn preview_png(&self, icon_hash: &str) -> Result<Option<Vec<u8>>> {
        Ok(self
            .conn
            .query_row(
                "SELECT preview_png FROM customizations WHERE icon_hash = ?1 ORDER BY id DESC LIMIT 1",
                [icon_hash],
                |r| r.get(0),
            )
            .optional()?)
    }

    // ---- journal ----
    pub fn journal_begin(
        &self,
        id: &str,
        op: &str,
        target: &str,
        pre_state: Option<&str>,
    ) -> Result<()> {
        self.conn.execute(
            "INSERT INTO operation_journal(id, op, target_path, status, pre_state_json) VALUES (?1, ?2, ?3, 'pending', ?4)",
            params![id, op, target, pre_state],
        )?;
        Ok(())
    }

    pub fn journal_finish(&self, id: &str, status: &str, detail: Option<&str>) -> Result<()> {
        self.conn.execute(
            "UPDATE operation_journal SET status = ?2, detail = ?3,
             finished_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?1",
            params![id, status, detail],
        )?;
        Ok(())
    }

    pub fn pending_ops(&self) -> Result<Vec<PendingOp>> {
        let mut st = self.conn.prepare(
            "SELECT id, op, target_path, pre_state_json FROM operation_journal WHERE status = 'pending' ORDER BY started_at",
        )?;
        let rows = st.query_map([], |r| {
            Ok(PendingOp {
                id: r.get(0)?,
                op: r.get(1)?,
                target_path: r.get(2)?,
                pre_state_json: r.get(3)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    // ---- history ----
    pub fn log(
        &self,
        action: &str,
        target: &str,
        name: &str,
        outcome: &str,
        message: Option<&str>,
        hash: Option<&str>,
    ) -> Result<()> {
        self.conn.execute(
            "INSERT INTO activity_history(action, target_path, target_name, outcome, message, icon_hash)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![action, target, name, outcome, message, hash],
        )?;
        Ok(())
    }

    pub fn history(&self, limit: u32) -> Result<Vec<HistoryRow>> {
        let mut st = self.conn.prepare(
            "SELECT id, action, target_path, target_name, outcome, message, icon_hash, at
             FROM activity_history ORDER BY id DESC LIMIT ?1",
        )?;
        let rows = st.query_map([limit], |r| {
            Ok(HistoryRow {
                id: r.get(0)?,
                action: r.get(1)?,
                target_path: r.get(2)?,
                target_name: r.get(3)?,
                outcome: r.get(4)?,
                message: r.get(5)?,
                icon_hash: r.get(6)?,
                at: r.get(7)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    // ---- settings ----
    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        Ok(self
            .conn
            .query_row(
                "SELECT value FROM app_settings WHERE key = ?1",
                [key],
                |r| r.get(0),
            )
            .optional()?)
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO app_settings(key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesignRow {
    pub id: i64,
    pub icon_hash: String,
    pub applied_at: String,
    pub active: bool,
    /// The stored native icon file still exists, so the design can be re-applied.
    pub available: bool,
}

#[derive(Debug, Clone)]
pub struct StoredDesign {
    pub target_path: String,
    pub target_name: String,
    pub icon_hash: String,
    pub spec_json: String,
    pub preview_png: Vec<u8>,
    pub icon_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotRow {
    pub id: i64,
    pub name: String,
    pub created_at: String,
    pub item_count: i64,
    /// Up to 8 icon hashes for a visual preview.
    pub icon_hashes: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct SnapshotItem {
    pub target_path: String,
    pub target_name: String,
    pub customization_id: i64,
    pub icon_hash: String,
}

impl Store {
    /// Every design ever applied to `target`, newest first.
    pub fn designs_for(&self, target: &str) -> Result<Vec<DesignRow>> {
        let mut st = self.conn.prepare(
            "SELECT c.id, c.icon_hash, c.applied_at, c.active, a.path FROM customizations c
             LEFT JOIN icon_assets a ON a.hash = c.icon_hash
             WHERE c.target_path = ?1 ORDER BY c.id DESC",
        )?;
        let rows = st.query_map([target], |r| {
            let path: Option<String> = r.get(4)?;
            Ok(DesignRow {
                id: r.get(0)?,
                icon_hash: r.get(1)?,
                applied_at: r.get(2)?,
                active: r.get::<_, i64>(3)? == 1,
                available: path
                    .map(|p| std::path::Path::new(&p).exists())
                    .unwrap_or(false),
            })
        })?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    pub fn design(&self, id: i64) -> Result<Option<StoredDesign>> {
        Ok(self
            .conn
            .query_row(
                "SELECT c.target_path, c.target_name, c.icon_hash, c.spec_json, c.preview_png, a.path
                 FROM customizations c LEFT JOIN icon_assets a ON a.hash = c.icon_hash WHERE c.id = ?1",
                [id],
                |r| {
                    Ok(StoredDesign {
                        target_path: r.get(0)?,
                        target_name: r.get(1)?,
                        icon_hash: r.get(2)?,
                        spec_json: r.get(3)?,
                        preview_png: r.get(4)?,
                        icon_path: r.get(5)?,
                    })
                },
            )
            .optional()?)
    }

    pub fn create_snapshot(&self, name: &str) -> Result<i64> {
        let tx = self.conn.unchecked_transaction()?;
        tx.execute("INSERT INTO desktop_snapshots(name) VALUES (?1)", [name])?;
        let id = tx.last_insert_rowid();
        tx.execute(
            "INSERT INTO snapshot_items(snapshot_id, target_path, target_name, customization_id, icon_hash)
             SELECT ?1, target_path, target_name, MAX(id), icon_hash FROM customizations
             WHERE active = 1 GROUP BY target_path",
            [id],
        )?;
        tx.commit()?;
        Ok(id)
    }

    pub fn snapshots(&self) -> Result<Vec<SnapshotRow>> {
        let mut st = self.conn.prepare(
            "SELECT s.id, s.name, s.created_at, COUNT(i.target_path),
                    (SELECT group_concat(icon_hash) FROM
                       (SELECT icon_hash FROM snapshot_items WHERE snapshot_id = s.id LIMIT 8))
             FROM desktop_snapshots s LEFT JOIN snapshot_items i ON i.snapshot_id = s.id
             GROUP BY s.id ORDER BY s.id DESC",
        )?;
        let rows = st.query_map([], |r| {
            let hashes: Option<String> = r.get(4)?;
            Ok(SnapshotRow {
                id: r.get(0)?,
                name: r.get(1)?,
                created_at: r.get(2)?,
                item_count: r.get(3)?,
                icon_hashes: hashes
                    .map(|h| h.split(',').map(str::to_string).collect())
                    .unwrap_or_default(),
            })
        })?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    pub fn snapshot_items(&self, id: i64) -> Result<Vec<SnapshotItem>> {
        let mut st = self.conn.prepare(
            "SELECT target_path, target_name, customization_id, icon_hash FROM snapshot_items
             WHERE snapshot_id = ?1 ORDER BY target_name",
        )?;
        let rows = st.query_map([id], |r| {
            Ok(SnapshotItem {
                target_path: r.get(0)?,
                target_name: r.get(1)?,
                customization_id: r.get(2)?,
                icon_hash: r.get(3)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    pub fn snapshot_exists(&self, id: i64) -> Result<bool> {
        Ok(self
            .conn
            .query_row(
                "SELECT 1 FROM desktop_snapshots WHERE id = ?1",
                [id],
                |_| Ok(()),
            )
            .optional()?
            .is_some())
    }

    pub fn delete_snapshot(&self, id: i64) -> Result<()> {
        self.conn
            .execute("DELETE FROM desktop_snapshots WHERE id = ?1", [id])?;
        Ok(())
    }
}

fn map_custom(r: &rusqlite::Row<'_>) -> rusqlite::Result<CustomizationRow> {
    Ok(CustomizationRow {
        id: r.get(0)?,
        target_path: r.get(1)?,
        target_name: r.get(2)?,
        icon_hash: r.get(3)?,
        spec_json: r.get(4)?,
        applied_at: r.get(5)?,
    })
}
