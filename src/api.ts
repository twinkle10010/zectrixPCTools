import { Config } from './storage';

const API_BASE = 'cloud.zectrix.com';

export interface Todo {
  id: string | number;
  title: string;
  description: string | null;
  dueDate: string;
  dueTime: string;
  status: number;
  priority: number;
  completed: boolean;
  deviceId: string;
  deviceName: string;
  createDate: string;
  updateDate: number;
}

interface ApiResponse<T> {
  code: number;
  msg: string;
  data?: T;
}

async function request<T>(method: string, path: string, body?: object, config?: Config): Promise<T> {
  if (!config) {
    throw new Error('请先配置 MAC 地址和 API Key');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`https://${API_BASE}${path}`, {
      method,
      headers: {
        'X-API-Key': config.api_key,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });

    const text = await response.text();
    let result: ApiResponse<T>;
    try {
      result = JSON.parse(text);
    } catch {
      throw new Error('解析响应失败');
    }

    if (result.code === 0) {
      return result.data as T;
    } else {
      throw new Error(result.msg || 'API 错误');
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new Error('请求超时');
    } else {
      throw new Error(`网络错误: ${e?.message || '请求失败'}`);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

export function fetchTodos(config: Config): Promise<Todo[]> {
  const params = new URLSearchParams({
    status: '0',
    deviceId: config.mac_address
  });
  return request<Todo[]>('GET', `/open/v1/todos?${params.toString()}`, undefined, config);
}

export function createTodo(
  config: Config,
  title: string,
  dueDate: string,
  dueTime: string,
  priority: number
): Promise<void> {
  const body = {
    title,
    description: '',
    dueDate,
    dueTime,
    repeatType: 'none',
    priority,
    deviceId: config.mac_address
  };
  return request<void>('POST', '/open/v1/todos', body, config);
}

export function updateTodo(config: Config, id: string | number, title: string): Promise<void> {
  return request<void>('PUT', `/open/v1/todos/${id}`, { title }, config);
}

export function completeTodo(config: Config, id: string | number): Promise<void> {
  return request<void>('PUT', `/open/v1/todos/${id}/complete`, undefined, config);
}

export function deleteTodo(config: Config, id: string | number): Promise<void> {
  return request<void>('DELETE', `/open/v1/todos/${id}`, undefined, config);
}
