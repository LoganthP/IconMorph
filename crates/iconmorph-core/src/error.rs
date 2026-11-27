use serde::{Serialize, Serializer};

/// All errors surfaced by the IconMorph engine. Every error carries a human-readable
/// message so the UI can show a meaningful explanation instead of a generic failure.
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("File system error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Could not read image: {0}")]
    Image(#[from] image::ImageError),
    #[error("Database error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("Invalid data: {0}")]
    Json(#[from] serde_json::Error),
    #[error("{0}")]
    Invalid(String),
    #[error("Not supported here: {0}")]
    Unsupported(String),
    #[error("The operating system rejected the change: {0}")]
    Platform(String),
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("Cancelled")]
    Cancelled,
}

impl CoreError {
    pub fn invalid(msg: impl Into<String>) -> Self {
        Self::Invalid(msg.into())
    }
    pub fn unsupported(msg: impl Into<String>) -> Self {
        Self::Unsupported(msg.into())
    }
    pub fn platform(msg: impl Into<String>) -> Self {
        Self::Platform(msg.into())
    }
}

impl Serialize for CoreError {
    fn serialize<S: Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, CoreError>;
