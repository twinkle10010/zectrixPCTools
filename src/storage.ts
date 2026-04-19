import { filesystem as nFileSystem, os as nOs } from '@neutralinojs/lib';

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

async function getConfigFilePath(): Promise<string | null> {
  if (!isNeutralinoMode()) return null;
  try {
    const appId = ((window as any).NL_APPID as string | undefined) || 'com.zectrix.pctools';
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
  if (!isNeutralinoMode()) return null;

  const filePath = await getConfigFilePath();
  if (!filePath) return null;

  try {
    const content = await nFileSystem.readFile(filePath);
    return parseConfig(content);
  } catch {
    return null;
  }
}

export async function saveConfig(config: Config): Promise<boolean> {
  if (!isNeutralinoMode()) return false;

  const filePath = await getConfigFilePath();
  if (!filePath) return false;

  try {
    const normalizedConfig: Config = {
      mac_address: config.mac_address.trim(),
      api_key: config.api_key.trim()
    };
    await nFileSystem.writeFile(filePath, JSON.stringify(normalizedConfig));
    return true;
  } catch (error) {
    console.error('Failed to save config:', error);
    return false;
  }
}

export async function isConfigured(): Promise<boolean> {
  const config = await loadConfig();
  return config !== null && !!config.mac_address && !!config.api_key;
}
