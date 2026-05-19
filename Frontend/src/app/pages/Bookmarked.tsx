import { Bookmark } from "lucide-react";
import { useBookmarks } from "../context/BookmarksContext";
import { useRecords } from "../context/RecordsContext";
import { useNavigate } from "react-router";
import { createDetailPath, createDetailSlug, createOpenDetailState, type DetailEntityType } from "../navigation/detailNavigation";
import { formatTimestampMinute } from "../utils/dateTime";
import type { BookmarkedItem } from "../data/apiClient";

const typeIcons: Record<string, string> = {
  'case': '📋',
  'project': '📁',
  'account': '🏢',
  'mantis': '⭐',
  'knock': '🔨',
  'product': '📦',
};

const typeColors: Record<string, string> = {
  'case': 'bg-red-50 border-red-200',
  'project': 'bg-blue-50 border-blue-200',
  'account': 'bg-green-50 border-green-200',
  'mantis': 'bg-yellow-50 border-yellow-200',
  'knock': 'bg-purple-50 border-purple-200',
  'product': 'bg-orange-50 border-orange-200',
};

function textValue(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || "-";
}

function formatCaseId(recordId: string) {
  return createDetailSlug("case", recordId);
}

export function Bookmarked() {
  const { bookmarked, removeBookmark } = useBookmarks();
  const { getAccountById, getCaseById, getKnockById, getMantisById, getProjectById } = useRecords();
  const navigate = useNavigate();

  const handleItemClick = (item: any) => {
    const entityType = item.type as DetailEntityType;
    const identifier = entityType === "mantis"
      ? getMantisById(item.id)?.mantisId || item.id
      : entityType === "knock"
        ? getKnockById(item.id)?.knockId || item.id
        : item.id;

    navigate(createDetailPath(entityType, identifier), { state: createOpenDetailState(entityType, item.id) });
  };

  const groupedByType = bookmarked.reduce((acc, item) => {
    if (!acc[item.type]) {
      acc[item.type] = [];
    }
    acc[item.type].push(item);
    return acc;
  }, {} as Record<string, typeof bookmarked>);

  const typeLabels: Record<string, string> = {
    'case': 'Cases',
    'project': 'Projects',
    'account': 'Accounts',
    'mantis': 'Mantis',
    'knock': 'Knocks',
    'product': 'Products',
  };

  const getBookmarkDisplay = (item: BookmarkedItem) => {
    if (item.type === "mantis") {
      const mantis = getMantisById(item.id);
      return {
        displayId: mantis?.mantisId || item.id,
        title: mantis?.description || item.title,
        details: mantis?.mantisStatus || item.subtitle,
      };
    }

    if (item.type === "knock") {
      const knock = getKnockById(item.id);
      return {
        displayId: knock?.knockId || item.id,
        title: knock?.description || item.title,
        details: knock?.status || item.subtitle,
      };
    }

    if (item.type === "case") {
      const caseRecord = getCaseById(item.id);
      const accountName = getAccountById(caseRecord?.account)?.accountName || caseRecord?.account;
      const projectName = getProjectById(caseRecord?.project)?.projectName || caseRecord?.project;
      const relationship = `Account: ${textValue(accountName)} | Project: ${textValue(projectName)}`;
      const statusLine = caseRecord
        ? `${textValue(caseRecord.status)} - ${textValue(caseRecord.priority)}`
        : item.subtitle;

      return {
        displayId: formatCaseId(item.id),
        title: caseRecord?.description || item.title,
        details: relationship,
        secondaryDetails: statusLine,
      };
    }

    return {
      displayId: item.id,
      title: item.title,
      details: item.subtitle,
    };
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Bookmarks</h1>
        <p className="text-gray-600 mt-1">Your saved items across all sections</p>
      </div>

      {bookmarked.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
          <Bookmark className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No bookmarked items yet</p>
          <p className="text-sm text-gray-500 mt-2">Bookmark items to see them here</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedByType).map(([type, items]) => (
            <div key={type}>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">{typeLabels[type]}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((item) => {
                  const display = getBookmarkDisplay(item);
                  return (
                    <div
                      key={`${item.type}-${item.id}`}
                      className={`rounded-lg border p-4 cursor-pointer transition-all hover:shadow-md ${typeColors[item.type]}`}
                      onClick={() => handleItemClick(item)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xl">{typeIcons[item.type]}</span>
                            <p className="font-medium text-gray-900 truncate">{display.displayId}</p>
                          </div>
                          <p className="text-sm text-gray-700 line-clamp-2">{display.title}</p>
                          {display.details && (
                            <p className="text-xs text-gray-600 mt-1 line-clamp-1">{display.details}</p>
                          )}
                          {display.secondaryDetails && (
                            <p className="text-xs text-gray-500 mt-1">{display.secondaryDetails}</p>
                          )}
                          <p className="text-xs text-gray-500 mt-2">
                            {formatTimestampMinute(item.timestamp)}
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeBookmark(item.id, item.type);
                          }}
                          className="flex-shrink-0 text-gray-400 hover:text-red-600 transition-colors"
                          title="Remove bookmark"
                        >
                          <Bookmark className="w-5 h-5 fill-current" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

