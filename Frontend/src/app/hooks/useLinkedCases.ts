import { useEffect, useMemo, useState } from "react";
import {
  addCaseLink,
  getLinkedCasesByEntity,
  removeCaseLink,
  type CaseLinkEntityType,
  type CaseRecord,
} from "../data/apiClient";

type UseLinkedCasesOptions = {
  entityType: CaseLinkEntityType;
  entityRecordId: string | null | undefined;
  cases: CaseRecord[];
  entityLabel: string;
  showToast: (message: string, type?: "success" | "error" | "info" | "warning") => void;
};

export function useLinkedCases({
  entityType,
  entityRecordId,
  cases,
  entityLabel,
  showToast,
}: UseLinkedCasesOptions) {
  const [linkedCases, setLinkedCases] = useState<CaseRecord[]>([]);
  const [linkingCaseId, setLinkingCaseId] = useState("");
  const [isLinkingCase, setIsLinkingCase] = useState(false);

  const loadLinkedCases = async (cancelled?: () => boolean) => {
    if (!entityRecordId) {
      setLinkedCases([]);
      setLinkingCaseId("");
      return;
    }

    try {
      const linked = await getLinkedCasesByEntity(entityType, entityRecordId);
      if (!cancelled?.()) {
        setLinkedCases(linked);
      }
    } catch (error) {
      console.error(`Failed to load linked cases for ${entityLabel}:`, error);
      if (!cancelled?.()) {
        setLinkedCases([]);
      }
    }
  };

  useEffect(() => {
    let cancelled = false;
    void loadLinkedCases(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [entityRecordId, entityType]);

  const availableCases = useMemo(
    () => cases.filter((caseItem) => !linkedCases.some((linkedCase) => linkedCase.recordId === caseItem.recordId)),
    [cases, linkedCases],
  );

  const linkCase = async (caseRecordId: string) => {
    if (!entityRecordId || !caseRecordId) return;

    setIsLinkingCase(true);
    try {
      await addCaseLink(caseRecordId, entityType, entityRecordId);
      await loadLinkedCases();
      setLinkingCaseId("");
      showToast("Case linked successfully.", "success");
    } catch (error) {
      console.error(`Failed to link case to ${entityLabel}:`, error);
      showToast("Failed to link case.", "error");
    } finally {
      setIsLinkingCase(false);
    }
  };

  const handleLinkCase = async () => {
    await linkCase(linkingCaseId);
  };

  const handleUnlinkCase = async (caseRecordId: string) => {
    if (!entityRecordId) return;

    setIsLinkingCase(true);
    try {
      await removeCaseLink(caseRecordId, entityType, entityRecordId);
      await loadLinkedCases();
      showToast("Case unlinked successfully.", "success");
    } catch (error) {
      console.error(`Failed to unlink case from ${entityLabel}:`, error);
      showToast("Failed to unlink case.", "error");
    } finally {
      setIsLinkingCase(false);
    }
  };

  return {
    linkedCases,
    linkingCaseId,
    setLinkingCaseId,
    isLinkingCase,
    availableCases,
    linkCase,
    handleLinkCase,
    handleUnlinkCase,
  };
}
