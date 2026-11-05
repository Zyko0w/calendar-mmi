// Pas de console noire au lancement sous Windows en mode release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    agenda_mmi_lib::run()
}
