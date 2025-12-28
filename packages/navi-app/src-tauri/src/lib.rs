use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::ShellExt;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU32, Ordering};

const BUNDLED_SERVER_PORT: u16 = 3011;
const BUNDLED_PTY_PORT: u16 = 3012;

struct SidecarState(Mutex<Option<tauri_plugin_shell::process::CommandChild>>);
struct ServerPorts {
    server: u16,
    pty: u16,
}

// Counter for unique window labels
static WINDOW_COUNTER: AtomicU32 = AtomicU32::new(1);

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_server_ports(state: tauri::State<ServerPorts>) -> (u16, u16) {
    (state.server, state.pty)
}

#[tauri::command]
async fn open_project_in_new_window(
    app: tauri::AppHandle,
    project_id: String,
    project_name: String,
) -> Result<(), String> {
    let window_num = WINDOW_COUNTER.fetch_add(1, Ordering::SeqCst);
    let window_label = format!("project-{}", window_num);

    // Build URL with project ID as hash parameter
    let url = format!("index.html#/project/{}", project_id);

    WebviewWindowBuilder::new(
        &app,
        &window_label,
        WebviewUrl::App(url.into())
    )
    .title(format!("Navi - {}", project_name))
    .inner_size(1200.0, 800.0)
    .min_inner_size(800.0, 600.0)
    .center()
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .manage(SidecarState(Mutex::new(None)))
        .manage(ServerPorts { server: BUNDLED_SERVER_PORT, pty: BUNDLED_PTY_PORT })
        .setup(|app| {
            let mut sidecar_command = app.shell().sidecar("navi-server").unwrap()
                .args([BUNDLED_SERVER_PORT.to_string()]);

            if let Ok(log_dir) = app.path().app_log_dir() {
                sidecar_command = sidecar_command.env("NAVI_LOG_DIR", log_dir.to_string_lossy().to_string());
            }

            if let Ok(resource_dir) = app.path().resource_dir() {
                sidecar_command = sidecar_command.env("TAURI_RESOURCE_DIR", resource_dir.to_string_lossy().to_string());
                let cli_path = resource_dir.join("resources").join("claude-agent-sdk").join("cli.js");
                sidecar_command = sidecar_command.env("NAVI_CLAUDE_CODE_PATH", cli_path.to_string_lossy().to_string());

                if let Some(contents_dir) = resource_dir.parent() {
                    let bun_path = contents_dir.join("MacOS").join("bun");
                    sidecar_command = sidecar_command.env("NAVI_BUN_PATH", bun_path.to_string_lossy().to_string());
                }
            }
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
                if let Some(child) = window.state::<SidecarState>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![greet, get_server_ports, open_project_in_new_window])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
