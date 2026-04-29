import { Columns3, RotateCcw } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

type TableFieldOption<Key extends string> = {
  key: Key;
  label: string;
};

type TableFieldSelectorProps<Key extends string> = {
  columns: TableFieldOption<Key>[];
  visibleKeys: Key[];
  onToggle: (key: Key) => void;
  onReset: () => void;
};

export function TableFieldSelector<Key extends string>({
  columns,
  visibleKeys,
  onToggle,
  onReset,
}: TableFieldSelectorProps<Key>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 self-start rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 sm:self-auto"
        >
          <Columns3 className="h-4 w-4" />
          Fields
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Table fields</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.key}
            checked={visibleKeys.includes(column.key)}
            disabled={visibleKeys.length === 1 && visibleKeys.includes(column.key)}
            onCheckedChange={() => onToggle(column.key)}
            onSelect={(event) => event.preventDefault()}
          >
            {column.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onReset} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Reset fields
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
