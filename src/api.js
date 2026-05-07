const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3333';

async function request(path, options = {}) {
  const hasBody = typeof options.body !== 'undefined';
  const response = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
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

export function listWorkspaces() {
  return request('/api/workspaces').then((data) => data.workspaces || []);
}

export function createWorkspace(payload) {
  return request('/api/workspaces', {
    method: 'POST',
    body: JSON.stringify(payload),
  }).then((data) => data.workspace);
}

export function listProjects(workspaceId) {
  return request(`/api/workspaces/${workspaceId}/projects`).then((data) => data.projects || []);
}

export function createProject(workspaceId, payload) {
  return request(`/api/workspaces/${workspaceId}/projects`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }).then((data) => data.project);
}

export function getProjectBoard(projectId) {
  return request(`/api/projects/${projectId}/board`);
}

export function saveProjectBoard(projectId, state) {
  return request(`/api/projects/${projectId}/board`, {
    method: 'PUT',
    body: JSON.stringify(state),
  });
}
