/**
 * Dynamic API configuration for local network access.
 *
 * Uses the browser's current hostname so the app works whether accessed via
 * localhost, 127.0.0.1, or a LAN IP like 192.168.x.x.
 */

const API_PORT = 8000;

const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';

export const API_BASE_URL = `${protocol}//${host}:${API_PORT}`;
export const WS_BASE_URL = `${wsProtocol}//${host}:${API_PORT}`;
