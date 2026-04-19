import { loadConfig, saveConfig, isConfigured, Config } from './storage';
import { fetchTodos, createTodo, updateTodo, completeTodo, deleteTodo, Todo } from './api';
import { init as initNeutralino, window as nWindow, os as nOs, events as nEvents, app } from '@neutralinojs/lib';

class App {
  private config: Config | null = null;
  private todos: Todo[] = [];
  private currentEditId: string | number | null = null;
  private inlineEditingId: string | number | null = null;
  private abortController: AbortController | null = null;
  private boundHandleKeydown!: (e: KeyboardEvent) => void;
  private boundHideContextMenu!: () => void;
  private visibilityCheckInterval: number | null = null;
  private wasWindowHidden: boolean = true;

  private setupModal!: HTMLElement;
  private appContainer!: HTMLElement;
  private editModal!: HTMLElement;
  private todoList!: HTMLElement;
  private contextMenu!: HTMLElement;

  constructor() {
    if (this.hasNeutralinoRuntime()) {
      initNeutralino();
    }

    // 绑定方法引用以便正确移除事件监听器
    this.boundHideContextMenu = () => this.hideContextMenu();

    this.initElements();
    this.bindEvents();
    void this.bootstrap();

    // 页面卸载时清理资源
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
        // 启动热键扩展（托盘和全局热键）
        this.initExtension();

        // 先显示窗口再居中，避免闪烁
        await nWindow.show();
        await nWindow.center();
        // 居中完成后显示 body
        document.body.classList.add('window-visible');

        // 监听窗口关闭事件，隐藏到托盘而不是退出
        nEvents.on('windowClose', async () => {
          await nWindow.hide();
        });

        // 启动窗口可见性轮询，检测热键扩展直接显示窗口的情况
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

      const extPath = nlPath.replace(/\\/g, '/') + '/extensions/hotkey/hotkey-ext.exe';
      console.log('Starting hotkey extension:', extPath);
      console.log('With port:', nlPort, 'token:', nlToken ? nlToken.substring(0, 10) : 'none');

      // 传递 port 和 token 给扩展
      await nOs.spawnProcess(extPath, {
        args: [String(nlPort), nlToken],
        cwd: nlPath.replace(/\\/g, '/') + '/extensions/hotkey'
      });
      console.log('Hotkey extension started');
    } catch (err) {
      console.error('Failed to start hotkey extension:', err);
    }
  }

  private async initTray() {
    // 托盘功能已禁用
  }

  private initElements() {
    this.setupModal = document.getElementById('setup-modal')!;
    this.appContainer = document.getElementById('app')!;
    this.editModal = document.getElementById('edit-modal')!;
    this.todoList = document.getElementById('todo-list')!;
    this.contextMenu = document.getElementById('context-menu')!;
  }

  private bindEvents() {
    document.getElementById('save-config-btn')!.addEventListener('click', () => void this.saveConfig());
    document.getElementById('add-btn')!.addEventListener('click', () => this.showCreateDialog());
    document.getElementById('edit-cancel-btn')!.addEventListener('click', () => this.hideEditDialog());
    document.getElementById('edit-save-btn')!.addEventListener('click', () => void this.saveEdit());

    document.getElementById('maximize-btn')!.addEventListener('click', () => this.handleMaximize());
    document.getElementById('close-btn')!.addEventListener('click', () => this.handleClose());

    this.todoList.addEventListener('dblclick', (e) => {
      const target = e.target as HTMLElement;
      // 只有点击空白处（非 todo-item）才触发
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

    // 空白处右键不显示浏览器菜单
    this.todoList.addEventListener('contextmenu', (e) => {
      const target = e.target as HTMLElement;
      // 只有点击空白处（非 todo-item）才阻止
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
        exclude: ['add-btn', 'maximize-btn', 'close-btn']
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

  private async toggleWindow() {
    if (!this.isNeutralinoMode()) return;

    try {
      // 直接切换：隐藏就显示，显示就隐藏
      const visible = await nWindow.isVisible();
      if (visible) {
        await nWindow.hide();
      } else {
        await nWindow.show();
        await nWindow.center();
        await nWindow.focus();
        document.body.classList.add('window-visible');
        void this.refreshTodos();
      }
    } catch (e: any) {
      console.error('窗口切换失败:', e?.message || e);
    }
  }

  private startVisibilityPolling() {
    if (!this.isNeutralinoMode()) return;

    this.visibilityCheckInterval = window.setInterval(async () => {
      try {
        const isVisible = await nWindow.isVisible();
        if (isVisible && this.wasWindowHidden) {
          // 窗口刚被显示（可能是热键触发的），刷新数据
          this.wasWindowHidden = false;
          void this.refreshTodos();
        } else if (!isVisible) {
          this.wasWindowHidden = true;
        }
      } catch (e) {
        // 忽略轮询中的错误
      }
    }, 500);
  }

  private async checkConfig() {
    if (await isConfigured()) {
      this.config = await loadConfig();
      this.showMainApp();
      void this.refreshTodos();
    } else {
      this.showSetupModal();
    }
  }

  private showSetupModal() {
    this.setupModal.classList.remove('hidden');
    this.appContainer.classList.add('hidden');
  }

  private showMainApp() {
    this.setupModal.classList.add('hidden');
    this.appContainer.classList.remove('hidden');
  }

  private async saveConfig() {
    const macInput = document.getElementById('mac-input') as HTMLInputElement;
    const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement;

    const mac = macInput.value.trim();
    const apiKey = apiKeyInput.value.trim();

    if (!mac || !apiKey) {
      alert('请填写所有字段');
      return;
    }

    const config: Config = { mac_address: mac, api_key: apiKey };
    if (await saveConfig(config)) {
      this.config = config;
      this.showMainApp();
      void this.refreshTodos();
    } else {
      alert('保存配置失败');
    }
  }

  async refreshTodos() {
    if (!this.config) return;

    // 取消之前的请求
    this.abortController?.abort();
    this.abortController = new AbortController();

    this.todoList.innerHTML = '';

    try {
      this.todos = await fetchTodos(this.config);
      // 检查是否已被取消
      if (this.abortController.signal.aborted) return;
      this.renderTodos();
    } catch (e: any) {
      // 检查是否已被取消
      if (this.abortController?.signal.aborted) return;
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
        this.handleCompleteById(id);
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
    this.currentEditId = id;
    this.contextMenu.style.left = `${x}px`;
    this.contextMenu.style.top = `${y}px`;
    this.contextMenu.classList.remove('hidden');
  }

  private hideContextMenu() {
    this.contextMenu.classList.add('hidden');
    this.currentEditId = null;
  }

  private handleContextAction(action: string) {
    if (this.currentEditId === null) return;
    if (action === 'delete') {
      this.handleDelete();
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
        await updateTodo(this.config, todo.id, newTitle);
        this.inlineEditingId = null;
        await this.refreshTodos();
      } catch (e: any) {
        restoreTitle(originalText);
        alert(`修改失败: ${e.message}`);
      }
    };

    input.addEventListener('blur', () => {
      // 使用 setTimeout 避免与 Enter 键的竞态
      setTimeout(() => save(), 0);
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
    // 只提取日期部分，避免时区转换问题
    const dateValue = todo.dueDate ? todo.dueDate.split('T')[0] : '';
    (document.getElementById('edit-date-input') as HTMLInputElement).value = dateValue;
    (document.getElementById('edit-time-input') as HTMLInputElement).value = todo.dueTime || '';

    const priorityRadio = document.querySelector(`input[name="priority"][value="${todo.priority}"]`) as HTMLInputElement;
    if (priorityRadio) priorityRadio.checked = true;

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
    const priority = parseInt(priorityRadio.value);

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
        await updateTodo(this.config, this.currentEditId, title);
      } else {
        await createTodo(this.config, title, dueDate, dueTime, priority);
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
