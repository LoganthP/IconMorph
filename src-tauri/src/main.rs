// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().any(|a| a == "--live") {
        iconmorph_lib::run_live_helper();
        return;
    }
    iconmorph_lib::run();
}
