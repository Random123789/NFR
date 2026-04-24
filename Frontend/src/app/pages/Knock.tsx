import { useState, useEffect } from "react";
import { X, ArrowUpDown, ArrowUp, ArrowDown, Edit2, Save, Bookmark } from "lucide-react";
import { knocks, getCasesByKnockId, getKnockById, getCasesByKnockIdNum, updateKnock } from "../data/apiClient";
import { LinkedCasesList } from "../components/LinkedEntityCard";
import { useNavigate } from "react-router";
import { useSearch } from "../context/SearchContext";
import { useBookmarks } from "../context/BookmarksContext";
import { knockStatusColors } from "../data/recordStyles";

export function Knock() {
  const navigate = useNavigate();
  const { addBookmark, removeBookmark, isBookmarked } = useBookmarks();
  const { searchTerm } = useSearch();
  const [selectedKnock, setSelectedKnock] = useState<typeof knocks[0] | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedKnock, setEditedKnock] = useState<typeof knocks[0] | null>(null);
  const [newComment, setNewComment] = useState("");

  const [searchFilters, setSearchFilters] = useState({
    recordId: "",
    description: "",
    knockId: "",
  });

  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({
    key: "",
    direction: null,
  });

  useEffect(() => {
    const handleOpenDetail = (event: any) => {
      const knockId = event.detail;
      const knock = getKnockById(knockId);
      if (knock) {
        setSelectedKnock(knock);
      }
    };

    window.addEventListener('openKnockDetail', handleOpenDetail as EventListener);
    return () => window.removeEventListener('openKnockDetail', handleOpenDetail as EventListener);
  }, []);

  const handleCaseClick = (caseId: string) => {
    setSelectedKnock(null);
    navigate('/cases');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('openCaseDetail', { detail: caseId }));
    }, 100);
  };

  const handleEdit = () => {
    if (selectedKnock) {
      setEditedKnock({ ...selectedKnock });
      setIsEditing(true);
    }
  };

  const handleSave = async () => {
    if (!editedKnock) return;

    try {
      const saved = await updateKnock(editedKnock.recordId, {
        description: editedKnock.description,
        knockId: editedKnock.knockId,
        knockUrl: editedKnock.knockUrl,
        status: editedKnock.status,
        requestDate: editedKnock.requestDate,
        targetDate: editedKnock.targetDate,
        metaData: editedKnock.metaData,
      });

      const index = knocks.findIndex((knock) => knock.recordId === saved.recordId);
      if (index >= 0) {
        knocks[index] = saved;
      }

      setSelectedKnock(saved);
      setEditedKnock(saved);
      setIsEditing(false);
      alert("Changes saved successfully!");
    } catch (error) {
      console.error("Failed to save knock:", error);
      alert("Failed to save changes. Please try again.");
    }
  };

  const handleCancelEdit = () => {
    setEditedKnock(null);
    setIsEditing(false);
  };

  const handleAddComment = () => {
    if (selectedKnock && newComment.trim()) {
      const now = new Date();
      const timestamp = now.toISOString().slice(0, 19).replace('T', ' ');

      const newHistoryEntry = {
        timestamp,
        user: "Current User",
        action: "Comment",
        changes: newComment.trim(),
      };

      const updatedKnock = {
        ...selectedKnock,
        history: [...(selectedKnock.history || []), newHistoryEntry],
      };

      setSelectedKnock(updatedKnock);
      setNewComment("");
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

  const filteredKnocks = knocks.filter((knock) => {
    if (normalizedSearchTerm) {
      const matchesGlobalSearch = [
        knock.recordId,
        knock.description,
        knock.knockId,
        knock.knockUrl,
        knock.status,
      ].some((value) => (value ?? "").toLowerCase().includes(normalizedSearchTerm));

      if (!matchesGlobalSearch) return false;
    }

    if (searchFilters.recordId && !knock.recordId.toLowerCase().includes(searchFilters.recordId.toLowerCase())) return false;
    if (searchFilters.description && !knock.description.toLowerCase().includes(searchFilters.description.toLowerCase())) return false;
    if (searchFilters.knockId && !knock.knockId.toLowerCase().includes(searchFilters.knockId.toLowerCase())) return false;
    return true;
  });

  const sortedKnocks = [...filteredKnocks].sort((a, b) => {
    if (!sortConfig.direction) return 0;

    let aValue: any = a[sortConfig.key as keyof typeof a] || "";
    let bValue: any = b[sortConfig.key as keyof typeof b] || "";

    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const relatedCases = selectedKnock ? getCasesByKnockId(selectedKnock.knockId) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Knock</h1>
        <p className="text-gray-600 mt-1">Track Knock requests and integrations</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
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
                    <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Knock ID</span>
                    <button onClick={() => handleSort("knockId")} className="text-gray-400 hover:text-gray-600">
                      {sortConfig.key === "knockId" ? (
                        sortConfig.direction === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                      ) : (
                        <ArrowUpDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchFilters.knockId}
                    onChange={(e) => setSearchFilters({ ...searchFilters, knockId: e.target.value })}
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
                    <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Request Date</span>
                    <button onClick={() => handleSort("requestDate")} className="text-gray-400 hover:text-gray-600">
                      {sortConfig.key === "requestDate" ? (
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
                    <button onClick={() => handleSort("targetDate")} className="text-gray-400 hover:text-gray-600">
                      {sortConfig.key === "targetDate" ? (
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
              {sortedKnocks.map((knock) => (
                <tr
                  key={knock.recordId}
                  onClick={() => setSelectedKnock(knock)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >                  <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isBookmarked(knock.recordId, 'knock')) {
                          removeBookmark(knock.recordId, 'knock');
                        } else {
                          addBookmark({
                            id: knock.recordId,
                            type: 'knock',
                            title: knock.description,
                            subtitle: knock.status,
                            timestamp: Date.now(),
                          });
                        }
                      }}
                      className="text-gray-400 hover:text-yellow-500 transition-colors"
                      title="Bookmark"
                    >
                      <Bookmark className={`w-5 h-5 ${isBookmarked(knock.recordId, 'knock') ? 'fill-yellow-400 text-yellow-500' : ''}`} />
                    </button>
                  </td>                  <td className="px-6 py-4 text-sm font-medium text-[#E31937] whitespace-nowrap">{knock.recordId}</td>
                  <td className="px-6 py-4 text-sm text-gray-900 max-w-md truncate whitespace-nowrap" title={knock.description}>
                    {knock.description}
                  </td>
                  <td className="px-6 py-4 text-sm text-[#E31937] hover:underline whitespace-nowrap">{knock.knockId}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-medium ${knockStatusColors[knock.status]}`}>
                      {knock.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">{knock.requestDate}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">{knock.targetDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedKnock && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between rounded-t-xl">
              <h2 className="text-xl font-semibold text-gray-900">Knock Details</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (isBookmarked(selectedKnock!.recordId, 'knock')) {
                      removeBookmark(selectedKnock!.recordId, 'knock');
                    } else {
                      addBookmark({
                        id: selectedKnock!.recordId,
                        type: 'knock',
                        title: selectedKnock!.description,
                        subtitle: selectedKnock!.status,
                        timestamp: Date.now(),
                      });
                    }
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    isBookmarked(selectedKnock!.recordId, 'knock')
                      ? 'bg-yellow-100 text-yellow-600'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  title="Bookmark this knock"
                >
                  <Bookmark className={`w-5 h-5 ${isBookmarked(selectedKnock!.recordId, 'knock') ? 'fill-current' : ''}`} />
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
                <button onClick={() => setSelectedKnock(null)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Record ID</label>
                  <p className="text-gray-900">{selectedKnock.recordId}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Knock ID</label>
                  {isEditing && editedKnock ? (
                    <input
                      type="text"
                      value={editedKnock.knockId}
                      onChange={(e) => setEditedKnock({ ...editedKnock, knockId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedKnock.knockId}</p>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Description</label>
                  {isEditing && editedKnock ? (
                    <textarea
                      value={editedKnock.description}
                      onChange={(e) => setEditedKnock({ ...editedKnock, description: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedKnock.description}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Status</label>
                  {isEditing && editedKnock ? (
                    <select
                      value={editedKnock.status}
                      onChange={(e) => setEditedKnock({ ...editedKnock, status: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="Active">Active</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Completed">Completed</option>
                      <option value="Cancelled">Cancelled</option>
                    </select>
                  ) : (
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${knockStatusColors[selectedKnock.status]}`}>
                      {selectedKnock.status}
                    </span>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Knock URL</label>
                  {isEditing && editedKnock ? (
                    <input
                      type="url"
                      value={editedKnock.knockUrl}
                      onChange={(e) => setEditedKnock({ ...editedKnock, knockUrl: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <a href={selectedKnock.knockUrl} target="_blank" rel="noopener noreferrer" className="text-[#E31937] hover:underline flex items-center gap-1">
                      View in Knock
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Request Date</label>
                  {isEditing && editedKnock ? (
                    <input
                      type="date"
                      value={editedKnock.requestDate}
                      onChange={(e) => setEditedKnock({ ...editedKnock, requestDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedKnock.requestDate}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Target Date</label>
                  {isEditing && editedKnock ? (
                    <input
                      type="date"
                      value={editedKnock.targetDate}
                      onChange={(e) => setEditedKnock({ ...editedKnock, targetDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedKnock.targetDate}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Created At</label>
                  <p className="text-gray-900">{selectedKnock.createdAt}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Updated At</label>
                  <p className="text-gray-900">{selectedKnock.updatedAt}</p>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <h3 className="font-semibold text-lg text-gray-900 mb-4">Related Data</h3>
                <LinkedCasesList cases={relatedCases} onCaseClick={handleCaseClick} />
              </div>

              <div className="border-t border-gray-200 pt-6">
                <h3 className="font-semibold text-lg text-gray-900 mb-4">History</h3>
                <div className="space-y-3 mb-6">
                  {selectedKnock.history && selectedKnock.history.length > 0 ? (
                    selectedKnock.history.map((entry, index) => (
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
