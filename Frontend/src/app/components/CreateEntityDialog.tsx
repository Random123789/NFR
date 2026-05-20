import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, PlusCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Checkbox } from "./ui/checkbox";
import {
  addCaseLink,
  createAccount,
  createCase,
  createKnock,
  createMantis,
  createProduct,
  createProject,
  listAssignableUsers,
  type AccountRecord,
  type AssignableUser,
  type CaseRecord,
  type KnockRecord,
  type MantisRecord,
  type ProductRecord,
  type ProjectRecord,
} from "../data/apiClient";
import { useAuth } from "../context/AuthContext";
import { useRecords } from "../context/RecordsContext";
import { useToast } from "../context/ToastContext";
import { accountTypes, accountVerticals, type AccountType, type AccountVertical } from "../data/accountOptions";
import { caseCategories, caseEscalationTypes, casePriorities, caseStatuses } from "../data/caseOptions";
import { buildMantisUrl, mantisCategories, mantisStatuses } from "../data/mantisOptions";
import { projectStages } from "../data/projectOptions";
import { formatRelatedCaseOption, getRelatedCaseLabelParts } from "../utils/caseLabels";
import { normalizeUsdIntegerInput, parseUsdIntegerInput } from "../utils/currency";

export type CreateEntityType = "case" | "account" | "project" | "mantis" | "knock" | "product";

type CreatedRecordByType = {
  case: CaseRecord;
  account: AccountRecord;
  project: ProjectRecord;
  mantis: MantisRecord;
  knock: KnockRecord;
  product: ProductRecord;
};

type FormData = {
  case: {
    description: string;
    priority: string;
    category: string;
    status: string;
    assignedTo: string;
    seOwner: string;
    accountIds: string[];
    project: string;
    productIds: string[];
    closeDate: string;
    escalationType: string;
    escalationNote: string;
    knockIds: string[];
    mantisIds: string[];
  };
  account: {
    accountName: string;
    website: string;
    type: string;
    vertical: string;
    linkedCase: string;
  };
  project: {
    projectName: string;
    accountId: string;
    startDate: string;
    closeDate: string;
    seOwner: string;
    isClosed: boolean;
    stage: string;
    sfdc: string;
    sfdcValue: string;
    linkedCase: string;
  };
  product: {
    productName: string;
    productFamily: string;
    productVersion: string;
    productUrl: string;
    description: string;
    linkedCase: string;
  };
  mantis: {
    description: string;
    mantisId: string;
    mantisUrl: string;
    category: string;
    mantisRequestDate: string;
    mantisTargetDate: string;
    mantisStatus: string;
    linkedCase: string;
  };
  knock: {
    description: string;
    knockId: string;
    knockUrl: string;
    requestDate: string;
    targetDate: string;
    status: string;
    linkedCase: string;
  };
};

type CreateEntityDialogProps<T extends CreateEntityType> = {
  entityType: T;
  onCreated?: (record: CreatedRecordByType[T]) => void;
  className?: string;
  triggerLabel?: string;
  triggerTitle?: string;
  initialValues?: Partial<FormData[T]>;
  hideLinkedCaseSelect?: boolean;
};

const entityLabels: Record<CreateEntityType, string> = {
  case: "Case",
  account: "Account",
  project: "Project",
  mantis: "Mantis",
  knock: "Knock",
  product: "Product",
};

const inputClassName = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31937]";
const labelClassName = "block text-sm font-medium text-gray-700 mb-1";

type SelectOption = {
  value: string;
  label: string;
  description?: string | null;
};

function createEmptyQuickAccountDraft() {
  return {
    accountName: "",
    website: "",
    type: "Customer",
    vertical: "Commercial",
  };
}

function createInitialFormData(userName?: string | null): FormData {
  return {
    case: {
      description: "",
      priority: "Medium",
      category: "NFR",
      status: "New",
      assignedTo: "",
      seOwner: userName ?? "",
      accountIds: [],
      project: "",
      productIds: [],
      closeDate: "",
      escalationType: "",
      escalationNote: "",
      knockIds: [],
      mantisIds: [],
    },
    account: {
      accountName: "",
      website: "",
      type: "Customer",
      vertical: "Commercial",
      linkedCase: "",
    },
    project: {
      projectName: "",
      accountId: "",
      startDate: "",
      closeDate: "",
      seOwner: userName ?? "",
      isClosed: false,
      stage: "Technical Qualification",
      sfdc: "",
      sfdcValue: "",
      linkedCase: "",
    },
    product: {
      productName: "",
      productFamily: "",
      productVersion: "",
      productUrl: "",
      description: "",
      linkedCase: "",
    },
    mantis: {
      description: "",
      mantisId: "",
      mantisUrl: "",
      category: "Feature Request",
      mantisRequestDate: "",
      mantisTargetDate: "",
      mantisStatus: "New",
      linkedCase: "",
    },
    knock: {
      description: "",
      knockId: "",
      knockUrl: "",
      requestDate: "",
      targetDate: "",
      status: "Active",
      linkedCase: "",
    },
  };
}

function createEmptyQuickProjectDraft(userName?: string | null) {
  return createInitialFormData(userName).project;
}

function createEmptyQuickProductDraft() {
  return createInitialFormData().product;
}

function createEmptyQuickMantisDraft() {
  return createInitialFormData().mantis;
}

function createEmptyQuickKnockDraft() {
  return createInitialFormData().knock;
}

function cleanString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function nullableString(value: string | null | undefined) {
  return cleanString(value) ?? null;
}

function isActiveUser(user: AssignableUser) {
  return Boolean(user.isActive);
}

function isSeUserRole(role: string | null | undefined) {
  const normalized = role?.trim().toLowerCase();
  return normalized === "user" || normalized === "se user" || normalized === "se_user";
}

function joinDescriptionParts(parts: Array<string | null | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join(" | ");
}

function SearchableSelect({
  label,
  value,
  options,
  emptyLabel,
  searchPlaceholder,
  onChange,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  emptyLabel: string;
  searchPlaceholder?: string;
  onChange: (nextValue: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const selectedOption = options.find((option) => option.value === value);
  const normalizedSearch = searchValue.trim().toLowerCase();
  const filteredOptions = normalizedSearch
    ? options.filter((option) =>
        [option.label, option.description]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch),
      )
    : options;

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
          className="flex min-h-[38px] w-full items-center justify-between gap-3 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
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
          {filteredOptions.length === 0 ? (
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

function MultiRecordDropdown({
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
  const filteredOptions = normalizedSearch
    ? options.filter((option) =>
        [option.label, option.description]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch),
      )
    : options;

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
          className="flex min-h-[38px] w-full items-center justify-between gap-3 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
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

function RelatedCaseSelect({
  value,
  cases,
  accounts,
  projects,
  onChange,
}: {
  value: string;
  cases: CaseRecord[];
  accounts: AccountRecord[];
  projects: ProjectRecord[];
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const selectedCase = cases.find((caseItem) => caseItem.recordId === value);
  const selectedParts = selectedCase ? getRelatedCaseLabelParts(selectedCase, accounts, projects) : null;
  const normalizedSearch = searchValue.trim().toLowerCase();
  const filteredCases = normalizedSearch
    ? cases.filter((caseItem) => formatRelatedCaseOption(caseItem, accounts, projects).toLowerCase().includes(normalizedSearch))
    : cases;

  const handleSelect = (nextValue: string) => {
    onChange(nextValue);
    setSearchValue("");
    setIsOpen(false);
  };

  return (
    <div>
      <label className={labelClassName}>Related Case</label>
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
            {selectedParts ? (
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-gray-900">
                  {selectedParts.account} | {selectedParts.project}
                </span>
                <span className="mt-0.5 block truncate text-xs text-gray-500">{selectedParts.description}</span>
              </span>
            ) : (
              <span className="min-w-0 flex-1 text-gray-600">No linked case</span>
            )}
            <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
          <input
            type="text"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Search account, project, or description"
            className="mb-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E31937]"
          />
          <div className="max-h-72 space-y-1 overflow-auto pr-1">
            <button
              type="button"
              className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-gray-50 ${value ? "text-gray-700" : "bg-red-50 text-[#E31937]"}`}
              onClick={() => handleSelect("")}
            >
              <span>No linked case</span>
              {!value ? <Check className="h-4 w-4 shrink-0" /> : null}
            </button>
            {filteredCases.length === 0 ? (
              <div className="px-2 py-3 text-sm text-gray-500">No matching cases</div>
            ) : (
              filteredCases.map((caseItem) => {
                const parts = getRelatedCaseLabelParts(caseItem, accounts, projects);
                const isSelected = value === caseItem.recordId;
                return (
                  <button
                    key={caseItem.recordId}
                    type="button"
                    className={`flex w-full items-start justify-between gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-gray-50 ${isSelected ? "bg-red-50" : ""}`}
                    onClick={() => handleSelect(caseItem.recordId)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1 text-xs font-medium text-gray-600">
                        <span className="truncate">{parts.account}</span>
                        <span className="shrink-0 text-gray-300">|</span>
                        <span className="truncate">{parts.project}</span>
                      </span>
                      <span className="mt-1 line-clamp-2 text-sm leading-snug text-gray-900">{parts.description}</span>
                    </span>
                    {isSelected ? <Check className="mt-1 h-4 w-4 shrink-0 text-[#E31937]" /> : null}
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function CreateEntityDialog<T extends CreateEntityType>({
  entityType,
  onCreated,
  className,
  triggerLabel,
  triggerTitle,
  initialValues,
  hideLinkedCaseSelect = false,
}: CreateEntityDialogProps<T>) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const {
    accounts,
    projects,
    products,
    mantisRecords,
    knocks,
    cases,
    refreshRecords,
    upsertAccount,
    upsertProduct,
    upsertProject,
    upsertMantis,
    upsertKnock,
    upsertCase,
  } = useRecords();
  const [open, setOpen] = useState(false);
  const defaultCaseSeOwner = isSeUserRole(user?.role) ? user?.displayName : "";
  const [formData, setFormData] = useState<FormData>(() => createInitialFormData(defaultCaseSeOwner));
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [quickAccountOpen, setQuickAccountOpen] = useState(false);
  const [quickAccountDraft, setQuickAccountDraft] = useState(createEmptyQuickAccountDraft);
  const [isCreatingQuickAccount, setIsCreatingQuickAccount] = useState(false);
  const [quickAccountError, setQuickAccountError] = useState("");
  const [quickProjectOpen, setQuickProjectOpen] = useState(false);
  const [quickProjectDraft, setQuickProjectDraft] = useState(() => createEmptyQuickProjectDraft(defaultCaseSeOwner));
  const [isCreatingQuickProject, setIsCreatingQuickProject] = useState(false);
  const [quickProjectError, setQuickProjectError] = useState("");
  const [quickProductOpen, setQuickProductOpen] = useState(false);
  const [quickProductDraft, setQuickProductDraft] = useState(createEmptyQuickProductDraft);
  const [isCreatingQuickProduct, setIsCreatingQuickProduct] = useState(false);
  const [quickProductError, setQuickProductError] = useState("");
  const [quickMantisOpen, setQuickMantisOpen] = useState(false);
  const [quickMantisDraft, setQuickMantisDraft] = useState(createEmptyQuickMantisDraft);
  const [isCreatingQuickMantis, setIsCreatingQuickMantis] = useState(false);
  const [quickMantisError, setQuickMantisError] = useState("");
  const [quickKnockOpen, setQuickKnockOpen] = useState(false);
  const [quickKnockDraft, setQuickKnockDraft] = useState(createEmptyQuickKnockDraft);
  const [isCreatingQuickKnock, setIsCreatingQuickKnock] = useState(false);
  const [quickKnockError, setQuickKnockError] = useState("");
  const activeAssignableUsers = useMemo(() => assignableUsers.filter(isActiveUser), [assignableUsers]);
  const entityLabel = entityLabels[entityType];
  const defaultTriggerClassName = "inline-flex items-center justify-center gap-2 rounded-lg bg-[#E31937] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#c41230]";
  const triggerClassName = className ?? defaultTriggerClassName;
  const accountNameById = useMemo(
    () => new Map(accounts.map((account) => [account.recordId, account.accountName])),
    [accounts],
  );
  const accountSelectOptions = useMemo<SelectOption[]>(
    () => accounts.map((account) => ({
      value: account.recordId,
      label: account.accountName,
      description: joinDescriptionParts([account.type, account.vertical]),
    })),
    [accounts],
  );
  const projectSelectOptions = useMemo<SelectOption[]>(
    () => projects.map((project) => ({
      value: project.recordId,
      label: project.projectName,
      description: joinDescriptionParts([accountNameById.get(project.accountId ?? ""), project.stage]),
    })),
    [accountNameById, projects],
  );
  const productSelectOptions = useMemo<SelectOption[]>(
    () => products.map((product) => ({
      value: product.recordId,
      label: product.productName,
      description: joinDescriptionParts([product.productFamily, product.productVersion ? `Version ${product.productVersion}` : null, product.description]),
    })),
    [products],
  );
  const assignableUserSelectOptions = useMemo<SelectOption[]>(
    () => activeAssignableUsers.map((assignableUser) => ({
      value: assignableUser.displayName,
      label: assignableUser.displayName,
      description: joinDescriptionParts([assignableUser.email, assignableUser.vertical]),
    })),
    [activeAssignableUsers],
  );
  const mantisSelectOptions = useMemo<SelectOption[]>(
    () => mantisRecords.map((mantis) => ({
      value: mantis.recordId,
      label: mantis.mantisId || "No Mantis ID",
      description: joinDescriptionParts([mantis.mantisStatus, mantis.description]),
    })),
    [mantisRecords],
  );
  const knockSelectOptions = useMemo<SelectOption[]>(
    () => knocks.map((knock) => ({
      value: knock.recordId,
      label: knock.knockId || "No Knock ID",
      description: joinDescriptionParts([knock.status, knock.description]),
    })),
    [knocks],
  );

  const buildInitialFormData = () => {
    const nextFormData = createInitialFormData(defaultCaseSeOwner);
    if (!initialValues) {
      return nextFormData;
    }

    return {
      ...nextFormData,
      [entityType]: {
        ...nextFormData[entityType],
        ...initialValues,
      },
    } as FormData;
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setFormData(buildInitialFormData());
      setQuickAccountDraft(createEmptyQuickAccountDraft());
      setQuickAccountOpen(false);
      setQuickAccountError("");
      setQuickProjectDraft(createEmptyQuickProjectDraft(defaultCaseSeOwner));
      setQuickProjectOpen(false);
      setQuickProjectError("");
      setQuickProductDraft(createEmptyQuickProductDraft());
      setQuickProductOpen(false);
      setQuickProductError("");
      setQuickMantisDraft(createEmptyQuickMantisDraft());
      setQuickMantisOpen(false);
      setQuickMantisError("");
      setQuickKnockDraft(createEmptyQuickKnockDraft());
      setQuickKnockOpen(false);
      setQuickKnockError("");
    }
    setSubmitError("");
    setOpen(nextOpen);
  };

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    void (async () => {
      try {
        const users = await listAssignableUsers();
        if (!cancelled) {
          setAssignableUsers(users);
        }
      } catch (error) {
        console.error("Failed to load assignable users:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const getValidationError = () => {
    if (entityType === "case" && !cleanString(formData.case.description)) {
      return "Case description is required.";
    }
    if (entityType === "account" && !cleanString(formData.account.accountName)) {
      return "Account name is required.";
    }
    if (entityType === "project" && !cleanString(formData.project.projectName)) {
      return "Project name is required.";
    }
    if (entityType === "product" && !cleanString(formData.product.productName)) {
      return "Product name is required.";
    }
    if (entityType === "mantis" && !cleanString(formData.mantis.description)) {
      return "Mantis description is required.";
    }
    if (entityType === "knock" && !cleanString(formData.knock.description)) {
      return "Knock description is required.";
    }
    return "";
  };

  const linkToCase = async (
    linkedCaseId: string,
    linkType: Exclude<CreateEntityType, "case">,
    recordId: string,
  ) => {
    const caseId = cleanString(linkedCaseId);
    if (!caseId) return;

    await addCaseLink(caseId, linkType, recordId);
  };

  const handleCreateQuickAccount = async (onSelect: (recordId: string) => void) => {
    const accountName = cleanString(quickAccountDraft.accountName);
    if (!accountName) {
      const message = "Account name is required.";
      setQuickAccountError(message);
      showToast(message, "error");
      return;
    }

    setIsCreatingQuickAccount(true);
    setQuickAccountError("");
    try {
      const created = await createAccount({
        accountName,
        website: nullableString(quickAccountDraft.website),
        type: nullableString(quickAccountDraft.type) as AccountType | null,
        vertical: nullableString(quickAccountDraft.vertical) as AccountVertical | null,
      });

      upsertAccount(created);
      onSelect(created.recordId);
      setQuickAccountDraft(createEmptyQuickAccountDraft());
      setQuickAccountOpen(false);
      showToast("Created Account.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create account.";
      setQuickAccountError(message);
      showToast(message, "error");
    } finally {
      setIsCreatingQuickAccount(false);
    }
  };

  const renderQuickAccountFields = (onSelect: (recordId: string) => void) => {
    if (!quickAccountOpen) return null;

    return (
      <div className="mt-2 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClassName}>Account Name *</label>
            <input
              type="text"
              value={quickAccountDraft.accountName}
              onChange={(event) => setQuickAccountDraft({ ...quickAccountDraft, accountName: event.target.value })}
              className={inputClassName}
            />
          </div>
          <div>
            <label className={labelClassName}>Type</label>
            <select
              value={quickAccountDraft.type}
              onChange={(event) => setQuickAccountDraft({ ...quickAccountDraft, type: event.target.value })}
              className={inputClassName}
            >
              {accountTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClassName}>Vertical</label>
            <select
              value={quickAccountDraft.vertical}
              onChange={(event) => setQuickAccountDraft({ ...quickAccountDraft, vertical: event.target.value })}
              className={inputClassName}
            >
              {accountVerticals.map((vertical) => (
                <option key={vertical} value={vertical}>
                  {vertical}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClassName}>Website</label>
            <input
              type="url"
              value={quickAccountDraft.website}
              onChange={(event) => setQuickAccountDraft({ ...quickAccountDraft, website: event.target.value })}
              className={inputClassName}
              placeholder="https://example.com"
            />
          </div>
        </div>
        {quickAccountError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {quickAccountError}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setQuickAccountOpen(false);
              setQuickAccountDraft(createEmptyQuickAccountDraft());
              setQuickAccountError("");
            }}
            disabled={isCreatingQuickAccount}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleCreateQuickAccount(onSelect)}
            disabled={isCreatingQuickAccount}
            className="rounded-lg bg-[#E31937] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#c41230] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreatingQuickAccount ? "Creating..." : "Create Account"}
          </button>
        </div>
      </div>
    );
  };

  const renderAccountSelect = ({
    values,
    onChange,
    emptyLabel,
  }: {
    values: string[];
    onChange: (recordIds: string[]) => void;
    emptyLabel: string;
  }) => (
    <div>
      <label className={labelClassName}>Linked Accounts</label>
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <MultiRecordDropdown
            label="Accounts"
            values={values}
            options={accountSelectOptions}
            emptyLabel={emptyLabel}
            searchPlaceholder="Search accounts"
            onChange={onChange}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setQuickAccountOpen(true);
            setQuickAccountError("");
          }}
          className="inline-flex h-[38px] shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          New
        </button>
      </div>
      {renderQuickAccountFields((recordId) => onChange(values.includes(recordId) ? values : [...values, recordId]))}
    </div>
  );

  const handleCreateQuickProject = async (onSelect: (recordId: string) => void) => {
    const projectName = cleanString(quickProjectDraft.projectName);
    if (!projectName) {
      const message = "Project name is required.";
      setQuickProjectError(message);
      showToast(message, "error");
      return;
    }

    setIsCreatingQuickProject(true);
    setQuickProjectError("");
    try {
      const created = await createProject({
        projectName,
        accountId: nullableString(quickProjectDraft.accountId),
        startDate: nullableString(quickProjectDraft.startDate),
        closeDate: nullableString(quickProjectDraft.closeDate),
        seOwner: nullableString(quickProjectDraft.seOwner),
        isClosed: quickProjectDraft.isClosed,
        stage: nullableString(quickProjectDraft.stage),
        sfdc: nullableString(quickProjectDraft.sfdc),
        sfdcValue: parseUsdIntegerInput(quickProjectDraft.sfdcValue),
      });

      upsertProject(created);
      onSelect(created.recordId);
      setQuickProjectDraft(createEmptyQuickProjectDraft(defaultCaseSeOwner));
      setQuickProjectOpen(false);
      showToast("Created Project.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create project.";
      setQuickProjectError(message);
      showToast(message, "error");
    } finally {
      setIsCreatingQuickProject(false);
    }
  };

  const handleCreateQuickProduct = async (onSelect: (recordId: string) => void) => {
    const productName = cleanString(quickProductDraft.productName);
    if (!productName) {
      const message = "Product name is required.";
      setQuickProductError(message);
      showToast(message, "error");
      return;
    }

    setIsCreatingQuickProduct(true);
    setQuickProductError("");
    try {
      const created = await createProduct({
        productName,
        productFamily: nullableString(quickProductDraft.productFamily),
        productVersion: nullableString(quickProductDraft.productVersion),
        productUrl: nullableString(quickProductDraft.productUrl),
        description: nullableString(quickProductDraft.description),
      });

      upsertProduct(created);
      onSelect(created.recordId);
      setQuickProductDraft(createEmptyQuickProductDraft());
      setQuickProductOpen(false);
      showToast("Created Product.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create product.";
      setQuickProductError(message);
      showToast(message, "error");
    } finally {
      setIsCreatingQuickProduct(false);
    }
  };

  const handleCreateQuickMantis = async (onSelect: (recordId: string) => void) => {
    const description = cleanString(quickMantisDraft.description);
    if (!description) {
      const message = "Mantis description is required.";
      setQuickMantisError(message);
      showToast(message, "error");
      return;
    }

    setIsCreatingQuickMantis(true);
    setQuickMantisError("");
    try {
      const created = await createMantis({
        description,
        mantisId: nullableString(quickMantisDraft.mantisId),
        mantisUrl: nullableString(buildMantisUrl(quickMantisDraft.mantisId)),
        category: nullableString(quickMantisDraft.category),
        mantisStatus: nullableString(quickMantisDraft.mantisStatus),
        mantisRequestDate: nullableString(quickMantisDraft.mantisRequestDate),
        mantisTargetDate: nullableString(quickMantisDraft.mantisTargetDate),
      });

      upsertMantis(created);
      onSelect(created.recordId);
      setQuickMantisDraft(createEmptyQuickMantisDraft());
      setQuickMantisOpen(false);
      showToast("Created Mantis.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create mantis.";
      setQuickMantisError(message);
      showToast(message, "error");
    } finally {
      setIsCreatingQuickMantis(false);
    }
  };

  const handleCreateQuickKnock = async (onSelect: (recordId: string) => void) => {
    const description = cleanString(quickKnockDraft.description);
    if (!description) {
      const message = "Knock description is required.";
      setQuickKnockError(message);
      showToast(message, "error");
      return;
    }

    setIsCreatingQuickKnock(true);
    setQuickKnockError("");
    try {
      const created = await createKnock({
        description,
        knockId: nullableString(quickKnockDraft.knockId),
        knockUrl: nullableString(quickKnockDraft.knockUrl),
        status: nullableString(quickKnockDraft.status),
        requestDate: nullableString(quickKnockDraft.requestDate),
        targetDate: nullableString(quickKnockDraft.targetDate),
      });

      upsertKnock(created);
      onSelect(created.recordId);
      setQuickKnockDraft(createEmptyQuickKnockDraft());
      setQuickKnockOpen(false);
      showToast("Created Knock.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create knock.";
      setQuickKnockError(message);
      showToast(message, "error");
    } finally {
      setIsCreatingQuickKnock(false);
    }
  };

  const quickCreateActions = ({
    error,
    isCreating,
    onCancel,
    onCreate,
    label,
  }: {
    error: string;
    isCreating: boolean;
    onCancel: () => void;
    onCreate: () => void;
    label: string;
  }) => (
    <>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isCreating}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onCreate}
          disabled={isCreating}
          className="rounded-lg bg-[#E31937] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#c41230] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isCreating ? "Creating..." : label}
        </button>
      </div>
    </>
  );

  const renderQuickProjectFields = (onSelect: (recordId: string) => void) => {
    if (!quickProjectOpen) return null;

    return (
      <div className="mt-2 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className={labelClassName}>Project Name *</label>
            <input
              type="text"
              value={quickProjectDraft.projectName}
              onChange={(event) => setQuickProjectDraft({ ...quickProjectDraft, projectName: event.target.value })}
              className={inputClassName}
            />
          </div>
          <div>
            <label className={labelClassName}>Account</label>
            <SearchableSelect
              label="Account"
              value={quickProjectDraft.accountId}
              options={accountSelectOptions}
              emptyLabel="No account"
              searchPlaceholder="Search accounts"
              onChange={(accountId) => setQuickProjectDraft({ ...quickProjectDraft, accountId })}
            />
          </div>
          <div>
            <label className={labelClassName}>Stage</label>
            <select
              value={quickProjectDraft.stage}
              onChange={(event) => setQuickProjectDraft({ ...quickProjectDraft, stage: event.target.value })}
              className={inputClassName}
            >
              {projectStages.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClassName}>Start Date</label>
            <input
              type="date"
              value={quickProjectDraft.startDate}
              onChange={(event) => setQuickProjectDraft({ ...quickProjectDraft, startDate: event.target.value })}
              className={inputClassName}
            />
          </div>
          <div>
            <label className={labelClassName}>Close Date</label>
            <input
              type="date"
              value={quickProjectDraft.closeDate}
              onChange={(event) => setQuickProjectDraft({ ...quickProjectDraft, closeDate: event.target.value })}
              className={inputClassName}
            />
          </div>
          <div>
            <label className={labelClassName}>SE Owner</label>
            <SearchableSelect
              label="SE owner"
              value={quickProjectDraft.seOwner}
              options={assignableUserSelectOptions}
              emptyLabel="No SE owner"
              searchPlaceholder="Search users"
              onChange={(seOwner) => setQuickProjectDraft({ ...quickProjectDraft, seOwner })}
            />
          </div>
          <div>
            <label className={labelClassName}>SFDC Value (USD)</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={quickProjectDraft.sfdcValue}
              onChange={(event) => setQuickProjectDraft({ ...quickProjectDraft, sfdcValue: normalizeUsdIntegerInput(event.target.value) })}
              className={inputClassName}
              placeholder="250000"
            />
          </div>
        </div>
        {quickCreateActions({
          error: quickProjectError,
          isCreating: isCreatingQuickProject,
          label: "Create Project",
          onCancel: () => {
            setQuickProjectOpen(false);
            setQuickProjectDraft(createEmptyQuickProjectDraft(defaultCaseSeOwner));
            setQuickProjectError("");
          },
          onCreate: () => void handleCreateQuickProject(onSelect),
        })}
      </div>
    );
  };

  const renderQuickProductFields = (onSelect: (recordId: string) => void) => {
    if (!quickProductOpen) return null;

    return (
      <div className="mt-2 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className={labelClassName}>Product Name *</label>
            <input
              type="text"
              value={quickProductDraft.productName}
              onChange={(event) => setQuickProductDraft({ ...quickProductDraft, productName: event.target.value })}
              className={inputClassName}
            />
          </div>
          <div>
            <label className={labelClassName}>Product Family</label>
            <input
              type="text"
              value={quickProductDraft.productFamily}
              onChange={(event) => setQuickProductDraft({ ...quickProductDraft, productFamily: event.target.value })}
              className={inputClassName}
            />
          </div>
          <div>
            <label className={labelClassName}>Version</label>
            <input
              type="text"
              value={quickProductDraft.productVersion}
              onChange={(event) => setQuickProductDraft({ ...quickProductDraft, productVersion: event.target.value })}
              className={inputClassName}
              placeholder="7.6, 2026.1, GA"
            />
          </div>
          <div>
            <label className={labelClassName}>Product URL</label>
            <input
              type="url"
              value={quickProductDraft.productUrl}
              onChange={(event) => setQuickProductDraft({ ...quickProductDraft, productUrl: event.target.value })}
              className={inputClassName}
              placeholder="https://www.fortinet.com/products"
            />
          </div>
          <div>
            <label className={labelClassName}>Description</label>
            <textarea
              value={quickProductDraft.description}
              onChange={(event) => setQuickProductDraft({ ...quickProductDraft, description: event.target.value })}
              className={inputClassName}
              rows={3}
            />
          </div>
        </div>
        {quickCreateActions({
          error: quickProductError,
          isCreating: isCreatingQuickProduct,
          label: "Create Product",
          onCancel: () => {
            setQuickProductOpen(false);
            setQuickProductDraft(createEmptyQuickProductDraft());
            setQuickProductError("");
          },
          onCreate: () => void handleCreateQuickProduct(onSelect),
        })}
      </div>
    );
  };

  const renderQuickMantisFields = (onSelect: (recordId: string) => void) => {
    if (!quickMantisOpen) return null;

    return (
      <div className="mt-2 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className={labelClassName}>Description *</label>
            <textarea
              value={quickMantisDraft.description}
              onChange={(event) => setQuickMantisDraft({ ...quickMantisDraft, description: event.target.value })}
              className={inputClassName}
              rows={3}
            />
          </div>
          <div>
            <label className={labelClassName}>Mantis ID</label>
            <input
              type="text"
              value={quickMantisDraft.mantisId}
              onChange={(event) =>
                setQuickMantisDraft({
                  ...quickMantisDraft,
                  mantisId: event.target.value,
                  mantisUrl: buildMantisUrl(event.target.value),
                })
              }
              className={inputClassName}
            />
          </div>
          <div>
            <label className={labelClassName}>Status</label>
            <select
              value={quickMantisDraft.mantisStatus}
              onChange={(event) => setQuickMantisDraft({ ...quickMantisDraft, mantisStatus: event.target.value })}
              className={inputClassName}
            >
              {mantisStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClassName}>Category</label>
            <select
              value={quickMantisDraft.category}
              onChange={(event) => setQuickMantisDraft({ ...quickMantisDraft, category: event.target.value })}
              className={inputClassName}
            >
              {mantisCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClassName}>Mantis URL</label>
            <input
              type="url"
              value={quickMantisDraft.mantisUrl}
              readOnly
              className={`${inputClassName} bg-gray-50 text-gray-700`}
              placeholder="Generated from Mantis ID"
            />
          </div>
          <div>
            <label className={labelClassName}>NFR Target Date</label>
            <input
              type="date"
              value={quickMantisDraft.mantisTargetDate}
              onChange={(event) => setQuickMantisDraft({ ...quickMantisDraft, mantisTargetDate: event.target.value })}
              className={inputClassName}
            />
          </div>
        </div>
        {quickCreateActions({
          error: quickMantisError,
          isCreating: isCreatingQuickMantis,
          label: "Create Mantis",
          onCancel: () => {
            setQuickMantisOpen(false);
            setQuickMantisDraft(createEmptyQuickMantisDraft());
            setQuickMantisError("");
          },
          onCreate: () => void handleCreateQuickMantis(onSelect),
        })}
      </div>
    );
  };

  const renderQuickKnockFields = (onSelect: (recordId: string) => void) => {
    if (!quickKnockOpen) return null;

    return (
      <div className="mt-2 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className={labelClassName}>Description *</label>
            <textarea
              value={quickKnockDraft.description}
              onChange={(event) => setQuickKnockDraft({ ...quickKnockDraft, description: event.target.value })}
              className={inputClassName}
              rows={3}
            />
          </div>
          <div>
            <label className={labelClassName}>Knock ID</label>
            <input
              type="text"
              value={quickKnockDraft.knockId}
              onChange={(event) => setQuickKnockDraft({ ...quickKnockDraft, knockId: event.target.value })}
              className={inputClassName}
            />
          </div>
          <div>
            <label className={labelClassName}>Status</label>
            <input
              type="text"
              value={quickKnockDraft.status}
              onChange={(event) => setQuickKnockDraft({ ...quickKnockDraft, status: event.target.value })}
              className={inputClassName}
            />
          </div>
          <div>
            <label className={labelClassName}>Knock URL</label>
            <input
              type="url"
              value={quickKnockDraft.knockUrl}
              onChange={(event) => setQuickKnockDraft({ ...quickKnockDraft, knockUrl: event.target.value })}
              className={inputClassName}
            />
          </div>
          <div>
            <label className={labelClassName}>Target Date</label>
            <input
              type="date"
              value={quickKnockDraft.targetDate}
              onChange={(event) => setQuickKnockDraft({ ...quickKnockDraft, targetDate: event.target.value })}
              className={inputClassName}
            />
          </div>
        </div>
        {quickCreateActions({
          error: quickKnockError,
          isCreating: isCreatingQuickKnock,
          label: "Create Knock",
          onCancel: () => {
            setQuickKnockOpen(false);
            setQuickKnockDraft(createEmptyQuickKnockDraft());
            setQuickKnockError("");
          },
          onCreate: () => void handleCreateQuickKnock(onSelect),
        })}
      </div>
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const validationError = getValidationError();
    if (validationError) {
      setSubmitError(validationError);
      showToast(validationError, "error");
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      let createdRecord: CreatedRecordByType[CreateEntityType];
      let caseLinkRequest: {
        linkedCaseId: string;
        linkType: Exclude<CreateEntityType, "case">;
        recordId: string;
      } | null = null;

      if (entityType === "case") {
        const selectedMantisIds = formData.case.mantisIds;
        const selectedKnockIds = formData.case.knockIds;
        const created = await createCase({
          description: formData.case.description.trim(),
          status: nullableString(formData.case.status),
          priority: nullableString(formData.case.priority),
          category: nullableString(formData.case.category),
          assignedTo: nullableString(formData.case.assignedTo),
          seOwner: nullableString(formData.case.seOwner),
          accountIds: formData.case.accountIds,
          project: nullableString(formData.case.project),
          productIds: formData.case.productIds,
          closeDate: nullableString(formData.case.closeDate),
          escalationType: nullableString(formData.case.escalationType),
          escalationNote: nullableString(formData.case.escalationNote),
          knockRecordIds: selectedKnockIds,
          mantisRecordIds: selectedMantisIds,
        });
        upsertCase(created);
        createdRecord = created;
      } else if (entityType === "account") {
        const created = await createAccount({
          accountName: formData.account.accountName.trim(),
          website: nullableString(formData.account.website),
          type: nullableString(formData.account.type) as AccountType | null,
          vertical: nullableString(formData.account.vertical) as AccountVertical | null,
        });
        upsertAccount(created);
        createdRecord = created;
        caseLinkRequest = { linkedCaseId: formData.account.linkedCase, linkType: "account", recordId: created.recordId };
      } else if (entityType === "project") {
        const created = await createProject({
          projectName: formData.project.projectName.trim(),
          accountId: nullableString(formData.project.accountId),
          startDate: nullableString(formData.project.startDate),
          closeDate: nullableString(formData.project.closeDate),
          seOwner: nullableString(formData.project.seOwner),
          isClosed: formData.project.isClosed,
          stage: nullableString(formData.project.stage),
          sfdc: nullableString(formData.project.sfdc),
          sfdcValue: parseUsdIntegerInput(formData.project.sfdcValue),
        });
        upsertProject(created);
        createdRecord = created;
        caseLinkRequest = { linkedCaseId: formData.project.linkedCase, linkType: "project", recordId: created.recordId };
      } else if (entityType === "product") {
        const created = await createProduct({
          productName: formData.product.productName.trim(),
          productFamily: nullableString(formData.product.productFamily),
          productVersion: nullableString(formData.product.productVersion),
          productUrl: nullableString(formData.product.productUrl),
          description: nullableString(formData.product.description),
        });
        upsertProduct(created);
        createdRecord = created;
        caseLinkRequest = { linkedCaseId: formData.product.linkedCase, linkType: "product", recordId: created.recordId };
      } else if (entityType === "mantis") {
        const created = await createMantis({
          description: formData.mantis.description.trim(),
          mantisId: nullableString(formData.mantis.mantisId),
          mantisUrl: nullableString(buildMantisUrl(formData.mantis.mantisId)),
          category: nullableString(formData.mantis.category),
          mantisStatus: nullableString(formData.mantis.mantisStatus),
          mantisRequestDate: nullableString(formData.mantis.mantisRequestDate),
          mantisTargetDate: nullableString(formData.mantis.mantisTargetDate),
        });
        upsertMantis(created);
        createdRecord = created;
        caseLinkRequest = { linkedCaseId: formData.mantis.linkedCase, linkType: "mantis", recordId: created.recordId };
      } else {
        const created = await createKnock({
          description: formData.knock.description.trim(),
          knockId: nullableString(formData.knock.knockId),
          knockUrl: nullableString(formData.knock.knockUrl),
          status: nullableString(formData.knock.status),
          requestDate: nullableString(formData.knock.requestDate),
          targetDate: nullableString(formData.knock.targetDate),
        });
        upsertKnock(created);
        createdRecord = created;
        caseLinkRequest = { linkedCaseId: formData.knock.linkedCase, linkType: "knock", recordId: created.recordId };
      }

      let linkWarning = "";
      if (caseLinkRequest && cleanString(caseLinkRequest.linkedCaseId)) {
        try {
          await linkToCase(caseLinkRequest.linkedCaseId, caseLinkRequest.linkType, caseLinkRequest.recordId);
        } catch (error) {
          console.error(`Created ${entityLabel.toLowerCase()} but failed to link case:`, error);
          linkWarning = `Created ${entityLabel}, but failed to link the selected case.`;
        }
      }

      await refreshRecords();
      showToast(linkWarning || `Created ${entityLabel}.`, linkWarning ? "warning" : "success");
      onCreated?.(createdRecord as CreatedRecordByType[T]);
      setOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to create ${entityLabel.toLowerCase()}.`;
      setSubmitError(message);
      showToast(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderLinkedCaseSelect = (
    value: string,
    onChange: (value: string) => void,
  ) => (
    <RelatedCaseSelect
      value={value}
      cases={cases}
      accounts={accounts}
      projects={projects}
      onChange={onChange}
    />
  );

  const renderCaseFields = () => (
    <div className="space-y-4">
      <div>
        <label className={labelClassName}>Description *</label>
        <textarea
          value={formData.case.description}
          onChange={(event) => setFormData({ ...formData, case: { ...formData.case, description: event.target.value } })}
          className={inputClassName}
          rows={4}
          placeholder="Describe the customer case"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={labelClassName}>Priority</label>
          <select
            value={formData.case.priority}
            onChange={(event) => setFormData({ ...formData, case: { ...formData.case, priority: event.target.value } })}
            className={inputClassName}
          >
            <option value="">Select priority</option>
            {casePriorities.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClassName}>Status</label>
          <select
            value={formData.case.status}
            onChange={(event) => setFormData({ ...formData, case: { ...formData.case, status: event.target.value } })}
            className={inputClassName}
          >
            <option value="">Select status</option>
            {caseStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClassName}>Category</label>
          <select
            value={formData.case.category}
            onChange={(event) => setFormData({ ...formData, case: { ...formData.case, category: event.target.value } })}
            className={inputClassName}
          >
            <option value="">Select category</option>
            {caseCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClassName}>Assigned To</label>
          <SearchableSelect
            label="assignee"
            value={formData.case.assignedTo}
            options={assignableUserSelectOptions}
            emptyLabel="Unassigned"
            searchPlaceholder="Search users"
            onChange={(assignedTo) => setFormData({ ...formData, case: { ...formData.case, assignedTo } })}
          />
        </div>
        <div>
          <label className={labelClassName}>SE Owner</label>
          <SearchableSelect
            label="SE owner"
            value={formData.case.seOwner}
            options={assignableUserSelectOptions}
            emptyLabel="No SE owner"
            searchPlaceholder="Search users"
            onChange={(seOwner) => setFormData({ ...formData, case: { ...formData.case, seOwner } })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClassName}>Escalation Type</label>
          <select
            value={formData.case.escalationType}
            onChange={(event) => setFormData({ ...formData, case: { ...formData.case, escalationType: event.target.value } })}
            className={inputClassName}
          >
            <option value="">Select escalation type</option>
            {caseEscalationTypes.map((escalationType) => (
              <option key={escalationType} value={escalationType}>
                {escalationType}
              </option>
            ))}
          </select>
        </div>
        {renderAccountSelect({
          values: formData.case.accountIds,
          onChange: (accountIds) => setFormData({ ...formData, case: { ...formData.case, accountIds } }),
          emptyLabel: "Select linked accounts",
        })}
        <div className={quickProjectOpen ? "sm:col-span-2" : undefined}>
          <label className={labelClassName}>Project</label>
          <div className="flex gap-2">
            <SearchableSelect
              label="Project"
              value={formData.case.project}
              options={projectSelectOptions}
              emptyLabel="No linked project"
              searchPlaceholder="Search projects"
              onChange={(project) => setFormData({ ...formData, case: { ...formData.case, project } })}
            />
            <button
              type="button"
              onClick={() => {
                setQuickProjectDraft((current) => ({
                  ...current,
                  accountId: current.accountId || (formData.case.accountIds.length === 1 ? formData.case.accountIds[0] : ""),
                }));
                setQuickProjectOpen(true);
                setQuickProjectError("");
              }}
              className="inline-flex h-[38px] shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              New
            </button>
          </div>
          {renderQuickProjectFields((project) => setFormData({ ...formData, case: { ...formData.case, project } }))}
        </div>
        <div className={quickProductOpen ? "sm:col-span-2" : undefined}>
          <label className={labelClassName}>Linked Products</label>
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <MultiRecordDropdown
                label="Products"
                values={formData.case.productIds}
                options={productSelectOptions}
                emptyLabel="Select linked products"
                searchPlaceholder="Search products"
                onChange={(productIds) => setFormData({ ...formData, case: { ...formData.case, productIds } })}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setQuickProductOpen(true);
                setQuickProductError("");
              }}
              className="inline-flex h-[38px] shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              New
            </button>
          </div>
          {renderQuickProductFields((recordId) =>
            setFormData({
              ...formData,
              case: {
                ...formData.case,
                productIds: formData.case.productIds.includes(recordId)
                  ? formData.case.productIds
                  : [...formData.case.productIds, recordId],
              },
            }),
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={labelClassName}>Close Date</label>
          <input
            type="date"
            value={formData.case.closeDate}
            onChange={(event) => setFormData({ ...formData, case: { ...formData.case, closeDate: event.target.value } })}
            className={inputClassName}
          />
        </div>
        <div className={quickMantisOpen ? "sm:col-span-3" : undefined}>
          <label className={labelClassName}>Mantis IDs</label>
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <MultiRecordDropdown
                label="Mantis IDs"
                values={formData.case.mantisIds}
                options={mantisSelectOptions}
                emptyLabel="Select Mantis IDs"
                searchPlaceholder="Search Mantis ID, status, or description"
                onChange={(mantisIds) => setFormData({ ...formData, case: { ...formData.case, mantisIds } })}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setQuickMantisOpen(true);
                setQuickMantisError("");
              }}
              className="inline-flex h-[38px] shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              New
            </button>
          </div>
          {renderQuickMantisFields((recordId) =>
            setFormData({
              ...formData,
              case: {
                ...formData.case,
                mantisIds: formData.case.mantisIds.includes(recordId)
                  ? formData.case.mantisIds
                  : [...formData.case.mantisIds, recordId],
              },
            }),
          )}
        </div>
        <div className={quickKnockOpen ? "sm:col-span-3" : undefined}>
          <label className={labelClassName}>Knock IDs</label>
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <MultiRecordDropdown
                label="Knock IDs"
                values={formData.case.knockIds}
                options={knockSelectOptions}
                emptyLabel="Select Knock IDs"
                searchPlaceholder="Search Knock ID, status, or description"
                onChange={(knockIds) => setFormData({ ...formData, case: { ...formData.case, knockIds } })}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setQuickKnockOpen(true);
                setQuickKnockError("");
              }}
              className="inline-flex h-[38px] shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              New
            </button>
          </div>
          {renderQuickKnockFields((recordId) =>
            setFormData({
              ...formData,
              case: {
                ...formData.case,
                knockIds: formData.case.knockIds.includes(recordId)
                  ? formData.case.knockIds
                  : [...formData.case.knockIds, recordId],
              },
            }),
          )}
        </div>
      </div>
        <div>
          <label className={labelClassName}>Escalation Note</label>
          <textarea
            value={formData.case.escalationNote}
            onChange={(event) => setFormData({ ...formData, case: { ...formData.case, escalationNote: event.target.value } })}
            className={inputClassName}
            rows={3}
          />
        </div>
    </div>
  );

  const renderAccountFields = () => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className={labelClassName}>Account Name *</label>
        <input
          type="text"
          value={formData.account.accountName}
          onChange={(event) => setFormData({ ...formData, account: { ...formData.account, accountName: event.target.value } })}
          className={inputClassName}
        />
      </div>
      <div>
        <label className={labelClassName}>Type</label>
        <select
          value={formData.account.type}
          onChange={(event) => setFormData({ ...formData, account: { ...formData.account, type: event.target.value } })}
          className={inputClassName}
        >
          {accountTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClassName}>Vertical</label>
        <select
          value={formData.account.vertical}
          onChange={(event) => setFormData({ ...formData, account: { ...formData.account, vertical: event.target.value } })}
          className={inputClassName}
        >
          {accountVerticals.map((vertical) => (
            <option key={vertical} value={vertical}>
              {vertical}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className={labelClassName}>Website</label>
        <input
          type="url"
          value={formData.account.website}
          onChange={(event) => setFormData({ ...formData, account: { ...formData.account, website: event.target.value } })}
          className={inputClassName}
          placeholder="https://example.com"
        />
      </div>
      {!hideLinkedCaseSelect && (
      <div className="sm:col-span-2">
        {renderLinkedCaseSelect(formData.account.linkedCase, (value) =>
          setFormData({ ...formData, account: { ...formData.account, linkedCase: value } }),
        )}
      </div>
      )}
    </div>
  );

  const renderProjectFields = () => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className={labelClassName}>Project Name *</label>
        <input
          type="text"
          value={formData.project.projectName}
          onChange={(event) => setFormData({ ...formData, project: { ...formData.project, projectName: event.target.value } })}
          className={inputClassName}
        />
      </div>
      {renderAccountSelect({
        value: formData.project.accountId,
        onChange: (accountId) => setFormData({ ...formData, project: { ...formData.project, accountId } }),
        emptyLabel: "No account",
      })}
      <div>
        <label className={labelClassName}>Stage</label>
        <select
          value={formData.project.stage}
          onChange={(event) => setFormData({ ...formData, project: { ...formData.project, stage: event.target.value } })}
          className={inputClassName}
        >
          {projectStages.map((stage) => (
            <option key={stage} value={stage}>
              {stage}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClassName}>Start Date</label>
        <input
          type="date"
          value={formData.project.startDate}
          onChange={(event) => setFormData({ ...formData, project: { ...formData.project, startDate: event.target.value } })}
          className={inputClassName}
        />
      </div>
      <div>
        <label className={labelClassName}>Close Date</label>
        <input
          type="date"
          value={formData.project.closeDate}
          onChange={(event) => setFormData({ ...formData, project: { ...formData.project, closeDate: event.target.value } })}
          className={inputClassName}
        />
      </div>
      <div>
        <label className={labelClassName}>SE Owner</label>
        <SearchableSelect
          label="SE owner"
          value={formData.project.seOwner}
          options={assignableUserSelectOptions}
          emptyLabel="No SE owner"
          searchPlaceholder="Search users"
          onChange={(seOwner) => setFormData({ ...formData, project: { ...formData.project, seOwner } })}
        />
      </div>
      <div>
        <label className={labelClassName}>Is Closed?</label>
        <div className="grid grid-cols-2 rounded-lg border border-gray-300 bg-white p-1 text-sm">
          {[
            { label: "No", value: false },
            { label: "Yes", value: true },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => setFormData({ ...formData, project: { ...formData.project, isClosed: option.value } })}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                formData.project.isClosed === option.value
                  ? "bg-[#E31937] text-white"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className={labelClassName}>SFDC</label>
        <input
          type="text"
          value={formData.project.sfdc}
          onChange={(event) => setFormData({ ...formData, project: { ...formData.project, sfdc: event.target.value } })}
          className={inputClassName}
        />
      </div>
      <div>
        <label className={labelClassName}>SFDC Value (USD)</label>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={formData.project.sfdcValue}
          onChange={(event) => setFormData({ ...formData, project: { ...formData.project, sfdcValue: normalizeUsdIntegerInput(event.target.value) } })}
          className={inputClassName}
          placeholder="250000"
        />
      </div>
      {!hideLinkedCaseSelect && (
      <div className="sm:col-span-2">
        {renderLinkedCaseSelect(formData.project.linkedCase, (value) =>
          setFormData({ ...formData, project: { ...formData.project, linkedCase: value } }),
        )}
      </div>
      )}
    </div>
  );

  const renderProductFields = () => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className={labelClassName}>Product Name *</label>
        <input
          type="text"
          value={formData.product.productName}
          onChange={(event) => setFormData({ ...formData, product: { ...formData.product, productName: event.target.value } })}
          className={inputClassName}
        />
      </div>
      <div>
        <label className={labelClassName}>Product Family</label>
        <input
          type="text"
          value={formData.product.productFamily}
          onChange={(event) => setFormData({ ...formData, product: { ...formData.product, productFamily: event.target.value } })}
          className={inputClassName}
        />
      </div>
      <div>
        <label className={labelClassName}>Version</label>
        <input
          type="text"
          value={formData.product.productVersion}
          onChange={(event) => setFormData({ ...formData, product: { ...formData.product, productVersion: event.target.value } })}
          className={inputClassName}
          placeholder="7.6, 2026.1, GA"
        />
      </div>
      <div>
        <label className={labelClassName}>Product URL</label>
        <input
          type="url"
          value={formData.product.productUrl}
          onChange={(event) => setFormData({ ...formData, product: { ...formData.product, productUrl: event.target.value } })}
          className={inputClassName}
          placeholder="https://www.fortinet.com/products"
        />
      </div>
      <div className="sm:col-span-2">
        <label className={labelClassName}>Description</label>
        <textarea
          value={formData.product.description}
          onChange={(event) => setFormData({ ...formData, product: { ...formData.product, description: event.target.value } })}
          className={inputClassName}
          rows={3}
        />
      </div>
      {!hideLinkedCaseSelect && (
      <div className="sm:col-span-2">
        {renderLinkedCaseSelect(formData.product.linkedCase, (value) =>
          setFormData({ ...formData, product: { ...formData.product, linkedCase: value } }),
        )}
      </div>
      )}
    </div>
  );

  const renderMantisFields = () => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className={labelClassName}>Description *</label>
        <textarea
          value={formData.mantis.description}
          onChange={(event) => setFormData({ ...formData, mantis: { ...formData.mantis, description: event.target.value } })}
          className={inputClassName}
          rows={4}
        />
      </div>
      <div>
        <label className={labelClassName}>Mantis ID</label>
        <input
          type="text"
          value={formData.mantis.mantisId}
          onChange={(event) =>
            setFormData({
              ...formData,
              mantis: {
                ...formData.mantis,
                mantisId: event.target.value,
                mantisUrl: buildMantisUrl(event.target.value),
              },
            })
          }
          className={inputClassName}
        />
      </div>
      <div>
        <label className={labelClassName}>Status</label>
        <select
          value={formData.mantis.mantisStatus}
          onChange={(event) => setFormData({ ...formData, mantis: { ...formData.mantis, mantisStatus: event.target.value } })}
          className={inputClassName}
        >
          {mantisStatuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClassName}>Category</label>
        <select
          value={formData.mantis.category}
          onChange={(event) => setFormData({ ...formData, mantis: { ...formData.mantis, category: event.target.value } })}
          className={inputClassName}
        >
          {mantisCategories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className={labelClassName}>Mantis URL</label>
        <input
          type="url"
          value={formData.mantis.mantisUrl}
          readOnly
          className={`${inputClassName} bg-gray-50 text-gray-700`}
          placeholder="Generated from Mantis ID"
        />
      </div>
      <div>
        <label className={labelClassName}>NFR Request Date</label>
        <input
          type="date"
          value={formData.mantis.mantisRequestDate}
          onChange={(event) => setFormData({ ...formData, mantis: { ...formData.mantis, mantisRequestDate: event.target.value } })}
          className={inputClassName}
        />
      </div>
      <div>
        <label className={labelClassName}>NFR Target Date</label>
        <input
          type="date"
          value={formData.mantis.mantisTargetDate}
          onChange={(event) => setFormData({ ...formData, mantis: { ...formData.mantis, mantisTargetDate: event.target.value } })}
          className={inputClassName}
        />
      </div>
      {!hideLinkedCaseSelect && (
      <div className="sm:col-span-2">
        {renderLinkedCaseSelect(formData.mantis.linkedCase, (value) =>
          setFormData({ ...formData, mantis: { ...formData.mantis, linkedCase: value } }),
        )}
      </div>
      )}
    </div>
  );

  const renderKnockFields = () => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className={labelClassName}>Description *</label>
        <textarea
          value={formData.knock.description}
          onChange={(event) => setFormData({ ...formData, knock: { ...formData.knock, description: event.target.value } })}
          className={inputClassName}
          rows={4}
        />
      </div>
      <div>
        <label className={labelClassName}>Knock ID</label>
        <input
          type="text"
          value={formData.knock.knockId}
          onChange={(event) => setFormData({ ...formData, knock: { ...formData.knock, knockId: event.target.value } })}
          className={inputClassName}
        />
      </div>
      <div>
        <label className={labelClassName}>Status</label>
        <input
          type="text"
          value={formData.knock.status}
          onChange={(event) => setFormData({ ...formData, knock: { ...formData.knock, status: event.target.value } })}
          className={inputClassName}
        />
      </div>
      <div className="sm:col-span-2">
        <label className={labelClassName}>Knock URL</label>
        <input
          type="url"
          value={formData.knock.knockUrl}
          onChange={(event) => setFormData({ ...formData, knock: { ...formData.knock, knockUrl: event.target.value } })}
          className={inputClassName}
        />
      </div>
      <div>
        <label className={labelClassName}>Request Date</label>
        <input
          type="date"
          value={formData.knock.requestDate}
          onChange={(event) => setFormData({ ...formData, knock: { ...formData.knock, requestDate: event.target.value } })}
          className={inputClassName}
        />
      </div>
      <div>
        <label className={labelClassName}>Target Date</label>
        <input
          type="date"
          value={formData.knock.targetDate}
          onChange={(event) => setFormData({ ...formData, knock: { ...formData.knock, targetDate: event.target.value } })}
          className={inputClassName}
        />
      </div>
      {!hideLinkedCaseSelect && (
      <div className="sm:col-span-2">
        {renderLinkedCaseSelect(formData.knock.linkedCase, (value) =>
          setFormData({ ...formData, knock: { ...formData.knock, linkedCase: value } }),
        )}
      </div>
      )}
    </div>
  );

  const renderFields = () => {
    switch (entityType) {
      case "case":
        return renderCaseFields();
      case "account":
        return renderAccountFields();
      case "project":
        return renderProjectFields();
      case "product":
        return renderProductFields();
      case "mantis":
        return renderMantisFields();
      case "knock":
        return renderKnockFields();
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        className={triggerClassName}
        title={triggerTitle ?? `Create ${entityLabel}`}
      >
        <PlusCircle className="h-4 w-4" />
        {triggerLabel ?? `Create ${entityLabel}`}
      </button>

      <DialogContent className={`max-h-[90vh] overflow-y-auto ${entityType === "case" ? "sm:max-w-4xl" : "sm:max-w-2xl"}`}>
        <DialogHeader>
          <DialogTitle>Create {entityLabel}</DialogTitle>
          <DialogDescription>Add a new {entityLabel.toLowerCase()} record.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {renderFields()}

          {submitError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {submitError}
            </div>
          )}

          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-[#E31937] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#c41230] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Creating..." : `Create ${entityLabel}`}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
