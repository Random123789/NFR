import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Checkbox } from "./ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

export type SelectOption = {
  value: string;
  label: string;
  description?: string | null;
};

function optionMatchesSearch(option: SelectOption, searchValue: string) {
  return [option.label, option.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(searchValue);
}

export function SearchableSelect({
  label,
  value,
  options,
  emptyLabel,
  searchPlaceholder,
  noOptionsLabel = "No records available",
  onChange,
}: {
  label: string;
  value: string | null | undefined;
  options: SelectOption[];
  emptyLabel: string;
  searchPlaceholder?: string;
  noOptionsLabel?: string;
  onChange: (nextValue: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const selectedOption = options.find((option) => option.value === value);
  const normalizedSearch = searchValue.trim().toLowerCase();
  const filteredOptions = normalizedSearch ? options.filter((option) => optionMatchesSearch(option, normalizedSearch)) : options;

  const handleChange = (nextValue: string) => {
    onChange(nextValue);
    setSearchValue("");
    setIsOpen(false);
  };

  return (
    <Popover
      open={isOpen}
      onOpenChange={(nextOpen) => {
        setIsOpen(nextOpen);
        if (!nextOpen) setSearchValue("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex min-h-[42px] w-full items-center justify-between gap-3 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
        >
          {selectedOption ? (
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-gray-900">{selectedOption.label}</span>
              {selectedOption.description ? (
                <span className="mt-0.5 block truncate text-xs text-gray-500">{selectedOption.description}</span>
              ) : null}
            </span>
          ) : (
            <span className="min-w-0 flex-1 truncate text-gray-600">{emptyLabel}</span>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-80 p-2" align="start">
        <input
          type="text"
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder={searchPlaceholder ?? `Search ${label.toLowerCase()}`}
          className="mb-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31937]"
        />
        <div className="max-h-72 space-y-1 overflow-auto pr-1">
          <button
            type="button"
            className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-gray-50 ${value ? "text-gray-700" : "bg-red-50 text-[#E31937]"}`}
            onClick={() => handleChange("")}
          >
            <span>{emptyLabel}</span>
            {!value ? <Check className="h-4 w-4 shrink-0" /> : null}
          </button>
          {options.length === 0 ? (
            <div className="px-2 py-2 text-sm text-gray-500">{noOptionsLabel}</div>
          ) : filteredOptions.length === 0 ? (
            <div className="px-2 py-3 text-sm text-gray-500">No matching records</div>
          ) : (
            filteredOptions.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`flex w-full items-start justify-between gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-gray-50 ${isSelected ? "bg-red-50" : ""}`}
                  onClick={() => handleChange(option.value)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-900">{option.label}</span>
                    {option.description ? (
                      <span className="mt-0.5 block truncate text-xs text-gray-500">{option.description}</span>
                    ) : null}
                  </span>
                  {isSelected ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#E31937]" /> : null}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function MultiRecordDropdown({
  label,
  values,
  options,
  emptyLabel,
  searchPlaceholder,
  onChange,
}: {
  label: string;
  values: string[];
  options: SelectOption[];
  emptyLabel?: string;
  searchPlaceholder?: string;
  onChange: (nextValues: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const selectedOptions = options.filter((option) => values.includes(option.value));
  const normalizedSearch = searchValue.trim().toLowerCase();
  const filteredOptions = normalizedSearch ? options.filter((option) => optionMatchesSearch(option, normalizedSearch)) : options;

  return (
    <Popover
      open={isOpen}
      onOpenChange={(nextOpen) => {
        setIsOpen(nextOpen);
        if (!nextOpen) setSearchValue("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex min-h-[42px] w-full items-center justify-between gap-3 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
        >
          <span className="min-w-0 flex-1">
            <span className={`block truncate ${selectedOptions.length > 0 ? "font-medium text-gray-900" : "text-gray-600"}`}>
              {selectedOptions.length > 0
                ? selectedOptions.map((option) => option.label).join(", ")
                : emptyLabel ?? `Select ${label}`}
            </span>
            {selectedOptions.length > 1 ? (
              <span className="mt-0.5 block text-xs text-gray-500">{selectedOptions.length} selected</span>
            ) : selectedOptions[0]?.description ? (
              <span className="mt-0.5 block truncate text-xs text-gray-500">{selectedOptions[0].description}</span>
            ) : null}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-80 p-2" align="start">
        <input
          type="text"
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder={searchPlaceholder ?? `Search ${label.toLowerCase()}`}
          className="mb-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31937]"
        />
        <div className="max-h-72 space-y-1 overflow-auto pr-1">
          {options.length === 0 ? (
            <div className="px-2 py-2 text-sm text-gray-500">No records available</div>
          ) : filteredOptions.length === 0 ? (
            <div className="px-2 py-3 text-sm text-gray-500">No matching records</div>
          ) : (
            filteredOptions.map((option) => {
              const checked = values.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`flex w-full items-start gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-gray-50 ${checked ? "bg-red-50" : ""}`}
                  onClick={() => {
                    const nextValues = checked
                      ? values.filter((value) => value !== option.value)
                      : [...values, option.value];
                    onChange(nextValues);
                  }}
                >
                  <Checkbox checked={checked} className="pointer-events-none mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-gray-900">{option.label}</span>
                    {option.description ? (
                      <span className="mt-0.5 line-clamp-2 text-xs leading-snug text-gray-500">{option.description}</span>
                    ) : null}
                  </span>
                  {checked ? <Check className="h-4 w-4 shrink-0 text-[#E31937]" /> : null}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
