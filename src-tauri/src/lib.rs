mod backend;
mod diagnostics;
mod git_gh;
mod terminal;
mod testing_environment;
mod workspace;

pub use backend::tauri_backend_entry::run;
