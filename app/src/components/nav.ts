import { create } from 'zustand'

/** Which page is open. Pages not in the sidebar (Key test) are opened from a button and lead back to their parent. */
export const useNav = create<{ page: string; go(page: string): void }>((set) => ({
  page: 'performance',
  go: (page) => set({ page }),
}))
