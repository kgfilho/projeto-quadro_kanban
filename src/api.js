const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3333';

async function request(path, options = {}) {
  const hasBody = typeof options.body !== 'undefined';
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const response = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: {
      ...(hasBody && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    ...options,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(data?.message || 'Erro na API.');
    error.status = response.status;
    throw error;
  }

  return data;
}

export function getAssetUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function getCurrentUser() {
  return request('/api/auth/me');
}

export function registerUser(payload) {
  return request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function loginUser(payload) {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function logoutUser() {
  return request('/api/auth/logout', {
    method: 'POST',
  });
}

export function updateCurrentUserProfile(payload) {
  return request('/api/auth/me/profile', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }).then((data) => data.user);
}

export function uploadCurrentUserAvatar(file) {
  const formData = new FormData();
  formData.append('avatar', file);
  return request('/api/auth/me/avatar', {
    method: 'POST',
    body: formData,
  }).then((data) => data.user);
}

export function deleteCurrentUserAvatar() {
  return request('/api/auth/me/avatar', {
    method: 'DELETE',
  }).then((data) => data.user);
}

export function updateCurrentUserPreferences(payload) {
  return request('/api/auth/me/preferences', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }).then((data) => data.user);
}

export function updateCurrentUserPassword(payload) {
  return request('/api/auth/me/password', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function listNotifications() {
  return request('/api/notifications');
}

export function markNotificationRead(activityId) {
  return request(`/api/notifications/${activityId}/read`, {
    method: 'POST',
  });
}

export function markAllNotificationsRead() {
  return request('/api/notifications/read-all', {
    method: 'POST',
  });
}

export function listWorkspaces() {
  return request('/api/workspaces').then((data) => data.workspaces || []);
}

export function createWorkspace(payload) {
  return request('/api/workspaces', {
    method: 'POST',
    body: JSON.stringify(payload),
  }).then((data) => data.workspace);
}

export function updateWorkspace(workspaceId, payload) {
  return request(`/api/workspaces/${workspaceId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }).then((data) => data.workspace);
}

export function deleteWorkspace(workspaceId, payload) {
  return request(`/api/workspaces/${workspaceId}`, {
    method: 'DELETE',
    body: JSON.stringify(payload),
  });
}

export function listWorkspaceMembers(workspaceId) {
  return request(`/api/workspaces/${workspaceId}/members`).then((data) => data.members || []);
}

export function inviteWorkspaceMember(workspaceId, payload) {
  return request(`/api/workspaces/${workspaceId}/members`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }).then((data) => data.member);
}

export function updateWorkspaceMember(workspaceId, userId, payload) {
  return request(`/api/workspaces/${workspaceId}/members/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }).then((data) => data.member);
}

export function removeWorkspaceMember(workspaceId, userId) {
  return request(`/api/workspaces/${workspaceId}/members/${userId}`, {
    method: 'DELETE',
  });
}

export function listWorkspaceInvites(workspaceId) {
  return request(`/api/workspaces/${workspaceId}/invites`).then((data) => data.invites || []);
}

export function createWorkspaceInvite(workspaceId, payload) {
  return request(`/api/workspaces/${workspaceId}/invites`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function revokeWorkspaceInvite(workspaceId, inviteId) {
  return request(`/api/workspaces/${workspaceId}/invites/${inviteId}`, {
    method: 'DELETE',
  }).then((data) => data.invite);
}

export function getInvite(token) {
  return request(`/api/invites/${token}`).then((data) => data.invite);
}

export function acceptInvite(token) {
  return request(`/api/invites/${token}/accept`, {
    method: 'POST',
  });
}

export function listProjects(workspaceId) {
  return request(`/api/workspaces/${workspaceId}/projects`).then((data) => data.projects || []);
}

export function listArchivedProjects(workspaceId) {
  return request(`/api/workspaces/${workspaceId}/projects/archived`).then((data) => data.projects || []);
}

export function createProject(workspaceId, payload) {
  return request(`/api/workspaces/${workspaceId}/projects`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }).then((data) => data.project);
}

export function updateProject(projectId, payload) {
  return request(`/api/projects/${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }).then((data) => data.project);
}

export function archiveProject(projectId) {
  return request(`/api/projects/${projectId}/archive`, {
    method: 'POST',
  }).then((data) => data.project);
}

export function restoreProject(projectId) {
  return request(`/api/projects/${projectId}/restore`, {
    method: 'POST',
  }).then((data) => data.project);
}

export function deleteProject(projectId, payload) {
  return request(`/api/projects/${projectId}`, {
    method: 'DELETE',
    body: JSON.stringify(payload),
  });
}

export function getProjectBoard(projectId) {
  return request(`/api/projects/${projectId}/board`);
}

export function listProjectActivity(projectId) {
  return request(`/api/projects/${projectId}/activity`).then((data) => data.activities || []);
}

export function saveProjectBoard(projectId, state) {
  return request(`/api/projects/${projectId}/board`, {
    method: 'PUT',
    headers: {
      'x-chronos-client-id': getRealtimeClientId(),
    },
    body: JSON.stringify(state),
  });
}

export function getRealtimeClientId() {
  const storageKey = 'chronosClientId';
  const savedId = sessionStorage.getItem(storageKey);
  if (savedId) return savedId;

  const id = `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  sessionStorage.setItem(storageKey, id);
  return id;
}

export function subscribeToProjectEvents(projectId) {
  const url = new URL(`${API_URL}/api/projects/${projectId}/events`);
  url.searchParams.set('clientId', getRealtimeClientId());
  return new EventSource(url, { withCredentials: true });
}
