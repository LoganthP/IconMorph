//! Hard limits applied to all untrusted input (imported images, SVGs, GIFs).

/// Largest file IconMorph will read as an image source.
pub const MAX_FILE_BYTES: u64 = 40 * 1024 * 1024;
/// Largest SVG document accepted.
pub const MAX_SVG_BYTES: usize = 5 * 1024 * 1024;
/// Largest decoded width or height.
pub const MAX_DIMENSION: u32 = 8192;
/// Upper bound on decoder allocations.
pub const MAX_ALLOC_BYTES: u64 = 512 * 1024 * 1024;
/// Maximum GIF frames inspected.
pub const MAX_GIF_FRAMES: usize = 600;
/// Master render size; all native sizes are derived from it.
pub const CANVAS: u32 = 1024;
