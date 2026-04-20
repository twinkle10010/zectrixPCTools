import type { Config } from './storage.ts';

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

export interface RequestOptions {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface TodoMutationPayload {
  title: string;
  dueDate: string;
  dueTime: string;
  priority: number;
}

function createAbortError(): Error {
  const error = new Error('请求已取消');
  error.name = 'AbortError';
  return error;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

async function request<T>(
  method: string,
  path: string,
  body?: object,
  config?: Config,
  options: RequestOptions = {}
): Promise<T> {
  if (!config) {
    throw new Error('请先配置 MAC 地址和 API Key');
  }

  const { signal, fetchImpl = fetch, timeoutMs = 10000 } = options;
  const controller = new AbortController();
  let didTimeout = false;
  let wasExternallyAborted = false;

  const abortFromParent = () => {
    wasExternallyAborted = true;
    controller.abort();
  };

  if (signal?.aborted) {
    abortFromParent();
  } else {
    signal?.addEventListener('abort', abortFromParent, { once: true });
  }

  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(`https://${API_BASE}${path}`, {
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
      if (didTimeout) {
        throw new Error('请求超时');
      }
      if (wasExternallyAborted) {
        throw createAbortError();
      }
    } else {
      throw new Error(`网络错误: ${e?.message || '请求失败'}`);
    }
    throw new Error(`网络错误: ${e?.message || '请求失败'}`);
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', abortFromParent);
  }
}

export function fetchTodos(config: Config, options?: RequestOptions): Promise<Todo[]> {
  const params = new URLSearchParams({
    status: '0',
    deviceId: config.mac_address
  });
  return request<Todo[]>('GET', `/open/v1/todos?${params.toString()}`, undefined, config, options);
}

export function createTodo(
  config: Config,
  payload: TodoMutationPayload,
  options?: RequestOptions
): Promise<void> {
  const body = {
    title: payload.title,
    description: '',
    dueDate: payload.dueDate,
    dueTime: payload.dueTime,
    repeatType: 'none',
    priority: payload.priority,
    deviceId: config.mac_address
  };
  return request<void>('POST', '/open/v1/todos', body, config, options);
}

export function updateTodo(
  config: Config,
  id: string | number,
  payload: TodoMutationPayload,
  options?: RequestOptions
): Promise<void> {
  return request<void>('PUT', `/open/v1/todos/${id}`, payload, config, options);
}

export function completeTodo(config: Config, id: string | number, options?: RequestOptions): Promise<void> {
  return request<void>('PUT', `/open/v1/todos/${id}/complete`, undefined, config, options);
}

export function deleteTodo(config: Config, id: string | number, options?: RequestOptions): Promise<void> {
  return request<void>('DELETE', `/open/v1/todos/${id}`, undefined, config, options);
}
