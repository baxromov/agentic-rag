/**
 * Dynamic API configuration for local network access.
 *
 * Uses the browser's current hostname so the app works whether accessed via
 * localhost, 127.0.0.1, or a LAN IP like 192.168.x.x.
 *
 * On Windows, "localhost" can resolve to IPv6 (::1) while Docker only listens
 * on IPv4 (0.0.0.0), causing requests to hang. We force 127.0.0.1 in that case.
 */

const API_PORT = 8000;

const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';

export const API_BASE_URL = `${protocol}//${host}:${API_PORT}`;
export const WS_BASE_URL = `${wsProtocol}//${host}:${API_PORT}`;
