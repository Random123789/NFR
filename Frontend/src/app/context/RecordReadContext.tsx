import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import { getRecordReadState, markRecordRead as markRecordReadApi } from "../services/api/recordReadService";
import type { RecordReadEntityType } from "../services/api/types";

type RecordReadContextValue = {
  isRecordUnread: (entityType: RecordReadEntityType, entityId: string, activityAt: string | null | undefined) => boolean;
  markRecordRead: (entityType: RecordReadEntityType, entityId: string) => Promise<void>;
  refreshRecordReadState: () => Promise<void>;
};

const RecordReadContext = createContext<RecordReadContextValue | undefined>(undefined);

function readKey(entityType: RecordReadEntityType, entityId: string) {
  return `${entityType}:${entityId}`;
}

function timestampToMillis(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = Date.parse(value.replace(" ", "T"));
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function RecordReadProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [baselineAt, setBaselineAt] = useState("");
  const [readTimestamps, setReadTimestamps] = useState<Record<string, string>>({});

  const refreshRecordReadState = useCallback(async () => {
    if (!user) {
      setBaselineAt("");
      setReadTimestamps({});
      return;
    }

    try {
      const state = await getRecordReadState();
      setBaselineAt(state.baselineAt);
      setReadTimestamps(
        Object.fromEntries(state.reads.map((entry) => [readKey(entry.entityType, entry.entityId), entry.lastSeenAt])),
      );
    } catch (error) {
      console.error("Failed to load record read state:", error);
    }
  }, [user]);

  useEffect(() => {
    void refreshRecordReadState();
  }, [refreshRecordReadState]);

  const isRecordUnread = useCallback(
    (entityType: RecordReadEntityType, entityId: string, activityAt: string | null | undefined) => {
      if (!baselineAt || !entityId || !activityAt) return false;

      const lastSeenAt = readTimestamps[readKey(entityType, entityId)] ?? baselineAt;
      return timestampToMillis(activityAt) > timestampToMillis(lastSeenAt);
    },
    [baselineAt, readTimestamps],
  );

  const markRecordRead = useCallback(
    async (entityType: RecordReadEntityType, entityId: string) => {
      if (!user || !entityId) return;

      try {
        const readEntry = await markRecordReadApi(entityType, entityId);
        setReadTimestamps((current) => ({
          ...current,
          [readKey(readEntry.entityType, readEntry.entityId)]: readEntry.lastSeenAt,
        }));
      } catch (error) {
        console.error("Failed to mark record as read:", error);
      }
    },
    [user],
  );

  const value = useMemo<RecordReadContextValue>(
    () => ({ isRecordUnread, markRecordRead, refreshRecordReadState }),
    [isRecordUnread, markRecordRead, refreshRecordReadState],
  );

  return <RecordReadContext.Provider value={value}>{children}</RecordReadContext.Provider>;
}

export function useRecordReadState() {
  const context = useContext(RecordReadContext);
  if (!context) {
    throw new Error("useRecordReadState must be used within RecordReadProvider");
  }
  return context;
}
