use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

/// Ramène la fenêtre principale au premier plan.
fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Un second lancement réaffiche simplement la fenêtre existante.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .setup(|app| {
            let autostart = app.autolaunch();
            let enabled = autostart.is_enabled().unwrap_or(false);

            let open = MenuItem::with_id(app, "open", "Ouvrir l'agenda", true, None::<&str>)?;
            let boot = CheckMenuItem::with_id(app, "autostart", "Lancer au démarrage de Windows", true, enabled, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quitter (les alarmes s'arrêtent)", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &boot, &sep, &quit])?;

            let boot_item = boot.clone();
            TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Agenda MMI : les alarmes restent actives")
                .menu(&menu)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "open" => show_main(app),
                    "autostart" => {
                        let al = app.autolaunch();
                        let now = al.is_enabled().unwrap_or(false);
                        let _ = if now { al.disable() } else { al.enable() };
                        let _ = boot_item.set_checked(al.is_enabled().unwrap_or(!now));
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;

            // Lancé au démarrage de Windows : on reste discret dans la zone de notification.
            if std::env::args().any(|a| a == "--minimized") {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }
            Ok(())
        })
        // Fermer la fenêtre la cache : l'app continue de surveiller les alarmes.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("impossible de démarrer Agenda MMI");
}
