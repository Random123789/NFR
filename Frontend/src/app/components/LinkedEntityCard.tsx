import { ExternalLink } from "lucide-react";
import { casePriorityColors, caseStatusColors } from "../data/recordStyles";

interface LinkedEntityCardProps {
  title: string;
  data?: any;
  fields: { label: string; key: string; isLink?: boolean; url?: string }[];
  onRecordClick?: (recordId: string) => void;
}

export function LinkedEntityCard({ title, data, fields, onRecordClick }: LinkedEntityCardProps) {
  if (!data) {
    return (
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-medium text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-500">No linked {title.toLowerCase()}</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <h3 className="font-medium text-gray-900 mb-3">{title}</h3>
      <div className="space-y-2">
        {fields.map((field) => (
          <div key={field.key}>
            <span className="text-sm font-medium text-gray-600">{field.label}: </span>
            {field.isLink && field.url ? (
              <a
                href={field.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[#E31937] hover:underline inline-flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                {data[field.key]}
                <ExternalLink className="w-3 h-3" />
              </a>
            ) : field.key === 'recordId' && onRecordClick ? (
              <button
                onClick={() => onRecordClick(data[field.key])}
                className="text-sm text-[#E31937] hover:underline font-medium"
              >
                {data[field.key]}
              </button>
            ) : (
              <span className="text-sm text-gray-900 whitespace-nowrap">{data[field.key] || "—"}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface LinkedCasesListProps {
  cases: any[];
  onCaseClick: (recordId: string) => void;
  onRemoveCase?: (recordId: string) => void;
}

export function LinkedCasesList({ cases, onCaseClick, onRemoveCase }: LinkedCasesListProps) {
  if (cases.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-medium text-gray-900 mb-2">Related Cases</h3>
        <p className="text-sm text-gray-500">No related cases</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <h3 className="font-medium text-gray-900 mb-3">Related Cases ({cases.length})</h3>
      <div className="space-y-2">
        {cases.map((caseItem) => (
          <div
            key={caseItem.recordId}
            className="bg-white rounded p-3 hover:shadow-sm transition-shadow cursor-pointer"
            onClick={() => onCaseClick(caseItem.recordId)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[#E31937] mb-1">
                  {caseItem.recordId}
                </div>
                <div className="text-sm text-gray-900 truncate whitespace-nowrap mb-2" title={caseItem.description}>
                  {caseItem.description}
                </div>
                <div className="flex gap-2">
                  <span className={`inline-flex whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium ${caseStatusColors[caseItem.status]}`}>
                    {caseItem.status}
                  </span>
                  <span className={`inline-flex whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium ${casePriorityColors[caseItem.priority]}`}>
                    {caseItem.priority}
                  </span>
                </div>
              </div>
              {onRemoveCase && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveCase(caseItem.recordId);
                  }}
                  className="ml-2 px-2.5 py-1 text-xs border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface LinkedEntityListProps {
  title: string;
  entities: any[];
  fields: { label: string; key: string }[];
  onEntityClick?: (recordId: string) => void;
  onRemoveEntity?: (recordId: string) => void;
  removeLabel?: string;
}

export function LinkedEntityList({ title, entities, fields, onEntityClick, onRemoveEntity, removeLabel = "Remove" }: LinkedEntityListProps) {
  if (entities.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-medium text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-500">No linked {title.toLowerCase()}</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <h3 className="font-medium text-gray-900 mb-3">{title} ({entities.length})</h3>
      <div className="space-y-2">
        {entities.map((entity, index) => (
          <div
            key={entity.recordId ?? `${title}-${index}`}
            className={`bg-white rounded p-3 hover:shadow-sm transition-shadow ${onEntityClick ? "cursor-pointer" : ""}`}
            onClick={() => {
              if (onEntityClick && entity.recordId) {
                onEntityClick(entity.recordId);
              }
            }}
          >
            <div className="space-y-1">
              {fields.map((field) => (
                <div key={field.key} className="text-sm">
                  <span className="font-medium text-gray-600">{field.label}: </span>
                  {field.key === "recordId" && onEntityClick && entity[field.key] ? (
                    <span className="font-medium text-[#E31937]">{entity[field.key]}</span>
                  ) : (
                    <span className="text-gray-900">{entity[field.key] || "-"}</span>
                  )}
                </div>
              ))}
            </div>
            {onRemoveEntity && entity.recordId && (
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveEntity(entity.recordId);
                  }}
                  className="px-2.5 py-1 text-xs border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100"
                >
                  {removeLabel}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
