import React from 'react';
import ReactDOM from 'react-dom/client';
import { closestCorners, DndContext, DragOverlay, PointerSensor, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Calendar,
  CheckCircle2,
  Circle,
  CircleDotDashed,
  ClipboardList,
  Edit3,
  FolderKanban,
  ImagePlus,
  LogOut,
  MessageSquare,
  Moon,
  Plus,
  RotateCcw,
  Search,
  Settings,
  SquareKanban,
  TimerReset,
  Sun,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';
import {
  API_URL,
  acceptInvite,
  archiveProject,
  createProject,
  createWorkspaceInvite,
  createWorkspace,
  deleteCurrentUserAvatar,
  deleteProject,
  deleteWorkspace,
  getAssetUrl,
  getInvite,
  getCurrentUser,
  getProjectBoard,
  inviteWorkspaceMember,
  listArchivedProjects,
  listProjectActivity,
  listNotifications,
  listWorkspaceInvites,
  listProjects,
  listWorkspaceMembers,
  listWorkspaces,
  loginUser,
  logoutUser,
  markAllNotificationsRead,
  markNotificationRead,
  registerUser,
  removeWorkspaceMember,
  restoreProject,
  revokeWorkspaceInvite,
  saveProjectBoard,
  subscribeToProjectEvents,
  updateCurrentUserPassword,
  updateCurrentUserPreferences,
  updateCurrentUserProfile,
  uploadCurrentUserAvatar,
  updateProject,
  updateWorkspaceMember,
  updateWorkspace,
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
      const defaultArea = defaultAreas.find((item) => area.id === item.id || area.id.startsWith(`${item.id}-`));
      return {
        ...(defaultArea || {}),
        id: area.id,
        title: area.title || defaultArea?.title || 'Nova area',
        helper: area.helper || defaultArea?.helper || 'Area personalizada',
        icon: area.icon || defaultArea?.icon || 'custom',
        locked: Boolean(defaultArea?.locked),
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
    assigneeId: task.assigneeId || '',
    tags: Array.isArray(task.tags) ? task.tags : [],
    checklist: Array.isArray(task.checklist) ? task.checklist : [],
    comments: Array.isArray(task.comments) ? task.comments : [],
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

function getInitials(name = '') {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase();
}

function findMemberUser(members, userId) {
  if (!userId) return null;
  return members.find((member) => member.user.id === userId)?.user || null;
}

function Avatar({ user, size = 'md' }) {
  const name = user?.name || user?.email || 'Usuario';
  const avatarSrc = getAssetUrl(user?.avatarUrl);
  return (
    <span className={`avatar avatar-${size}`} aria-hidden="true">
      {avatarSrc ? <img src={avatarSrc} alt="" loading="lazy" referrerPolicy="no-referrer" /> : getInitials(name)}
    </span>
  );
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Nao foi possivel ler a imagem.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Nao foi possivel carregar a imagem.'));
    image.src = src;
  });
}

async function createCroppedAvatarFile({ src, zoom, offsetX, offsetY }) {
  const image = await loadImage(src);
  const size = 320;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);

  const baseScale = Math.max(size / image.width, size / image.height);
  const scale = baseScale * zoom;
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  context.drawImage(image, (size - drawWidth) / 2 + offsetX, (size - drawHeight) / 2 + offsetY, drawWidth, drawHeight);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('Nao foi possivel cortar a imagem.'))), 'image/jpeg', 0.9);
  });

  return new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
}

function App() {
  const [areas, setAreas] = React.useState(defaultAreas);
  const [board, setBoard] = React.useState(() => normalizeBoard(emptyBoard, defaultAreas));
  const [theme, setTheme] = React.useState('light');
  const [query, setQuery] = React.useState('');
  const [priorityFilter, setPriorityFilter] = React.useState('all');
  const [assigneeFilter, setAssigneeFilter] = React.useState('all');
  const [activeView, setActiveView] = React.useState('board');
  const [modalTask, setModalTask] = React.useState(null);
  const [commentsTask, setCommentsTask] = React.useState(null);
  const [areaModal, setAreaModal] = React.useState(null);
  const [nameModal, setNameModal] = React.useState(null);
  const [accountModalOpen, setAccountModalOpen] = React.useState(false);
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
  const [notifications, setNotifications] = React.useState([]);
  const [unreadNotifications, setUnreadNotifications] = React.useState(0);
  const [notificationsOpen, setNotificationsOpen] = React.useState(false);
  const [archivedProjects, setArchivedProjects] = React.useState([]);
  const [archiveModalOpen, setArchiveModalOpen] = React.useState(false);
  const [teamModalOpen, setTeamModalOpen] = React.useState(false);
  const [activeTask, setActiveTask] = React.useState(null);
  const hydratedRef = React.useRef(false);
  const applyingRemoteRef = React.useRef(false);
  const inviteTokenRef = React.useRef(new URLSearchParams(window.location.search).get('invite'));
  const areasRef = React.useRef(areas);
  const boardRef = React.useRef(board);
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

  const loadNotifications = React.useCallback(async () => {
    const data = await listNotifications();
    setNotifications(data.notifications || []);
    setUnreadNotifications(data.unreadCount || 0);
    return data;
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

  const loadArchivedProjects = React.useCallback(async (workspaceId) => {
    if (!workspaceId) {
      setArchivedProjects([]);
      return [];
    }
    const projectItems = await listArchivedProjects(workspaceId);
    setArchivedProjects(projectItems);
    return projectItems;
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
      setArchivedProjects([]);
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
    await loadArchivedProjects(workspaceId);

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
  }, [loadArchivedProjects, loadInvites, loadMembers, loadProjectBoard]);

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
        setTheme(session.user.preferredTheme || 'light');
        setAuthStatus('authenticated');
        setApiStatus('online');
        const acceptedWorkspace = await acceptPendingInvite();
        await loadWorkspaceData({ preferredWorkspaceId: acceptedWorkspace?.id });
        await loadNotifications();
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
  }, [acceptPendingInvite, loadNotifications, loadWorkspaceData]);

  React.useEffect(() => {
    setBoard((currentBoard) => normalizeBoard(currentBoard, areas));
  }, [areas]);

  React.useEffect(() => {
    areasRef.current = areas;
  }, [areas]);

  React.useEffect(() => {
    boardRef.current = board;
  }, [board]);

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId);
  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const connectionReadOnly = authStatus === 'authenticated' && Boolean(selectedProjectId) && (apiStatus !== 'online' || realtimeStatus !== 'online');
  const canEditBoard = !connectionReadOnly && ['owner', 'admin', 'editor'].includes(selectedProject?.role);
  const canManageTeam = !connectionReadOnly && ['owner', 'admin'].includes(selectedWorkspace?.role);
  const canManageProject = !connectionReadOnly && ['owner', 'admin'].includes(selectedProject?.role);
  const canDeleteWorkspace = !connectionReadOnly && selectedWorkspace?.role === 'owner';
  const canDeleteProject = canManageProject;

  const persistBoardSnapshot = React.useCallback(async (nextAreas, nextBoard) => {
    if (
      applyingRemoteRef.current ||
      !hydratedRef.current ||
      apiStatus !== 'online' ||
      authStatus !== 'authenticated' ||
      !selectedProjectId ||
      !canEditBoard
    ) return;

    await saveProjectBoard(selectedProjectId, {
      areas: nextAreas,
      board: nextBoard,
    });
  }, [apiStatus, authStatus, canEditBoard, selectedProjectId]);

  const syncBoardSnapshot = React.useCallback((nextAreas, nextBoard) => {
    areasRef.current = nextAreas;
    boardRef.current = nextBoard;
    setAreas(nextAreas);
    setBoard(nextBoard);
    persistBoardSnapshot(nextAreas, nextBoard).catch(() => {
      showToast('Nao foi possivel sincronizar as ultimas alteracoes.', 'warning');
    });
  }, [persistBoardSnapshot, showToast]);

  const flushBoardChanges = React.useCallback(async () => {
    await persistBoardSnapshot(areasRef.current, boardRef.current);
  }, [persistBoardSnapshot]);

  React.useEffect(() => {
    if (authStatus !== 'authenticated' || !selectedProjectId) {
      setRealtimeStatus('idle');
      return undefined;
    }

    const eventSource = subscribeToProjectEvents(selectedProjectId);
    setRealtimeStatus('connecting');

    eventSource.addEventListener('connected', () => {
      setApiStatus('online');
      setRealtimeStatus('online');
      loadProjectBoard(selectedProjectId).catch(() => {
        setApiStatus('offline');
      });
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
  }, [authStatus, selectedProjectId, applyRemoteBoard, loadProjectBoard, showToast]);

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
        if (!error.status) {
          setApiStatus('offline');
        }
        showToast('Nao foi possivel sincronizar com a API.', 'warning');
      }
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, [areas, board, apiStatus, authStatus, selectedProjectId, canEditBoard, showToast]);

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  React.useEffect(() => {
    if (authStatus !== 'authenticated') return undefined;
    const intervalId = window.setInterval(() => {
      loadNotifications().catch(() => {});
    }, 45000);
    return () => window.clearInterval(intervalId);
  }, [authStatus, loadNotifications]);

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
    mine: allTasks.filter((task) => task.assigneeId === user?.id).length,
    dueSoon: allTasks.filter((task) => isDueSoon(task.dueDate)).length,
    overdue: allTasks.filter((task) => getDueStatus(task.dueDate)?.type === 'overdue').length,
    done: doneAreaIds.reduce((total, areaId) => total + (board[areaId] || []).length, 0),
  };
  const donePercent = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
  const currentProjectLabel = selectedProject ? `${selectedProject.name} · ${selectedProject.role}` : 'Selecione um projeto';
  const currentWorkspaceLabel = selectedWorkspace?.name || 'Workspace';

  function saveTask(taskData) {
    if (!canEditBoard) return;
    const normalizedTask = normalizeTask(taskData);
    const nextBoard = normalizeBoard(boardRef.current, areasRef.current);
    if (normalizedTask.id) {
      const withoutTask = Object.fromEntries(
        areasRef.current.map((area) => [area.id, nextBoard[area.id].filter((task) => task.id !== normalizedTask.id)]),
      );
      withoutTask[normalizedTask.columnId] = sortTasks([...withoutTask[normalizedTask.columnId], normalizedTask]);
      syncBoardSnapshot(areasRef.current, withoutTask);
    } else {
      const newTask = { ...normalizedTask, id: createTaskId() };
      syncBoardSnapshot(areasRef.current, {
        ...nextBoard,
        [newTask.columnId]: sortTasks([...nextBoard[newTask.columnId], newTask]),
      });
    }
    setModalTask(null);
    showToast(normalizedTask.id ? 'Tarefa atualizada.' : 'Tarefa criada.');
  }

  function toggleChecklistItem(taskId, itemId) {
    if (!canEditBoard) return;
    const nextBoard = Object.fromEntries(
        areasRef.current.map((area) => [
          area.id,
          (boardRef.current[area.id] || []).map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  checklist: (task.checklist || []).map((item) => (item.id === itemId ? { ...item, done: !item.done } : item)),
                }
              : task,
          ),
        ]),
    );
    syncBoardSnapshot(areasRef.current, nextBoard);
  }

  function saveTaskComment(taskId, text) {
    if (!canEditBoard) return;
    const comment = {
      id: `comment-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      text,
      userId: user?.id || '',
      user,
      createdAt: new Date().toISOString(),
    };
    const nextBoard = Object.fromEntries(
        areasRef.current.map((area) => [
          area.id,
          (boardRef.current[area.id] || []).map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  comments: [...(task.comments || []), comment],
                }
              : task,
          ),
        ]),
    );
    syncBoardSnapshot(areasRef.current, nextBoard);
    setCommentsTask((currentTask) => (currentTask?.id === taskId ? { ...currentTask, comments: [...(currentTask.comments || []), comment] } : currentTask));
    showToast('Comentario adicionado.');
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
        const nextBoard = Object.fromEntries(
          areasRef.current.map((area) => [area.id, (boardRef.current[area.id] || []).filter((item) => item.id !== taskId)]),
        );
        syncBoardSnapshot(areasRef.current, nextBoard);
        showToast('Tarefa excluida.', 'danger');
      },
    });
  }

  function saveArea(areaData) {
    if (!canEditBoard) return;
    const title = areaData.title.trim();
    if (!title) return;
    if (areaData.id) {
      const nextAreas = areasRef.current.map((area) =>
          area.id === areaData.id
            ? { ...area, title, helper: areaData.helper.trim() || 'Area personalizada' }
            : area,
      );
      syncBoardSnapshot(nextAreas, normalizeBoard(boardRef.current, nextAreas));
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
    const nextAreas = [...areasRef.current, newArea];
    syncBoardSnapshot(nextAreas, { ...normalizeBoard(boardRef.current, areasRef.current), [newArea.id]: [] });
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
        const nextAreas = areasRef.current.filter((item) => item.id !== areaId);
        const { [areaId]: _removed, ...nextBoard } = boardRef.current;
        syncBoardSnapshot(nextAreas, normalizeBoard(nextBoard, nextAreas));
        showToast('Area removida.', 'danger');
      },
    });
  }

  function moveArea(areaId, direction) {
    if (!canEditBoard) return;
    const currentIndex = areas.findIndex((area) => area.id === areaId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= areas.length) return;
    const nextAreas = arrayMove(areasRef.current, currentIndex, targetIndex);
    syncBoardSnapshot(nextAreas, normalizeBoard(boardRef.current, nextAreas));
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

    const currentBoard = boardRef.current;
    const sourceColumn = findTaskColumn(currentBoard, areasRef.current, active.id);
    const targetColumn = areasRef.current.some((area) => area.id === over.id) ? over.id : findTaskColumn(currentBoard, areasRef.current, over.id);

    if (!sourceColumn || !targetColumn) return;
    if (sourceColumn === targetColumn) {
      const sourceTasks = currentBoard[sourceColumn] || [];
      const activeIndex = sourceTasks.findIndex((task) => task.id === active.id);
      const overIndex = sourceTasks.findIndex((task) => task.id === over.id);
      if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) return;
      syncBoardSnapshot(areasRef.current, {
          ...currentBoard,
          [sourceColumn]: arrayMove(sourceTasks, activeIndex, overIndex),
      });
      return;
    }

    const sourceTasks = currentBoard[sourceColumn] || [];
    const targetTasks = currentBoard[targetColumn] || [];
    const movingTask = sourceTasks.find((task) => task.id === active.id);
    if (!movingTask) return;
    const targetIndex = targetTasks.findIndex((task) => task.id === over.id);
    const insertIndex = targetIndex >= 0 ? targetIndex : targetTasks.length;
    const nextTargetTasks = [...targetTasks];
    nextTargetTasks.splice(insertIndex, 0, { ...movingTask, columnId: targetColumn });

    syncBoardSnapshot(areasRef.current, {
        ...currentBoard,
        [sourceColumn]: (currentBoard[sourceColumn] || []).filter((task) => task.id !== active.id),
        [targetColumn]: nextTargetTasks,
    });
  }

  async function handleAuthSubmit(mode, payload) {
    const action = mode === 'register' ? registerUser : loginUser;
    const session = await action(payload);
    setUser(session.user);
    setTheme(session.user.preferredTheme || 'light');
    setAuthStatus('authenticated');
    setApiStatus('online');
    const acceptedWorkspace = await acceptPendingInvite();
    await loadWorkspaceData({ preferredWorkspaceId: acceptedWorkspace?.id });
    await loadNotifications();
    showToast(acceptedWorkspace ? 'Convite aceito.' : mode === 'register' ? 'Conta criada.' : 'Sessao iniciada.');
  }

  async function handleLogout() {
    try {
      await flushBoardChanges().catch(() => showToast('Nao foi possivel sincronizar as ultimas alteracoes.', 'warning'));
      await logoutUser();
    } finally {
      setUser(null);
      setAuthStatus('unauthenticated');
      setWorkspaces([]);
      setProjects([]);
      setArchivedProjects([]);
      setMembers([]);
      setInvites([]);
      setActivities([]);
      setNotifications([]);
      setUnreadNotifications(0);
      setNotificationsOpen(false);
      setArchiveModalOpen(false);
      setSelectedWorkspaceId('');
      setSelectedProjectId('');
      setAreas(defaultAreas);
      setBoard(normalizeBoard(emptyBoard, defaultAreas));
      hydratedRef.current = false;
    }
  }

  async function handleWorkspaceChange(workspaceId) {
    await flushBoardChanges().catch(() => showToast('Nao foi possivel sincronizar as ultimas alteracoes.', 'warning'));
    setSelectedWorkspaceId(workspaceId);
    setSelectedProjectId('');
    setActivities([]);
    await loadMembers(workspaceId);
    await loadInvites(workspaceId);
    await loadArchivedProjects(workspaceId);
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
    await flushBoardChanges().catch(() => showToast('Nao foi possivel sincronizar as ultimas alteracoes.', 'warning'));
    await loadProjectBoard(projectId);
  }

  async function openArchiveModal() {
    setArchiveModalOpen(true);
    await loadArchivedProjects(selectedWorkspaceId).catch(() => showToast('Nao foi possivel carregar projetos arquivados.', 'warning'));
  }

  async function restoreArchivedProject(projectId) {
    const project = await restoreProject(projectId);
    await loadWorkspaceData({ preferredWorkspaceId: selectedWorkspaceId, preferredProjectId: project.id });
    setArchiveModalOpen(false);
    setActiveView('board');
    showToast('Projeto restaurado.');
  }

  async function retryConnection() {
    if (!selectedProjectId) {
      await loadWorkspaceData({ preferredWorkspaceId: selectedWorkspaceId });
      return;
    }
    setApiStatus('checking');
    setRealtimeStatus('connecting');
    try {
      await loadWorkspaceData({ preferredWorkspaceId: selectedWorkspaceId, preferredProjectId: selectedProjectId });
      setApiStatus('online');
    } catch {
      setApiStatus('offline');
      setRealtimeStatus('offline');
      showToast('A API ainda nao respondeu.', 'warning');
    }
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
      return;
    }

    if (nameModal?.type === 'rename-workspace') {
      await renameWorkspace(cleanName);
      setNameModal(null);
      return;
    }

    if (nameModal?.type === 'rename-project') {
      await renameProject(cleanName);
      setNameModal(null);
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

  async function updateUserProfile(payload) {
    const updatedUser = await updateCurrentUserProfile(payload);
    setUser(updatedUser);
    showToast('Perfil atualizado.');
  }

  async function uploadUserAvatar(file) {
    const updatedUser = await uploadCurrentUserAvatar(file);
    setUser(updatedUser);
    showToast('Avatar atualizado.');
  }

  async function removeUserAvatar() {
    const updatedUser = await deleteCurrentUserAvatar();
    setUser(updatedUser);
    showToast('Avatar removido.', 'warning');
  }

  async function updateUserPassword(payload) {
    await updateCurrentUserPassword(payload);
    showToast('Senha atualizada.');
  }

  async function saveUserTheme(nextTheme) {
    setTheme(nextTheme);
    if (authStatus !== 'authenticated' || connectionReadOnly) return;
    try {
      const updatedUser = await updateCurrentUserPreferences({ preferredTheme: nextTheme });
      setUser(updatedUser);
    } catch {
      showToast('Tema alterado apenas nesta sessao.', 'warning');
    }
  }

  async function renameWorkspace(name) {
    if (!selectedWorkspace || !canManageTeam) return;
    const workspace = await updateWorkspace(selectedWorkspace.id, { name });
    await loadWorkspaceData({ preferredWorkspaceId: workspace.id, preferredProjectId: selectedProjectId });
    setActiveView('settings');
    showToast('Workspace renomeado.');
  }

  async function renameProject(name) {
    if (!selectedProject || !canManageProject) return;
    const project = await updateProject(selectedProject.id, { name });
    await loadWorkspaceData({ preferredWorkspaceId: selectedWorkspaceId, preferredProjectId: project.id });
    setActiveView('settings');
    showToast('Projeto renomeado.');
  }

  function openRenameWorkspaceModal() {
    if (!selectedWorkspace || !canManageTeam) return;
    setNameModal({ type: 'rename-workspace', name: selectedWorkspace.name });
  }

  function openRenameProjectModal() {
    if (!selectedProject || !canManageProject) return;
    setNameModal({ type: 'rename-project', name: selectedProject.name });
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

  async function openNotifications() {
    setNotificationsOpen((isOpen) => !isOpen);
    if (!notificationsOpen) {
      await loadNotifications().catch(() => showToast('Nao foi possivel carregar notificacoes.', 'warning'));
    }
  }

  async function readNotification(activityId) {
    await markNotificationRead(activityId);
    await loadNotifications();
  }

  async function readAllNotifications() {
    await markAllNotificationsRead();
    await loadNotifications();
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

  function confirmDeleteProject() {
    if (!selectedProject || !canDeleteProject) return;
    setConfirmDialog({
      title: 'Excluir projeto',
      message: `Esta acao apaga o projeto "${selectedProject.name}", suas areas, tarefas e historico do projeto.`,
      confirmLabel: 'Excluir projeto',
      tone: 'danger',
      confirmationName: selectedProject.name,
      confirmationLabel: 'Digite o nome do projeto para confirmar',
      onConfirm: async (confirmationName) => {
        await deleteProject(selectedProject.id, { confirmationName });
        await loadWorkspaceData({ preferredWorkspaceId: selectedWorkspaceId });
        setActiveView('board');
        showToast('Projeto excluido.', 'danger');
      },
    });
  }

  function confirmArchiveProject() {
    if (!selectedProject || !canManageProject) return;
    setConfirmDialog({
      title: 'Arquivar projeto',
      message: `Arquivar "${selectedProject.name}"? Ele saira da lista principal e ficara protegido contra edicoes.`,
      confirmLabel: 'Arquivar projeto',
      tone: 'warning',
      onConfirm: async () => {
        await archiveProject(selectedProject.id);
        await loadWorkspaceData({ preferredWorkspaceId: selectedWorkspaceId });
        setActiveView('board');
        showToast('Projeto arquivado.', 'warning');
      },
    });
  }

  function confirmDeleteWorkspace() {
    if (!selectedWorkspace || !canDeleteWorkspace) return;
    setConfirmDialog({
      title: 'Excluir workspace',
      message: `Esta acao apaga o workspace "${selectedWorkspace.name}" com todos os projetos, membros, convites, areas e tarefas.`,
      confirmLabel: 'Excluir workspace',
      tone: 'danger',
      confirmationName: selectedWorkspace.name,
      confirmationLabel: 'Digite o nome do workspace para confirmar',
      onConfirm: async (confirmationName) => {
        await deleteWorkspace(selectedWorkspace.id, { confirmationName });
        await loadWorkspaceData();
        setActiveView('board');
        showToast('Workspace excluido.', 'danger');
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
            <p className="eyebrow">{currentWorkspaceLabel}</p>
            <h1>Chronos</h1>
            <span className="brand-subtitle">{currentProjectLabel}</span>
          </div>
        </div>

        <div className="top-meta">
          <span className={`api-status ${apiStatus}`}>{apiStatus === 'online' ? 'API online' : apiStatus === 'offline' ? 'API offline' : 'Conectando API'}</span>
          <span className={`api-status realtime ${realtimeStatus}`}>
            {realtimeStatus === 'online' ? 'Tempo real' : realtimeStatus === 'offline' ? 'Sem tempo real' : realtimeStatus === 'connecting' ? 'Conectando realtime' : 'Realtime ocioso'}
          </span>
          <div className="notification-wrap">
            <button type="button" className="icon-button notification-button" onClick={openNotifications} aria-label="Abrir notificacoes">
              <Bell size={18} />
              {unreadNotifications ? <span>{unreadNotifications > 9 ? '9+' : unreadNotifications}</span> : null}
            </button>
            {notificationsOpen ? (
              <NotificationPanel
                notifications={notifications}
                unreadCount={unreadNotifications}
                onRead={readNotification}
                onReadAll={readAllNotifications}
                onClose={() => setNotificationsOpen(false)}
              />
            ) : null}
          </div>
          <button type="button" className="user-chip" onClick={() => setAccountModalOpen(true)} aria-label="Abrir minha conta">
            <Avatar user={user} size="sm" />
            {user?.name || user?.email}
          </button>
          <button type="button" className="icon-button" onClick={() => saveUserTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Alternar tema">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button type="button" className="icon-button" onClick={handleLogout} aria-label="Sair">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <section className="project-strip" aria-label="Workspace e projeto atual">
        <div className="context-selectors">
          <label>
            <span>Workspace</span>
            <select
              value={selectedWorkspaceId}
              onChange={(event) => {
                if (event.target.value === 'new-workspace') {
                  setNameModal({ type: 'workspace' });
                  return;
                }
                handleWorkspaceChange(event.target.value);
              }}
              aria-label="Selecionar workspace"
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
              <option value="new-workspace">+ Criar workspace</option>
            </select>
          </label>
          <label>
            <span>Projeto</span>
            <select
              value={selectedProjectId || ''}
              onChange={(event) => {
                if (event.target.value === 'new-project') {
                  setNameModal({ type: 'project' });
                  return;
                }
                handleProjectChange(event.target.value);
              }}
              aria-label="Selecionar projeto"
              disabled={!selectedWorkspaceId}
            >
              {!projects.length ? <option value="">Nenhum projeto</option> : null}
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
              <option value="new-project">+ Criar projeto</option>
            </select>
          </label>
        </div>
        <div className="context-actions">
          <button type="button" className="secondary-button" onClick={openArchiveModal} disabled={!selectedWorkspaceId}>
            <FolderKanban size={17} />
            Arquivados
            {archivedProjects.length ? <span className="button-count">{archivedProjects.length}</span> : null}
          </button>
          <button type="button" className="secondary-button" onClick={() => setTeamModalOpen(true)} disabled={!selectedWorkspaceId}>
            <Users size={17} />
            Equipe
          </button>
        </div>
      </section>

      {connectionReadOnly ? (
        <section className="connection-banner" role="status" aria-live="polite">
          <div>
            <strong>Conexao perdida</strong>
            <span>O Chronos esta em somente leitura ate reconectar e recarregar o projeto.</span>
          </div>
          <button type="button" className="secondary-button" onClick={retryConnection}>
            <TimerReset size={17} />
            Tentar novamente
          </button>
        </section>
      ) : null}

      <section className="workspace-bar" aria-label="Resumo e filtros">
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
          <button type="button" className={activeView === 'settings' ? 'active' : ''} onClick={() => setActiveView('settings')}>
            Configuracoes
          </button>
        </div>
        <div className="quick-stats" aria-label="Indicadores do projeto">
          <StatCard label="Tarefas" value={stats.total} icon={ClipboardList} tone="blue" />
          <StatCard label="Urgentes" value={stats.urgent} icon={TimerReset} tone="red" />
          <StatCard label="Atrasadas" value={stats.overdue} icon={TimerReset} tone="red" />
          <StatCard label="Em breve" value={stats.dueSoon} icon={Calendar} tone="amber" />
          <StatCard label="Concluidas" value={`${donePercent}%`} detail={`${stats.done}/${stats.total || 0}`} icon={CheckCircle2} tone="green" />
        </div>
      </section>

      {activeView === 'board' ? (
        <section className="board-toolbar" aria-label="Ferramentas do quadro">
          <label className="search-field">
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar tarefas" />
          </label>
          <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} aria-label="Filtrar por prioridade">
            <option value="all">Todas as prioridades</option>
            {priorities.map((priority) => (
              <option key={priority.id} value={priority.id}>
                {priority.label}
              </option>
            ))}
          </select>
          <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)} aria-label="Filtrar por responsavel">
            <option value="all">Todas as tarefas</option>
            <option value="mine">Minhas tarefas ({stats.mine})</option>
          </select>
          <div className="toolbar-actions">
            <button type="button" className="secondary-button" onClick={() => setAreaModal({ mode: 'create' })} disabled={!selectedProjectId || !canEditBoard}>
              <SquareKanban size={18} />
              Nova area
            </button>
            <button type="button" className="primary-button" onClick={() => setModalTask({ columnId: defaultColumnId })} disabled={!selectedProjectId || !canEditBoard}>
              <Plus size={18} />
              Nova tarefa
            </button>
          </div>
        </section>
      ) : null}

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
                assigneeFilter={assigneeFilter}
                currentUserId={user?.id}
                members={members}
                canEdit={canEditBoard}
                onAddTask={() => setModalTask({ columnId: area.id })}
                onEditTask={(task) => setModalTask({ ...task, columnId: area.id })}
                onOpenComments={(task) => setCommentsTask({ ...task, columnId: area.id })}
                onDeleteTask={deleteTask}
                onToggleChecklistItem={toggleChecklistItem}
                onMoveArea={moveArea}
                onEditArea={() => setAreaModal({ mode: 'edit', area })}
                onDeleteArea={() => deleteArea(area.id)}
              />
            ))}
          </section>
          <DragOverlay>{activeTask ? <TaskCardView task={activeTask} members={members} isOverlay /> : null}</DragOverlay>
        </DndContext>
      ) : activeView === 'calendar' ? (
        <CalendarView tasks={calendarTasks} areas={areas} onEditTask={(task) => (canEditBoard ? setModalTask(task) : null)} />
      ) : activeView === 'settings' ? (
        <SettingsView
          workspace={selectedWorkspace}
          project={selectedProject}
          members={members}
          currentUserId={user?.id}
          canManageTeam={canManageTeam}
          canManageProject={canManageProject}
          canDeleteWorkspace={canDeleteWorkspace}
          canDeleteProject={canDeleteProject}
          onOpenTeam={() => setTeamModalOpen(true)}
          onRenameWorkspace={openRenameWorkspaceModal}
          onRenameProject={openRenameProjectModal}
          onArchiveProject={confirmArchiveProject}
          onUpdateRole={updateMemberRole}
          onRemoveMember={confirmRemoveMember}
          onDeleteWorkspace={confirmDeleteWorkspace}
          onDeleteProject={confirmDeleteProject}
        />
      ) : (
        <ActivityView activities={activities} />
      )}

      {modalTask ? <TaskModal task={modalTask} areas={areas} members={members} onClose={() => setModalTask(null)} onSave={saveTask} /> : null}
      {commentsTask ? (
        <CommentsModal
          task={commentsTask}
          members={members}
          canComment={canEditBoard}
          onClose={() => setCommentsTask(null)}
          onComment={saveTaskComment}
        />
      ) : null}
      {areaModal ? <AreaModal area={areaModal.area} onClose={() => setAreaModal(null)} onSave={saveArea} /> : null}
      {nameModal ? (
        <NameModal
          title={nameModal.type === 'workspace' ? 'Novo workspace' : nameModal.type === 'project' ? 'Novo projeto' : nameModal.type === 'rename-workspace' ? 'Renomear workspace' : 'Renomear projeto'}
          label={nameModal.type === 'workspace' || nameModal.type === 'rename-workspace' ? 'Nome do workspace' : 'Nome do projeto'}
          placeholder={nameModal.type === 'workspace' || nameModal.type === 'rename-workspace' ? 'Ex: Equipe Produto' : 'Ex: Site institucional'}
          initialValue={nameModal.name || ''}
          submitLabel={nameModal.type?.startsWith('rename') ? 'Renomear' : 'Salvar'}
          onClose={() => setNameModal(null)}
          onSave={saveNameModal}
        />
      ) : null}
      {accountModalOpen ? (
        <AccountModal
          user={user}
          theme={theme}
          onClose={() => setAccountModalOpen(false)}
          onUpdateProfile={updateUserProfile}
          onUploadAvatar={uploadUserAvatar}
          onRemoveAvatar={removeUserAvatar}
          onUpdatePassword={updateUserPassword}
          onUpdateTheme={saveUserTheme}
          readOnly={connectionReadOnly}
          onLogout={handleLogout}
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
      {archiveModalOpen ? (
        <ArchivedProjectsModal
          projects={archivedProjects}
          onClose={() => setArchiveModalOpen(false)}
          onRestore={restoreArchivedProject}
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
          <p>Verifique se a Chronos API esta acessivel em {API_URL} para acessar os projetos.</p>
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
  assigneeFilter,
  currentUserId,
  members,
  canEdit,
  onAddTask,
  onEditTask,
  onOpenComments,
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
    const assignee = findMemberUser(members, task.assigneeId);
    const matchesText = `${task.title} ${task.description} ${assignee?.name || ''} ${(task.tags || []).join(' ')}`.toLowerCase().includes(normalizedQuery);
    const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter;
    const matchesAssignee = assigneeFilter === 'all' || task.assigneeId === currentUserId;
    return matchesText && matchesPriority && matchesAssignee;
  });

  return (
    <article ref={setNodeRef} className={`column ${area.id} area-${area.icon} ${area.locked ? '' : 'custom-area'} ${isOver ? 'is-over' : ''}`}>
      <header className="column-header">
        <div className="column-title">
          <span className="column-icon">
            <AreaIcon size={24} />
          </span>
          <div>
            <h2>{area.title}</h2>
            <span>{area.helper}</span>
          </div>
        </div>
        <strong className="column-count">{visibleTasks.length}</strong>
        <div className="column-actions">
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
        </div>
      </header>

      <SortableContext items={visibleTasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <div className="task-list">
          {visibleTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              members={members}
              canEdit={canEdit}
              onEdit={() => onEditTask(task)}
              onOpenComments={() => onOpenComments(task)}
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

function TaskCard({ task, members = [], canEdit, onEdit, onOpenComments, onDelete, onToggleChecklistItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <TaskCardView
      task={task}
      members={members}
      canEdit={canEdit}
      onEdit={onEdit}
      onOpenComments={onOpenComments}
      onDelete={onDelete}
      onToggleChecklistItem={onToggleChecklistItem}
      dragHandleProps={{ ...listeners, ...attributes }}
      innerRef={setNodeRef}
      style={style}
      isDragging={isDragging}
    />
  );
}

function TaskCardView({ task, members = [], canEdit = true, onEdit, onOpenComments, onDelete, onToggleChecklistItem, dragHandleProps = {}, innerRef, style, isDragging = false, isOverlay = false }) {
  const priority = priorities.find((item) => item.id === task.priority);
  const dueStatus = getDueStatus(task.dueDate);
  const progress = checklistProgress(task.checklist);
  const assignee = findMemberUser(members, task.assigneeId);

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
        {assignee ? (
          <span className="assignee-badge">
            <Avatar user={assignee} size="sm" />
            {assignee.name}
          </span>
        ) : null}
        {dueStatus ? (
          <span className={`due-date ${dueStatus.type}`}>
            <Calendar size={14} />
            {dueStatus.label}
          </span>
        ) : null}
      </div>
      {!isOverlay ? (
        <div className="task-actions">
          <button type="button" className="comment-count" onClick={onOpenComments} aria-label={`Abrir comentarios de ${task.title}`}>
            <MessageSquare size={14} />
            {(task.comments || []).length} comentario{(task.comments || []).length === 1 ? '' : 's'}
          </button>
          {canEdit ? (
            <div className="task-action-buttons">
              <button type="button" onClick={onEdit} aria-label={`Editar ${task.title}`}>
                <Edit3 size={16} />
              </button>
              <button type="button" onClick={onDelete} aria-label={`Excluir ${task.title}`}>
                <Trash2 size={16} />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function TaskModal({ task, areas, members = [], onClose, onSave }) {
  const [form, setForm] = React.useState({
    id: task.id,
    title: task.title || '',
    description: task.description || '',
    priority: task.priority || 'prioridade-baixa',
    dueDate: task.dueDate || '',
    assigneeId: task.assigneeId || '',
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
      comments: task.comments || [],
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
          Responsavel
          <select value={form.assigneeId} onChange={(event) => updateField('assigneeId', event.target.value)}>
            <option value="">Sem responsavel</option>
            {members.map((member) => (
              <option key={member.user.id} value={member.user.id}>
                {member.user.name} ({member.role})
              </option>
            ))}
          </select>
        </label>
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

function CommentsModal({ task, members = [], canComment, onClose, onComment }) {
  const [commentText, setCommentText] = React.useState('');
  const comments = task.comments || [];

  function submit(event) {
    event.preventDefault();
    const text = commentText.trim();
    if (!text) return;
    onComment(task.id, text);
    setCommentText('');
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="task-modal comments-modal" role="dialog" aria-modal="true" aria-labelledby="comments-title">
        <header>
          <div>
            <p className="eyebrow">Comentarios</p>
            <h2 id="comments-title">{task.title}</h2>
          </div>
          <button type="button" className="icon-button small" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>

        {comments.length ? (
          <div className="comment-list">
            {comments.map((comment) => {
              const author = comment.user || findMemberUser(members, comment.userId);
              return (
                <article key={comment.id} className="comment-item">
                  <Avatar user={author} size="sm" />
                  <div>
                    <header>
                      <strong>{author?.name || 'Usuario removido'}</strong>
                      <time dateTime={comment.createdAt}>{formatActivityDate(comment.createdAt)}</time>
                    </header>
                    <p>{comment.text}</p>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="calendar-empty compact">
            <MessageSquare size={28} />
            <p>Nenhum comentario nesta tarefa.</p>
          </div>
        )}

        <form className="comment-compose" onSubmit={submit}>
          <textarea value={commentText} onChange={(event) => setCommentText(event.target.value)} rows={3} maxLength={1200} placeholder="Escreva um comentario para a equipe" disabled={!canComment} />
          <button type="submit" className="secondary-button" disabled={!canComment || !commentText.trim()}>
            <MessageSquare size={17} />
            Comentar
          </button>
        </form>
      </section>
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

function NameModal({ title, label, placeholder, initialValue = '', submitLabel = 'Salvar', onClose, onSave }) {
  const [name, setName] = React.useState(initialValue);
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
            {isSubmitting ? 'Salvando...' : submitLabel}
          </button>
        </footer>
      </form>
    </div>
  );
}

function ArchivedProjectsModal({ projects, onClose, onRestore }) {
  const [restoringId, setRestoringId] = React.useState('');
  const [error, setError] = React.useState('');

  async function restore(projectId) {
    setRestoringId(projectId);
    setError('');
    try {
      await onRestore(projectId);
    } catch (submitError) {
      setError(submitError.message || 'Nao foi possivel restaurar o projeto.');
      setRestoringId('');
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="task-modal archived-modal" role="dialog" aria-modal="true" aria-labelledby="archived-title">
        <header>
          <div>
            <p className="eyebrow">Projetos arquivados</p>
            <h2 id="archived-title">Arquivo do workspace</h2>
          </div>
          <button type="button" className="icon-button small" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>
        {error ? <p className="form-error">{error}</p> : null}
        {projects.length ? (
          <div className="archived-list">
            {projects.map((project) => {
              const canRestore = ['owner', 'admin'].includes(project.role);
              return (
                <article key={project.id} className="archived-row">
                  <span className="settings-icon">
                    <FolderKanban size={18} />
                  </span>
                  <div>
                    <strong>{project.name}</strong>
                    <small>Arquivado em {formatActivityDate(project.archivedAt)} - {project.role}</small>
                  </div>
                  <button type="button" className="secondary-button" onClick={() => restore(project.id)} disabled={!canRestore || restoringId === project.id}>
                    <RotateCcw size={17} />
                    Restaurar
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="calendar-empty compact">
            <FolderKanban size={28} />
            <p>Nenhum projeto arquivado.</p>
          </div>
        )}
        <footer>
          <button type="button" className="secondary-button" onClick={onClose}>
            Fechar
          </button>
        </footer>
      </section>
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
                <Avatar user={member.user} />
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

function SettingsView({
  workspace,
  project,
  members,
  currentUserId,
  canManageTeam,
  canManageProject,
  canDeleteWorkspace,
  canDeleteProject,
  onOpenTeam,
  onRenameWorkspace,
  onRenameProject,
  onArchiveProject,
  onUpdateRole,
  onRemoveMember,
  onDeleteWorkspace,
  onDeleteProject,
}) {
  const [error, setError] = React.useState('');

  async function changeRole(member, role) {
    setError('');
    try {
      await onUpdateRole(member.user.id, role);
    } catch (submitError) {
      setError(submitError.message || 'Nao foi possivel alterar a permissao.');
    }
  }

  return (
    <section className="settings-view" aria-label="Configuracoes">
      <header className="settings-header">
        <div>
          <p className="eyebrow">Configuracoes</p>
          <h2>Administracao do workspace</h2>
        </div>
        <span className="settings-icon">
          <Settings size={20} />
        </span>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="settings-section" aria-label="Workspace">
        <div>
          <p className="eyebrow">Workspace</p>
          <h3>{workspace?.name || 'Nenhum workspace selecionado'}</h3>
          <p>Owner e admin podem renomear. Exclusao definitiva fica disponivel apenas para owner.</p>
        </div>
        <button type="button" className="secondary-button" onClick={onRenameWorkspace} disabled={!workspace || !canManageTeam}>
          <Edit3 size={17} />
          Renomear
        </button>
        <button type="button" className="secondary-button danger-outline" onClick={onDeleteWorkspace} disabled={!canDeleteWorkspace}>
          <Trash2 size={17} />
          Excluir workspace
        </button>
      </section>

      <section className="settings-section" aria-label="Projeto">
        <div>
          <p className="eyebrow">Projeto</p>
          <h3>{project?.name || 'Nenhum projeto selecionado'}</h3>
          <p>Owner e admin podem renomear ou arquivar. Exclusao definitiva fica disponivel como ultima etapa.</p>
        </div>
        <button type="button" className="secondary-button" onClick={onRenameProject} disabled={!project || !canManageProject}>
          <Edit3 size={17} />
          Renomear
        </button>
        <button type="button" className="secondary-button" onClick={onArchiveProject} disabled={!project || !canManageProject}>
          <FolderKanban size={17} />
          Arquivar
        </button>
        <button type="button" className="secondary-button danger-outline" onClick={onDeleteProject} disabled={!canDeleteProject || !project}>
          <Trash2 size={17} />
          Excluir projeto
        </button>
      </section>

      <section className="settings-section team-settings" aria-label="Equipe">
        <div className="settings-section-head">
          <div>
            <p className="eyebrow">Equipe</p>
            <h3>Membros e permissoes</h3>
          </div>
          <button type="button" className="secondary-button" onClick={onOpenTeam} disabled={!workspace}>
            <Users size={17} />
            Convidar
          </button>
        </div>
        <div className="member-list">
          {members.map((member) => {
            const isSelf = member.user.id === currentUserId;
            const canEditMember = canManageTeam && member.role !== 'owner' && !isSelf;
            return (
              <article key={member.user.id} className="member-row">
                <Avatar user={member.user} />
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
    </section>
  );
}

function AccountModal({ user, theme, readOnly, onClose, onUpdateProfile, onUploadAvatar, onRemoveAvatar, onUpdatePassword, onUpdateTheme, onLogout }) {
  const [profileName, setProfileName] = React.useState(user?.name || '');
  const [avatarDraft, setAvatarDraft] = React.useState(null);
  const [avatarZoom, setAvatarZoom] = React.useState(1);
  const [avatarOffsetX, setAvatarOffsetX] = React.useState(0);
  const [avatarOffsetY, setAvatarOffsetY] = React.useState(0);
  const [passwordForm, setPasswordForm] = React.useState({ currentPassword: '', newPassword: '' });
  const [error, setError] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const fileInputRef = React.useRef(null);

  React.useEffect(() => {
    setProfileName(user?.name || '');
  }, [user?.name]);

  async function saveProfile(event) {
    event.preventDefault();
    const name = profileName.trim();
    if (!name || name === user?.name) return;
    setError('');
    setIsSubmitting(true);
    try {
      await onUpdateProfile({ name });
    } catch (submitError) {
      setError(submitError.message || 'Nao foi possivel atualizar o perfil.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function selectAvatar(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Avatar precisa ser JPG, PNG ou WEBP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Escolha uma imagem de ate 5MB.');
      return;
    }

    setError('');
    try {
      setAvatarDraft(await readFileAsDataUrl(file));
      setAvatarZoom(1);
      setAvatarOffsetX(0);
      setAvatarOffsetY(0);
    } catch (submitError) {
      setError(submitError.message || 'Nao foi possivel carregar a imagem.');
    }
  }

  async function saveAvatar() {
    if (!avatarDraft) return;
    setError('');
    setIsSubmitting(true);
    try {
      const avatarFile = await createCroppedAvatarFile({
        src: avatarDraft,
        zoom: Number(avatarZoom),
        offsetX: Number(avatarOffsetX),
        offsetY: Number(avatarOffsetY),
      });
      await onUploadAvatar(avatarFile);
      setAvatarDraft(null);
    } catch (submitError) {
      setError(submitError.message || 'Nao foi possivel salvar o avatar.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function removeAvatar() {
    setError('');
    setIsSubmitting(true);
    try {
      await onRemoveAvatar();
      setAvatarDraft(null);
    } catch (submitError) {
      setError(submitError.message || 'Nao foi possivel remover o avatar.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await onUpdatePassword(passwordForm);
      setPasswordForm({ currentPassword: '', newPassword: '' });
    } catch (submitError) {
      setError(submitError.message || 'Nao foi possivel atualizar a senha.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="task-modal account-modal" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <header>
          <div>
            <p className="eyebrow">Minha conta</p>
            <h2 id="account-title">{user?.name || 'Usuario'}</h2>
            <span>{user?.email}</span>
          </div>
          <Avatar user={user} size="lg" />
          <button type="button" className="icon-button small" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>

        {error ? <p className="form-error">{error}</p> : null}
        {readOnly ? <p className="form-error warning">Conta em somente leitura ate a API reconectar.</p> : null}

        <form className="account-form" onSubmit={saveProfile}>
          <label>
            Nome
            <input value={profileName} onChange={(event) => setProfileName(event.target.value)} disabled={readOnly} />
          </label>
          <button type="submit" className="secondary-button" disabled={readOnly || isSubmitting || !profileName.trim() || profileName.trim() === user?.name}>
            <CheckCircle2 size={17} />
            Salvar perfil
          </button>
        </form>

        <section className="avatar-panel" aria-label="Avatar do usuario">
          <div className="avatar-current">
            <Avatar user={user} size="lg" />
            <div>
              <strong>Foto do perfil</strong>
              <span>Envie uma imagem e ajuste o corte antes de salvar.</span>
            </div>
          </div>
          <div className="avatar-actions">
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={selectAvatar} disabled={readOnly} hidden />
            <button type="button" className="secondary-button" onClick={() => fileInputRef.current?.click()} disabled={readOnly || isSubmitting}>
              <ImagePlus size={17} />
              Enviar imagem
            </button>
            <button type="button" className="secondary-button danger-outline" onClick={removeAvatar} disabled={readOnly || isSubmitting || !user?.avatarUrl}>
              <Trash2 size={17} />
              Remover
            </button>
          </div>

          {avatarDraft ? (
            <div className="avatar-cropper">
              <div className="avatar-crop-frame">
                <img
                  src={avatarDraft}
                  alt="Previa do corte"
                  style={{
                    transform: `translate(${avatarOffsetX * 0.75}px, ${avatarOffsetY * 0.75}px) scale(${avatarZoom})`,
                  }}
                />
              </div>
              <div className="crop-controls">
                <label>
                  Zoom
                  <input type="range" min="1" max="3" step="0.05" value={avatarZoom} onChange={(event) => setAvatarZoom(event.target.value)} />
                </label>
                <label>
                  Horizontal
                  <input type="range" min="-120" max="120" step="1" value={avatarOffsetX} onChange={(event) => setAvatarOffsetX(event.target.value)} />
                </label>
                <label>
                  Vertical
                  <input type="range" min="-120" max="120" step="1" value={avatarOffsetY} onChange={(event) => setAvatarOffsetY(event.target.value)} />
                </label>
                <div className="avatar-crop-actions">
                  <button type="button" className="secondary-button" onClick={() => setAvatarDraft(null)} disabled={isSubmitting}>
                    Cancelar
                  </button>
                  <button type="button" className="primary-button" onClick={saveAvatar} disabled={readOnly || isSubmitting}>
                    <CheckCircle2 size={17} />
                    Salvar avatar
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <div className="account-form">
          <label>
            Tema
            <select value={theme} onChange={(event) => onUpdateTheme(event.target.value)} disabled={readOnly}>
              <option value="light">Claro</option>
              <option value="dark">Escuro</option>
            </select>
          </label>
        </div>

        <form className="account-form" onSubmit={savePassword}>
          <label>
            Senha atual
            <input type="password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm((currentForm) => ({ ...currentForm, currentPassword: event.target.value }))} autoComplete="current-password" disabled={readOnly} />
          </label>
          <label>
            Nova senha
            <input type="password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm((currentForm) => ({ ...currentForm, newPassword: event.target.value }))} autoComplete="new-password" disabled={readOnly} />
          </label>
          <button type="submit" className="secondary-button" disabled={readOnly || isSubmitting || !passwordForm.currentPassword || passwordForm.newPassword.length < 10}>
            <CheckCircle2 size={17} />
            Alterar senha
          </button>
        </form>

        <footer>
          <button type="button" className="secondary-button" onClick={onClose}>
            Fechar
          </button>
          <button type="button" className="secondary-button danger-outline" onClick={onLogout}>
            <LogOut size={17} />
            Sair
          </button>
        </footer>
      </section>
    </div>
  );
}

function ConfirmDialog({ dialog, onClose }) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [confirmationName, setConfirmationName] = React.useState('');
  const [error, setError] = React.useState('');
  const requiresName = Boolean(dialog.confirmationName);
  const confirmationMatches = !requiresName || confirmationName.trim() === dialog.confirmationName;

  async function confirm() {
    if (!confirmationMatches) return;
    setIsSubmitting(true);
    setError('');
    try {
      await dialog.onConfirm(confirmationName.trim());
      onClose();
    } catch (confirmError) {
      setError(confirmError.message || 'Nao foi possivel confirmar.');
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
        {requiresName ? (
          <label className="confirm-field">
            {dialog.confirmationLabel || 'Digite o nome para confirmar'}
            <input value={confirmationName} onChange={(event) => setConfirmationName(event.target.value)} autoFocus />
          </label>
        ) : null}
        {error ? <p className="form-error">{error}</p> : null}
        <footer>
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className={`primary-button ${dialog.tone === 'danger' ? 'danger-button' : ''}`} onClick={confirm} disabled={isSubmitting || !confirmationMatches}>
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
            {activity.user ? <Avatar user={activity.user} size="sm" /> : <span className="activity-marker" />}
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

function NotificationPanel({ notifications, unreadCount, onRead, onReadAll, onClose }) {
  return (
    <section className="notification-panel" aria-label="Notificacoes">
      <header>
        <div>
          <p className="eyebrow">Notificacoes</p>
          <h2>{unreadCount ? `${unreadCount} nao lida${unreadCount > 1 ? 's' : ''}` : 'Tudo em dia'}</h2>
        </div>
        <button type="button" className="icon-button small" onClick={onClose} aria-label="Fechar notificacoes">
          <X size={16} />
        </button>
      </header>
      {notifications.length ? (
        <>
          <button type="button" className="secondary-button notification-read-all" onClick={onReadAll} disabled={!unreadCount}>
            Marcar todas como lidas
          </button>
          <div className="notification-list">
            {notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                className={`notification-item ${notification.readAt ? 'read' : 'unread'}`}
                onClick={() => onRead(notification.id)}
              >
                {notification.user ? <Avatar user={notification.user} size="sm" /> : <span className="activity-marker" />}
                <span>
                  <strong>{notification.description}</strong>
                  <small>{notification.user?.name || 'Sistema'} - {formatActivityDate(notification.createdAt)}</small>
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="notification-empty">
          <Bell size={22} />
          <p>Nenhuma notificacao importante ainda.</p>
        </div>
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
