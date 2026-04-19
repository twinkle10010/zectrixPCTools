# zectrixPCTools

一款基于 Neutralinojs 构建的桌面待办事项管理工具，支持云端同步。
<img width="1611" height="1323" alt="image" src="https://github.com/user-attachments/assets/2594bb0c-bf2f-4c5e-bd6d-1f1a80cf99b5" />
<img width="2031" height="1296" alt="image" src="https://github.com/user-attachments/assets/1a25b2da-0799-4629-a704-5a271a32b30a" />


## 功能特性

- **待办管理**：创建、编辑、完成、删除待办事项
- **优先级支持**：低/中/高三种优先级
- **云端同步**：通过 API 与云端 (cloud.zectrix.com) 同步数据
- **桌面集成**：
  - 窗口可拖拽移动
  - 始终置顶显示
  - 透明边框less窗口
  - 点击关闭按钮隐藏到后台（非退出）
- **快捷操作**：
  - 双击标题快速编辑
  - 右键菜单删除
  - 点击复选框完成待办

## 系统要求

### 开发环境

- **Node.js**: v18.0.0 或更高版本
- **npm**: v9.0.0 或更高版本
- **Rust** (仅构建热键扩展需要): 最新稳定版
- **操作系统**: Windows 10/11, macOS, Linux

### 运行环境

- **Windows**: Windows 10/11 (x64)
- 无需额外安装运行时（已打包 Neutralinojs）

## 项目结构

```
zectrixPCTools/
├── src/                    # TypeScript 源代码
│   ├── main.ts            # 应用主逻辑
│   ├── controller.ts      # 控制器
│   ├── api.ts             # API 通信
│   └── storage.ts         # 配置存储
├── extensions/            # 扩展程序
│   └── hotkey/            # 热键扩展
│       └── hotkey-ext.exe # 预编译的可执行文件
├── dist/                   # 构建输出
│   └── zectrixPCTools/    # 打包后的应用
│       └── zectrixPCTools-win_x64.exe  # Windows 可执行文件
├── styles.css             # 样式文件
├── index.html             # HTML 入口
├── neutralino.config.json  # Neutralinojs 配置
├── vite.config.ts         # Vite 配置
├── tsconfig.json          # TypeScript 配置
└── package.json           # npm 依赖配置
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 开发模式运行

```bash
npm run dev
```

启动后访问 http://127.0.0.1:5173

### 3. 构建打包

```bash
npm run build
```

打包后的文件位于 `dist/zectrixPCTools/`

### 4. 运行打包后的应用

```bash
# Windows
dist\zectrixPCTools\zectrixPCTools-win_x64.exe

# macOS / Linux
./dist/zectrixPCTools/zectrixPCTools
```

## 首次配置

1. 首次运行应用会显示设置弹窗
2. 填写以下信息：
   - **MAC 地址**：设备的 MAC 地址（格式：AA:BB:CC:DD:EE:FF）
   - **API Key**：从云端服务获取的 API 密钥
3. 点击「保存并进入」完成配置

配置信息存储在：
- Windows: `%APPDATA%\com.zectrix.pctools\config.json`
- macOS: `~/Library/Application Support/com.zectrix.pctools/config.json`

## 使用说明

### 创建待办

- 点击标题栏的 **+** 按钮
- 或双击待办列表空白区域
- 填写标题、日期、时间、优先级后保存

### 编辑待办

- **快速编辑**：双击待办标题直接修改
- **完整编辑**：通过设置弹窗修改（功能预留）

### 完成/删除待办

- **完成**：点击待办左侧的复选框
- **删除**：右键点击待办，选择「删除」

### 关闭窗口

- 点击关闭按钮会将窗口隐藏到后台，应用继续运行
- 如需完全退出，请通过任务管理器终止进程

## 热键扩展

热键扩展 (`hotkey-ext.exe`) 用于注册系统级快捷键，提供额外的快捷操作支持。

### 重新构建热键扩展（可选）

如需修改热键扩展源码：

```bash
cd extensions/hotkey
cargo build --release
# 输出: target/release/hotkey-ext.exe
```

## 打包注意事项

### 必须先清理再打包

每次执行 `npm run build` 前，**必须先删除 `dist` 目录**：

```bash
rm -rf dist
npm run build
```

原因：`neutralino.config.json` 中 `resourcesPath: "dist"` 会将 `dist` 目录内容打包。如果 `dist` 目录中已存在上一次打包的输出文件，会导致循环引用，使 `resources.neu` 文件体积膨胀（从几十KB变成几百MB）。

### 扩展目录保持精简

`extensions/hotkey/` 目录只保留 `hotkey-ext.exe` 文件即可。源码文件（`Cargo.toml`、`src/`、`target/`）不需要也不应该提交到仓库。

## 常见问题

### Q: 构建后 resources.neu 文件过大？

A: 检查 `neutralino.config.json` 中 `resourcesPath` 和 `distributionPath` 配置，确保 Vite 输出目录与 Neutralinojs 打包目录分离，避免循环引用。

### Q: 打包后无法找到页面？

A: 检查 `documentRoot` 和 `url` 配置是否与实际文件路径匹配。

### Q: 窗口显示异常？

A: 确保运行的是打包后的可执行文件，而非开发模式直接访问。

## 技术栈

- **运行时**: Neutralinojs v6.7.0
- **构建工具**: Vite v5.0.0
- **语言**: TypeScript v5.3.0
- **扩展开发**: Rust

## 配置说明

### neutralino.config.json 主要配置

| 字段 | 说明 |
|------|------|
| `applicationId` | 应用唯一标识符 |
| `defaultMode` | 默认运行模式（window/browser） |
| `documentRoot` | 静态文件根目录 |
| `url` | 入口页面路径 |
| `enableNativeAPI` | 启用原生 API |
| `cli.resourcesPath` | 资源文件路径 |
| `cli.distributionPath` | 打包输出目录 |

### 窗口配置

- **alwaysOnTop**: true - 始终置顶
- **borderless**: true - 无边框窗口
- **transparent**: true - 透明背景
- **center**: true - 启动时居中

## 许可证

 proprietary
