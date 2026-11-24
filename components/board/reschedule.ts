import { ApiError, apiPost } from "@/lib/client-api";

type Moved = { board: { id: string; name: string }; swapped: { id: string; name: string } | null };

/**
 * Move a day / week board of a calendar to the day / week containing `date`.
 * When that day already has a board, `askSwap()` decides whether the two
 * boards trade places. Returns null when the user declined.
 */
export async function rescheduleBoard(boardId: string, date: string, askSwap: () => Promise<boolean>, swap = false): Promise<Moved | null> {
  try {
    return await apiPost<Moved>(`/api/boards/${boardId}/reschedule`, { date, swap });
  } catch (e) {
    if (!swap && e instanceof ApiError && e.status === 409) {
      if (!(await askSwap())) return null;
      return apiPost<Moved>(`/api/boards/${boardId}/reschedule`, { date, swap: true });
    }
    throw e;
  }
}
