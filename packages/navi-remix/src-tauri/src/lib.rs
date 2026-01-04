use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use std::sync::Mutex;

struct SidecarState(Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(SidecarState(Mutex::new(None)))
        .setup(|app| {
            let sidecar_command = app.shell().sidecar("navi-server").unwrap();
            let (mut rx, child) = sidecar_command.spawn().expect("Failed to spawn sidecar");
            
            app.state::<SidecarState>().0.lock().unwrap().replace(child);
            
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                            println!("[sidecar stdout] {}", String::from_utf8_lossy(&line));
                        }
                        tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                            eprintln!("[sidecar stderr] {}", String::from_utf8_lossy(&line));
                        }
                        _ => {}
                    }
                }
            });
            
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(mut child) = window.state::<SidecarState>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
