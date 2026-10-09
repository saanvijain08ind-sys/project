import { io, Socket } from 'socket.io-client';

// Generate or retrieve persistent unique client userId to survive reloads & reconnections
export function getPersistentUserId(): string {
  let uid = sessionStorage.getItem('syncpad_user_id');
  if (!uid) {
    uid = 'usr_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
    sessionStorage.setItem('syncpad_user_id', uid);
  }
  return uid;
}

// Generate or retrieve persistent username
export function getStoredUsername(): string {
  return sessionStorage.getItem('syncpad_username') || `Dev_${Math.floor(100 + Math.random() * 900)}`;
}

export function setStoredUsername(name: string): void {
  sessionStorage.setItem('syncpad_username', name);
}

// Generate or retrieve preferred user color
const USER_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ec4899', // pink
  '#8b5cf6', // purple
  '#06b6d4', // cyan
  '#f97316', // orange
  '#14b8a6', // teal
];

export function getStoredColor(): string {
  let color = sessionStorage.getItem('syncpad_color');
  if (!color) {
    color = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
    sessionStorage.setItem('syncpad_color', color);
  }
  return color;
}

export function setStoredColor(color: string): void {
  sessionStorage.setItem('syncpad_color', color);
}

// Initialize socket instance connecting to same host
export const socket: Socket = io({
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 15,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
});
