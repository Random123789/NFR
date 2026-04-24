export const casePriorityColors: Record<string, string> = {
  Critical: "bg-[#E31937] text-white",
  High: "bg-orange-100 text-orange-800",
  Medium: "bg-yellow-100 text-yellow-800",
  Low: "bg-green-100 text-green-800",
};

export const caseStatusColors: Record<string, string> = {
  Open: "bg-blue-100 text-blue-800",
  "In Progress": "bg-[#2c3e50] text-white",
  Escalated: "bg-[#c41230] text-white",
  Closed: "bg-gray-100 text-gray-700",
};

export const projectStageColors: Record<string, string> = {
  Discovery: "bg-blue-100 text-blue-800",
  Planning: "bg-purple-100 text-purple-800",
  "In Progress": "bg-[#2c3e50] text-white",
  Completed: "bg-green-100 text-green-800",
  "On Hold": "bg-gray-100 text-gray-700",
};

export const nfrStatusColors: Record<string, string> = {
  Pending: "bg-yellow-100 text-yellow-800",
  "In Review": "bg-blue-100 text-blue-800",
  Approved: "bg-green-100 text-green-800",
  Rejected: "bg-[#E31937] text-white",
  Implemented: "bg-[#2c3e50] text-white",
};

export const knockStatusColors: Record<string, string> = {
  Active: "bg-blue-100 text-blue-800",
  "In Progress": "bg-[#2c3e50] text-white",
  Completed: "bg-green-100 text-green-800",
  Cancelled: "bg-gray-100 text-gray-700",
};

export const chartColors = ["#E31937", "#2c3e50", "#c41230", "#666666", "#999999"];