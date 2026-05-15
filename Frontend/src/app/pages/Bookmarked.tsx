import { Bookmark, ExternalLink } from "lucide-react";
import { useBookmarks } from "../context/BookmarksContext";
import { useNavigate } from "react-router";
import { casePriorityColors, caseStatusColors, projectStageColors } from "../data/recordStyles";
import { createOpenDetailState, getDetailRoute, type DetailEntityType } from "../navigation/detailNavigation";
import { formatTimestampMinute } from "../utils/dateTime";

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

export function Bookmarked() {
  const { bookmarked, removeBookmark } = useBookmarks();
  const navigate = useNavigate();

  const handleItemClick = (item: any) => {
    const entityType = item.type as DetailEntityType;
    const path = getDetailRoute(entityType);

    if (path) {
      navigate(path, { state: createOpenDetailState(entityType, item.id) });
    }
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
                {items.map((item) => (
                  <div
                    key={`${item.type}-${item.id}`}
                    className={`rounded-lg border p-4 cursor-pointer transition-all hover:shadow-md ${typeColors[item.type]}`}
                    onClick={() => handleItemClick(item)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xl">{typeIcons[item.type]}</span>
                          <p className="font-medium text-gray-900 truncate">{item.id}</p>
                        </div>
                        <p className="text-sm text-gray-700 line-clamp-2">{item.title}</p>
                        {item.subtitle && (
                          <p className="text-xs text-gray-600 mt-1">{item.subtitle}</p>
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
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

