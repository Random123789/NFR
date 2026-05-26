import { useMemo, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Check } from "lucide-react";

type TypeaheadInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  value: string;
  options: readonly string[];
  optionLimit?: number;
  onChange: (nextValue: string) => void;
};

type TypeaheadTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> & {
  value: string;
  options: readonly string[];
  optionLimit?: number;
  onChange: (nextValue: string) => void;
};

function normalizeOption(value: string) {
  return value.trim().toLowerCase();
}

function uniqueSortedOptions(options: readonly string[]) {
  const seen = new Map<string, string>();
  for (const option of options) {
    const value = option.trim();
    if (!value) continue;

    const key = normalizeOption(value);
    if (!seen.has(key)) {
      seen.set(key, value);
    }
  }

  return [...seen.values()].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base", numeric: true }),
  );
}

function compareSuggestionMatch(searchValue: string) {
  return (left: string, right: string) => {
    const normalizedLeft = normalizeOption(left);
    const normalizedRight = normalizeOption(right);
    const leftStartsWith = normalizedLeft.startsWith(searchValue);
    const rightStartsWith = normalizedRight.startsWith(searchValue);

    if (leftStartsWith !== rightStartsWith) {
      return leftStartsWith ? -1 : 1;
    }

    return left.localeCompare(right, undefined, { sensitivity: "base", numeric: true });
  };
}

function useTypeaheadOptions(value: string, options: readonly string[], optionLimit: number) {
  const [isFocused, setIsFocused] = useState(false);
  const normalizedValue = normalizeOption(value);
  const sortedOptions = useMemo(() => uniqueSortedOptions(options), [options]);
  const filteredOptions = useMemo(() => {
    const matches = normalizedValue
      ? sortedOptions
          .filter((option) => normalizeOption(option).includes(normalizedValue))
          .sort(compareSuggestionMatch(normalizedValue))
      : sortedOptions;

    return matches.slice(0, optionLimit);
  }, [normalizedValue, optionLimit, sortedOptions]);
  const showSuggestions = isFocused && filteredOptions.length > 0;

  return { filteredOptions, normalizedValue, setIsFocused, showSuggestions };
}

function TypeaheadSuggestions({
  options,
  normalizedValue,
  onSelect,
}: {
  options: string[];
  normalizedValue: string;
  onSelect: (option: string) => void;
}) {
  return (
    <div className="absolute left-0 right-0 z-40 mt-1 max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
      {options.map((option) => {
        const isSelected = normalizedValue !== "" && normalizeOption(option) === normalizedValue;
        return (
          <button
            key={option}
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(option);
            }}
            className={`flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-gray-50 ${
              isSelected ? "bg-red-50 text-[#E31937]" : "text-gray-800"
            }`}
          >
            <span className="min-w-0 flex-1 truncate">{option}</span>
            {isSelected ? <Check className="h-4 w-4 shrink-0" /> : null}
          </button>
        );
      })}
    </div>
  );
}

export function TypeaheadInput({
  value,
  options,
  optionLimit = 8,
  onChange,
  className,
  onBlur,
  onFocus,
  ...inputProps
}: TypeaheadInputProps) {
  const { filteredOptions, normalizedValue, setIsFocused, showSuggestions } = useTypeaheadOptions(value, options, optionLimit);

  return (
    <div className="relative">
      <input
        {...inputProps}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={(event) => {
          onFocus?.(event);
          setIsFocused(true);
        }}
        onBlur={(event) => {
          onBlur?.(event);
          setIsFocused(false);
        }}
        className={className}
        autoComplete="off"
      />
      {showSuggestions ? (
        <TypeaheadSuggestions
          options={filteredOptions}
          normalizedValue={normalizedValue}
          onSelect={(option) => {
            onChange(option);
            setIsFocused(false);
          }}
        />
      ) : null}
    </div>
  );
}

export function TypeaheadTextarea({
  value,
  options,
  optionLimit = 8,
  onChange,
  className,
  onBlur,
  onFocus,
  ...textareaProps
}: TypeaheadTextareaProps) {
  const { filteredOptions, normalizedValue, setIsFocused, showSuggestions } = useTypeaheadOptions(value, options, optionLimit);

  return (
    <div className="relative">
      <textarea
        {...textareaProps}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={(event) => {
          onFocus?.(event);
          setIsFocused(true);
        }}
        onBlur={(event) => {
          onBlur?.(event);
          setIsFocused(false);
        }}
        className={className}
      />
      {showSuggestions ? (
        <TypeaheadSuggestions
          options={filteredOptions}
          normalizedValue={normalizedValue}
          onSelect={(option) => {
            onChange(option);
            setIsFocused(false);
          }}
        />
      ) : null}
    </div>
  );
}
