const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3333';

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Erro na API.' }));
    throw new Error(error.message || 'Erro na API.');
  }

  return response.json();
}

export function getBoardState() {
  return request('/api/board');
}

export function saveBoardState(state) {
  return request('/api/board', {
    method: 'PUT',
    body: JSON.stringify(state),
  });
}
