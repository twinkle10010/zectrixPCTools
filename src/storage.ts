import { filesystem as nFileSystem, os as nOs } from '@neutralinojs/lib';

const CONFIG_FILE_NAME = 'config.json';
const WEB_CONFIG_STORAGE_KEY = 'zectrixPCTools.config';

export interface Config {
  mac_address: string;
  api_key: string;
  filter_future: boolean;
}

function isNeutralinoMode(): boolean {
  if (typeof window === 'undefined') return false;
  const runtime = window as any;
  return typeof runtime.NL_PORT !== 'undefined' || typeof runtime.NL_TOKEN !== 'undefined';
}

export function normalizeMacAddress(input: string): string | null {
  const condensed = input
    .trim()
    .replace(/：/g, ':')
    .replace(/[-:\s]/g, '')
    .toUpperCase();

  if (!/^[0-9A-F]{12}$/.test(condensed)) {
    return null;
  }

  return condensed.match(/.{2}/g)!.join(':');
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

export function parseConfig(raw: string | null): Config | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Config>;
    if (typeof parsed.mac_address !== 'string' || typeof parsed.api_key !== 'string') {
      return null;
    }
    const normalizedMacAddress = normalizeMacAddress(parsed.mac_address);
    const apiKey = parsed.api_key.trim();
    if (!normalizedMacAddress || !apiKey) {
      return null;
    }
    return {
      mac_address: normalizedMacAddress,
      api_key: apiKey,
      filter_future: !!parsed.filter_future
    };
  } catch {
    return null;
  }
}

export async function loadConfig(): Promise<Config | null> {
  if (isNeutralinoMode()) {
    const filePath = await getConfigFilePath();
    if (!filePath) return null;

    try {
      const content = await nFileSystem.readFile(filePath);
      return parseConfig(content);
    } catch {
      return null;
    }
  }

  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return parseConfig(window.localStorage.getItem(WEB_CONFIG_STORAGE_KEY));
  } catch {
    return null;
  }
}

export async function saveConfig(config: Config): Promise<boolean> {
  const normalizedMacAddress = normalizeMacAddress(config.mac_address);
  const apiKey = config.api_key.trim();
  if (!normalizedMacAddress || !apiKey) {
    return false;
  }

  const normalizedConfig: Config = {
    mac_address: normalizedMacAddress,
    api_key: apiKey,
    filter_future: config.filter_future
  };

  if (isNeutralinoMode()) {
    const filePath = await getConfigFilePath();
    if (!filePath) return false;

    try {
      await nFileSystem.writeFile(filePath, JSON.stringify(normalizedConfig));
      return true;
    } catch (error) {
      console.error('Failed to save config:', error);
      return false;
    }
  }

  if (typeof window === 'undefined') {
    return false;
  }

  try {
    window.localStorage.setItem(WEB_CONFIG_STORAGE_KEY, JSON.stringify(normalizedConfig));
    return true;
  } catch (error) {
    console.error('Failed to save config in browser storage:', error);
    return false;
  }
}

export async function isConfigured(): Promise<boolean> {
  const config = await loadConfig();
  return config !== null && !!config.mac_address && !!config.api_key;
}
