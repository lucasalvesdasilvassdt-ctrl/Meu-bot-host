import { randomBytes } from "node:crypto";

export interface HostingKey {
  key: string;
  createdBy: string;
  createdAt: Date;
  used: boolean;
  usedBy?: string;
  usedAt?: Date;
  label?: string;
}

const keys = new Map<string, HostingKey>();

export function generateKey(createdBy: string, label?: string): HostingKey {
  const key = "HLB-" + randomBytes(12).toString("hex").toUpperCase();
  const entry: HostingKey = {
    key,
    createdBy,
    createdAt: new Date(),
    used: false,
    label,
  };
  keys.set(key, entry);
  return entry;
}

export function validateKey(key: string): HostingKey | null {
  const entry = keys.get(key);
  if (!entry || entry.used) return null;
  return entry;
}

export function consumeKey(key: string, usedBy: string): boolean {
  const entry = keys.get(key);
  if (!entry || entry.used) return false;
  entry.used = true;
  entry.usedBy = usedBy;
  entry.usedAt = new Date();
  return true;
}

export function revokeKey(key: string): boolean {
  return keys.delete(key);
}

export function listKeys(): HostingKey[] {
  return Array.from(keys.values());
}
