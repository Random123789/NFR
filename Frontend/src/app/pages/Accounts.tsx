import { useState, useEffect } from "react";
import { ArrowLeft, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown, Edit2, Save, Bookmark } from "lucide-react";
import { accounts, cases, getLinkedCasesByEntity, addCaseLink, removeCaseLink, getProjectsByAccountId, getCaseById, updateAccount, type HistoryEntry } from "../data/apiClient";
import { LinkedCasesList } from "../components/LinkedEntityCard";
import { RecordHistoryTimeline, formatHistoryEntryText } from "../components/RecordHistoryTimeline";
import { useLocation, useNavigate } from "react-router";
import { useSearch } from "../context/SearchContext";
import { useBookmarks } from "../context/BookmarksContext";
import { useToast } from "../context/ToastContext";

export function Accounts() {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const { searchTerm } = useSearch();
  const { addBookmark, removeBookmark, isBookmarked } = useBookmarks();
  const [selectedAccount, setSelectedAccount] = useState<typeof accounts[0] | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedAccount, setEditedAccount] = useState<typeof accounts[0] | null>(null);
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
    moduleId: "",
    accountName: "",
    type: "",
    vertical: "",
  });

  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({
    key: "",
    direction: null,
  });

  useEffect(() => {
    const handleOpenDetail = (event: any) => {
      const accountId = event.detail;
      const account = accounts.find(a => a.recordId === accountId);
      if (account) {
        setSelectedAccount(account);
        setActiveDetailTab("details");
      }
    };

    window.addEventListener('openAccountDetail', handleOpenDetail as EventListener);
    return () => window.removeEventListener('openAccountDetail', handleOpenDetail as EventListener);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadLinkedCases = async () => {
      if (!selectedAccount) {
        setLinkedCases([]);
        setLinkingCaseId("");
        return;
      }

      try {
        const linked = await getLinkedCasesByEntity("account", selectedAccount.recordId);
        if (!cancelled) {
          setLinkedCases(linked);
        }
      } catch (error) {
        console.error("Failed to load linked cases for account:", error);
        if (!cancelled) {
          setLinkedCases([]);
        }
      }
    };

    loadLinkedCases();
    return () => {
      cancelled = true;
    };
  }, [selectedAccount?.recordId]);

  const handleCaseClick = (caseId: string) => {
    if (!selectedAccount?.recordId) return;

    const state: LinkedReturnState = {
      returnTo: {
        path: '/accounts',
        eventName: 'openAccountDetail',
        recordId: selectedAccount.recordId,
      },
      previousState: (location.state as LinkedReturnState | null) ?? null,
    };

    navigate('/cases', { state });
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('openCaseDetail', { detail: caseId }));
    }, 100);
  };

  const handleProjectClick = (projectId: string) => {
    if (!selectedAccount?.recordId) return;

    const state: LinkedReturnState = {
      returnTo: {
        path: '/accounts',
        eventName: 'openAccountDetail',
        recordId: selectedAccount.recordId,
      },
      previousState: (location.state as LinkedReturnState | null) ?? null,
    };

    navigate('/projects', { state });
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('openProjectDetail', { detail: projectId }));
    }, 100);
  };

  const handleLinkCase = async () => {
    if (!selectedAccount || !linkingCaseId) return;

    setIsLinkingCase(true);
    try {
      await addCaseLink(linkingCaseId, "account", selectedAccount.recordId);
      const linked = await getLinkedCasesByEntity("account", selectedAccount.recordId);
      setLinkedCases(linked);
      setLinkingCaseId("");
      showToast("Case linked successfully.", "success");
    } catch (error) {
      console.error("Failed to link case to account:", error);
      showToast("Failed to link case.", "error");
    } finally {
      setIsLinkingCase(false);
    }
  };

  const handleUnlinkCase = async (caseRecordId: string) => {
    if (!selectedAccount) return;

    setIsLinkingCase(true);
    try {
      await removeCaseLink(caseRecordId, "account", selectedAccount.recordId);
      const linked = await getLinkedCasesByEntity("account", selectedAccount.recordId);
      setLinkedCases(linked);
      showToast("Case unlinked successfully.", "success");
    } catch (error) {
      console.error("Failed to unlink case from account:", error);
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

    setSelectedAccount(null);
    setIsEditing(false);
    setEditedAccount(null);
  };

  const handleEdit = () => {
    if (selectedAccount) {
      setEditedAccount({ ...selectedAccount });
      setIsEditing(true);
    }
  };

  const handleSave = async () => {
    if (!editedAccount) return;

    try {
      const saved = await updateAccount(editedAccount.recordId, {
        accountName: editedAccount.accountName,
        website: editedAccount.website,
        type: editedAccount.type,
        vertical: editedAccount.vertical,
        metaData: editedAccount.metaData,
      });

      const index = accounts.findIndex((a) => a.recordId === saved.recordId);
      if (index >= 0) {
        accounts[index] = saved;
      }

      setSelectedAccount(saved);
      setEditedAccount(saved);
      setIsEditing(false);
      showToast("Changes saved successfully!", "success");
    } catch (error) {
      console.error("Failed to save account:", error);
      showToast("Failed to save changes. Please try again.", "error");
    }
  };

  const handleCancelEdit = () => {
    setEditedAccount(null);
    setIsEditing(false);
  };

  const handleAddComment = () => {
    if (selectedAccount && newComment.trim()) {
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

      const updatedAccount = {
        ...selectedAccount,
        history: [...(selectedAccount.history || []), newHistoryEntry],
      };

      setSelectedAccount(updatedAccount);
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

  const filteredAccounts = accounts.filter((account) => {
    if (normalizedSearchTerm) {
      const matchesGlobalSearch = [
        account.recordId,
        account.accountName,
        account.type,
        account.vertical,
        account.website,
        account.ownedBy,
      ].some((value) => (value ?? "").toLowerCase().includes(normalizedSearchTerm));

      if (!matchesGlobalSearch) return false;
    }

    if (searchFilters.recordId && !account.recordId.toLowerCase().includes(searchFilters.recordId.toLowerCase())) return false;
    if (searchFilters.moduleId && !account.moduleId.toLowerCase().includes(searchFilters.moduleId.toLowerCase())) return false;
    if (searchFilters.accountName && !account.accountName.toLowerCase().includes(searchFilters.accountName.toLowerCase())) return false;
    if (searchFilters.type && !account.type.toLowerCase().includes(searchFilters.type.toLowerCase())) return false;
    if (searchFilters.vertical && !account.vertical.toLowerCase().includes(searchFilters.vertical.toLowerCase())) return false;
    return true;
  });

  const sortedAccounts = [...filteredAccounts].sort((a, b) => {
    if (!sortConfig.direction) return 0;

    let aValue: any = a[sortConfig.key as keyof typeof a] || "";
    let bValue: any = b[sortConfig.key as keyof typeof b] || "";

    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const relatedCases = linkedCases;
  const relatedProjects = selectedAccount ? getProjectsByAccountId(selectedAccount.recordId) : [];
  const availableCases = cases.filter((caseItem) => !linkedCases.some((linkedCase) => linkedCase.recordId === caseItem.recordId));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Customer Accounts</h1>
        <p className="text-gray-600 mt-1">Manage Fortinet customer accounts and organizations</p>
      </div>

      <div className={`bg-white rounded-xl shadow-sm border border-gray-200 ${selectedAccount ? "hidden" : ""}`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">                <th className="text-left px-4 py-3 w-12">
                  <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">★</span>
                </th>                <th className="text-left px-6 py-3">
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
                    <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Account Name</span>
                    <button onClick={() => handleSort("accountName")} className="text-gray-400 hover:text-gray-600">
                      {sortConfig.key === "accountName" ? (
                        sortConfig.direction === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                      ) : (
                        <ArrowUpDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchFilters.accountName}
                    onChange={(e) => setSearchFilters({ ...searchFilters, accountName: e.target.value })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#E31937]"
                    onClick={(e) => e.stopPropagation()}
                  />
                </th>
                <th className="text-left px-6 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Type</span>
                    <button onClick={() => handleSort("type")} className="text-gray-400 hover:text-gray-600">
                      {sortConfig.key === "type" ? (
                        sortConfig.direction === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                      ) : (
                        <ArrowUpDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchFilters.type}
                    onChange={(e) => setSearchFilters({ ...searchFilters, type: e.target.value })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#E31937]"
                    onClick={(e) => e.stopPropagation()}
                  />
                </th>
                <th className="text-left px-6 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Vertical</span>
                    <button onClick={() => handleSort("vertical")} className="text-gray-400 hover:text-gray-600">
                      {sortConfig.key === "vertical" ? (
                        sortConfig.direction === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                      ) : (
                        <ArrowUpDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchFilters.vertical}
                    onChange={(e) => setSearchFilters({ ...searchFilters, vertical: e.target.value })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#E31937]"
                    onClick={(e) => e.stopPropagation()}
                  />
                </th>
                <th className="text-left px-6 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Website</span>
                    <button onClick={() => handleSort("website")} className="text-gray-400 hover:text-gray-600">
                      {sortConfig.key === "website" ? (
                        sortConfig.direction === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                      ) : (
                        <ArrowUpDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </th>
                <th className="text-left px-6 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Updated At</span>
                    <button onClick={() => handleSort("updatedAt")} className="text-gray-400 hover:text-gray-600">
                      {sortConfig.key === "updatedAt" ? (
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
              {sortedAccounts.map((account) => (
                <tr
                  key={account.recordId}
                  onClick={() => {
                    setSelectedAccount(account);
                    setActiveDetailTab("details");
                  }}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >                  <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isBookmarked(account.recordId, 'account')) {
                          removeBookmark(account.recordId, 'account');
                        } else {
                          addBookmark({
                            id: account.recordId,
                            type: 'account',
                            title: account.accountName,
                            subtitle: account.vertical,
                            timestamp: Date.now(),
                          });
                        }
                      }}
                      className="text-gray-400 hover:text-yellow-500 transition-colors"
                      title="Bookmark"
                    >
                      <Bookmark className={`w-5 h-5 ${isBookmarked(account.recordId, 'account') ? 'fill-yellow-400 text-yellow-500' : ''}`} />
                    </button>
                  </td>                  <td className="px-6 py-4 text-sm font-medium text-[#E31937]">{account.recordId}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{account.accountName}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{account.type}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{account.vertical}</td>
                  <td className="px-6 py-4 text-sm">
                    <a href={account.website} target="_blank" rel="noopener noreferrer" className="text-[#E31937] hover:underline flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {account.website}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{account.updatedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedAccount && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="w-full">
            <div className="sticky top-[-1.5rem] z-10 bg-white border-b border-gray-200 p-6 flex items-center justify-between rounded-t-xl">
              <h2 className="text-xl font-semibold text-gray-900">Account Details</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (isBookmarked(selectedAccount!.recordId, 'account')) {
                      removeBookmark(selectedAccount!.recordId, 'account');
                    } else {
                      addBookmark({
                        id: selectedAccount!.recordId,
                        type: 'account',
                        title: selectedAccount!.accountName,
                        subtitle: selectedAccount!.vertical,
                        timestamp: Date.now(),
                      });
                    }
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    isBookmarked(selectedAccount!.recordId, 'account')
                      ? 'bg-yellow-100 text-yellow-600'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  title="Bookmark this account"
                >
                  <Bookmark className={`w-5 h-5 ${isBookmarked(selectedAccount!.recordId, 'account') ? 'fill-current' : ''}`} />
                </button>
                {!isEditing ? (
                  <button
                    onClick={handleEdit}
                    className="flex items-center gap-2 px-4 py-2 bg-[#E31937] text-white rounded-lg hover:bg-[#c41230] transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleCancelEdit}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      className="flex items-center gap-2 px-4 py-2 bg-[#E31937] text-white rounded-lg hover:bg-[#c41230] transition-colors"
                    >
                      <Save className="w-4 h-4" />
                      Save
                    </button>
                  </>
                )}
                <button
                  onClick={handleBackFromDetail}
                  className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
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
                  {isEditing && editedAccount ? (
                    <input
                      type="text"
                      value={editedAccount.recordId}
                      onChange={(e) => setEditedAccount({ ...editedAccount, recordId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedAccount.recordId}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Module ID</label>
                  {isEditing && editedAccount ? (
                    <input
                      type="text"
                      value={editedAccount.moduleId}
                      onChange={(e) => setEditedAccount({ ...editedAccount, moduleId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedAccount.moduleId}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Account Name</label>
                  {isEditing && editedAccount ? (
                    <input
                      type="text"
                      value={editedAccount.accountName}
                      onChange={(e) => setEditedAccount({ ...editedAccount, accountName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900 font-medium">{selectedAccount.accountName}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Type</label>
                  {isEditing && editedAccount ? (
                    <select
                      value={editedAccount.type}
                      onChange={(e) => setEditedAccount({ ...editedAccount, type: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="Enterprise">Enterprise</option>
                      <option value="Mid-Market">Mid-Market</option>
                      <option value="Startup">Startup</option>
                    </select>
                  ) : (
                    <p className="text-gray-900">{selectedAccount.type}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Vertical</label>
                  {isEditing && editedAccount ? (
                    <input
                      type="text"
                      value={editedAccount.vertical}
                      onChange={(e) => setEditedAccount({ ...editedAccount, vertical: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedAccount.vertical}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Owned By</label>
                  {isEditing && editedAccount ? (
                    <input
                      type="text"
                      value={editedAccount.ownedBy}
                      onChange={(e) => setEditedAccount({ ...editedAccount, ownedBy: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedAccount.ownedBy}</p>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Website</label>
                  {isEditing && editedAccount ? (
                    <input
                      type="text"
                      value={editedAccount.website}
                      onChange={(e) => setEditedAccount({ ...editedAccount, website: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <a href={selectedAccount.website} target="_blank" rel="noopener noreferrer" className="text-[#E31937] hover:underline flex items-center gap-1">
                      {selectedAccount.website}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Created At</label>
                  {isEditing && editedAccount ? (
                    <input
                      type="date"
                      value={editedAccount.createdAt}
                      onChange={(e) => setEditedAccount({ ...editedAccount, createdAt: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedAccount.createdAt}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Created By</label>
                  {isEditing && editedAccount ? (
                    <input
                      type="text"
                      value={editedAccount.createdBy}
                      onChange={(e) => setEditedAccount({ ...editedAccount, createdBy: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedAccount.createdBy}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Updated At</label>
                  {isEditing && editedAccount ? (
                    <input
                      type="date"
                      value={editedAccount.updatedAt}
                      onChange={(e) => setEditedAccount({ ...editedAccount, updatedAt: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedAccount.updatedAt}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Updated By</label>
                  {isEditing && editedAccount ? (
                    <input
                      type="text"
                      value={editedAccount.updatedBy}
                      onChange={(e) => setEditedAccount({ ...editedAccount, updatedBy: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedAccount.updatedBy}</p>
                  )}
                </div>
              </div>

              <div className={activeDetailTab === "linked" ? "pt-1" : "hidden"}>
                <h3 className="font-semibold text-lg text-gray-900 mb-4">Related Data</h3>
                <div className="space-y-4">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
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

                  {relatedProjects.length > 0 ? (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="font-medium text-gray-900 mb-3">Related Projects ({relatedProjects.length})</h3>
                      <div className="space-y-2">
                        {relatedProjects.map((project) => (
                          <div
                            key={project.recordId}
                            className="bg-white rounded p-3 hover:shadow-sm transition-shadow cursor-pointer"
                            onClick={() => handleProjectClick(project.recordId)}
                          >
                            <div className="text-sm font-medium text-[#E31937] mb-1">{project.recordId}</div>
                            <div className="text-sm text-gray-900">{project.projectName}</div>
                            <div className="text-xs text-gray-500 mt-1">
                              Stage: {project.stage} | Value: {project.sfdcValue}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="font-medium text-gray-900 mb-2">Related Projects</h3>
                      <p className="text-sm text-gray-500">No related projects</p>
                    </div>
                  )}
                </div>
              </div>

              </div>

              <div className="xl:col-span-1">
                <div className="xl:sticky xl:top-24 border border-gray-200 rounded-lg bg-white p-4 max-h-[60vh] overflow-y-auto">
              <div className="pt-0">
                <h3 className="font-semibold text-lg text-gray-900 mb-4">History</h3>
                <RecordHistoryTimeline history={selectedAccount.history} onQuote={setSelectedQuote} />

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
