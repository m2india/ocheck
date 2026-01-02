/**
 * Central configuration for API and Socket URLs.
 * Automatically switches between local and production/staging environments.
 */

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// If running locally, point to the local backend port 3001
// If running on a server, assume the backend is on the same host
export const BASE_URL = import.meta.env.VITE_API_URL || (isLocal
    ? 'http://localhost:3001'
    : window.location.origin);

export const SOCKET_URL = isLocal
    ? 'http://localhost:3001'
    : window.location.origin;
