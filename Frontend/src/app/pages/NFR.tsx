import { useState, useEffect } from "react";
import { ArrowLeft, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown, Edit2, Save, Bookmark } from "lucide-react";
import { nfrs, cases, getLinkedCasesByEntity, addCaseLink, removeCaseLink, getNfrById, updateNfr, type HistoryEntry } from "../data/apiClient";
import { LinkedCasesList } from "../components/LinkedEntityCard";
import { RecordHistoryTimeline, formatHistoryEntryText } from "../components/RecordHistoryTimeline";
import { useLocation, useNavigate } from "react-router";
import { useSearch } from "../context/SearchContext";
import { useBookmarks } from "../context/BookmarksContext";
import { useToast } from "../context/ToastContext";
import { nfrStatusColors } from "../data/recordStyles";

export function NFR() {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const { addBookmark, removeBookmark, isBookmarked } = useBookmarks();
  const { searchTerm } = useSearch();
  const [selectedNfr, setSelectedNfr] = useState<typeof nfrs[0] | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedNfr, setEditedNfr] = useState<typeof nfrs[0] | null>(null);
  const [newComment, setNewComment] = useState("");
  const [selectedQuote, setSelectedQuote] = useState<HistoryEntry | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<"details" | "linked">("details");
  const [linkedCases, setLinkedCases] = useState<typeof cases>([]);
  const [linkingCaseId, setLinkingCaseId] = useState("");
  const [isLinkingCase, setIsLinkingCase] = useState(false);

  type LinkedReturnState = {
    returnTo?: {
      path: string;
      eventName: string;
      recordId: string;
    };
    previousState?: LinkedReturnState | null;
  };

  const [searchFilters, setSearchFilters] = useState({
    recordId: "",
    description: "",
    mantisId: "",
  });

  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({
    key: "",
    direction: null,
  });

  useEffect(() => {
    const handleOpenDetail = (event: any) => {
      const nfrId = event.detail;
      const nfr = getNfrById(nfrId);
      if (nfr) {
        setSelectedNfr(nfr);
        setActiveDetailTab("details");
      }
    };

    window.addEventListener('openNfrDetail', handleOpenDetail as EventListener);
    return () => window.removeEventListener('openNfrDetail', handleOpenDetail as EventListener);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadLinkedCases = async () => {
      if (!selectedNfr) {
        setLinkedCases([]);
        setLinkingCaseId("");
        return;
      }

      try {
        const linked = await getLinkedCasesByEntity("nfr", selectedNfr.recordId);
        if (!cancelled) {
          setLinkedCases(linked);
        }
      } catch (error) {
        console.error("Failed to load linked cases for NFR:", error);
        if (!cancelled) {
          setLinkedCases([]);
        }
      }
    };

    loadLinkedCases();
    return () => {
      cancelled = true;
    };
  }, [selectedNfr?.recordId]);

  const handleCaseClick = (caseId: string) => {
    if (!selectedNfr?.recordId) return;

    const state: LinkedReturnState = {
      returnTo: {
        path: '/nfr',
        eventName: 'openNfrDetail',
        recordId: selectedNfr.recordId,
      },
      previousState: (location.state as LinkedReturnState | null) ?? null,
    };

    navigate('/cases', { state });
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('openCaseDetail', { detail: caseId }));
    }, 100);
  };

  const handleLinkCase = async () => {
    if (!selectedNfr || !linkingCaseId) return;

    setIsLinkingCase(true);
    try {
      await addCaseLink(linkingCaseId, "nfr", selectedNfr.recordId);
      const linked = await getLinkedCasesByEntity("nfr", selectedNfr.recordId);
      setLinkedCases(linked);
      setLinkingCaseId("");
      showToast("Case linked successfully.", "success");
    } catch (error) {
      console.error("Failed to link case to NFR:", error);
      showToast("Failed to link case.", "error");
    } finally {
      setIsLinkingCase(false);
    }
  };

  const handleUnlinkCase = async (caseRecordId: string) => {
    if (!selectedNfr) return;

    setIsLinkingCase(true);
    try {
      await removeCaseLink(caseRecordId, "nfr", selectedNfr.recordId);
      const linked = await getLinkedCasesByEntity("nfr", selectedNfr.recordId);
      setLinkedCases(linked);
      showToast("Case unlinked successfully.", "success");
    } catch (error) {
      console.error("Failed to unlink case from NFR:", error);
      showToast("Failed to unlink case.", "error");
    } finally {
      setIsLinkingCase(false);
    }
  };

  const handleBackFromDetail = () => {
    const navState = (location.state as LinkedReturnState | null) ?? null;
    if (navState?.returnTo) {
      navigate(navState.returnTo.path, { state: navState.previousState ?? null });
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent(navState.returnTo!.eventName, { detail: navState.returnTo!.recordId }));
      }, 100);
      return;
    }

    setSelectedNfr(null);
  };

  const handleEdit = () => {
    if (selectedNfr) {
      setEditedNfr({ ...selectedNfr });
      setIsEditing(true);
    }
  };

  const handleSave = async () => {
    if (!editedNfr) return;

    try {
      const saved = await updateNfr(editedNfr.recordId, {
        description: editedNfr.description,
        mantisId: editedNfr.mantisId,
        mantisUrl: editedNfr.mantisUrl,
        nfrStatus: editedNfr.nfrStatus,
        nfrRequestDate: editedNfr.nfrRequestDate,
        nfrTargetDate: editedNfr.nfrTargetDate,
        metaData: editedNfr.metaData,
      });

      const index = nfrs.findIndex((nfr) => nfr.recordId === saved.recordId);
      if (index >= 0) {
        nfrs[index] = saved;
      }

      setSelectedNfr(saved);
      setEditedNfr(saved);
      setIsEditing(false);
      showToast("Changes saved successfully!", "success");
    } catch (error) {
      console.error("Failed to save NFR:", error);
      showToast("Failed to save changes. Please try again.", "error");
    }
  };

  const handleCancelEdit = () => {
    setEditedNfr(null);
    setIsEditing(false);
  };

  const handleAddComment = () => {
    if (selectedNfr && newComment.trim()) {
      const timestamp = new Date().toLocaleString("sv-SE", { hour12: false }).replace(",", "");
      const quoteText = selectedQuote
        ? `[Quoted reply to ${selectedQuote.user} (${selectedQuote.timestamp})]\n${formatHistoryEntryText(selectedQuote)}`
        : null;

      const newHistoryEntry = {
        timestamp,
        user: "Current User",
        action: "Comment",
        changes: quoteText ? `${quoteText}\n\n${newComment.trim()}` : newComment.trim(),
      };

      const updatedNfr = {
        ...selectedNfr,
        history: [...(selectedNfr.history || []), newHistoryEntry],
      };

      setSelectedNfr(updatedNfr);
      setNewComment("");
      setSelectedQuote(null);
    }
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' | null = 'asc';
    if (sortConfig.key === key) {
      if (sortConfig.direction === 'asc') {
        direction = 'desc';
      } else if (sortConfig.direction === 'desc') {
        direction = null;
      }
    }
    setSortConfig({ key, direction });
  };

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  const filteredNfrs = nfrs.filter((nfr) => {
    if (normalizedSearchTerm) {
      const matchesGlobalSearch = [
        nfr.recordId,
        nfr.description,
        nfr.mantisId,
        nfr.mantisUrl,
        nfr.nfrStatus,
      ].some((value) => (value ?? "").toLowerCase().includes(normalizedSearchTerm));

      if (!matchesGlobalSearch) return false;
    }

    if (searchFilters.recordId && !nfr.recordId.toLowerCase().includes(searchFilters.recordId.toLowerCase())) return false;
    if (searchFilters.description && !nfr.description.toLowerCase().includes(searchFilters.description.toLowerCase())) return false;
    if (searchFilters.mantisId && !nfr.mantisId.toLowerCase().includes(searchFilters.mantisId.toLowerCase())) return false;
    return true;
  });

  const sortedNfrs = [...filteredNfrs].sort((a, b) => {
    if (!sortConfig.direction) return 0;

    let aValue: any = a[sortConfig.key as keyof typeof a] || "";
    let bValue: any = b[sortConfig.key as keyof typeof b] || "";

    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const availableCases = cases.filter((caseItem) => !linkedCases.some((linkedCase) => linkedCase.recordId === caseItem.recordId));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">NFR (New Feature Requests)</h1>
        <p className="text-gray-600 mt-1">Track new feature requests and enhancements</p>
      </div>

      <div className={`bg-white rounded-xl shadow-sm border border-gray-200 ${selectedNfr ? "hidden" : ""}`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 w-12">
                  <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">★</span>
                </th>
                <th className="text-left px-6 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Record ID</span>
                    <button onClick={() => handleSort("recordId")} className="text-gray-400 hover:text-gray-600">
                      {sortConfig.key === "recordId" ? (
                        sortConfig.direction === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                      ) : (
                        <ArrowUpDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchFilters.recordId}
                    onChange={(e) => setSearchFilters({ ...searchFilters, recordId: e.target.value })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#E31937]"
                    onClick={(e) => e.stopPropagation()}
                  />
                </th>
                <th className="text-left px-6 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Description</span>
                    <button onClick={() => handleSort("description")} className="text-gray-400 hover:text-gray-600">
                      {sortConfig.key === "description" ? (
                        sortConfig.direction === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                      ) : (
                        <ArrowUpDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchFilters.description}
                    onChange={(e) => setSearchFilters({ ...searchFilters, description: e.target.value })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#E31937]"
                    onClick={(e) => e.stopPropagation()}
                  />
                </th>
                <th className="text-left px-6 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Mantis ID</span>
                    <button onClick={() => handleSort("mantisId")} className="text-gray-400 hover:text-gray-600">
                      {sortConfig.key === "mantisId" ? (
                        sortConfig.direction === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                      ) : (
                        <ArrowUpDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchFilters.mantisId}
                    onChange={(e) => setSearchFilters({ ...searchFilters, mantisId: e.target.value })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#E31937]"
                    onClick={(e) => e.stopPropagation()}
                  />
                </th>
                <th className="text-left px-6 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Status</span>
                    <button onClick={() => handleSort("nfrStatus")} className="text-gray-400 hover:text-gray-600">
                      {sortConfig.key === "nfrStatus" ? (
                        sortConfig.direction === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                      ) : (
                        <ArrowUpDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </th>
                <th className="text-left px-6 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Request Date</span>
                    <button onClick={() => handleSort("nfrRequestDate")} className="text-gray-400 hover:text-gray-600">
                      {sortConfig.key === "nfrRequestDate" ? (
                        sortConfig.direction === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                      ) : (
                        <ArrowUpDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </th>
                <th className="text-left px-6 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Target Date</span>
                    <button onClick={() => handleSort("nfrTargetDate")} className="text-gray-400 hover:text-gray-600">
                      {sortConfig.key === "nfrTargetDate" ? (
                        sortConfig.direction === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                      ) : (
                        <ArrowUpDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedNfrs.map((nfr) => (
                <tr
                  key={nfr.recordId}
                  onClick={() => {
                    setSelectedNfr(nfr);
                    setActiveDetailTab("details");
                  }}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isBookmarked(nfr.recordId, 'nfr')) {
                          removeBookmark(nfr.recordId, 'nfr');
                        } else {
                          addBookmark({
                            id: nfr.recordId,
                            type: 'nfr',
                            title: nfr.description,
                            subtitle: nfr.nfrStatus,
                            timestamp: Date.now(),
                          });
                        }
                      }}
                      className="text-gray-400 hover:text-yellow-500 transition-colors"
                      title="Bookmark"
                    >
                      <Bookmark className={`w-5 h-5 ${isBookmarked(nfr.recordId, 'nfr') ? 'fill-yellow-400 text-yellow-500' : ''}`} />
                    </button>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-[#E31937] whitespace-nowrap">{nfr.recordId}</td>
                  <td className="px-6 py-4 text-sm text-gray-900 max-w-md truncate whitespace-nowrap" title={nfr.description}>
                    {nfr.description}
                  </td>
                  <td className="px-6 py-4 text-sm text-[#E31937] hover:underline whitespace-nowrap">{nfr.mantisId}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-medium ${nfrStatusColors[nfr.nfrStatus]}`}>
                      {nfr.nfrStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">{nfr.nfrRequestDate}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">{nfr.nfrTargetDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedNfr && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="w-full">
            <div className="sticky top-[-1.5rem] z-10 bg-white border-b border-gray-200 p-6 flex items-center justify-between rounded-t-xl">
              <h2 className="text-xl font-semibold text-gray-900">NFR Details</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (isBookmarked(selectedNfr!.recordId, 'nfr')) {
                      removeBookmark(selectedNfr!.recordId, 'nfr');
                    } else {
                      addBookmark({
                        id: selectedNfr!.recordId,
                        type: 'nfr',
                        title: selectedNfr!.description,
                        subtitle: selectedNfr!.nfrStatus,
                        timestamp: Date.now(),
                      });
                    }
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    isBookmarked(selectedNfr!.recordId, 'nfr')
                      ? 'bg-yellow-100 text-yellow-600'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  title="Bookmark this NFR"
                >
                  <Bookmark className={`w-5 h-5 ${isBookmarked(selectedNfr!.recordId, 'nfr') ? 'fill-current' : ''}`} />
                </button>
                {isEditing ? (
                  <>
                    <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-[#E31937] text-white rounded-lg hover:bg-[#c41230] transition-colors">
                      <Save className="w-4 h-4" />
                      Save
                    </button>
                    <button onClick={handleCancelEdit} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                      Cancel
                    </button>
                  </>
                ) : (
                  <button onClick={handleEdit} className="flex items-center gap-2 px-4 py-2 bg-[#E31937] text-white rounded-lg hover:bg-[#c41230] transition-colors">
                    <Edit2 className="w-4 h-4" />
                    Edit
                  </button>
                )}
                <button onClick={handleBackFromDetail} className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
              </div>
            </div>

            <div className="p-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="xl:col-span-2 space-y-6">
              <div className="border-b border-gray-200 pb-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveDetailTab("details")}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      activeDetailTab === "details"
                        ? "bg-[#E31937] text-white"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    Details
                  </button>
                  <button
                    onClick={() => setActiveDetailTab("linked")}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      activeDetailTab === "linked"
                        ? "bg-[#E31937] text-white"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    Linked Entities
                  </button>
                </div>
              </div>

              <div className={activeDetailTab === "details" ? "grid grid-cols-2 gap-4" : "hidden"}>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Record ID</label>
                  <p className="text-gray-900">{selectedNfr.recordId}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Mantis ID</label>
                  {isEditing && editedNfr ? (
                    <input
                      type="text"
                      value={editedNfr.mantisId}
                      onChange={(e) => setEditedNfr({ ...editedNfr, mantisId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedNfr.mantisId}</p>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Description</label>
                  {isEditing && editedNfr ? (
                    <textarea
                      value={editedNfr.description}
                      onChange={(e) => setEditedNfr({ ...editedNfr, description: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedNfr.description}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Status</label>
                  {isEditing && editedNfr ? (
                    <select
                      value={editedNfr.nfrStatus}
                      onChange={(e) => setEditedNfr({ ...editedNfr, nfrStatus: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="Pending">Pending</option>
                      <option value="In Review">In Review</option>
                      <option value="Approved">Approved</option>
                      <option value="Rejected">Rejected</option>
                      <option value="Implemented">Implemented</option>
                    </select>
                  ) : (
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${nfrStatusColors[selectedNfr.nfrStatus]}`}>
                      {selectedNfr.nfrStatus}
                    </span>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Mantis URL</label>
                  {isEditing && editedNfr ? (
                    <input
                      type="url"
                      value={editedNfr.mantisUrl}
                      onChange={(e) => setEditedNfr({ ...editedNfr, mantisUrl: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <a href={selectedNfr.mantisUrl} target="_blank" rel="noopener noreferrer" className="text-[#E31937] hover:underline flex items-center gap-1">
                      View in Mantis
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Request Date</label>
                  {isEditing && editedNfr ? (
                    <input
                      type="date"
                      value={editedNfr.nfrRequestDate}
                      onChange={(e) => setEditedNfr({ ...editedNfr, nfrRequestDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedNfr.nfrRequestDate}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Target Date</label>
                  {isEditing && editedNfr ? (
                    <input
                      type="date"
                      value={editedNfr.nfrTargetDate}
                      onChange={(e) => setEditedNfr({ ...editedNfr, nfrTargetDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedNfr.nfrTargetDate}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Created At</label>
                  <p className="text-gray-900">{selectedNfr.createdAt}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Updated At</label>
                  <p className="text-gray-900">{selectedNfr.updatedAt}</p>
                </div>
              </div>

              <div className={activeDetailTab === "linked" ? "pt-1" : "hidden"}>
                <h3 className="font-semibold text-lg text-gray-900 mb-4">Related Data</h3>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3 mb-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Link case</label>
                      <select
                        value={linkingCaseId}
                        onChange={(e) => setLinkingCaseId(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                      >
                        <option value="">Select a case</option>
                        {availableCases.map((caseItem) => (
                          <option key={caseItem.recordId} value={caseItem.recordId}>
                            {caseItem.recordId} - {caseItem.description}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={handleLinkCase}
                      disabled={!linkingCaseId || isLinkingCase}
                      className="px-4 py-2 bg-[#E31937] text-white rounded-lg hover:bg-[#c41230] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Link Case
                    </button>
                  </div>
                </div>

                <LinkedCasesList cases={linkedCases} onCaseClick={handleCaseClick} onRemoveCase={handleUnlinkCase} />
              </div>

              </div>

              <div className="xl:col-span-1">
                <div className="xl:sticky xl:top-24 border border-gray-200 rounded-lg bg-white p-4 max-h-[60vh] overflow-y-auto">
              <div className="pt-0">
                <h3 className="font-semibold text-lg text-gray-900 mb-4">History</h3>
                <RecordHistoryTimeline history={selectedNfr.history} onQuote={setSelectedQuote} />

                <div className="border-t border-gray-200 pt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Add Comment</label>
                  {selectedQuote && (
                    <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3 border-l-4 border-l-[#6264A7]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-gray-500 font-medium">
                          Replying to {selectedQuote.user} - {selectedQuote.timestamp}
                        </p>
                        <button
                          onClick={() => setSelectedQuote(null)}
                          className="text-xs text-[#6264A7] hover:underline"
                        >
                          Clear quote
                        </button>
                      </div>
                      <p className="text-sm text-gray-700 mt-1 line-clamp-3">{formatHistoryEntryText(selectedQuote)}</p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Enter your comment..."
                      rows={3}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={handleAddComment}
                      disabled={!newComment.trim()}
                      className="px-4 py-2 bg-[#E31937] text-white rounded-lg hover:bg-[#c41230] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Add Comment
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
          </div>
        </div>
      )}
    </div>
  );
}
