import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  createReturnDetailState,
  getOpenDetailRecordId,
  type DetailEntityType,
  type DetailRouteState,
} from "../navigation/detailNavigation";

type RecordWithId = {
  recordId: string;
};

export type DetailTab = string;

export function useRoutedEntityDetail<T extends RecordWithId>({
  entityType,
  getRecordById,
}: {
  entityType: DetailEntityType;
  getRecordById: (recordId: string) => T | undefined;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedRecord, setSelectedRecord] = useState<T | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedRecord, setEditedRecord] = useState<T | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>("details");
  const lastLocationKeyRef = useRef(location.key);
  const lastRouteSelectionKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const recordId = getOpenDetailRecordId(location.state, entityType);
    if (!recordId) {
      if (lastLocationKeyRef.current !== location.key) {
        setSelectedRecord(null);
        setActiveDetailTab("details");
        setIsEditing(false);
        setEditedRecord(null);
        lastRouteSelectionKeyRef.current = null;
      }
      lastLocationKeyRef.current = location.key;
      return;
    }

    const record = getRecordById(recordId);
    if (record) {
      const routeSelectionKey = `${location.key}:${entityType}:${recordId}`;
      const isNewRouteSelection = lastRouteSelectionKeyRef.current !== routeSelectionKey;

      setSelectedRecord(record);
      if (isNewRouteSelection) {
        setActiveDetailTab("details");
        setIsEditing(false);
        setEditedRecord(null);
        lastRouteSelectionKeyRef.current = routeSelectionKey;
      }
    }
    lastLocationKeyRef.current = location.key;
  }, [entityType, getRecordById, location.key, location.state]);

  const selectRecord = (record: T) => {
    setSelectedRecord(record);
    setActiveDetailTab("details");
    setIsEditing(false);
    setEditedRecord(null);
  };

  const handleBackFromDetail = () => {
    const navState = (location.state as DetailRouteState | null) ?? null;
    if (navState?.returnTo) {
      navigate(navState.returnTo.path, {
        state: createReturnDetailState(navState.returnTo, navState.previousState ?? null),
      });
      return;
    }

    setSelectedRecord(null);
    setIsEditing(false);
    setEditedRecord(null);
  };

  const handleEdit = () => {
    if (selectedRecord) {
      setEditedRecord({ ...selectedRecord });
      setIsEditing(true);
    }
  };

  const handleCancelEdit = () => {
    setEditedRecord(null);
    setIsEditing(false);
  };

  const applySavedRecord = (record: T) => {
    setSelectedRecord(record);
    setEditedRecord(record);
    setIsEditing(false);
  };

  return {
    selectedRecord,
    setSelectedRecord,
    selectRecord,
    isEditing,
    editedRecord,
    setEditedRecord,
    activeDetailTab,
    setActiveDetailTab,
    handleBackFromDetail,
    handleEdit,
    handleCancelEdit,
    applySavedRecord,
  };
}
