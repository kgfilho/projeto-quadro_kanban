import React from 'react';
import ReactDOM from 'react-dom/client';
import { closestCorners, DndContext, DragOverlay, PointerSensor, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Circle,
  CircleDotDashed,
  ClipboardList,
  Download,
  Edit3,
  FolderKanban,
  LogOut,
  Moon,
  Plus,
  Search,
  SquareKanban,
  TimerReset,
  Sun,
  Trash2,
  Upload,
  User,
  Users,
  X,
} from 'lucide-react';
import {
  acceptInvite,
  createProject,
  createWorkspaceInvite,
  createWorkspace,
  getInvite,
  getCurrentUser,
  getProjectBoard,
  inviteWorkspaceMember,
  listProjectActivity,
  listWorkspaceInvites,
  listProjects,
  listWorkspaceMembers,
  listWorkspaces,
  loginUser,
  logoutUser,
  registerUser,
  removeWorkspaceMember,
  revokeWorkspaceInvite,
  saveProjectBoard,
  subscribeToProjectEvents,
  updateWorkspaceMember,
} from './api.js';
import './styles.css';

const defaultAreas = [
  { id: 'todo', title: 'A Fazer', helper: 'Ideias e proximas tarefas', icon: 'circle', locked: true },
  { id: 'in-progress', title: 'Em Andamento', helper: 'Foco atual do dia', icon: 'progress', locked: true },
  { id: 'done', title: 'Concluido', helper: 'Entregas finalizadas', icon: 'done', locked: true },
];

const priorities = [
  { id: 'prioridade-baixa', label: 'Baixa', rank: 3 },
  { id: 'prioridade-media', label: 'Media', rank: 2 },
  { id: 'prioridade-alta', label: 'Alta', rank: 1 },
];

const memberRoles = [
  { id: 'admin', label: 'Admin' },
  { id: 'editor', label: 'Editor' },
  { id: 'viewer', label: 'Viewer' },
];

const emptyBoard = {
  todo: [],
  'in-progress': [],
  done: [],
};

const areaIcons = {
  circle: Circle,
  progress: CircleDotDashed,
  done: CheckCircle2,
  custom: SquareKanban,
};

function normalizeAreas(areas) {
  if (!Array.isArray(areas) || areas.length === 0) return defaultAreas;
  const normalized = areas
    .filter((area) => area?.id)
    .map((area) => {
      const defaultArea = defaultAreas.find((item) => item.id === area.id);
      return {
        ...(defaultArea || {}),
        id: area.id,
        title: area.title || defaultArea?.title || 'Nova area',
        helper: area.helper || defaultArea?.helper || 'Area personalizada',
        icon: area.icon || defaultArea?.icon || 'custom',
        locked: defaultArea?.locked || false,
      };
    });

  return normalized.map((area) => ({
      id: area.id,
      title: area.title,
      helper: area.helper,
      icon: area.icon,
      locked: area.locked,
    }));
}

function normalizeBoard(board, areas) {
  return areas.reduce((acc, area) => {
    acc[area.id] = Array.isArray(board?.[area.id]) ? board[area.id].map((task) => normalizeTask(task, area.id)) : [];
    return acc;
  }, {});
}

function normalizeTask(task, columnId = 'todo') {
  return {
    ...task,
    columnId: task.columnId || columnId,
    tags: Array.isArray(task.tags) ? task.tags : [],
    checklist: Array.isArray(task.checklist) ? task.checklist : [],
  };
}

function createTaskId() {
  return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createAreaId(title) {
  const slug = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);
  return `area-${slug || Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
}

function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const priorityA = priorities.find((priority) => priority.id === a.priority)?.rank ?? 3;
    const priorityB = priorities.find((priority) => priority.id === b.priority)?.rank ?? 3;
    if (priorityA !== priorityB) return priorityA - priorityB;
    return (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31');
  });
}

function isDueSoon(dateValue) {
  return getDueStatus(dateValue)?.type === 'soon';
}

function getDueStatus(dateValue) {
  if (!dateValue) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(`${dateValue}T00:00:00`);
  const diffDays = Math.ceil((dueDate - today) / 86400000);
  if (diffDays < 0) return { type: 'overdue', label: 'Atrasada' };
  if (diffDays === 0) return { type: 'today', label: 'Hoje' };
  if (diffDays <= 2) return { type: 'soon', label: 'Em breve' };
  return { type: 'scheduled', label: dateValue };
}

function parseTags(value) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function checklistProgress(checklist = []) {
  if (!checklist.length) return null;
  const done = checklist.filter((item) => item.done).length;
  return { done, total: checklist.length, percent: Math.round((done / checklist.length) * 100) };
}

function App() {
  const [areas, setAreas] = React.useState(defaultAreas);
  const [board, setBoard] = React.useState(() => normalizeBoard(emptyBoard, defaultAreas));
  const [theme, setTheme] = React.useState(() => localStorage.getItem('theme') || 'light');
  const [query, setQuery] = React.useState('');
  const [priorityFilter, setPriorityFilter] = React.useState('all');
  const [activeView, setActiveView] = React.useState('board');
  const [modalTask, setModalTask] = React.useState(null);
  const [areaModal, setAreaModal] = React.useState(null);
  const [nameModal, setNameModal] = React.useState(null);
  const [confirmDialog, setConfirmDialog] = React.useState(null);
  const [toasts, setToasts] = React.useState([]);
  const [apiStatus, setApiStatus] = React.useState('checking');
  const [realtimeStatus, setRealtimeStatus] = React.useState('idle');
  const [authStatus, setAuthStatus] = React.useState('checking');
  const [user, setUser] = React.useState(null);
  const [workspaces, setWorkspaces] = React.useState([]);
  const [projects, setProjects] = React.useState([]);
  const [members, setMembers] = React.useState([]);
  const [invites, setInvites] = React.useState([]);
  const [pendingInvite, setPendingInvite] = React.useState(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = React.useState('');
  const [selectedProjectId, setSelectedProjectId] = React.useState('');
  const [activities, setActivities] = React.useState([]);
  const [teamModalOpen, setTeamModalOpen] = React.useState(false);
  const [activeTask, setActiveTask] = React.useState(null);
  const fileInputRef = React.useRef(null);
  const hydratedRef = React.useRef(false);
  const applyingRemoteRef = React.useRef(false);
  const inviteTokenRef = React.useRef(new URLSearchParams(window.location.search).get('invite'));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const showToast = React.useCallback((message, tone = 'success') => {
    const id = `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((currentToasts) => [...currentToasts, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id));
    }, 3200);
  }, []);

  const loadProjectActivity = React.useCallback(async (projectId) => {
    if (!projectId) {
      setActivities([]);
      return [];
    }
    const activityItems = await listProjectActivity(projectId);
    setActivities(activityItems);
    return activityItems;
  }, []);

  const loadProjectBoard = React.useCallback(async (projectId) => {
    hydratedRef.current = false;
    const remoteState = await getProjectBoard(projectId);
    const remoteAreas = normalizeAreas(remoteState.areas);
    setAreas(remoteAreas);
    setBoard(normalizeBoard(remoteState.board, remoteAreas));
    setSelectedProjectId(projectId);
    setApiStatus('online');
    hydratedRef.current = true;
    await loadProjectActivity(projectId);
  }, [loadProjectActivity]);

  const applyRemoteBoard = React.useCallback(async (projectId, updatedBy) => {
    applyingRemoteRef.current = true;
    hydratedRef.current = false;
    const remoteState = await getProjectBoard(projectId);
    const remoteAreas = normalizeAreas(remoteState.areas);
    setAreas(remoteAreas);
    setBoard(normalizeBoard(remoteState.board, remoteAreas));
    setApiStatus('online');
    window.setTimeout(() => {
      applyingRemoteRef.current = false;
      hydratedRef.current = true;
    }, 0);
    if (updatedBy?.name) {
      showToast(`Quadro atualizado por ${updatedBy.name}.`);
    }
    await loadProjectActivity(projectId);
  }, [loadProjectActivity, showToast]);

  const loadMembers = React.useCallback(async (workspaceId) => {
    if (!workspaceId) {
      setMembers([]);
      return [];
    }
    const memberItems = await listWorkspaceMembers(workspaceId);
    setMembers(memberItems);
    return memberItems;
  }, []);

  const loadInvites = React.useCallback(async (workspaceId) => {
    if (!workspaceId) {
      setInvites([]);
      return [];
    }
    try {
      const inviteItems = await listWorkspaceInvites(workspaceId);
      setInvites(inviteItems);
      return inviteItems;
    } catch {
      setInvites([]);
      return [];
    }
  }, []);

  const acceptPendingInvite = React.useCallback(async () => {
    const token = inviteTokenRef.current;
    if (!token) return null;
    const result = await acceptInvite(token);
    inviteTokenRef.current = null;
    setPendingInvite(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('invite');
    window.history.replaceState({}, '', url);
    return result.workspace;
  }, []);

  const loadWorkspaceData = React.useCallback(async ({ preferredWorkspaceId, preferredProjectId } = {}) => {
    const workspaceItems = await listWorkspaces();
    setWorkspaces(workspaceItems);

    const workspaceId = preferredWorkspaceId || workspaceItems[0]?.id || '';
    setSelectedWorkspaceId(workspaceId);

    if (!workspaceId) {
      setProjects([]);
      setMembers([]);
      setInvites([]);
      setActivities([]);
      setSelectedProjectId('');
      setAreas(defaultAreas);
      setBoard(normalizeBoard(emptyBoard, defaultAreas));
      hydratedRef.current = true;
      return;
    }

    await loadMembers(workspaceId);
    await loadInvites(workspaceId);

    const projectItems = await listProjects(workspaceId);
    setProjects(projectItems);
    const projectId = preferredProjectId || projectItems[0]?.id || '';

    if (!projectId) {
      setSelectedProjectId('');
      setActivities([]);
      setAreas(defaultAreas);
      setBoard(normalizeBoard(emptyBoard, defaultAreas));
      hydratedRef.current = true;
      return;
    }

    await loadProjectBoard(projectId);
  }, [loadInvites, loadMembers, loadProjectBoard]);

  React.useEffect(() => {
    const token = inviteTokenRef.current;
    if (!token) return undefined;

    let cancelled = false;
    getInvite(token)
      .then((invite) => {
        if (!cancelled) setPendingInvite(invite);
      })
      .catch(() => {
        if (!cancelled) {
          inviteTokenRef.current = null;
          setPendingInvite({ error: 'Convite invalido ou expirado.' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function bootstrapSession() {
      try {
        const session = await getCurrentUser();
        if (cancelled) return;
        setUser(session.user);
        setAuthStatus('authenticated');
        setApiStatus('online');
        const acceptedWorkspace = await acceptPendingInvite();
        await loadWorkspaceData({ preferredWorkspaceId: acceptedWorkspace?.id });
      } catch (error) {
        if (cancelled) return;
        if (error.status === 401) {
          setAuthStatus('unauthenticated');
          setApiStatus('online');
        } else {
          setAuthStatus('unavailable');
          setApiStatus('offline');
        }
      }
    }

    bootstrapSession();

    return () => {
      cancelled = true;
    };
  }, [acceptPendingInvite, loadWorkspaceData]);

  React.useEffect(() => {
    setBoard((currentBoard) => normalizeBoard(currentBoard, areas));
  }, [areas]);

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId);
  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const canEditBoard = ['owner', 'admin', 'editor'].includes(selectedProject?.role);
  const canManageTeam = ['owner', 'admin'].includes(selectedWorkspace?.role);

  React.useEffect(() => {
    if (authStatus !== 'authenticated' || !selectedProjectId) {
      setRealtimeStatus('idle');
      return undefined;
    }

    const eventSource = subscribeToProjectEvents(selectedProjectId);
    setRealtimeStatus('connecting');

    eventSource.addEventListener('connected', () => {
      setRealtimeStatus('online');
    });

    eventSource.addEventListener('board-updated', (event) => {
      const payload = JSON.parse(event.data);
      applyRemoteBoard(payload.projectId, payload.updatedBy).catch(() => {
        setRealtimeStatus('offline');
        showToast('Nao foi possivel aplicar atualizacao em tempo real.', 'warning');
      });
    });

    eventSource.addEventListener('activity-created', (event) => {
      const payload = JSON.parse(event.data);
      if (!payload.activity) return;
      setActivities((currentActivities) => [
        payload.activity,
        ...currentActivities.filter((activity) => activity.id !== payload.activity.id),
      ].slice(0, 50));
    });

    eventSource.onerror = () => {
      setRealtimeStatus('offline');
    };

    return () => {
      eventSource.close();
    };
  }, [authStatus, selectedProjectId, applyRemoteBoard, showToast]);

  React.useEffect(() => {
    if (
      applyingRemoteRef.current ||
      !hydratedRef.current ||
      apiStatus !== 'online' ||
      authStatus !== 'authenticated' ||
      !selectedProjectId ||
      !canEditBoard
    ) return undefined;

    const timeoutId = window.setTimeout(async () => {
      try {
        await saveProjectBoard(selectedProjectId, { areas, board });
      } catch (error) {
        if (error.status === 401) {
          setAuthStatus('unauthenticated');
          setUser(null);
        }
        setApiStatus('offline');
        showToast('Nao foi possivel sincronizar com a API.', 'warning');
      }
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, [areas, board, apiStatus, authStatus, selectedProjectId, canEditBoard, showToast]);

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  const allTasks = areas.flatMap((area) => (board[area.id] || []).map((task) => ({ ...task, columnId: area.id })));
  const calendarTasks = allTasks
    .filter((task) => task.dueDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const doneAreaIds = areas
    .filter((area) => area.id === 'done' || area.title.toLowerCase().includes('concluido'))
    .map((area) => area.id);
  const defaultColumnId = areas[0]?.id || 'todo';
  const stats = {
    total: allTasks.length,
    urgent: allTasks.filter((task) => task.priority === 'prioridade-alta').length,
    dueSoon: allTasks.filter((task) => isDueSoon(task.dueDate)).length,
    overdue: allTasks.filter((task) => getDueStatus(task.dueDate)?.type === 'overdue').length,
    done: doneAreaIds.reduce((total, areaId) => total + (board[areaId] || []).length, 0),
  };
  const donePercent = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;

  function saveTask(taskData) {
    if (!canEditBoard) return;
    const normalizedTask = normalizeTask(taskData);
    setBoard((currentBoard) => {
      const nextBoard = normalizeBoard(currentBoard, areas);
      if (normalizedTask.id) {
        const withoutTask = Object.fromEntries(
          areas.map((area) => [area.id, nextBoard[area.id].filter((task) => task.id !== normalizedTask.id)]),
        );
        withoutTask[normalizedTask.columnId] = sortTasks([...withoutTask[normalizedTask.columnId], normalizedTask]);
        return withoutTask;
      }

      const newTask = { ...normalizedTask, id: createTaskId() };
      return {
        ...nextBoard,
        [newTask.columnId]: sortTasks([...nextBoard[newTask.columnId], newTask]),
      };
    });
    setModalTask(null);
    showToast(normalizedTask.id ? 'Tarefa atualizada.' : 'Tarefa criada.');
  }

  function toggleChecklistItem(taskId, itemId) {
    if (!canEditBoard) return;
    setBoard((currentBoard) =>
      Object.fromEntries(
        areas.map((area) => [
          area.id,
          (currentBoard[area.id] || []).map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  checklist: (task.checklist || []).map((item) => (item.id === itemId ? { ...item, done: !item.done } : item)),
                }
              : task,
          ),
        ]),
      ),
    );
  }

  function deleteTask(taskId) {
    if (!canEditBoard) return;
    const task = allTasks.find((item) => item.id === taskId);
    setConfirmDialog({
      title: 'Excluir tarefa',
      message: `Excluir "${task?.title || 'esta tarefa'}"? Esta acao nao pode ser desfeita.`,
      confirmLabel: 'Excluir',
      tone: 'danger',
      onConfirm: () => {
        setBoard((currentBoard) =>
          Object.fromEntries(areas.map((area) => [area.id, (currentBoard[area.id] || []).filter((item) => item.id !== taskId)])),
        );
        showToast('Tarefa excluida.', 'danger');
      },
    });
  }

  function saveArea(areaData) {
    if (!canEditBoard) return;
    const title = areaData.title.trim();
    if (!title) return;
    if (areaData.id) {
      setAreas((currentAreas) =>
        currentAreas.map((area) =>
          area.id === areaData.id
            ? { ...area, title, helper: areaData.helper.trim() || 'Area personalizada' }
            : area,
        ),
      );
      setAreaModal(null);
      showToast('Area atualizada.');
      return;
    }

    const newArea = {
      id: createAreaId(title),
      title,
      helper: areaData.helper.trim() || 'Area personalizada',
      icon: 'custom',
      locked: false,
    };
    setAreas((currentAreas) => [...currentAreas, newArea]);
    setAreaModal(null);
    showToast('Area criada.');
  }

  function deleteArea(areaId) {
    if (!canEditBoard) return;
    const area = areas.find((item) => item.id === areaId);
    if (!area || area.locked) return;
    if ((board[areaId] || []).length > 0) {
      showToast('Mova ou exclua as tarefas desta area antes de remover.', 'warning');
      return;
    }
    setConfirmDialog({
      title: 'Remover area',
      message: `Remover a area "${area.title}"?`,
      confirmLabel: 'Remover',
      tone: 'danger',
      onConfirm: () => {
        setAreas((currentAreas) => currentAreas.filter((item) => item.id !== areaId));
        setBoard((currentBoard) => {
          const { [areaId]: _removed, ...nextBoard } = currentBoard;
          return nextBoard;
        });
        showToast('Area removida.', 'danger');
      },
    });
  }

  function moveArea(areaId, direction) {
    if (!canEditBoard) return;
    const currentIndex = areas.findIndex((area) => area.id === areaId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= areas.length) return;
    setAreas((currentAreas) => arrayMove(currentAreas, currentIndex, targetIndex));
  }

  function handleDragStart(event) {
    if (!canEditBoard) return;
    const task = allTasks.find((item) => item.id === event.active.id);
    setActiveTask(task || null);
  }

  function handleDragEnd(event) {
    if (!canEditBoard) return;
    const { active, over } = event;
    setActiveTask(null);
    if (!over) return;

    setBoard((currentBoard) => {
      const sourceColumn = findTaskColumn(currentBoard, areas, active.id);
      const targetColumn = areas.some((area) => area.id === over.id) ? over.id : findTaskColumn(currentBoard, areas, over.id);

      if (!sourceColumn || !targetColumn) return currentBoard;
      if (sourceColumn === targetColumn) {
        const sourceTasks = currentBoard[sourceColumn] || [];
        const activeIndex = sourceTasks.findIndex((task) => task.id === active.id);
        const overIndex = sourceTasks.findIndex((task) => task.id === over.id);
        if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) return currentBoard;
        return {
          ...currentBoard,
          [sourceColumn]: arrayMove(sourceTasks, activeIndex, overIndex),
        };
      }

      const sourceTasks = currentBoard[sourceColumn] || [];
      const targetTasks = currentBoard[targetColumn] || [];
      const movingTask = sourceTasks.find((task) => task.id === active.id);
      if (!movingTask) return currentBoard;
      const targetIndex = targetTasks.findIndex((task) => task.id === over.id);
      const insertIndex = targetIndex >= 0 ? targetIndex : targetTasks.length;
      const nextTargetTasks = [...targetTasks];
      nextTargetTasks.splice(insertIndex, 0, { ...movingTask, columnId: targetColumn });

      return {
        ...currentBoard,
        [sourceColumn]: (currentBoard[sourceColumn] || []).filter((task) => task.id !== active.id),
        [targetColumn]: nextTargetTasks,
      };
    });
  }

  function exportBoard() {
    const exportData = {
      app: 'Chronos',
      version: 1,
      areas,
      board,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'chronos-board.json';
    link.click();
    URL.revokeObjectURL(url);
    showToast('Quadro exportado.');
  }

  function importBoard(event) {
    if (!canEditBoard) return;
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const importedData = JSON.parse(reader.result);
        const importedAreas = importedData.areas ? normalizeAreas(importedData.areas) : areas;
        const importedBoard = normalizeBoard(importedData.board || importedData, importedAreas);
        setAreas(importedAreas);
        setBoard(
          Object.fromEntries(
            importedAreas.map((area) => [
              area.id,
              sortTasks(
                importedBoard[area.id]
                  .filter((task) => task.title && priorities.some((priority) => priority.id === task.priority))
                  .map(normalizeTask),
              ),
            ]),
          ),
        );
        showToast('Quadro importado.');
      } catch {
        showToast('Arquivo JSON invalido.', 'danger');
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  }

  async function handleAuthSubmit(mode, payload) {
    const action = mode === 'register' ? registerUser : loginUser;
    const session = await action(payload);
    setUser(session.user);
    setAuthStatus('authenticated');
    setApiStatus('online');
    const acceptedWorkspace = await acceptPendingInvite();
    await loadWorkspaceData({ preferredWorkspaceId: acceptedWorkspace?.id });
    showToast(acceptedWorkspace ? 'Convite aceito.' : mode === 'register' ? 'Conta criada.' : 'Sessao iniciada.');
  }

  async function handleLogout() {
    try {
      await logoutUser();
    } finally {
        setUser(null);
        setAuthStatus('unauthenticated');
      setWorkspaces([]);
      setProjects([]);
      setMembers([]);
      setInvites([]);
      setActivities([]);
      setSelectedWorkspaceId('');
      setSelectedProjectId('');
      setAreas(defaultAreas);
      setBoard(normalizeBoard(emptyBoard, defaultAreas));
      hydratedRef.current = false;
    }
  }

  async function handleWorkspaceChange(workspaceId) {
    setSelectedWorkspaceId(workspaceId);
    setSelectedProjectId('');
    setActivities([]);
    await loadMembers(workspaceId);
    await loadInvites(workspaceId);
    const projectItems = await listProjects(workspaceId);
    setProjects(projectItems);
    const projectId = projectItems[0]?.id || '';
    if (projectId) {
      await loadProjectBoard(projectId);
    } else {
      setAreas(defaultAreas);
      setBoard(normalizeBoard(emptyBoard, defaultAreas));
    }
  }

  async function handleProjectChange(projectId) {
    if (!projectId) return;
    await loadProjectBoard(projectId);
  }

  async function saveNameModal(name) {
    const cleanName = name.trim();
    if (!cleanName) return;

    if (nameModal?.type === 'workspace') {
      const workspace = await createWorkspace({ name: cleanName });
      await loadWorkspaceData({ preferredWorkspaceId: workspace.id });
      setNameModal(null);
      showToast('Workspace criado.');
      return;
    }

    if (nameModal?.type === 'project' && selectedWorkspaceId) {
      const project = await createProject(selectedWorkspaceId, { name: cleanName });
      await loadWorkspaceData({ preferredWorkspaceId: selectedWorkspaceId, preferredProjectId: project.id });
      setNameModal(null);
      showToast('Projeto criado.');
    }
  }

  async function inviteMember(payload) {
    await inviteWorkspaceMember(selectedWorkspaceId, payload);
    await loadMembers(selectedWorkspaceId);
    await loadWorkspaceData({ preferredWorkspaceId: selectedWorkspaceId, preferredProjectId: selectedProjectId });
    showToast('Membro adicionado ao workspace.');
  }

  async function updateMemberRole(userId, role) {
    await updateWorkspaceMember(selectedWorkspaceId, userId, { role });
    await loadMembers(selectedWorkspaceId);
    await loadWorkspaceData({ preferredWorkspaceId: selectedWorkspaceId, preferredProjectId: selectedProjectId });
    showToast('Permissao atualizada.');
  }

  async function createInviteLink(payload) {
    const result = await createWorkspaceInvite(selectedWorkspaceId, payload);
    await loadInvites(selectedWorkspaceId);
    showToast(result.email?.sent ? 'Convite enviado por e-mail.' : 'Link de convite criado.');
  }

  async function revokeInviteLink(inviteId) {
    await revokeWorkspaceInvite(selectedWorkspaceId, inviteId);
    await loadInvites(selectedWorkspaceId);
    showToast('Convite revogado.', 'warning');
  }

  function confirmRemoveMember(member) {
    setConfirmDialog({
      title: 'Remover membro',
      message: `Remover ${member.user.name} deste workspace?`,
      confirmLabel: 'Remover',
      tone: 'danger',
      onConfirm: async () => {
        await removeWorkspaceMember(selectedWorkspaceId, member.user.id);
        await loadMembers(selectedWorkspaceId);
        showToast('Membro removido.', 'danger');
      },
    });
  }

  if (authStatus === 'checking') {
    return <LoadingScreen theme={theme} setTheme={setTheme} message="Verificando sessao segura" />;
  }

  if (authStatus === 'unavailable') {
    return <UnavailableScreen theme={theme} setTheme={setTheme} />;
  }

  if (authStatus === 'unauthenticated') {
    return <AuthScreen theme={theme} setTheme={setTheme} pendingInvite={pendingInvite} onSubmit={handleAuthSubmit} />;
  }

  return (
    <main className="app-shell">
      <header className="top-panel">
        <div className="brand-block">
          <span className="brand-mark">
            <ClipboardList size={24} />
          </span>
          <div>
            <p className="eyebrow">{selectedWorkspace?.name || 'Workspace'}</p>
            <h1>Chronos</h1>
          </div>
        </div>

        <div className="toolbar">
          <span className={`api-status ${apiStatus}`}>{apiStatus === 'online' ? 'API online' : apiStatus === 'offline' ? 'API offline' : 'Conectando API'}</span>
          <span className={`api-status realtime ${realtimeStatus}`}>
            {realtimeStatus === 'online' ? 'Tempo real' : realtimeStatus === 'offline' ? 'Sem tempo real' : realtimeStatus === 'connecting' ? 'Conectando realtime' : 'Realtime ocioso'}
          </span>
          <label className="search-field">
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar tarefas" />
          </label>
          <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} aria-label="Filtrar por prioridade">
            <option value="all">Todas</option>
            {priorities.map((priority) => (
              <option key={priority.id} value={priority.id}>
                {priority.label}
              </option>
            ))}
          </select>
          <button type="button" className="icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Alternar tema">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button type="button" className="icon-button" onClick={() => fileInputRef.current.click()} aria-label="Importar quadro" disabled={!canEditBoard}>
            <Upload size={18} />
          </button>
          <button type="button" className="icon-button" onClick={exportBoard} aria-label="Exportar quadro">
            <Download size={18} />
          </button>
          <span className="user-chip">
            <User size={16} />
            {user?.name || user?.email}
          </span>
          <button type="button" className="icon-button" onClick={handleLogout} aria-label="Sair">
            <LogOut size={18} />
          </button>
          <button type="button" className="primary-button" onClick={() => setModalTask({ columnId: defaultColumnId })} disabled={!selectedProjectId || !canEditBoard}>
            <Plus size={18} />
            Nova tarefa
          </button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={importBoard} hidden />
        </div>
      </header>

      <section className="project-strip" aria-label="Workspace e projeto atual">
        <label>
          <Users size={17} />
          <select value={selectedWorkspaceId} onChange={(event) => handleWorkspaceChange(event.target.value)} aria-label="Selecionar workspace">
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="secondary-button" onClick={() => setNameModal({ type: 'workspace' })}>
          <Plus size={17} />
          Workspace
        </button>
        <button type="button" className="secondary-button" onClick={() => setTeamModalOpen(true)} disabled={!selectedWorkspaceId}>
          <Users size={17} />
          Equipe
        </button>
        <label>
          <FolderKanban size={17} />
          <select value={selectedProjectId} onChange={(event) => handleProjectChange(event.target.value)} aria-label="Selecionar projeto" disabled={!projects.length}>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="secondary-button" onClick={() => setNameModal({ type: 'project' })} disabled={!selectedWorkspaceId}>
          <Plus size={17} />
          Projeto
        </button>
        <strong>{selectedProject ? `${selectedProject.name} - ${selectedProject.role}` : 'Crie um projeto para comecar'}</strong>
      </section>

      <section className="stats-row" aria-label="Resumo do quadro">
        <StatCard label="Tarefas" value={stats.total} icon={ClipboardList} tone="blue" />
        <StatCard label="Alta prioridade" value={stats.urgent} icon={TimerReset} tone="red" />
        <StatCard label="Atrasadas" value={stats.overdue} icon={TimerReset} tone="red" />
        <StatCard label="Vencem em breve" value={stats.dueSoon} icon={Calendar} tone="amber" />
        <StatCard label="Concluidas" value={`${donePercent}%`} detail={`${stats.done} de ${stats.total || 0}`} icon={CheckCircle2} tone="green" />
      </section>

      <section className="board-actions" aria-label="Acoes das areas">
        <div className="view-switcher" role="tablist" aria-label="Visualizacao">
          <button type="button" className={activeView === 'board' ? 'active' : ''} onClick={() => setActiveView('board')}>
            Quadro
          </button>
          <button type="button" className={activeView === 'calendar' ? 'active' : ''} onClick={() => setActiveView('calendar')}>
            Calendario
          </button>
          <button type="button" className={activeView === 'activity' ? 'active' : ''} onClick={() => setActiveView('activity')}>
            Atividade
          </button>
        </div>
        <button type="button" className="secondary-button" onClick={() => setAreaModal({ mode: 'create' })} disabled={!selectedProjectId || !canEditBoard}>
          <SquareKanban size={18} />
          Nova area
        </button>
      </section>

      {activeView === 'board' ? (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <section className="kanban-board">
            {areas.map((area, index) => (
              <KanbanColumn
                key={area.id}
                area={area}
                areaIndex={index}
                areaCount={areas.length}
                tasks={board[area.id] || []}
                query={query}
                priorityFilter={priorityFilter}
                canEdit={canEditBoard}
                onAddTask={() => setModalTask({ columnId: area.id })}
                onEditTask={(task) => setModalTask({ ...task, columnId: area.id })}
                onDeleteTask={deleteTask}
                onToggleChecklistItem={toggleChecklistItem}
                onMoveArea={moveArea}
                onEditArea={() => setAreaModal({ mode: 'edit', area })}
                onDeleteArea={() => deleteArea(area.id)}
              />
            ))}
          </section>
          <DragOverlay>{activeTask ? <TaskCardView task={activeTask} isOverlay /> : null}</DragOverlay>
        </DndContext>
      ) : activeView === 'calendar' ? (
        <CalendarView tasks={calendarTasks} areas={areas} onEditTask={(task) => (canEditBoard ? setModalTask(task) : null)} />
      ) : (
        <ActivityView activities={activities} />
      )}

      {modalTask ? <TaskModal task={modalTask} areas={areas} onClose={() => setModalTask(null)} onSave={saveTask} /> : null}
      {areaModal ? <AreaModal area={areaModal.area} onClose={() => setAreaModal(null)} onSave={saveArea} /> : null}
      {nameModal ? (
        <NameModal
          title={nameModal.type === 'workspace' ? 'Novo workspace' : 'Novo projeto'}
          label={nameModal.type === 'workspace' ? 'Nome do workspace' : 'Nome do projeto'}
          placeholder={nameModal.type === 'workspace' ? 'Ex: Equipe Produto' : 'Ex: Site institucional'}
          onClose={() => setNameModal(null)}
          onSave={saveNameModal}
        />
      ) : null}
      {teamModalOpen ? (
        <TeamModal
          currentUserId={user?.id}
          canManage={canManageTeam}
          invites={invites}
          members={members}
          workspaceName={selectedWorkspace?.name || 'Workspace'}
          onClose={() => setTeamModalOpen(false)}
          onInvite={inviteMember}
          onCreateInviteLink={createInviteLink}
          onRevokeInviteLink={revokeInviteLink}
          onUpdateRole={updateMemberRole}
          onRemoveMember={confirmRemoveMember}
        />
      ) : null}
      {confirmDialog ? <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} /> : null}
      <ToastList toasts={toasts} onDismiss={(id) => setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id))} />
    </main>
  );
}

function LoadingScreen({ theme, setTheme, message }) {
  return (
    <main className="auth-shell">
      <button type="button" className="icon-button auth-theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Alternar tema">
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <section className="auth-card compact">
        <span className="brand-mark">
          <ClipboardList size={24} />
        </span>
        <div>
          <p className="eyebrow">Chronos</p>
          <h1>{message}</h1>
        </div>
      </section>
    </main>
  );
}

function UnavailableScreen({ theme, setTheme }) {
  return (
    <main className="auth-shell">
      <button type="button" className="icon-button auth-theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Alternar tema">
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <section className="auth-card compact">
        <span className="brand-mark">
          <ClipboardList size={24} />
        </span>
        <div>
          <p className="eyebrow">API offline</p>
          <h1>Nao foi possivel conectar</h1>
          <p>Inicie a Chronos API em `http://127.0.0.1:3333` para acessar os projetos.</p>
        </div>
      </section>
    </main>
  );
}

function AuthScreen({ theme, setTheme, pendingInvite, onSubmit }) {
  const [mode, setMode] = React.useState('login');
  const [form, setForm] = React.useState({ name: '', email: '', password: '' });
  const [error, setError] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  function updateField(field, value) {
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await onSubmit(mode, {
        ...(mode === 'register' ? { name: form.name.trim() } : {}),
        email: form.email.trim(),
        password: form.password,
      });
    } catch (submitError) {
      setError(submitError.message || 'Nao foi possivel entrar.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <button type="button" className="icon-button auth-theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Alternar tema">
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <section className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">
            <ClipboardList size={24} />
          </span>
          <div>
            <p className="eyebrow">Chronos</p>
            <h1>{mode === 'register' ? 'Criar conta' : 'Entrar'}</h1>
          </div>
        </div>

        {pendingInvite ? (
          <div className={`invite-banner ${pendingInvite.error ? 'danger' : ''}`}>
            <Users size={18} />
            <div>
              <strong>{pendingInvite.error || `Convite para ${pendingInvite.workspace?.name}`}</strong>
              {!pendingInvite.error ? <span>Entre ou crie sua conta para acessar como {pendingInvite.role}.</span> : null}
            </div>
          </div>
        ) : null}

        <div className="view-switcher auth-switcher" role="tablist" aria-label="Acesso">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            Login
          </button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
            Cadastro
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {mode === 'register' ? (
            <label>
              Nome
              <input value={form.name} onChange={(event) => updateField('name', event.target.value)} autoComplete="name" required />
            </label>
          ) : null}
          <label>
            E-mail
            <input type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} autoComplete="email" required />
          </label>
          <label>
            Senha
            <input type="password" value={form.password} onChange={(event) => updateField('password', event.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={10} required />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button type="submit" className="primary-button" disabled={isSubmitting}>
            {isSubmitting ? 'Enviando...' : mode === 'register' ? 'Criar conta' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  );
}

function findTaskColumn(board, areas, taskId) {
  return areas.find((area) => (board[area.id] || []).some((task) => task.id === taskId))?.id;
}

function StatCard({ label, value, detail, icon: Icon, tone }) {
  return (
    <article className={`stat-card ${tone}`}>
      <span className="stat-icon">
        <Icon size={18} />
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {detail ? <small>{detail}</small> : null}
      </div>
    </article>
  );
}

function KanbanColumn({
  area,
  areaIndex,
  areaCount,
  tasks,
  query,
  priorityFilter,
  canEdit,
  onAddTask,
  onEditTask,
  onDeleteTask,
  onToggleChecklistItem,
  onMoveArea,
  onEditArea,
  onDeleteArea,
}) {
  const AreaIcon = areaIcons[area.icon] || SquareKanban;
  const { isOver, setNodeRef } = useDroppable({ id: area.id });
  const normalizedQuery = query.toLowerCase();
  const visibleTasks = tasks.filter((task) => {
    const matchesText = `${task.title} ${task.description} ${(task.tags || []).join(' ')}`.toLowerCase().includes(normalizedQuery);
    const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter;
    return matchesText && matchesPriority;
  });

  return (
    <article ref={setNodeRef} className={`column ${area.id} ${area.locked ? '' : 'custom-area'} ${isOver ? 'is-over' : ''}`}>
      <header className="column-header">
        <div className="column-title">
          <span className="column-icon">
            <AreaIcon size={18} />
          </span>
          <div>
            <h2>{area.title}</h2>
            <span>{area.helper}</span>
          </div>
        </div>
        <strong className="column-count">{visibleTasks.length}</strong>
        <button type="button" className="icon-button small" onClick={() => onMoveArea(area.id, -1)} disabled={!canEdit || areaIndex === 0} aria-label={`Mover ${area.title} para esquerda`}>
          <ArrowLeft size={15} />
        </button>
        <button type="button" className="icon-button small" onClick={() => onMoveArea(area.id, 1)} disabled={!canEdit || areaIndex === areaCount - 1} aria-label={`Mover ${area.title} para direita`}>
          <ArrowRight size={15} />
        </button>
        <button type="button" className="icon-button small" onClick={onAddTask} disabled={!canEdit} aria-label={`Adicionar em ${area.title}`}>
          <Plus size={16} />
        </button>
        {!area.locked && canEdit ? (
          <>
            <button type="button" className="icon-button small" onClick={onEditArea} aria-label={`Editar area ${area.title}`}>
              <Edit3 size={15} />
            </button>
            <button type="button" className="icon-button small danger-action" onClick={onDeleteArea} aria-label={`Remover area ${area.title}`}>
              <Trash2 size={15} />
            </button>
          </>
        ) : null}
      </header>

      <SortableContext items={visibleTasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <div className="task-list">
          {visibleTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              canEdit={canEdit}
              onEdit={() => onEditTask(task)}
              onDelete={() => onDeleteTask(task.id)}
              onToggleChecklistItem={onToggleChecklistItem}
            />
          ))}
          {visibleTasks.length === 0 ? (
            <button type="button" className="empty-state" onClick={onAddTask} disabled={!canEdit}>
              <Plus size={18} />
              Nada por aqui
            </button>
          ) : null}
        </div>
      </SortableContext>
    </article>
  );
}

function TaskCard({ task, canEdit, onEdit, onDelete, onToggleChecklistItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <TaskCardView
      task={task}
      canEdit={canEdit}
      onEdit={onEdit}
      onDelete={onDelete}
      onToggleChecklistItem={onToggleChecklistItem}
      dragHandleProps={{ ...listeners, ...attributes }}
      innerRef={setNodeRef}
      style={style}
      isDragging={isDragging}
    />
  );
}

function TaskCardView({ task, canEdit = true, onEdit, onDelete, onToggleChecklistItem, dragHandleProps = {}, innerRef, style, isDragging = false, isOverlay = false }) {
  const priority = priorities.find((item) => item.id === task.priority);
  const dueStatus = getDueStatus(task.dueDate);
  const progress = checklistProgress(task.checklist);

  return (
    <article
      ref={innerRef}
      style={style}
      className={`task ${task.priority} due-${dueStatus?.type || 'none'} ${isDragging ? 'dragging' : ''} ${isOverlay ? 'drag-overlay' : ''}`}
    >
      <button type="button" className="drag-handle" {...dragHandleProps} disabled={!canEdit} aria-label={`Mover ${task.title}`}>
        <span />
      </button>
      <h3>{task.title}</h3>
      {task.description ? <p>{task.description}</p> : null}
      {(task.tags || []).length ? (
        <div className="tag-list">
          {task.tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      ) : null}
      {progress ? (
        <div className="checklist-preview">
          <div className="checklist-summary">
            <span>Checklist</span>
            <strong>{progress.done}/{progress.total}</strong>
          </div>
          <div className="checklist-bar">
            <span style={{ width: `${progress.percent}%` }} />
          </div>
          {!isOverlay ? (
            <div className="checklist-items">
              {task.checklist.slice(0, 4).map((item) => (
                <label key={item.id}>
                  <input type="checkbox" checked={item.done} onChange={() => onToggleChecklistItem?.(task.id, item.id)} disabled={!canEdit} />
                  <span>{item.text}</span>
                </label>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="task-meta">
        <span className="priority-badge">{priority?.label || 'Baixa'}</span>
        {dueStatus ? (
          <span className={`due-date ${dueStatus.type}`}>
            <Calendar size={14} />
            {dueStatus.label}
          </span>
        ) : null}
      </div>
      {!isOverlay && canEdit ? <div className="task-actions">
        <button type="button" onClick={onEdit} aria-label={`Editar ${task.title}`}>
          <Edit3 size={16} />
        </button>
        <button type="button" onClick={onDelete} aria-label={`Excluir ${task.title}`}>
          <Trash2 size={16} />
        </button>
      </div> : null}
    </article>
  );
}

function TaskModal({ task, areas, onClose, onSave }) {
  const [form, setForm] = React.useState({
    id: task.id,
    title: task.title || '',
    description: task.description || '',
    priority: task.priority || 'prioridade-baixa',
    dueDate: task.dueDate || '',
    tagsText: (task.tags || []).join(', '),
    checklistText: (task.checklist || []).map((item) => `${item.done ? '[x]' : '[ ]'} ${item.text}`).join('\n'),
    columnId: task.columnId || areas[0]?.id || 'todo',
  });

  function updateField(field, value) {
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    if (!form.title.trim()) return;
    const { tagsText, checklistText, ...taskFields } = form;
    const previousChecklist = task.checklist || [];
    const checklist = checklistText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const done = /^\[[xX]\]\s*/.test(line);
        const cleanText = line.replace(/^\[[ xX]\]\s*/, '').trim();
        const previous = previousChecklist.find((item) => item.text === cleanText);
        return {
          id: previous?.id || `check-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          text: cleanText,
          done: previous?.done ?? done,
        };
      });
    onSave({
      ...taskFields,
      title: form.title.trim(),
      description: form.description.trim(),
      tags: parseTags(tagsText),
      checklist,
    });
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="task-modal" onSubmit={submit}>
        <header>
          <h2>{form.id ? 'Editar tarefa' : 'Nova tarefa'}</h2>
          <button type="button" className="icon-button small" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>

        <label>
          Titulo
          <input value={form.title} onChange={(event) => updateField('title', event.target.value)} autoFocus />
        </label>
        <label>
          Descricao
          <textarea value={form.description} onChange={(event) => updateField('description', event.target.value)} rows={4} />
        </label>
        <div className="form-grid">
          <label>
            Prioridade
            <select value={form.priority} onChange={(event) => updateField('priority', event.target.value)}>
              {priorities.map((priority) => (
                <option key={priority.id} value={priority.id}>
                  {priority.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Vencimento
            <input type="date" value={form.dueDate} onChange={(event) => updateField('dueDate', event.target.value)} />
          </label>
        </div>
        <label>
          Tags
          <input value={form.tagsText} onChange={(event) => updateField('tagsText', event.target.value)} placeholder="Ex: cliente, urgente, design" />
        </label>
        <label>
          Checklist
          <textarea
            value={form.checklistText}
            onChange={(event) => updateField('checklistText', event.target.value)}
            rows={4}
            placeholder={"[ ] Primeiro item\n[x] Item concluido"}
          />
        </label>
        <label>
          Coluna
          <select value={form.columnId} onChange={(event) => updateField('columnId', event.target.value)}>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.title}
              </option>
            ))}
          </select>
        </label>

        <footer>
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="primary-button">
            <CheckCircle2 size={18} />
            Salvar
          </button>
        </footer>
      </form>
    </div>
  );
}

function AreaModal({ area, onClose, onSave }) {
  const [title, setTitle] = React.useState(area?.title || '');
  const [helper, setHelper] = React.useState(area?.helper || '');

  function submit(event) {
    event.preventDefault();
    onSave({ id: area?.id, title, helper });
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="task-modal area-modal" onSubmit={submit}>
        <header>
          <h2>{area ? 'Editar area' : 'Nova area'}</h2>
          <button type="button" className="icon-button small" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>
        <label>
          Nome da area
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex: Revisao, Backlog, Bloqueadas" autoFocus />
        </label>
        <label>
          Descricao curta
          <input value={helper} onChange={(event) => setHelper(event.target.value)} placeholder="Ex: Itens aguardando retorno" />
        </label>
        <footer>
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="primary-button">
            <CheckCircle2 size={18} />
            {area ? 'Salvar area' : 'Criar area'}
          </button>
        </footer>
      </form>
    </div>
  );
}

function NameModal({ title, label, placeholder, onClose, onSave }) {
  const [name, setName] = React.useState('');
  const [error, setError] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!name.trim()) return;
    setError('');
    setIsSubmitting(true);
    try {
      await onSave(name);
    } catch (submitError) {
      setError(submitError.message || 'Nao foi possivel salvar.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="task-modal area-modal" onSubmit={submit}>
        <header>
          <h2>{title}</h2>
          <button type="button" className="icon-button small" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>
        <label>
          {label}
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder={placeholder} autoFocus />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <footer>
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="primary-button" disabled={isSubmitting}>
            <CheckCircle2 size={18} />
            {isSubmitting ? 'Salvando...' : 'Salvar'}
          </button>
        </footer>
      </form>
    </div>
  );
}

function TeamModal({
  currentUserId,
  canManage,
  invites,
  members,
  workspaceName,
  onClose,
  onInvite,
  onCreateInviteLink,
  onRevokeInviteLink,
  onUpdateRole,
  onRemoveMember,
}) {
  const [form, setForm] = React.useState({ email: '', role: 'viewer' });
  const [linkForm, setLinkForm] = React.useState({ email: '', role: 'viewer', expiresInDays: 7 });
  const [error, setError] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await onInvite({ email: form.email.trim(), role: form.role });
      setForm({ email: '', role: 'viewer' });
    } catch (submitError) {
      setError(submitError.message || 'Nao foi possivel adicionar o membro.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function changeRole(member, role) {
    setError('');
    try {
      await onUpdateRole(member.user.id, role);
    } catch (submitError) {
      setError(submitError.message || 'Nao foi possivel alterar a permissao.');
    }
  }

  async function createLink(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await onCreateInviteLink({
        ...(linkForm.email.trim() ? { email: linkForm.email.trim() } : {}),
        role: linkForm.role,
        expiresInDays: Number(linkForm.expiresInDays),
      });
      setLinkForm((currentForm) => ({ ...currentForm, email: '' }));
    } catch (submitError) {
      setError(submitError.message || 'Nao foi possivel criar o link.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function inviteUrl(invite) {
    return `${window.location.origin}${window.location.pathname}?invite=${invite.token}`;
  }

  async function copyInvite(invite) {
    await navigator.clipboard?.writeText(inviteUrl(invite));
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="task-modal team-modal" role="dialog" aria-modal="true" aria-labelledby="team-title">
        <header>
          <div>
            <p className="eyebrow">Equipe</p>
            <h2 id="team-title">{workspaceName}</h2>
          </div>
          <button type="button" className="icon-button small" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>

        {canManage ? (
          <>
            <form className="invite-form" onSubmit={submit}>
              <label>
                E-mail
                <input type="email" value={form.email} onChange={(event) => setForm((currentForm) => ({ ...currentForm, email: event.target.value }))} placeholder="pessoa@empresa.com" required />
              </label>
              <label>
                Papel
                <select value={form.role} onChange={(event) => setForm((currentForm) => ({ ...currentForm, role: event.target.value }))}>
                  {memberRoles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="primary-button" disabled={isSubmitting}>
                <Plus size={18} />
                {isSubmitting ? 'Adicionando...' : 'Adicionar'}
              </button>
            </form>
            <form className="invite-form" onSubmit={createLink}>
              <label>
                E-mail opcional
                <input type="email" value={linkForm.email} onChange={(event) => setLinkForm((currentForm) => ({ ...currentForm, email: event.target.value }))} placeholder="envia por e-mail" />
              </label>
              <label>
                Papel
                <select value={linkForm.role} onChange={(event) => setLinkForm((currentForm) => ({ ...currentForm, role: event.target.value }))}>
                  {memberRoles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Expira em
                <select value={linkForm.expiresInDays} onChange={(event) => setLinkForm((currentForm) => ({ ...currentForm, expiresInDays: event.target.value }))}>
                  <option value={1}>1 dia</option>
                  <option value={7}>7 dias</option>
                  <option value={14}>14 dias</option>
                  <option value={30}>30 dias</option>
                </select>
              </label>
              <button type="submit" className="secondary-button" disabled={isSubmitting}>
                <Plus size={18} />
                {linkForm.email.trim() ? 'Enviar convite' : 'Criar link'}
              </button>
            </form>
          </>
        ) : null}

        {error ? <p className="form-error">{error}</p> : null}

        <div className="member-list">
          {canManage && invites.length ? (
            <div className="invite-link-list">
              {invites.map((invite) => {
                const inactive = invite.revokedAt || invite.acceptedAt || new Date(invite.expiresAt) <= new Date();
                return (
                  <article key={invite.id} className={`invite-link-row ${inactive ? 'inactive' : ''}`}>
                    <div>
                      <strong>{invite.role}</strong>
                      <small>Expira em {formatActivityDate(invite.expiresAt)}</small>
                    </div>
                    <button type="button" className="secondary-button" onClick={() => copyInvite(invite)} disabled={inactive}>
                      Copiar link
                    </button>
                    <button type="button" className="icon-button small danger-action" onClick={() => onRevokeInviteLink(invite.id)} disabled={inactive} aria-label="Revogar convite">
                      <Trash2 size={15} />
                    </button>
                  </article>
                );
              })}
            </div>
          ) : null}
          {members.map((member) => {
            const isSelf = member.user.id === currentUserId;
            const canEditMember = canManage && member.role !== 'owner' && !isSelf;
            return (
              <article key={member.user.id} className="member-row">
                <span className="member-avatar">{member.user.name.slice(0, 1).toUpperCase()}</span>
                <div>
                  <strong>{member.user.name}</strong>
                  <small>{member.user.email}</small>
                </div>
                {canEditMember ? (
                  <select value={member.role} onChange={(event) => changeRole(member, event.target.value)} aria-label={`Alterar papel de ${member.user.name}`}>
                    {memberRoles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="role-pill">{member.role}</span>
                )}
                {canEditMember ? (
                  <button type="button" className="icon-button small danger-action" onClick={() => onRemoveMember(member)} aria-label={`Remover ${member.user.name}`}>
                    <Trash2 size={15} />
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ConfirmDialog({ dialog, onClose }) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function confirm() {
    setIsSubmitting(true);
    try {
      await dialog.onConfirm();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <header>
          <h2 id="confirm-title">{dialog.title}</h2>
          <button type="button" className="icon-button small" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>
        <p>{dialog.message}</p>
        <footer>
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className={`primary-button ${dialog.tone === 'danger' ? 'danger-button' : ''}`} onClick={confirm} disabled={isSubmitting}>
            {isSubmitting ? 'Aguarde...' : dialog.confirmLabel || 'Confirmar'}
          </button>
        </footer>
      </section>
    </div>
  );
}

function CalendarView({ tasks, areas, onEditTask }) {
  const areaById = Object.fromEntries(areas.map((area) => [area.id, area]));
  const groupedTasks = tasks.reduce((groups, task) => {
    const key = task.dueDate;
    groups[key] = groups[key] || [];
    groups[key].push(task);
    return groups;
  }, {});
  const dates = Object.keys(groupedTasks).sort();

  return (
    <section className="calendar-view" aria-label="Calendario de tarefas">
      {dates.length === 0 ? (
        <div className="calendar-empty">
          <Calendar size={28} />
          <p>Nenhuma tarefa com vencimento.</p>
        </div>
      ) : (
        dates.map((date) => {
          const dueStatus = getDueStatus(date);
          return (
            <article key={date} className={`calendar-day ${dueStatus?.type || 'scheduled'}`}>
              <header>
                <div>
                  <strong>{date}</strong>
                  <span>{dueStatus?.label || 'Agendada'}</span>
                </div>
                <small>{groupedTasks[date].length} tarefas</small>
              </header>
              <div className="calendar-task-list">
                {groupedTasks[date].map((task) => (
                  <button key={task.id} type="button" className={`calendar-task ${task.priority}`} onClick={() => onEditTask(task)}>
                    <span>{task.title}</span>
                    <small>{areaById[task.columnId]?.title || 'Area'}</small>
                  </button>
                ))}
              </div>
            </article>
          );
        })
      )}
    </section>
  );
}

function ActivityView({ activities }) {
  return (
    <section className="activity-view" aria-label="Atividade do projeto">
      {activities.length === 0 ? (
        <div className="calendar-empty">
          <ClipboardList size={28} />
          <p>Nenhuma atividade registrada.</p>
        </div>
      ) : (
        activities.map((activity) => (
          <article key={activity.id} className="activity-item">
            <span className="activity-marker" />
            <div>
              <header>
                <strong>{activity.description}</strong>
                <time dateTime={activity.createdAt}>{formatActivityDate(activity.createdAt)}</time>
              </header>
              <p>{activity.user?.name || 'Sistema'} - {activity.action}</p>
              {activity.metadata?.taskCount !== undefined ? (
                <small>{activity.metadata.taskCount} tarefas em {activity.metadata.areaCount} areas</small>
              ) : null}
            </div>
          </article>
        ))
      )}
    </section>
  );
}

function formatActivityDate(value) {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function ToastList({ toasts, onDismiss }) {
  return (
    <div className="toast-stack" aria-live="polite" aria-label="Notificacoes">
      {toasts.map((toast) => (
        <button key={toast.id} type="button" className={`toast ${toast.tone}`} onClick={() => onDismiss(toast.id)}>
          {toast.message}
        </button>
      ))}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
