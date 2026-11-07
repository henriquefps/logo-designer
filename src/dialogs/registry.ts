import type { DialogDef } from './types';

const modules = import.meta.glob<{ default: DialogDef }>('./*/index.{ts,tsx}', { eager: true });

export const getDialogs = (): DialogDef[] => Object.values(modules).map((m) => m.default).filter(Boolean);
