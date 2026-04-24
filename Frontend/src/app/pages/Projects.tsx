import { useState, useEffect } from "react";
import { X, ArrowUpDown, ArrowUp, ArrowDown, Edit2, Save, Bookmark } from "lucide-react";
import { projects, getAccountById, getCasesByProjectId, getProjectById, updateProject } from "../data/apiClient";
import { LinkedEntityCard, LinkedCasesList } from "../components/LinkedEntityCard";
import { useNavigate } from "react-router";
import { useSearch } from "../context/SearchContext";
import { useBookmarks } from "../context/BookmarksContext";
import { projectStageColors } from "../data/recordStyles";

export function Projects() {
  const navigate = useNavigate();
  const { addBookmark, removeBookmark, isBookmarked } = useBookmarks();
  const { searchTerm } = useSearch();
  const [selectedProject, setSelectedProject] = useState<typeof projects[0] | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedProject, setEditedProject] = useState<typeof projects[0] | null>(null);
  const [newComment, setNewComment] = useState("");

  const [searchFilters, setSearchFilters] = useState({
    recordId: "",
    projectName: "",
    account: "",
    se: "",
  });

  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({
    key: "",
    direction: null,
  });

  useEffect(() => {
    const handleOpenDetail = (event: any) => {
      const projectId = event.detail;
      const project = getProjectById(projectId);
      if (project) {
        setSelectedProject(project);
      }
    };

    window.addEventListener('openProjectDetail', handleOpenDetail as EventListener);
    return () => window.removeEventListener('openProjectDetail', handleOpenDetail as EventListener);
  }, []);

  const handleAccountClick = (accountId: string) => {
    setSelectedProject(null);
    navigate('/accounts');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('openAccountDetail', { detail: accountId }));
    }, 100);
  };

  const handleCaseClick = (caseId: string) => {
    setSelectedProject(null);
    navigate('/cases');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('openCaseDetail', { detail: caseId }));
    }, 100);
  };

  const handleEdit = () => {
    if (selectedProject) {
      setEditedProject({ ...selectedProject });
      setIsEditing(true);
    }
  };

  const handleSave = async () => {
    if (!editedProject) return;

    try {
      const saved = await updateProject(editedProject.recordId, {
        projectName: editedProject.projectName,
        accountId: editedProject.accountId,
        startDate: editedProject.startDate,
        closeDate: editedProject.closeDate,
        stage: editedProject.stage,
        sfdc: editedProject.sfdc,
        sfdcValue: editedProject.sfdcValue,
        se: editedProject.se,
        metaData: editedProject.metaData,
      });

      const index = projects.findIndex((project) => project.recordId === saved.recordId);
      if (index >= 0) {
        projects[index] = saved;
      }

      setSelectedProject(saved);
      setEditedProject(saved);
      setIsEditing(false);
      alert("Changes saved successfully!");
    } catch (error) {
      console.error("Failed to save project:", error);
      alert("Failed to save changes. Please try again.");
    }
  };

  const handleCancelEdit = () => {
    setEditedProject(null);
    setIsEditing(false);
  };

  const handleAddComment = () => {
    if (selectedProject && newComment.trim()) {
      const now = new Date();
      const timestamp = now.toISOString().slice(0, 19).replace('T', ' ');

      const newHistoryEntry = {
        timestamp,
        user: "Current User",
        action: "Comment",
        changes: newComment.trim(),
      };

      const updatedProject = {
        ...selectedProject,
        history: [...(selectedProject.history || []), newHistoryEntry],
      };

      setSelectedProject(updatedProject);
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

  const filteredProjects = projects.filter((project) => {
    if (normalizedSearchTerm) {
      const account = getAccountById(project.accountId);
      const matchesGlobalSearch = [
        project.recordId,
        project.projectName,
        project.stage,
        project.sfdc,
        project.sfdcValue,
        project.se,
        account?.accountName,
      ].some((value) => (value ?? "").toLowerCase().includes(normalizedSearchTerm));

      if (!matchesGlobalSearch) return false;
    }

    if (searchFilters.recordId && !project.recordId.toLowerCase().includes(searchFilters.recordId.toLowerCase())) return false;
    if (searchFilters.projectName && !project.projectName.toLowerCase().includes(searchFilters.projectName.toLowerCase())) return false;
    if (searchFilters.account) {
      const account = getAccountById(project.accountId);
      if (!account?.accountName.toLowerCase().includes(searchFilters.account.toLowerCase())) return false;
    }
    if (searchFilters.se && !project.se.toLowerCase().includes(searchFilters.se.toLowerCase())) return false;
    return true;
  });

  const sortedProjects = [...filteredProjects].sort((a, b) => {
    if (!sortConfig.direction) return 0;

    let aValue: any = "";
    let bValue: any = "";

    switch (sortConfig.key) {
      case "account":
        aValue = getAccountById(a.accountId)?.accountName || "";
        bValue = getAccountById(b.accountId)?.accountName || "";
        break;
      default:
        aValue = a[sortConfig.key as keyof typeof a] || "";
        bValue = b[sortConfig.key as keyof typeof b] || "";
    }

    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const account = selectedProject ? getAccountById(selectedProject.accountId) : null;
  const relatedCases = selectedProject ? getCasesByProjectId(selectedProject.recordId) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Customer Projects</h1>
        <p className="text-gray-600 mt-1">Track Fortinet customer projects and implementations</p>
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
                    <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Project Name</span>
                    <button onClick={() => handleSort("projectName")} className="text-gray-400 hover:text-gray-600">
                      {sortConfig.key === "projectName" ? (
                        sortConfig.direction === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                      ) : (
                        <ArrowUpDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchFilters.projectName}
                    onChange={(e) => setSearchFilters({ ...searchFilters, projectName: e.target.value })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#E31937]"
                    onClick={(e) => e.stopPropagation()}
                  />
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
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Stage</span>
                    <button onClick={() => handleSort("stage")} className="text-gray-400 hover:text-gray-600">
                      {sortConfig.key === "stage" ? (
                        sortConfig.direction === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                      ) : (
                        <ArrowUpDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </th>
                <th className="text-left px-6 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">SFDC Value</span>
                    <button onClick={() => handleSort("sfdcValue")} className="text-gray-400 hover:text-gray-600">
                      {sortConfig.key === "sfdcValue" ? (
                        sortConfig.direction === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                      ) : (
                        <ArrowUpDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </th>
                <th className="text-left px-6 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Solution Consultant</span>
                    <button onClick={() => handleSort("se")} className="text-gray-400 hover:text-gray-600">
                      {sortConfig.key === "se" ? (
                        sortConfig.direction === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                      ) : (
                        <ArrowUpDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchFilters.se}
                    onChange={(e) => setSearchFilters({ ...searchFilters, se: e.target.value })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#E31937]"
                    onClick={(e) => e.stopPropagation()}
                  />
                </th>
                <th className="text-left px-6 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Close Date</span>
                    <button onClick={() => handleSort("closeDate")} className="text-gray-400 hover:text-gray-600">
                      {sortConfig.key === "closeDate" ? (
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
              {sortedProjects.map((project) => (
                <tr
                  key={project.recordId}
                  onClick={() => setSelectedProject(project)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isBookmarked(project.recordId, 'project')) {
                          removeBookmark(project.recordId, 'project');
                        } else {
                          addBookmark({
                            id: project.recordId,
                            type: 'project',
                            title: project.projectName,
                            subtitle: project.stage,
                            timestamp: Date.now(),
                          });
                        }
                      }}
                      className="text-gray-400 hover:text-yellow-500 transition-colors"
                      title="Bookmark"
                    >
                      <Bookmark className={`w-5 h-5 ${isBookmarked(project.recordId, 'project') ? 'fill-yellow-400 text-yellow-500' : ''}`} />
                    </button>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-[#E31937] whitespace-nowrap">{project.recordId}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 whitespace-nowrap">{project.projectName}</td>
                  <td className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">{getAccountById(project.accountId)?.accountName || "—"}</td>
                  <td className="px-6 py-4">
                      <span className={`inline-flex whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-medium ${projectStageColors[project.stage]}`}>
                      {project.stage}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 whitespace-nowrap">{project.sfdcValue}</td>
                  <td className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">{project.se}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">{project.closeDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between rounded-t-xl">
              <h2 className="text-xl font-semibold text-gray-900">Project Details</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (isBookmarked(selectedProject!.recordId, 'project')) {
                      removeBookmark(selectedProject!.recordId, 'project');
                    } else {
                      addBookmark({
                        id: selectedProject!.recordId,
                        type: 'project',
                        title: selectedProject!.projectName,
                        subtitle: selectedProject!.stage,
                        timestamp: Date.now(),
                      });
                    }
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    isBookmarked(selectedProject!.recordId, 'project')
                      ? 'bg-yellow-100 text-yellow-600'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  title="Bookmark this project"
                >
                  <Bookmark className={`w-5 h-5 ${isBookmarked(selectedProject!.recordId, 'project') ? 'fill-current' : ''}`} />
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
                <button onClick={() => setSelectedProject(null)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Record ID</label>
                  <p className="text-gray-900">{selectedProject.recordId}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Project Name</label>
                  {isEditing && editedProject ? (
                    <input
                      type="text"
                      value={editedProject.projectName}
                      onChange={(e) => setEditedProject({ ...editedProject, projectName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900 font-medium">{selectedProject.projectName}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Stage</label>
                  {isEditing && editedProject ? (
                    <select
                      value={editedProject.stage}
                      onChange={(e) => setEditedProject({ ...editedProject, stage: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="Discovery">Discovery</option>
                      <option value="Planning">Planning</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Completed">Completed</option>
                      <option value="On Hold">On Hold</option>
                    </select>
                  ) : (
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${projectStageColors[selectedProject.stage]}`}>
                      {selectedProject.stage}
                    </span>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Solution Consultant</label>
                  {isEditing && editedProject ? (
                    <input
                      type="text"
                      value={editedProject.se}
                      onChange={(e) => setEditedProject({ ...editedProject, se: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedProject.se}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Start Date</label>
                  {isEditing && editedProject ? (
                    <input
                      type="date"
                      value={editedProject.startDate}
                      onChange={(e) => setEditedProject({ ...editedProject, startDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedProject.startDate}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Close Date</label>
                  {isEditing && editedProject ? (
                    <input
                      type="date"
                      value={editedProject.closeDate}
                      onChange={(e) => setEditedProject({ ...editedProject, closeDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedProject.closeDate}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">SFDC</label>
                  {isEditing && editedProject ? (
                    <input
                      type="text"
                      value={editedProject.sfdc}
                      onChange={(e) => setEditedProject({ ...editedProject, sfdc: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedProject.sfdc}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">SFDC Value</label>
                  {isEditing && editedProject ? (
                    <input
                      type="text"
                      value={editedProject.sfdcValue}
                      onChange={(e) => setEditedProject({ ...editedProject, sfdcValue: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900 font-medium">{selectedProject.sfdcValue}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Updated At</label>
                  <p className="text-gray-900">{selectedProject.updatedAt}</p>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <h3 className="font-semibold text-lg text-gray-900 mb-4">Linked Entities</h3>
                <div className="space-y-4">
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

                  <LinkedCasesList cases={relatedCases} onCaseClick={handleCaseClick} />
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <h3 className="font-semibold text-lg text-gray-900 mb-4">History</h3>
                <div className="space-y-3 mb-6">
                  {selectedProject.history && selectedProject.history.length > 0 ? (
                    selectedProject.history.map((entry, index) => (
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
