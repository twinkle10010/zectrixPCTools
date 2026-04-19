import { filesystem as nFileSystem, os as nOs, storage as nStorage } from '@neutralinojs/lib';

const CONFIG_KEY = 'todo_widget_config';
const CONFIG_FILE_NAME = 'config.json';

export interface Config {
  mac_address: string;
  api_key: string;
}

function isNeutralinoMode(): boolean {
  if (typeof window === 'undefined') return false;
  const runtime = window as any;
  return typeof runtime.NL_PORT !== 'undefined' || typeof runtime.NL_TOKEN !== 'undefined';
}

function getConfigFilePath(): string | null {
  if (!isNeutralinoMode()) return null;
  const appPath = (window as any).NL_PATH as string | undefined;
  if (!appPath) return null;
  return `${appPath}\\${CONFIG_FILE_NAME}`;
}

async function getPersistentConfigFilePath(): Promise<string | null> {
  if (!isNeutralinoMode()) return null;
  try {
    const appId = ((window as any).NL_APPID as string | undefined) || 'todo_widget';
    const dataDir = await nOs.getPath('data');
    const appDir = `${dataDir}\\${appId}`;
    try {
      await nFileSystem.createDirectory(appDir);
    } catch {
      // Directory may already exist.
    }
    return `${appDir}\\${CONFIG_FILE_NAME}`;
  } catch {
    return null;
  }
}

function parseConfig(raw: string | null): Config | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Config>;
    if (typeof parsed.mac_address !== 'string' || typeof parsed.api_key !== 'string') {
      return null;
    }
    if (!parsed.mac_address.trim() || !parsed.api_key.trim()) {
      return null;
    }
    return {
      mac_address: parsed.mac_address.trim(),
      api_key: parsed.api_key.trim()
    };
  } catch {
    return null;
  }
}

export async function loadConfig(): Promise<Config | null> {
  try {
    if (isNeutralinoMode()) {
      const persistentFilePath = await getPersistentConfigFilePath();
      if (persistentFilePath) {
        try {
          const persistentFileConfig = parseConfig(await nFileSystem.readFile(persistentFilePath));
          if (persistentFileConfig) return persistentFileConfig;
        } catch {
          // Ignore persistent file read failures and fallback to other sources.
        }
      }

      try {
        const storageConfig = parseConfig(await nStorage.getData(CONFIG_KEY));
        if (storageConfig) return storageConfig;
      } catch {
        // Ignore Neutralino storage read failures and fallback to other sources.
      }

      const filePath = getConfigFilePath();
      if (filePath) {
        try {
          const fileConfig = parseConfig(await nFileSystem.readFile(filePath));
          if (fileConfig) return fileConfig;
        } catch {
          // Ignore file read failures and fallback to localStorage.
        }
      }
    }

    // 在非浏览器环境或 localStorage 不可用时安全返回 null
    try {
      if (typeof localStorage !== 'undefined') {
        return parseConfig(localStorage.getItem(CONFIG_KEY));
      }
    } catch {
      // localStorage 不可用
    }
    return null;
  } catch (error) {
    console.error('Failed to load config:', error);
  }
  return null;
}

export async function saveConfig(config: Config): Promise<boolean> {
  try {
    const normalizedConfig: Config = {
      mac_address: config.mac_address.trim(),
      api_key: config.api_key.trim()
    };
    const data = JSON.stringify(normalizedConfig);
    let successCount = 0;

    // 尝试保存到 localStorage（仅在浏览器环境中）
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(CONFIG_KEY, data);
        successCount += 1;
      }
    } catch {
      // Ignore localStorage write failures.
    }

    if (isNeutralinoMode()) {
      try {
        await nStorage.setData(CONFIG_KEY, data);
        successCount += 1;
      } catch {
        // Ignore Neutralino storage write failures.
      }

      const persistentFilePath = await getPersistentConfigFilePath();
      if (persistentFilePath) {
        try {
          await nFileSystem.writeFile(persistentFilePath, data);
          successCount += 1;
        } catch {
          // Ignore persistent file write failures.
        }
      }

      const filePath = getConfigFilePath();
      if (filePath) {
        try {
          await nFileSystem.writeFile(filePath, data);
          successCount += 1;
        } catch {
          // Ignore app directory file write failures.
        }
      }
    }

    return successCount > 0;
  } catch (error) {
    console.error('Failed to save config:', error);
    return false;
  }
}

export async function isConfigured(): Promise<boolean> {
  const config = await loadConfig();
  return config !== null && !!config.mac_address && !!config.api_key;
}
