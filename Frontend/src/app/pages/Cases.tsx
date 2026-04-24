import { useState, useEffect } from "react";
import { ChevronDown, X, ArrowUpDown, ArrowUp, ArrowDown, Edit2, Save, Bookmark } from "lucide-react";
import { cases, getAccountById, getProductById, getProjectById, getNfrById, getNfrByMantisId, getKnockById, getKnockByKnockId, getCaseById, updateCase } from "../data/apiClient";
import { LinkedEntityCard } from "../components/LinkedEntityCard";
import { useNavigate } from "react-router";
import { useSearch } from "../context/SearchContext";
import { useBookmarks } from "../context/BookmarksContext";
import { casePriorityColors, caseStatusColors } from "../data/recordStyles";

export function Cases() {
  const navigate = useNavigate();
  const { searchTerm } = useSearch();
  const { addBookmark, removeBookmark, isBookmarked } = useBookmarks();
  const [selectedCase, setSelectedCase] = useState<typeof cases[0] | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedCase, setEditedCase] = useState<typeof cases[0] | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [priorityFilter, setPriorityFilter] = useState<string>("All");
  const [newComment, setNewComment] = useState("");

  const [searchFilters, setSearchFilters] = useState({
    recordId: "",
    moduleId: "",
    description: "",
    account: "",
    product: "",
    caseOwner: "",
    seOwner: "",
  });

  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({
    key: "",
    direction: null,
  });

  useEffect(() => {
    const handleOpenDetail = (event: any) => {
      const caseId = event.detail;
      const caseData = getCaseById(caseId);
      if (caseData) {
        setSelectedCase(caseData);
      }
    };

    window.addEventListener('openCaseDetail', handleOpenDetail as EventListener);
    return () => window.removeEventListener('openCaseDetail', handleOpenDetail as EventListener);
  }, []);

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

  const filteredCases = cases.filter((c) => {
    if (statusFilter !== "All" && c.status !== statusFilter) return false;
    if (priorityFilter !== "All" && c.priority !== priorityFilter) return false;

    if (normalizedSearchTerm) {
      const account = getAccountById(c.account);
      const product = getProductById(c.product);
      const project = getProjectById(c.project);
      const nfr = c.mantisId ? getNfrByMantisId(c.mantisId) : null;
      const knock = c.knockId ? getKnockByKnockId(c.knockId) : null;

      const matchesGlobalSearch = [
        c.recordId,
        c.moduleId,
        c.description,
        c.status,
        c.priority,
        c.category,
        c.caseOwner,
        c.seOwner,
        account?.accountName,
        product?.productName,
        project?.projectName,
        nfr?.description,
        nfr?.mantisId,
        knock?.description,
        knock?.knockId,
      ].some((value) => (value ?? "").toLowerCase().includes(normalizedSearchTerm));

      if (!matchesGlobalSearch) return false;
    }

    if (searchFilters.recordId && !c.recordId.toLowerCase().includes(searchFilters.recordId.toLowerCase())) return false;
    if (searchFilters.moduleId && !c.moduleId.toLowerCase().includes(searchFilters.moduleId.toLowerCase())) return false;
    if (searchFilters.description && !c.description.toLowerCase().includes(searchFilters.description.toLowerCase())) return false;
    if (searchFilters.account) {
      const account = getAccountById(c.account);
      if (!account?.accountName.toLowerCase().includes(searchFilters.account.toLowerCase())) return false;
    }
    if (searchFilters.product) {
      const product = getProductById(c.product);
      if (!product?.productName.toLowerCase().includes(searchFilters.product.toLowerCase())) return false;
    }
    if (searchFilters.caseOwner && !c.caseOwner.toLowerCase().includes(searchFilters.caseOwner.toLowerCase())) return false;
    if (searchFilters.seOwner && !c.seOwner.toLowerCase().includes(searchFilters.seOwner.toLowerCase())) return false;

    return true;
  });

  const sortedCases = [...filteredCases].sort((a, b) => {
    if (!sortConfig.direction) return 0;

    let aValue: any = "";
    let bValue: any = "";

    switch (sortConfig.key) {
      case "account":
        aValue = getAccountById(a.account)?.accountName || "";
        bValue = getAccountById(b.account)?.accountName || "";
        break;
      case "product":
        aValue = getProductById(a.product)?.productName || "";
        bValue = getProductById(b.product)?.productName || "";
        break;
      case "project":
        aValue = getProjectById(a.project)?.projectName || "";
        bValue = getProjectById(b.project)?.projectName || "";
        break;
      default:
        aValue = a[sortConfig.key as keyof typeof a] || "";
        bValue = b[sortConfig.key as keyof typeof b] || "";
    }

    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const handleRecordClick = (recordId: string) => {
    const caseData = getCaseById(recordId);
    if (caseData) {
      setSelectedCase(caseData);
      setIsEditing(false);
      setEditedCase(null);
    }
  };

  const handleEdit = () => {
    if (selectedCase) {
      setEditedCase({ ...selectedCase });
      setIsEditing(true);
    }
  };

  const handleSave = async () => {
    if (!editedCase) return;

    try {
      const saved = await updateCase(editedCase.recordId, {
        description: editedCase.description,
        status: editedCase.status,
        priority: editedCase.priority,
        category: editedCase.category,
        caseOwner: editedCase.caseOwner,
        product: editedCase.product,
        account: editedCase.account,
        project: editedCase.project,
        knockId: editedCase.knockId,
        mantisId: editedCase.mantisId,
        metaData: editedCase.metaData,
      });

      const index = cases.findIndex((c) => c.recordId === saved.recordId);
      if (index >= 0) {
        cases[index] = saved;
      }

      setSelectedCase(saved);
      setEditedCase(saved);
      setIsEditing(false);
      alert("Changes saved successfully!");
    } catch (error) {
      console.error("Failed to save case:", error);
      alert("Failed to save changes. Please try again.");
    }
  };

  const handleCancelEdit = () => {
    setEditedCase(null);
    setIsEditing(false);
  };

  const handleAddComment = () => {
    if (selectedCase && newComment.trim()) {
      const now = new Date();
      const timestamp = now.toISOString().slice(0, 19).replace('T', ' ');

      const newHistoryEntry = {
        timestamp,
        user: "Current User",
        action: "Comment",
        changes: newComment.trim(),
      };

      const updatedCase = {
        ...selectedCase,
        history: [...(selectedCase.history || []), newHistoryEntry],
      };

      setSelectedCase(updatedCase);
      setNewComment("");
    }
  };

  const handleAccountClick = (accountId: string) => {
    setSelectedCase(null);
    navigate('/accounts');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('openAccountDetail', { detail: accountId }));
    }, 100);
  };

  const handleProductClick = (productId: string) => {
    setSelectedCase(null);
    navigate('/product');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('openProductDetail', { detail: productId }));
    }, 100);
  };

  const handleProjectClick = (projectId: string) => {
    setSelectedCase(null);
    navigate('/projects');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('openProjectDetail', { detail: projectId }));
    }, 100);
  };

  const handleNfrClick = (nfrId: string) => {
    setSelectedCase(null);
    navigate('/nfr');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('openNfrDetail', { detail: nfrId }));
    }, 100);
  };

  const handleKnockClick = (knockId: string) => {
    setSelectedCase(null);
    navigate('/knock');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('openKnockDetail', { detail: knockId }));
    }, 100);
  };

  const account = selectedCase ? getAccountById(selectedCase.account) : null;
  const product = selectedCase ? getProductById(selectedCase.product) : null;
  const project = selectedCase ? getProjectById(selectedCase.project) : null;
  const nfr = selectedCase ? (selectedCase.mantisId ? getNfrByMantisId(selectedCase.mantisId) : null) : null;
  const knock = selectedCase ? (selectedCase.knockId ? getKnockByKnockId(selectedCase.knockId) : null) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cases</h1>
          <p className="text-gray-600 mt-1">Manage and track all customer cases</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200 flex gap-3">
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="appearance-none px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937] bg-white"
            >
              <option value="All">All Status</option>
              <option value="Open">Open</option>
              <option value="In Progress">In Progress</option>
              <option value="Escalated">Escalated</option>
              <option value="Closed">Closed</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
          </div>

          <div className="relative">
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="appearance-none px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937] bg-white"
            >
              <option value="All">All Priority</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
          </div>
        </div>

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
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Status</span>
                    <button onClick={() => handleSort("status")} className="text-gray-400 hover:text-gray-600">
                      {sortConfig.key === "status" ? (
                        sortConfig.direction === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                      ) : (
                        <ArrowUpDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </th>
                <th className="text-left px-6 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Priority</span>
                    <button onClick={() => handleSort("priority")} className="text-gray-400 hover:text-gray-600">
                      {sortConfig.key === "priority" ? (
                        sortConfig.direction === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                      ) : (
                        <ArrowUpDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </th>
                <th className="text-left px-6 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Account</span>
                    <button onClick={() => handleSort("account")} className="text-gray-400 hover:text-gray-600">
                      {sortConfig.key === "account" ? (
                        sortConfig.direction === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                      ) : (
                        <ArrowUpDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchFilters.account}
                    onChange={(e) => setSearchFilters({ ...searchFilters, account: e.target.value })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#E31937]"
                    onClick={(e) => e.stopPropagation()}
                  />
                </th>
                <th className="text-left px-6 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Product</span>
                    <button onClick={() => handleSort("product")} className="text-gray-400 hover:text-gray-600">
                      {sortConfig.key === "product" ? (
                        sortConfig.direction === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                      ) : (
                        <ArrowUpDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchFilters.product}
                    onChange={(e) => setSearchFilters({ ...searchFilters, product: e.target.value })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#E31937]"
                    onClick={(e) => e.stopPropagation()}
                  />
                </th>
                <th className="text-left px-6 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">SC Owner</span>
                    <button onClick={() => handleSort("caseOwner")} className="text-gray-400 hover:text-gray-600">
                      {sortConfig.key === "caseOwner" ? (
                        sortConfig.direction === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                      ) : (
                        <ArrowUpDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchFilters.caseOwner}
                    onChange={(e) => setSearchFilters({ ...searchFilters, caseOwner: e.target.value })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#E31937]"
                    onClick={(e) => e.stopPropagation()}
                  />
                </th>
                <th className="text-left px-6 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Updated</span>
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
              {sortedCases.map((caseItem) => (
                <tr
                  key={caseItem.recordId}
                  onClick={() => setSelectedCase(caseItem)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isBookmarked(caseItem.recordId, 'case')) {
                          removeBookmark(caseItem.recordId, 'case');
                        } else {
                          addBookmark({
                            id: caseItem.recordId,
                            type: 'case',
                            title: caseItem.description,
                            subtitle: `${caseItem.status} - ${caseItem.priority}`,
                            timestamp: Date.now(),
                          });
                        }
                      }}
                      className="text-gray-400 hover:text-yellow-500 transition-colors"
                      title="Bookmark"
                    >
                      <Bookmark className={`w-5 h-5 ${isBookmarked(caseItem.recordId, 'case') ? 'fill-yellow-400 text-yellow-500' : ''}`} />
                    </button>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-[#E31937] whitespace-nowrap">{caseItem.recordId}</td>
                  <td className="px-6 py-4 text-sm text-gray-900 max-w-md truncate whitespace-nowrap" title={caseItem.description}>
                    {caseItem.description}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-medium ${caseStatusColors[caseItem.status]}`}>
                      {caseItem.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-medium ${casePriorityColors[caseItem.priority]}`}>
                      {caseItem.priority}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">{getAccountById(caseItem.account)?.accountName || "—"}</td>
                  <td className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">{getProductById(caseItem.product)?.productName || "—"}</td>
                  <td className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">{caseItem.caseOwner}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">{caseItem.updatedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedCase && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Case Details</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (isBookmarked(selectedCase!.recordId, 'case')) {
                      removeBookmark(selectedCase!.recordId, 'case');
                    } else {
                      addBookmark({
                        id: selectedCase!.recordId,
                        type: 'case',
                        title: selectedCase!.description,
                        subtitle: `${selectedCase!.status} - ${selectedCase!.priority}`,
                        timestamp: Date.now(),
                      });
                    }
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    isBookmarked(selectedCase!.recordId, 'case')
                      ? 'bg-yellow-100 text-yellow-600'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  title="Bookmark this case"
                >
                  <Bookmark className={`w-5 h-5 ${isBookmarked(selectedCase!.recordId, 'case') ? 'fill-current' : ''}`} />
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
                  onClick={() => {
                    setSelectedCase(null);
                    setIsEditing(false);
                    setEditedCase(null);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Record ID</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.recordId}
                      onChange={(e) => setEditedCase({ ...editedCase, recordId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.recordId}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Module ID</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.moduleId}
                      onChange={(e) => setEditedCase({ ...editedCase, moduleId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.moduleId}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Record Revision</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.recordRevision}
                      onChange={(e) => setEditedCase({ ...editedCase, recordRevision: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.recordRevision}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Owned By</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.ownedBy}
                      onChange={(e) => setEditedCase({ ...editedCase, ownedBy: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.ownedBy}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Created At</label>
                  {isEditing && editedCase ? (
                    <input
                      type="date"
                      value={editedCase.createdAt}
                      onChange={(e) => setEditedCase({ ...editedCase, createdAt: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.createdAt}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Created By</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.createdBy}
                      onChange={(e) => setEditedCase({ ...editedCase, createdBy: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.createdBy}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Updated At</label>
                  {isEditing && editedCase ? (
                    <input
                      type="date"
                      value={editedCase.updatedAt}
                      onChange={(e) => setEditedCase({ ...editedCase, updatedAt: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.updatedAt}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Updated By</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.updatedBy}
                      onChange={(e) => setEditedCase({ ...editedCase, updatedBy: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.updatedBy}</p>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Meta Data</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.metaData}
                      onChange={(e) => setEditedCase({ ...editedCase, metaData: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.metaData}</p>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Description</label>
                  {isEditing && editedCase ? (
                    <textarea
                      value={editedCase.description}
                      onChange={(e) => setEditedCase({ ...editedCase, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                      rows={3}
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.description}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Status</label>
                  {isEditing && editedCase ? (
                    <select
                      value={editedCase.status}
                      onChange={(e) => setEditedCase({ ...editedCase, status: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="Open">Open</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Escalated">Escalated</option>
                      <option value="Closed">Closed</option>
                    </select>
                  ) : (
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${caseStatusColors[selectedCase.status]}`}>
                      {selectedCase.status}
                    </span>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Previous Status</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.previousStatus || ""}
                      onChange={(e) => setEditedCase({ ...editedCase, previousStatus: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.previousStatus || "—"}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Priority</label>
                  {isEditing && editedCase ? (
                    <select
                      value={editedCase.priority}
                      onChange={(e) => setEditedCase({ ...editedCase, priority: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Critical">Critical</option>
                    </select>
                  ) : (
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${casePriorityColors[selectedCase.priority]}`}>
                      {selectedCase.priority}
                    </span>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Category</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.category}
                      onChange={(e) => setEditedCase({ ...editedCase, category: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.category}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Close Date</label>
                  {isEditing && editedCase ? (
                    <input
                      type="date"
                      value={editedCase.closeDate || ""}
                      onChange={(e) => setEditedCase({ ...editedCase, closeDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.closeDate || "—"}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Case Owner</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.caseOwner}
                      onChange={(e) => setEditedCase({ ...editedCase, caseOwner: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.caseOwner}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">SE Owner</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.seOwner}
                      onChange={(e) => setEditedCase({ ...editedCase, seOwner: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.seOwner}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Product</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.product}
                      onChange={(e) => setEditedCase({ ...editedCase, product: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{product?.productName || "—"}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Account</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.account}
                      onChange={(e) => setEditedCase({ ...editedCase, account: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{account?.accountName || "—"}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Project</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.project || ""}
                      onChange={(e) => setEditedCase({ ...editedCase, project: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{project?.projectName || "—"}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Knock ID</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.knockId || ""}
                      onChange={(e) => setEditedCase({ ...editedCase, knockId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.knockId || "—"}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Mantis ID</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.mantisId || ""}
                      onChange={(e) => setEditedCase({ ...editedCase, mantisId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.mantisId || "—"}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Escalation Type</label>
                  {isEditing && editedCase ? (
                    <input
                      type="text"
                      value={editedCase.escalationType || ""}
                      onChange={(e) => setEditedCase({ ...editedCase, escalationType: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.escalationType || "—"}</p>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Escalation Note</label>
                  {isEditing && editedCase ? (
                    <textarea
                      value={editedCase.escalationNote || ""}
                      onChange={(e) => setEditedCase({ ...editedCase, escalationNote: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                      rows={2}
                    />
                  ) : (
                    <p className="text-gray-900">{selectedCase.escalationNote || "—"}</p>
                  )}
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <h3 className="font-semibold text-lg text-gray-900 mb-4">Linked Entities</h3>
                <div className="grid grid-cols-2 gap-4">
                  <LinkedEntityCard
                    title="Account"
                    data={account}
                    fields={[
                      { label: "ID", key: "recordId" },
                      { label: "Name", key: "accountName" },
                      { label: "Type", key: "type" },
                      { label: "Vertical", key: "vertical" },
                    ]}
                    onRecordClick={handleAccountClick}
                  />

                  <LinkedEntityCard
                    title="Product"
                    data={product}
                    fields={[
                      { label: "ID", key: "recordId" },
                      { label: "Name", key: "productName" },
                      { label: "Family", key: "productFamily" },
                    ]}
                    onRecordClick={handleProductClick}
                  />

                  <LinkedEntityCard
                    title="Project"
                    data={project}
                    fields={[
                      { label: "ID", key: "recordId" },
                      { label: "Name", key: "projectName" },
                      { label: "Stage", key: "stage" },
                      { label: "Value", key: "sfdcValue" },
                    ]}
                    onRecordClick={handleProjectClick}
                  />

                  <LinkedEntityCard
                    title="NFR"
                    data={nfr}
                    fields={[
                      { label: "ID", key: "recordId" },
                      { label: "Mantis ID", key: "mantisId" },
                      { label: "Status", key: "nfrStatus" },
                      { label: "Target Date", key: "nfrTargetDate" },
                    ]}
                    onRecordClick={handleNfrClick}
                  />

                  <LinkedEntityCard
                    title="Knock"
                    data={knock}
                    fields={[
                      { label: "ID", key: "recordId" },
                      { label: "Knock ID", key: "knockId" },
                      { label: "Status", key: "status" },
                      { label: "Target Date", key: "targetDate" },
                    ]}
                    onRecordClick={handleKnockClick}
                  />
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <h3 className="font-semibold text-lg text-gray-900 mb-4">History</h3>
                <div className="space-y-3 mb-6">
                  {selectedCase.history && selectedCase.history.length > 0 ? (
                    selectedCase.history.map((entry, index) => (
                      <div key={index} className="flex gap-4 p-4 bg-gray-50 rounded-lg">
                        <div className="flex-shrink-0 w-40">
                          <div className="text-sm text-gray-500">{entry.timestamp}</div>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-gray-900">{entry.user}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              entry.action === "Comment"
                                ? "bg-green-100 text-green-800"
                                : "bg-blue-100 text-blue-800"
                            }`}>
                              {entry.action}
                            </span>
                          </div>
                          <div className="text-sm text-gray-700">{entry.changes}</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500 italic">No history available</p>
                  )}
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Add Comment</label>
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
      )}
    </div>
  );
}
