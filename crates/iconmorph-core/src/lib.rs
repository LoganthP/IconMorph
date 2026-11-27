//! # iconmorph-core
//!
//! The engine behind IconMorph: decodes untrusted images safely, composes icons in four
//! modes (classic folder, folder decoration, full replacement, custom shape), encodes native
//! ICO / ICNS / PNG files, and applies them through supported OS mechanisms with backups,
//! verification, journaling and restore.
//!
//! The engine never runs in the background. Once an icon is applied the operating system
//! renders it on its own, so IconMorph can exit completely.

#![deny(unsafe_code)]

pub mod compose;
pub mod encode;
pub mod engine;
pub mod error;
pub mod image_io;
pub mod limits;
pub mod live;
pub mod palette;
pub mod platform;
pub mod raster;
pub mod store;

pub use compose::{
    compose, compose_with_layout, Appearance, Effects, Fill, FolderStyle, IconSpec, LayerLayout,
    LayerTransform, Mode, ShapeKind, ShapeStyle, Texture,
};
pub use encode::IconFormat;
pub use engine::{AppPaths, ApplyRequest, Engine, ItemResult, PlatformInfo, SourceInput};
pub use error::{CoreError, Result};
pub use platform::{DesktopItem, ItemKind, PlatformAdapter};

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
