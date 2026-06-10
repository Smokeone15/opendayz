#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::Path;
use std::process::Command;
use winreg::enums::*;
use winreg::RegKey;

// Команда прямого запуска DayZ_x64.exe в обход окон подтверждения Steam
#[tauri::command]
fn launch_game_direct(
    custom_path: String, 
    connect_ip: String, 
    connect_port: u16, 
    mods: String, 
    additional_args: String
) -> Result<(), String> {
    
    let mut exe_path = custom_path;
    
    // 1. Если пользователь не указал путь вручную, ищем его в реестре Steam
    if exe_path.is_empty() {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(steam_key) = hkcu.open_subkey("Software\\Valve\\Steam") {
            if let Ok(steam_path) = steam_key.get_value::<String, _>("SteamPath") {
                let default_path = format!("{}/steamapps/common/DayZ/DayZ_x64.exe", steam_path.replace("\\", "/"));
                if Path::new(&default_path).exists() {
                    exe_path = default_path;
                }
            }
        }
    }

    // 2. Если в реестре пусто, проверяем стандартный путь установки по умолчанию
    if exe_path.is_empty() {
        let standard_path = "C:/Program Files (x86)/Steam/steamapps/common/DayZ/DayZ_x64.exe";
        if Path::new(standard_path).exists() {
            exe_path = standard_path.to_string();
        }
    }

    // 3. Если файл все еще не найден
    if exe_path.is_empty() {
        return Err("Не удалось найти файл DayZ_x64.exe автоматически. Пожалуйста, укажите путь к игре во вкладке 'Настройки параметров'.".to_string());
    }

    // 4. Формируем аргументы запуска процесса
    let mut args = Vec::new();
    args.push(format!("-connect={}", connect_ip));
    args.push(format!("-port={}", connect_port));
    
    if !mods.is_empty() {
        args.push(format!("-mod={}", mods));
    }

    // Добавляем дополнительные параметры оптимизации из настроек лаунчера
    for arg in additional_args.split_whitespace() {
        if !arg.is_empty() {
            args.push(arg.to_string());
        }
    }

    // 5. Запускаем нативный процесс игры напрямую
    Command::new(&exe_path)
        .args(&args)
        .spawn()
        .map_err(|err| format!("Ошибка запуска процесса DayZ_x64.exe: {}", err))?;

    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![launch_game_direct])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}