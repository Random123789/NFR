import { useState } from "react";
import type { HistoryEntry } from "../data/apiClient";
import { formatQuotedReplyChanges } from "../utils/historyEntries";

type RecordWithHistory = {
  recordId: string;
  history: HistoryEntry[];
};

type HistoryEntryInput = Pick<HistoryEntry, "action" | "changes" | "user"> &
  Partial<Pick<HistoryEntry, "field" | "previousValue" | "newValue">>;

type UseRecordCommentsOptions<T extends RecordWithHistory> = {
  selectedRecord: T | null;
  setSelectedRecord: (record: T) => void;
  addHistory: (recordId: string, entry: HistoryEntryInput) => Promise<T>;
  upsertRecord: (record: T) => void;
  userName?: string | null;
  onError?: (message: string) => void;
};

export function useRecordComments<T extends RecordWithHistory>({
  selectedRecord,
  setSelectedRecord,
  addHistory,
  upsertRecord,
  userName,
  onError,
}: UseRecordCommentsOptions<T>) {
  const [newComment, setNewComment] = useState("");
  const [selectedQuote, setSelectedQuote] = useState<HistoryEntry | null>(null);
  const [isAddingComment, setIsAddingComment] = useState(false);

  const handleAddComment = async () => {
    const comment = newComment.trim();
    if (!selectedRecord || !comment || isAddingComment) return;

    setIsAddingComment(true);

    try {
      const savedRecord = await addHistory(selectedRecord.recordId, {
        action: "Comment",
        changes: selectedQuote ? formatQuotedReplyChanges(selectedQuote, comment) : comment,
        user: userName || "Current User",
      });

      setSelectedRecord(savedRecord);
      upsertRecord(savedRecord);
      setNewComment("");
      setSelectedQuote(null);
    } catch (error) {
      console.error("Failed to add comment:", error);
      onError?.("Failed to add comment. Please try again.");
    } finally {
      setIsAddingComment(false);
    }
  };

  return {
    newComment,
    setNewComment,
    selectedQuote,
    setSelectedQuote,
    isAddingComment,
    handleAddComment,
  };
}
