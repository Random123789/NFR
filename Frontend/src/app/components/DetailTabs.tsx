export type DetailTabItem = {
  key: string;
  label: string;
};

type DetailTabsProps = {
  tabs: DetailTabItem[];
  activeTab: string;
  onChange: (tab: string) => void;
};

export function DetailTabs({ tabs, activeTab, onChange }: DetailTabsProps) {
  return (
    <div className="border-b border-gray-200 pb-2">
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-[#E31937] text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
