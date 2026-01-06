use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, RunEvent};
use tauri_plugin_shell::ShellExt;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU32, Ordering};
use std::collections::VecDeque;
use std::path::PathBuf;

#[cfg(target_os = "macos")]
use tauri::menu::{Menu, MenuItem, Submenu, PredefinedMenuItem, AboutMetadata};

const BUNDLED_SERVER_PORT: u16 = 3011;
const BUNDLED_PTY_PORT: u16 = 3012;
const MAX_RECENT_PROJECTS: usize = 10;

struct SidecarState(Mutex<Option<tauri_plugin_shell::process::CommandChild>>);
struct ServerPorts {
    server: u16,
    pty: u16,
}

/// Recent project entry for Open Recent menu
#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct RecentProject {
    id: String,
    name: String,
    path: String,
    timestamp: u64,
}

/// State for recent projects
struct RecentProjectsState(Mutex<VecDeque<RecentProject>>);

/// State for dock badge
struct DockBadgeState(Mutex<Option<String>>);

// Counter for unique window labels
static WINDOW_COUNTER: AtomicU32 = AtomicU32::new(1);

// Store app handle for dock menu callbacks and notifications
static APP_HANDLE: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();

/// Create a new window (used by dock menu and menu bar)
fn create_new_window(app: &tauri::AppHandle) -> Result<(), String> {
    let window_num = WINDOW_COUNTER.fetch_add(1, Ordering::SeqCst);
    let window_label = format!("main-{}", window_num);

    WebviewWindowBuilder::new(
        app,
        &window_label,
        WebviewUrl::App("index.html".into())
    )
    .title("Navi")
    .inner_size(1200.0, 800.0)
    .min_inner_size(800.0, 600.0)
    .center()
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Set up macOS dock menu with "New Window" option
#[cfg(target_os = "macos")]
fn setup_dock_menu(_app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use cocoa::appkit::{NSApp, NSMenu, NSMenuItem};
    use cocoa::base::{id, nil, selector};
    use cocoa::foundation::{NSAutoreleasePool, NSString};
    use objc::declare::ClassDecl;
    use objc::runtime::{Class, Object, Sel};
    #[allow(unused_imports)]
    use objc::{msg_send, sel, sel_impl};

    unsafe {
        // Create dock menu
        #[allow(deprecated)]
        let dock_menu: id = NSMenu::new(nil).autorelease();

        // Create "New Window" menu item
        #[allow(deprecated)]
        let new_window_title = NSString::alloc(nil).init_str("New Window");
        #[allow(deprecated)]
        let new_window_item: id = NSMenuItem::alloc(nil)
            .initWithTitle_action_keyEquivalent_(
                new_window_title,
                selector("newWindowFromDock:"),
                NSString::alloc(nil).init_str(""),
            )
            .autorelease();

        #[allow(deprecated)]
        dock_menu.addItem_(new_window_item);

        // Register a custom class to handle the dock menu action
        let superclass = Class::get("NSObject").unwrap();
        let mut decl = ClassDecl::new("NaviDockMenuHandler", superclass).unwrap();

        extern "C" fn new_window_handler(_this: &Object, _cmd: Sel, _sender: id) {
            if let Some(app) = APP_HANDLE.get() {
                let _ = create_new_window(app);
            }
        }

        #[allow(deprecated)]
        decl.add_method(
            selector("newWindowFromDock:"),
            new_window_handler as extern "C" fn(&Object, Sel, id),
        );

        let handler_class = decl.register();
        let handler: id = msg_send![handler_class, new];

        // Set the target for the menu item
        let _: () = msg_send![new_window_item, setTarget: handler];

        // Set the dock menu
        #[allow(deprecated)]
        let ns_app: id = NSApp();
        let _: () = msg_send![ns_app, setDockMenu: dock_menu];
    }

    Ok(())
}

/// Set up macOS application menu with About, Check for Updates, etc.
#[cfg(target_os = "macos")]
fn setup_app_menu(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // Create About metadata with rich info
    let about_metadata = AboutMetadata {
        version: Some("1.1.0".into()),
        authors: Some(vec!["Bruno Galvao".into()]),
        comments: Some("The Agent Workspace GUI for Claude Code".into()),
        website: Some("https://navi.dev".into()),
        website_label: Some("Visit Website".into()),
        license: Some("MIT".into()),
        ..Default::default()
    };

    // Build the Navi submenu (required first submenu on macOS)
    let about_item = PredefinedMenuItem::about(app, Some("About Navi"), Some(about_metadata))?;
    let separator1 = PredefinedMenuItem::separator(app)?;
    let check_updates = MenuItem::with_id(app, "check_updates", "Check for Updates...", true, None::<&str>)?;
    let separator2 = PredefinedMenuItem::separator(app)?;
    let settings = PredefinedMenuItem::services(app, Some("Services"))?;
    let separator3 = PredefinedMenuItem::separator(app)?;
    let hide = PredefinedMenuItem::hide(app, Some("Hide Navi"))?;
    let hide_others = PredefinedMenuItem::hide_others(app, Some("Hide Others"))?;
    let show_all = PredefinedMenuItem::show_all(app, Some("Show All"))?;
    let separator4 = PredefinedMenuItem::separator(app)?;
    let quit = PredefinedMenuItem::quit(app, Some("Quit Navi"))?;

    let navi_submenu = Submenu::with_items(
        app,
        "Navi",
        true,
        &[
            &about_item,
            &separator1,
            &check_updates,
            &separator2,
            &settings,
            &separator3,
            &hide,
            &hide_others,
            &show_all,
            &separator4,
            &quit,
        ],
    )?;

    // Build File menu with Open Recent submenu
    let new_window = MenuItem::with_id(app, "new_window", "New Window", true, Some("CmdOrCtrl+N"))?;
    let separator_file = PredefinedMenuItem::separator(app)?;

    // Create Open Recent submenu (initially empty, will be populated dynamically)
    let clear_recent = MenuItem::with_id(app, "clear_recent", "Clear Menu", true, None::<&str>)?;
    let no_recent = MenuItem::with_id(app, "no_recent", "No Recent Projects", false, None::<&str>)?;
    let open_recent_submenu = Submenu::with_items(
        app,
        "Open Recent",
        true,
        &[&no_recent, &PredefinedMenuItem::separator(app)?, &clear_recent],
    )?;

    let separator_file2 = PredefinedMenuItem::separator(app)?;
    let close_window = PredefinedMenuItem::close_window(app, Some("Close Window"))?;

    let file_submenu = Submenu::with_items(
        app,
        "File",
        true,
        &[&new_window, &separator_file, &open_recent_submenu, &separator_file2, &close_window],
    )?;

    // Build Edit menu
    let undo = PredefinedMenuItem::undo(app, None)?;
    let redo = PredefinedMenuItem::redo(app, None)?;
    let separator5 = PredefinedMenuItem::separator(app)?;
    let cut = PredefinedMenuItem::cut(app, None)?;
    let copy = PredefinedMenuItem::copy(app, None)?;
    let paste = PredefinedMenuItem::paste(app, None)?;
    let select_all = PredefinedMenuItem::select_all(app, None)?;

    let edit_submenu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[&undo, &redo, &separator5, &cut, &copy, &paste, &select_all],
    )?;

    // Build View menu
    let enter_fullscreen = PredefinedMenuItem::fullscreen(app, Some("Enter Full Screen"))?;

    let view_submenu = Submenu::with_items(
        app,
        "View",
        true,
        &[&enter_fullscreen],
    )?;

    // Build Window menu
    let minimize = PredefinedMenuItem::minimize(app, None)?;
    let zoom = PredefinedMenuItem::maximize(app, Some("Zoom"))?;

    let window_submenu = Submenu::with_items(
        app,
        "Window",
        true,
        &[&minimize, &zoom],
    )?;

    // Build Help menu
    let help_item = MenuItem::with_id(app, "help_docs", "Navi Documentation", true, None::<&str>)?;
    let report_issue = MenuItem::with_id(app, "report_issue", "Report an Issue...", true, None::<&str>)?;

    let help_submenu = Submenu::with_items(
        app,
        "Help",
        true,
        &[&help_item, &report_issue],
    )?;

    // Create the main menu
    let menu = Menu::with_items(
        app,
        &[
            &navi_submenu,
            &file_submenu,
            &edit_submenu,
            &view_submenu,
            &window_submenu,
            &help_submenu,
        ],
    )?;

    app.set_menu(menu)?;

    Ok(())
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_server_ports(state: tauri::State<ServerPorts>) -> (u16, u16) {
    (state.server, state.pty)
}

/// Send a native notification
#[tauri::command]
#[cfg(desktop)]
async fn send_notification(
    app: tauri::AppHandle,
    title: String,
    body: String,
) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;

    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[cfg(not(desktop))]
async fn send_notification(
    _app: tauri::AppHandle,
    _title: String,
    _body: String,
) -> Result<(), String> {
    Ok(()) // No-op on non-desktop platforms
}

/// Set the dock badge (macOS only)
#[tauri::command]
#[cfg(target_os = "macos")]
fn set_dock_badge(
    app: tauri::AppHandle,
    badge: Option<String>,
) -> Result<(), String> {
    use cocoa::appkit::NSApp;
    use cocoa::base::nil;
    use cocoa::foundation::NSString;
    #[allow(unused_imports)]
    use objc::{msg_send, sel, sel_impl};

    // Update state
    if let Some(state) = app.try_state::<DockBadgeState>() {
        *state.0.lock().unwrap() = badge.clone();
    }

    unsafe {
        #[allow(deprecated)]
        let ns_app: cocoa::base::id = NSApp();
        let dock_tile: cocoa::base::id = msg_send![ns_app, dockTile];

        match badge {
            Some(text) => {
                #[allow(deprecated)]
                let badge_label = NSString::alloc(nil).init_str(&text);
                let _: () = msg_send![dock_tile, setBadgeLabel: badge_label];
            }
            None => {
                let _: () = msg_send![dock_tile, setBadgeLabel: nil];
            }
        }
    }

    Ok(())
}

#[tauri::command]
#[cfg(not(target_os = "macos"))]
fn set_dock_badge(
    _app: tauri::AppHandle,
    _badge: Option<String>,
) -> Result<(), String> {
    Ok(()) // No-op on non-macOS platforms
}

/// Share a file using the native share sheet (macOS)
#[tauri::command]
#[cfg(target_os = "macos")]
async fn share_file(file_path: String) -> Result<(), String> {
    use cocoa::appkit::{NSApp, NSWindow};
    use cocoa::base::{id, nil};
    use cocoa::foundation::{NSArray, NSPoint, NSString};
    #[allow(unused_imports)]
    use objc::{class, msg_send, sel, sel_impl};

    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    unsafe {
        // Create NSURL from file path
        #[allow(deprecated)]
        let ns_path = NSString::alloc(nil).init_str(&file_path);
        let file_url: id = msg_send![class!(NSURL), fileURLWithPath: ns_path];

        // Create an array with the file URL
        #[allow(deprecated)]
        let items: id = NSArray::arrayWithObject(nil, file_url);

        // Create NSSharingServicePicker
        let picker: id = msg_send![class!(NSSharingServicePicker), alloc];
        let picker: id = msg_send![picker, initWithItems: items];

        // Get the key window to show the picker from
        #[allow(deprecated)]
        let ns_app: id = NSApp();
        let key_window: id = msg_send![ns_app, keyWindow];

        if key_window != nil {
            // Get content view
            let content_view: id = key_window.contentView();
            if content_view != nil {
                // Show picker at center of window
                let bounds: cocoa::foundation::NSRect = msg_send![content_view, bounds];
                let center = NSPoint::new(bounds.size.width / 2.0, bounds.size.height / 2.0);
                let rect = cocoa::foundation::NSRect::new(center, cocoa::foundation::NSSize::new(1.0, 1.0));
                let _: () = msg_send![picker, showRelativeToRect:rect ofView:content_view preferredEdge:1_isize];
            }
        }
    }

    Ok(())
}

#[tauri::command]
#[cfg(not(target_os = "macos"))]
async fn share_file(_file_path: String) -> Result<(), String> {
    Err("Sharing is only supported on macOS".to_string())
}

/// Copy file to clipboard (for cross-platform sharing)
#[tauri::command]
async fn copy_image_to_clipboard(file_path: String) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        // Use osascript to copy image to clipboard
        let script = format!(
            r#"set the clipboard to (read (POSIX file "{}") as TIFF picture)"#,
            file_path
        );
        Command::new("osascript")
            .args(["-e", &script])
            .output()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Add a project to recent projects list
#[tauri::command]
fn add_recent_project(
    app: tauri::AppHandle,
    id: String,
    name: String,
    path: String,
) -> Result<(), String> {
    let state = app.state::<RecentProjectsState>();
    let mut recent = state.0.lock().unwrap();

    // Remove if already exists (we'll re-add at front)
    recent.retain(|p| p.id != id);

    // Add to front
    recent.push_front(RecentProject {
        id,
        name,
        path,
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs(),
    });

    // Keep only MAX_RECENT_PROJECTS
    while recent.len() > MAX_RECENT_PROJECTS {
        recent.pop_back();
    }

    Ok(())
}

/// Get recent projects list
#[tauri::command]
fn get_recent_projects(
    app: tauri::AppHandle,
) -> Result<Vec<RecentProject>, String> {
    let state = app.state::<RecentProjectsState>();
    let recent = state.0.lock().unwrap();
    Ok(recent.iter().cloned().collect())
}

/// Clear recent projects list
#[tauri::command]
fn clear_recent_projects(
    app: tauri::AppHandle,
) -> Result<(), String> {
    let state = app.state::<RecentProjectsState>();
    state.0.lock().unwrap().clear();
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
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

/// Check for updates and show dialog if available
#[cfg(desktop)]
async fn check_for_updates_with_dialog(app: tauri::AppHandle) {
    use tauri_plugin_updater::UpdaterExt;
    use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

    match app.updater() {
        Ok(updater) => {
            match updater.check().await {
                Ok(Some(update)) => {
                    let version = update.version.clone();
                    let should_install = app.dialog()
                        .message(format!(
                            "A new version of Navi is available!\n\nCurrent: {}\nLatest: {}\n\nWould you like to download and install it now?",
                            env!("CARGO_PKG_VERSION"),
                            version
                        ))
                        .title("Update Available")
                        .kind(MessageDialogKind::Info)
                        .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancel)
                        .blocking_show();

                    if should_install {
                        // Download and install the update
                        let _ = update.download_and_install(|_, _| {}, || {}).await;
                        // Restart the app
                        app.restart();
                    }
                }
                Ok(None) => {
                    app.dialog()
                        .message("You're running the latest version of Navi!")
                        .title("No Updates Available")
                        .kind(MessageDialogKind::Info)
                        .blocking_show();
                }
                Err(e) => {
                    app.dialog()
                        .message(format!("Failed to check for updates: {}", e))
                        .title("Update Error")
                        .kind(MessageDialogKind::Error)
                        .blocking_show();
                }
            }
        }
        Err(e) => {
            eprintln!("Failed to get updater: {}", e);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_fs::init());

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_notification::init());
    }

    let app = builder
        .manage(SidecarState(Mutex::new(None)))
        .manage(ServerPorts { server: BUNDLED_SERVER_PORT, pty: BUNDLED_PTY_PORT })
        .manage(RecentProjectsState(Mutex::new(VecDeque::new())))
        .manage(DockBadgeState(Mutex::new(None)))
        .setup(|app| {
            // Store app handle for dock menu callbacks and global access
            let _ = APP_HANDLE.set(app.handle().clone());

            #[cfg(target_os = "macos")]
            {
                // Set up macOS app menu with About, Check for Updates, etc.
                if let Err(e) = setup_app_menu(app.handle()) {
                    eprintln!("Failed to setup app menu: {}", e);
                }

                // Set up macOS dock menu
                if let Err(e) = setup_dock_menu(app.handle()) {
                    eprintln!("Failed to setup dock menu: {}", e);
                }
            }

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
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "new_window" => {
                    let _ = create_new_window(app);
                }
                "check_updates" => {
                    #[cfg(desktop)]
                    {
                        let app_handle = app.clone();
                        tauri::async_runtime::spawn(async move {
                            check_for_updates_with_dialog(app_handle).await;
                        });
                    }
                }
                "help_docs" => {
                    use tauri_plugin_opener::OpenerExt;
                    let _ = app.opener().open_url("https://navi.dev/docs", None::<&str>);
                }
                "report_issue" => {
                    use tauri_plugin_opener::OpenerExt;
                    let _ = app.opener().open_url("https://github.com/brunogalvao/navi/issues", None::<&str>);
                }
                "clear_recent" => {
                    let state = app.state::<RecentProjectsState>();
                    state.0.lock().unwrap().clear();
                }
                id if id.starts_with("recent_project_") => {
                    // Handle opening a recent project
                    let project_id = id.strip_prefix("recent_project_").unwrap_or("");
                    let state = app.state::<RecentProjectsState>();
                    let recent = state.0.lock().unwrap();
                    if let Some(project) = recent.iter().find(|p| p.id == project_id) {
                        let project_id = project.id.clone();
                        let project_name = project.name.clone();
                        let app_clone = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = open_project_in_new_window(app_clone, project_id, project_name).await;
                        });
                    }
                }
                _ => {}
            }
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(child) = window.state::<SidecarState>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_server_ports,
            open_project_in_new_window,
            send_notification,
            set_dock_badge,
            add_recent_project,
            get_recent_projects,
            clear_recent_projects,
            share_file,
            copy_image_to_clipboard
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // Run with event handling for Reopen (dock icon click when no windows)
    app.run(|app_handle, event| {
        match event {
            RunEvent::Reopen { has_visible_windows, .. } => {
                // When dock icon is clicked and no windows are visible, open a new window
                if !has_visible_windows {
                    let _ = create_new_window(app_handle);
                }
            }
            _ => {}
        }
    });
}
