use rdev::{listen, Event, EventType, Key};
use std::sync::atomic::{AtomicBool, Ordering};
use tray_icon::{
    menu::{Menu, MenuItem},
    Icon, TrayIconBuilder,
};
use windows::Win32::UI::WindowsAndMessaging::{
    FindWindowW, GetMessageW, GetWindowThreadProcessId, SetForegroundWindow, ShowWindow,
    SW_RESTORE, SW_SHOW, IsWindowVisible, IsIconic,
    TranslateMessage, DispatchMessageW, MSG,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    keybd_event, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, VK_MENU,
};
use windows::Win32::Foundation::HWND;
use windows::Win32::System::Threading::{OpenProcess, TerminateProcess, PROCESS_TERMINATE};
use windows_core::PCWSTR;

// 主程序窗口标题
const MAIN_WINDOW_TITLE: &str = "zectrixPCTools";

static QUIT_REQUESTED: AtomicBool = AtomicBool::new(false);

fn find_main_window() -> Option<HWND> {
    unsafe {
        let title: Vec<u16> = MAIN_WINDOW_TITLE.encode_utf16().chain(std::iter::once(0)).collect();
        let result = FindWindowW(None, PCWSTR(title.as_ptr()));
        match result {
            Ok(hwnd) => {
                if hwnd.0 == std::ptr::null_mut() {
                    None
                } else {
                    Some(hwnd)
                }
            }
            Err(_) => None,
        }
    }
}

fn bring_window_to_front() {
    if let Some(hwnd) = find_main_window() {
        unsafe {
            // 判断窗口当前状态，选择正确的显示方式
            let is_visible = IsWindowVisible(hwnd).as_bool();
            let is_minimized = IsIconic(hwnd).as_bool();

            if is_minimized {
                let _ = ShowWindow(hwnd, SW_RESTORE);
            } else if !is_visible {
                let _ = ShowWindow(hwnd, SW_SHOW);
            }

            // 模拟按下并释放 Alt 键，绕过 SetForegroundWindow 限制
            keybd_event(VK_MENU.0 as u8, 0, KEYEVENTF_EXTENDEDKEY, 0);
            keybd_event(VK_MENU.0 as u8, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);

            let _ = SetForegroundWindow(hwnd);
        }
        println!("Window brought to front (visible: previous state handled)");
    } else {
        println!("Main window not found");
    }
}

fn terminate_main_program() {
    if let Some(hwnd) = find_main_window() {
        unsafe {
            let mut process_id: u32 = 0;
            GetWindowThreadProcessId(hwnd, Some(&mut process_id));

            if process_id != 0 {
                println!("Terminating process ID: {}", process_id);
                let handle = OpenProcess(PROCESS_TERMINATE, false, process_id);
                if let Ok(handle) = handle {
                    let _ = TerminateProcess(handle, 1);
                    println!("Main process terminated");
                }
            }
        }
    }
}

fn main() {
    println!("Hotkey extension starting...");

    // 创建托盘图标
    let quit_item = MenuItem::with_id("quit", "退出", true, None);
    let menu = Menu::with_items(&[&quit_item]).expect("Failed to create menu");

    // 加载图标
    let icon = load_icon();

    let _tray = TrayIconBuilder::new()
        .with_icon(icon)
        .with_menu(Box::new(menu))
        .with_tooltip("zectrixPCTools - 右键退出")
        .build()
        .expect("Failed to create tray icon");

    // 监听菜单事件 - 使用 muda 的事件处理
    let _ = tray_icon::menu::MenuEvent::set_event_handler(Some(move |event: tray_icon::menu::MenuEvent| {
        println!("Menu event received: {:?}", event.id.as_ref());
        if event.id.as_ref() == "quit" {
            println!("Quit clicked!");
            QUIT_REQUESTED.store(true, Ordering::Relaxed);
        }
    }));

    // 启动热键监听线程
    std::thread::spawn(move || {
        let mut current_keys: std::collections::HashSet<Key> = std::collections::HashSet::new();

        if let Err(e) = listen(move |event: Event| {
            match event.event_type {
                EventType::KeyPress(key) => {
                    current_keys.insert(key);
                }
                EventType::KeyRelease(key) => {
                    current_keys.remove(&key);
                }
                _ => {
                    // 不要清空按键状态！鼠标移动等事件不应影响键盘状态
                }
            }

            // 检查 Alt+C
            let has_alt = current_keys.contains(&Key::Alt);
            let has_c = current_keys.contains(&Key::KeyC);

            if has_alt && has_c {
                println!("Hotkey Alt+C triggered!");
                bring_window_to_front();
                current_keys.clear();
            }
        }) {
            eprintln!("Error listening for hotkeys: {:?}", e);
        }
    });

    println!("Hotkey extension ready. Press Alt+C to show window, right-click to quit.");

    // Windows 消息循环
    unsafe {
        let mut msg: MSG = std::mem::zeroed();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            let _ = DispatchMessageW(&msg);

            // 检查是否请求退出
            if QUIT_REQUESTED.load(Ordering::Relaxed) {
                terminate_main_program();
                std::process::exit(0);
            }
        }
    }
}

fn load_icon() -> Icon {
    let icon_paths = [
        "../icon.ico",
        "../../icon.ico",
        "icon.ico",
        "extensions/hotkey/icon.ico",
    ];

    for path in &icon_paths {
        if std::path::Path::new(path).exists() {
            if let Ok(icon) = Icon::from_path(path, None) {
                println!("Loaded icon from: {}", path);
                return icon;
            }
        }
    }

    println!("No icon found, using default");
    create_default_icon()
}

fn create_default_icon() -> Icon {
    let size = 16;
    let mut rgba = vec![0u8; size * size * 4];

    for i in 0..(size * size) {
        let idx = i * 4;
        rgba[idx] = 255;     // R
        rgba[idx + 1] = 0;   // G
        rgba[idx + 2] = 0;   // B
        rgba[idx + 3] = 255; // A
    }

    Icon::from_rgba(rgba, size as u32, size as u32).expect("Failed to create default icon")
}
