import {
  loadConfig,
  saveConfig,
  isConfigured,
  normalizeMacAddress
} from './storage.ts';
import type { Config } from './storage.ts';
import {
  fetchTodos,
  createTodo,
  updateTodo,
  completeTodo,
  deleteTodo,
  isAbortError
} from './api.ts';
import type { Todo, TodoMutationPayload } from './api.ts';
import {
  init as initNeutralino,
  window as nWindow,
  os as nOs,
  events as nEvents
} from '@neutralinojs/lib';

class App {
  private config: Config | null = null;
  private todos: Todo[] = [];
  private currentEditId: string | number | null = null;
  private contextMenuTodoId: string | number | null = null;
  private inlineEditingId: string | number | null = null;
  private abortController: AbortController | null = null;
  private boundHideContextMenu!: () => void;
  private visibilityCheckInterval: number | null = null;
  private wasWindowHidden = true;
  private isSettingsMode = false;

  private setupModal!: HTMLElement;
  private setupTitle!: HTMLElement;
  private setupSaveBtn!: HTMLButtonElement;
  private setupCancelBtn!: HTMLButtonElement;
  private appContainer!: HTMLElement;
  private editModal!: HTMLElement;
  private todoList!: HTMLElement;
  private contextMenu!: HTMLElement;
  private macInput!: HTMLInputElement;
  private apiKeyInput!: HTMLInputElement;

  constructor() {
    if (this.hasNeutralinoRuntime()) {
      initNeutralino();
    }

    this.boundHideContextMenu = () => this.hideContextMenu();

    this.initElements();
    this.bindEvents();

    if (!this.hasNeutralinoRuntime()) {
      document.body.classList.add('window-visible');
    }

    void this.bootstrap();

    window.addEventListener('beforeunload', () => this.destroy());
  }

  destroy() {
    this.abortController?.abort();
    document.removeEventListener('click', this.boundHideContextMenu);
    if (this.visibilityCheckInterval !== null) {
      clearInterval(this.visibilityCheckInterval);
      this.visibilityCheckInterval = null;
    }
  }

  private hasNeutralinoRuntime(): boolean {
    if (typeof window === 'undefined') return false;
    const runtime = window as any;
    return typeof runtime.NL_PORT !== 'undefined' || typeof runtime.NL_TOKEN !== 'undefined';
  }

  private isNeutralinoMode(): boolean {
    return this.hasNeutralinoRuntime();
  }

  private async bootstrap() {
    if (this.isNeutralinoMode()) {
      try {
        void this.initExtension();

        await nWindow.show();
        await nWindow.center();
        document.body.classList.add('window-visible');

        nEvents.on('windowClose', async () => {
          await nWindow.hide();
        });

        this.startVisibilityPolling();
      } catch (err) {
        console.error('Bootstrap error:', err);
      }
    }

    await this.checkConfig();
  }

  private async initExtension() {
    try {
      const nlPath = (window as any).NL_PATH as string;
      const nlPort = (window as any).NL_PORT as number;
      const nlToken = (window as any).NL_TOKEN as string;

      const normalizedPath = nlPath.replace(/\\/g, '/');
      const extPath = `${normalizedPath}/extensions/hotkey/hotkey-ext.exe`;
      const quotedCommand = `"${extPath}" "${nlPort}" "${nlToken.replace(/"/g, '\\"')}"`;

      console.log('Starting hotkey extension:', extPath);
      await nOs.spawnProcess(quotedCommand, {
        cwd: `${normalizedPath}/extensions/hotkey`
      });
      console.log('Hotkey extension started');
    } catch (err) {
      console.error('Failed to start hotkey extension:', err);
    }
  }

  private initElements() {
    this.setupModal = document.getElementById('setup-modal')!;
    this.setupTitle = document.getElementById('setup-title')!;
    this.setupSaveBtn = document.getElementById('save-config-btn') as HTMLButtonElement;
    this.setupCancelBtn = document.getElementById('setup-cancel-btn') as HTMLButtonElement;
    this.appContainer = document.getElementById('app')!;
    this.editModal = document.getElementById('edit-modal')!;
    this.todoList = document.getElementById('todo-list')!;
    this.contextMenu = document.getElementById('context-menu')!;
    this.macInput = document.getElementById('mac-input') as HTMLInputElement;
    this.apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement;
  }

  private bindEvents() {
    this.setupSaveBtn.addEventListener('click', () => void this.saveConfig());
    this.setupCancelBtn.addEventListener('click', () => this.hideSetupModal());
    document.getElementById('settings-btn')!.addEventListener('click', () => this.openSettingsDialog());
    document.getElementById('add-btn')!.addEventListener('click', () => this.showCreateDialog());
    document.getElementById('edit-cancel-btn')!.addEventListener('click', () => this.hideEditDialog());
    document.getElementById('edit-save-btn')!.addEventListener('click', () => void this.saveEdit());

    document.getElementById('maximize-btn')!.addEventListener('click', () => this.handleMaximize());
    document.getElementById('close-btn')!.addEventListener('click', () => this.handleClose());

    this.macInput.addEventListener('blur', () => this.formatMacInputValue());
    this.macInput.addEventListener('input', () => this.macInput.classList.remove('input-error'));
    this.apiKeyInput.addEventListener('input', () => this.apiKeyInput.classList.remove('input-error'));

    this.todoList.addEventListener('dblclick', (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.todo-item')) {
        this.showCreateDialog();
      }
    });

    this.contextMenu.querySelectorAll('.menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const action = (e.target as HTMLElement).dataset.action;
        this.handleContextAction(action!);
      });
    });

    document.addEventListener('click', this.boundHideContextMenu);

    this.todoList.addEventListener('contextmenu', (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.todo-item')) {
        e.preventDefault();
      }
    });

    void this.setupDragToMove();
  }

  private async setupDragToMove() {
    if (!this.isNeutralinoMode()) return;

    const dragArea = document.getElementById('drag-header') as HTMLElement | null;
    if (!dragArea) return;
    try {
      await nWindow.setDraggableRegion(dragArea, {
        exclude: ['add-btn', 'settings-btn', 'maximize-btn', 'close-btn']
      });
    } catch (err) {
      console.error('Setup draggable region failed:', err);
    }
  }

  private async handleMaximize() {
    if (!this.isNeutralinoMode()) return;
    try {
      const isMaximized = await nWindow.isMaximized();
      if (isMaximized) {
        await nWindow.unmaximize();
      } else {
        await nWindow.maximize();
      }
    } catch (e: any) {
      console.error('最大化失败:', e?.message || e);
    }
  }

  private async handleClose() {
    if (!this.isNeutralinoMode()) return;
    try {
      await nWindow.hide();
    } catch (e: any) {
      console.error('关闭失败:', e?.message || e);
    }
  }

  private startVisibilityPolling() {
    if (!this.isNeutralinoMode()) return;

    this.visibilityCheckInterval = window.setInterval(async () => {
      try {
        const isVisible = await nWindow.isVisible();
        if (isVisible && this.wasWindowHidden) {
          this.wasWindowHidden = false;
          void this.refreshTodos();
        } else if (!isVisible) {
          this.wasWindowHidden = true;
        }
      } catch {
        // Ignore polling errors.
      }
    }, 500);
  }

  private async checkConfig() {
    if (await isConfigured()) {
      this.config = await loadConfig();
      this.showMainApp();
      void this.refreshTodos();
    } else {
      this.showSetupModal('initial');
    }
  }

  private populateConfigInputs(config: Config | null) {
    this.macInput.value = config?.mac_address ?? '';
    this.apiKeyInput.value = config?.api_key ?? '';
    this.macInput.classList.remove('input-error');
    this.apiKeyInput.classList.remove('input-error');
  }

  private showSetupModal(mode: 'initial' | 'settings') {
    this.isSettingsMode = mode === 'settings';
    this.setupTitle.textContent = this.isSettingsMode ? '设置' : '首次设置';
    this.setupSaveBtn.textContent = this.isSettingsMode ? '保存设置' : '保存并进入';
    this.setupCancelBtn.classList.toggle('hidden', !this.isSettingsMode);
    this.populateConfigInputs(this.isSettingsMode ? this.config : null);
    this.setupModal.classList.remove('hidden');

    if (!this.isSettingsMode) {
      this.appContainer.classList.add('hidden');
    }
  }

  private hideSetupModal() {
    this.setupModal.classList.add('hidden');
    this.isSettingsMode = false;
  }

  private openSettingsDialog() {
    this.showSetupModal('settings');
  }

  private showMainApp() {
    this.hideSetupModal();
    this.appContainer.classList.remove('hidden');
  }

  private formatMacInputValue() {
    const normalized = normalizeMacAddress(this.macInput.value);
    if (normalized) {
      this.macInput.value = normalized;
      this.macInput.classList.remove('input-error');
    }
  }

  private markInputError(input: HTMLInputElement) {
    input.classList.add('input-error');
  }

  private async saveConfig() {
    const normalizedMacAddress = normalizeMacAddress(this.macInput.value);
    const apiKey = this.apiKeyInput.value.trim();

    if (!normalizedMacAddress) {
      this.markInputError(this.macInput);
      alert('MAC 地址格式无效，请输入 12 位十六进制字符，保存后会自动规范为 AA:BB:CC:DD:EE:FF');
      return;
    }

    if (!apiKey) {
      this.markInputError(this.apiKeyInput);
      alert('请输入 API Key');
      return;
    }

    this.macInput.value = normalizedMacAddress;
    const config: Config = { mac_address: normalizedMacAddress, api_key: apiKey };
    if (await saveConfig(config)) {
      this.config = config;
      if (this.isSettingsMode) {
        this.hideSetupModal();
      } else {
        this.showMainApp();
      }
      void this.refreshTodos();
    } else {
      alert('保存配置失败');
    }
  }

  async refreshTodos() {
    if (!this.config) return;

    this.abortController?.abort();
    const requestController = new AbortController();
    this.abortController = requestController;

    this.todoList.innerHTML = '<div class="loading">加载中...</div>';

    try {
      const todos = await fetchTodos(this.config, { signal: requestController.signal });
      if (this.abortController !== requestController || requestController.signal.aborted) return;
      this.todos = todos;
      this.renderTodos();
    } catch (e: any) {
      if (this.abortController !== requestController || isAbortError(e)) return;
      this.todoList.innerHTML = `<div class="empty">加载失败: ${e.message}</div>`;
    }
  }

  private renderTodos() {
    if (this.todos.length === 0) {
      this.todoList.innerHTML = '<div class="empty"><div class="empty-icon">📋</div>暂无待办事项</div>';
      return;
    }

    this.todoList.innerHTML = this.todos.map(todo => {
      const priorityClass = todo.priority === 2 ? 'priority-high' :
        todo.priority === 0 ? 'priority-low' : 'priority-medium';
      const dueDateText = todo.dueDate ? todo.dueDate.split('T')[0] : '';
      const dueText = dueDateText && todo.dueTime ? `${dueDateText} ${todo.dueTime}` : '';

      return `
        <div class="todo-item ${priorityClass}" data-id="${todo.id}">
          <div class="checkbox" title="点击完成"></div>
          <div class="content">
            <div class="title">${this.escapeHtml(todo.title)}</div>
            ${dueText ? `<div class="due">${dueText}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    this.todoList.querySelectorAll('.todo-item').forEach(item => {
      const id = item.getAttribute('data-id');
      if (id === null) return;
      const todo = this.todos.find(t => String(t.id) === id);
      if (!todo) return;

      const checkbox = item.querySelector('.checkbox') as HTMLElement | null;
      const title = item.querySelector('.title') as HTMLElement | null;

      checkbox?.addEventListener('click', (e) => {
        e.stopPropagation();
        void this.handleCompleteById(id);
      });

      title?.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.startInlineEdit(title, todo);
      });

      item.addEventListener('contextmenu', (e: Event) => {
        e.preventDefault();
        const mouseEvent = e as MouseEvent;
        this.showContextMenu(mouseEvent.clientX, mouseEvent.clientY, id);
      });
    });
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private showContextMenu(x: number, y: number, id: string | number) {
    this.contextMenuTodoId = id;
    this.contextMenu.style.left = `${x}px`;
    this.contextMenu.style.top = `${y}px`;
    this.contextMenu.classList.remove('hidden');
  }

  private hideContextMenu() {
    this.contextMenu.classList.add('hidden');
    this.contextMenuTodoId = null;
  }

  private handleContextAction(action: string) {
    if (this.contextMenuTodoId === null) return;
    if (action === 'edit') {
      const todo = this.todos.find(item => String(item.id) === String(this.contextMenuTodoId));
      if (todo) {
        this.showEditDialog(todo);
      }
    }
    if (action === 'delete') {
      void this.handleDelete();
    }
    this.hideContextMenu();
  }

  private async handleCompleteById(id: string | number) {
    if (!this.config) return;
    try {
      await completeTodo(this.config, id);
      await this.refreshTodos();
    } catch (e: any) {
      alert(`操作失败: ${e.message}`);
    }
  }

  private startInlineEdit(titleEl: HTMLElement, todo: Todo) {
    if (this.inlineEditingId !== null) return;

    this.inlineEditingId = todo.id;
    const originalText = todo.title;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'inline-edit-input';
    input.value = originalText;

    titleEl.replaceChildren(input);
    input.focus();
    input.select();

    const restoreTitle = (text: string) => {
      titleEl.textContent = text;
      this.inlineEditingId = null;
    };

    let isSaving = false;

    const save = async () => {
      if (isSaving) return;
      isSaving = true;

      const newTitle = input.value.trim();
      if (!newTitle || newTitle === originalText) {
        restoreTitle(originalText);
        return;
      }
      if (!this.config) {
        restoreTitle(originalText);
        return;
      }

      try {
        await updateTodo(this.config, todo.id, {
          title: newTitle,
          dueDate: todo.dueDate ? todo.dueDate.split('T')[0] : '',
          dueTime: todo.dueTime || '',
          priority: todo.priority
        });
        this.inlineEditingId = null;
        await this.refreshTodos();
      } catch (e: any) {
        restoreTitle(originalText);
        alert(`修改失败: ${e.message}`);
      }
    };

    input.addEventListener('blur', () => {
      setTimeout(() => void save(), 0);
    });
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        restoreTitle(originalText);
      }
    });
  }

  private showCreateDialog() {
    this.currentEditId = null;
    (document.getElementById('edit-title') as HTMLElement).textContent = '创建待办';
    (document.getElementById('edit-id') as HTMLInputElement).value = '';
    (document.getElementById('edit-title-input') as HTMLInputElement).value = '';

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const date = `${year}-${month}-${day}`;
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const time = `${hours}:${minutes}`;
    (document.getElementById('edit-date-input') as HTMLInputElement).value = date;
    (document.getElementById('edit-time-input') as HTMLInputElement).value = time;

    const priorityRadio = document.querySelector('input[name="priority"][value="1"]') as HTMLInputElement;
    if (priorityRadio) priorityRadio.checked = true;

    this.editModal.classList.remove('hidden');
  }

  private showEditDialog(todo: Todo) {
    this.currentEditId = todo.id;
    (document.getElementById('edit-title') as HTMLElement).textContent = '编辑待办';
    (document.getElementById('edit-id') as HTMLInputElement).value = String(todo.id);
    (document.getElementById('edit-title-input') as HTMLInputElement).value = todo.title;
    (document.getElementById('edit-date-input') as HTMLInputElement).value = todo.dueDate
      ? todo.dueDate.split('T')[0]
      : '';
    (document.getElementById('edit-time-input') as HTMLInputElement).value = todo.dueTime || '';

    const priorityRadio = document.querySelector(`input[name="priority"][value="${todo.priority}"]`) as HTMLInputElement | null;
    if (priorityRadio) {
      priorityRadio.checked = true;
    }

    this.editModal.classList.remove('hidden');
  }

  private hideEditDialog() {
    this.editModal.classList.add('hidden');
    this.currentEditId = null;
  }

  private async saveEdit() {
    if (!this.config) return;

    const titleInput = document.getElementById('edit-title-input') as HTMLInputElement;
    const dateInput = document.getElementById('edit-date-input') as HTMLInputElement;
    const timeInput = document.getElementById('edit-time-input') as HTMLInputElement;
    const priorityRadio = document.querySelector('input[name="priority"]:checked') as HTMLInputElement;

    const title = titleInput.value.trim();
    const dueDate = dateInput.value;
    const dueTime = timeInput.value;
    const priority = parseInt(priorityRadio.value, 10);
    const payload: TodoMutationPayload = {
      title,
      dueDate,
      dueTime,
      priority
    };

    if (!title) {
      titleInput.classList.add('input-error');
      titleInput.addEventListener('input', function handler() {
        titleInput.classList.remove('input-error');
        titleInput.removeEventListener('input', handler);
      });
      return;
    }

    try {
      if (this.currentEditId !== null) {
        await updateTodo(this.config, this.currentEditId, payload);
      } else {
        await createTodo(this.config, payload);
      }
      this.hideEditDialog();
      await this.refreshTodos();
    } catch (e: any) {
      alert(`操作失败: ${e.message}`);
    }
  }

  private async handleDelete() {
    if (!this.config || this.currentEditId === null) return;

    try {
      await deleteTodo(this.config, this.currentEditId);
      await this.refreshTodos();
    } catch (e: any) {
      alert(`删除失败: ${e.message}`);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new App();
});
