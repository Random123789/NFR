import { useState } from "react";
import { Check, Briefcase, Building2, FolderKanban, FileText, Hammer, Package } from "lucide-react";
import {
  accounts,
  projects,
  products,
  nfrs,
  knocks,
  cases,
  addCaseLink,
  createAccount,
  createCase,
  createKnock,
  createNfr,
  createProduct,
  createProject,
  initializeData,
  type AccountRecord,
  type CaseRecord,
  type KnockRecord,
  type NfrRecord,
  type ProductRecord,
  type ProjectRecord,
} from "../data/apiClient";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

type EntityType = "case" | "account" | "project" | "nfr" | "knock" | "product";

type FormData = {
  case: {
    description: string;
    priority: string;
    category: string;
    status: string;
    caseOwner: string;
    seOwner: string;
    account: string;
    project: string;
    product: string;
    nfrRecordId: string;
    knockRecordId: string;
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
    startDate: string;
    closeDate: string;
    stage: string;
    sfdcValue: string;
    se: string;
    linkedCase: string;
  };
  product: {
    productName: string;
    productFamily: string;
    productUrl: string;
    linkedCase: string;
  };
  nfr: {
    description: string;
    mantisId: string;
    nfrRequestDate: string;
    nfrTargetDate: string;
    nfrStatus: string;
    linkedCase: string;
  };
  knock: {
    description: string;
    knockId: string;
    requestDate: string;
    targetDate: string;
    status: string;
    linkedCase: string;
  };
};

const entityOptions = [
  {
    type: "case" as EntityType,
    label: "Case",
    icon: Briefcase,
    description: "Create a new case record",
    color: "bg-[#E31937]"
  },
  {
    type: "account" as EntityType,
    label: "Account",
    icon: Building2,
    description: "Add a customer account",
    color: "bg-[#2c3e50]"
  },
  {
    type: "project" as EntityType,
    label: "Project",
    icon: FolderKanban,
    description: "Create a project",
    color: "bg-[#666666]"
  },
  {
    type: "nfr" as EntityType,
    label: "NFR",
    icon: FileText,
    description: "New feature request",
    color: "bg-blue-600"
  },
  {
    type: "knock" as EntityType,
    label: "Knock",
    icon: Hammer,
    description: "Knock request",
    color: "bg-purple-600"
  },
  {
    type: "product" as EntityType,
    label: "Product",
    icon: Package,
    description: "Add a product",
    color: "bg-green-600"
  },
];

type CreatedRecords = Partial<{
  case: CaseRecord;
  account: AccountRecord;
  project: ProjectRecord;
  product: ProductRecord;
  nfr: NfrRecord;
  knock: KnockRecord;
}>;

const cleanString = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const nullableString = (value: string | null | undefined) => cleanString(value) ?? null;

export function CreateData() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedEntities, setSelectedEntities] = useState<EntityType[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [createdRecordIds, setCreatedRecordIds] = useState<string[]>([]);
  const [formData, setFormData] = useState<FormData>({
    case: {
      description: "",
      priority: "Medium",
      category: "Technical",
      status: "Open",
      caseOwner: "",
      seOwner: "",
      account: "",
      project: "",
      product: "",
      nfrRecordId: "",
      knockRecordId: "",
    },
    account: {
      accountName: "",
      website: "",
      type: "Enterprise",
      vertical: "",
      linkedCase: "",
    },
    project: {
      projectName: "",
      startDate: "",
      closeDate: "",
      stage: "Discovery",
      sfdcValue: "",
      se: "",
      linkedCase: "",
    },
    product: {
      productName: "",
      productFamily: "",
      productUrl: "",
      linkedCase: "",
    },
    nfr: {
      description: "",
      mantisId: "",
      nfrRequestDate: "",
      nfrTargetDate: "",
      nfrStatus: "Pending",
      linkedCase: "",
    },
    knock: {
      description: "",
      knockId: "",
      requestDate: "",
      targetDate: "",
      status: "Active",
      linkedCase: "",
    },
  });

  const toggleEntity = (entity: EntityType) => {
    if (selectedEntities.includes(entity)) {
      setSelectedEntities(selectedEntities.filter(e => e !== entity));
    } else {
      setSelectedEntities([...selectedEntities, entity]);
    }
  };

  const totalSteps = selectedEntities.length + 2; // Selection step + entity forms + review step

  const getStepName = (step: number) => {
    if (step === 1) return "Select Entities";
    if (step === totalSteps) return "Review";

    const entityIndex = step - 2;
    const entity = selectedEntities[entityIndex];
    return entityOptions.find(e => e.type === entity)?.label || "";
  };

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const getValidationError = (entity: EntityType) => {
    if (entity === "case" && !cleanString(formData.case.description)) {
      return "Case description is required.";
    }
    if (entity === "account" && !cleanString(formData.account.accountName)) {
      return "Account name is required.";
    }
    if (entity === "project" && !cleanString(formData.project.projectName)) {
      return "Project name is required.";
    }
    if (entity === "product" && !cleanString(formData.product.productName)) {
      return "Product name is required.";
    }
    if (entity === "nfr" && !cleanString(formData.nfr.description)) {
      return "NFR description is required.";
    }
    if (entity === "knock" && !cleanString(formData.knock.description)) {
      return "Knock description is required.";
    }
    return "";
  };

  const getFirstValidationError = () => {
    for (const entity of selectedEntities) {
      const error = getValidationError(entity);
      if (error) {
        return error;
      }
    }
    return "";
  };

  const linkCreatedEntityToCases = async (
    caseRecordIds: Array<string | undefined>,
    entityType: Exclude<EntityType, "case">,
    entityRecordId: string | undefined,
  ) => {
    if (!entityRecordId) {
      return;
    }

    const uniqueCaseIds = Array.from(new Set(caseRecordIds.map(cleanString).filter((caseId): caseId is string => Boolean(caseId))));
    await Promise.all(uniqueCaseIds.map((caseRecordId) => addCaseLink(caseRecordId, entityType, entityRecordId)));
  };

  const handleSubmit = async () => {
    const validationError = getFirstValidationError();
    if (validationError) {
      setSubmitError(validationError);
      showToast(validationError, "error");
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");
    setCreatedRecordIds([]);

    try {
      const created: CreatedRecords = {};

      if (selectedEntities.includes("account")) {
        created.account = await createAccount({
          accountName: formData.account.accountName.trim(),
          website: nullableString(formData.account.website),
          type: nullableString(formData.account.type),
          vertical: nullableString(formData.account.vertical),
        });
      }

      if (selectedEntities.includes("product")) {
        created.product = await createProduct({
          productName: formData.product.productName.trim(),
          productFamily: nullableString(formData.product.productFamily),
          productUrl: nullableString(formData.product.productUrl),
        });
      }

      if (selectedEntities.includes("project")) {
        created.project = await createProject({
          projectName: formData.project.projectName.trim(),
          accountId: created.account?.recordId ?? null,
          startDate: nullableString(formData.project.startDate),
          closeDate: nullableString(formData.project.closeDate),
          stage: nullableString(formData.project.stage),
          sfdc: null,
          sfdcValue: nullableString(formData.project.sfdcValue),
          se: nullableString(formData.project.se),
        });
      }

      if (selectedEntities.includes("nfr")) {
        created.nfr = await createNfr({
          description: formData.nfr.description.trim(),
          mantisId: nullableString(formData.nfr.mantisId),
          mantisUrl: null,
          nfrStatus: nullableString(formData.nfr.nfrStatus),
          nfrRequestDate: nullableString(formData.nfr.nfrRequestDate),
          nfrTargetDate: nullableString(formData.nfr.nfrTargetDate),
        });
      }

      if (selectedEntities.includes("knock")) {
        created.knock = await createKnock({
          description: formData.knock.description.trim(),
          knockId: nullableString(formData.knock.knockId),
          knockUrl: null,
          status: nullableString(formData.knock.status),
          requestDate: nullableString(formData.knock.requestDate),
          targetDate: nullableString(formData.knock.targetDate),
        });
      }

      if (selectedEntities.includes("case")) {
        created.case = await createCase({
          description: formData.case.description.trim(),
          previousStatus: null,
          closeDate: null,
          status: nullableString(formData.case.status),
          priority: nullableString(formData.case.priority),
          category: nullableString(formData.case.category),
          caseOwner: cleanString(formData.case.caseOwner) ?? user?.displayName ?? null,
          seOwner: nullableString(formData.case.seOwner),
          account: created.account?.recordId ?? nullableString(formData.case.account),
          project: created.project?.recordId ?? nullableString(formData.case.project),
          product: created.product?.recordId ?? nullableString(formData.case.product),
          nfrRecordId: created.nfr?.recordId ?? nullableString(formData.case.nfrRecordId),
          knockRecordId: created.knock?.recordId ?? nullableString(formData.case.knockRecordId),
          escalationNote: null,
          escalationType: null,
        });
      }

      await Promise.all([
        linkCreatedEntityToCases([created.case?.recordId, formData.account.linkedCase], "account", created.account?.recordId),
        linkCreatedEntityToCases([created.case?.recordId, formData.project.linkedCase], "project", created.project?.recordId),
        linkCreatedEntityToCases([created.case?.recordId, formData.product.linkedCase], "product", created.product?.recordId),
        linkCreatedEntityToCases([created.case?.recordId, formData.nfr.linkedCase], "nfr", created.nfr?.recordId),
        linkCreatedEntityToCases([created.case?.recordId, formData.knock.linkedCase], "knock", created.knock?.recordId),
      ]);

      await initializeData();

      const recordIds = Object.values(created)
        .map((record) => record?.recordId)
        .filter((recordId): recordId is string => Boolean(recordId));
      setCreatedRecordIds(recordIds);

      const createdEntities = selectedEntities.map(entity =>
        entityOptions.find(e => e.type === entity)?.label
      ).join(", ");
      showToast(`Created ${createdEntities}.`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create records.";
      setSubmitError(message);
      showToast(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const canProceed = () => {
    if (currentStep === 1) {
      return selectedEntities.length > 0;
    }
    if (currentStep > 1 && currentStep < totalSteps) {
      const entityIndex = currentStep - 2;
      return !getValidationError(selectedEntities[entityIndex]);
    }
    return true;
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Create Data</h1>
        <p className="text-gray-600 mt-1">Create new NFR entities</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {Array.from({ length: Math.min(totalSteps, 5) }).map((_, index) => {
              const step = index + 1;
              const isLast = step === Math.min(totalSteps, 5);

              return (
                <div key={step} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        currentStep > step
                          ? "bg-green-500"
                          : currentStep === step
                          ? "bg-[#E31937]"
                          : "bg-gray-200"
                      }`}
                    >
                      {currentStep > step ? (
                        <Check className="w-5 h-5 text-white" />
                      ) : (
                        <span className={`${currentStep === step ? "text-white" : "text-gray-600"} text-sm`}>
                          {step}
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-medium text-gray-700 mt-2 text-center">
                      {getStepName(step)}
                    </div>
                  </div>
                  {!isLast && (
                    <div
                      className={`flex-1 h-1 -mt-8 ${
                        currentStep > step ? "bg-green-500" : "bg-gray-200"
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
          {totalSteps > 5 && (
            <div className="text-center text-sm text-gray-500 mt-2">
              Step {currentStep} of {totalSteps}
            </div>
          )}
        </div>

        {/* Step 1: Select Entities */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-lg text-gray-900 mb-4">Select entities to create</h2>
            <p className="text-sm text-gray-600 mb-6">Click on the cards below to select which entities you want to create</p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {entityOptions.map((entity) => {
                const isSelected = selectedEntities.includes(entity.type);
                const Icon = entity.icon;

                return (
                  <div
                    key={entity.type}
                    onClick={() => toggleEntity(entity.type)}
                    className={`relative p-6 border-2 rounded-xl cursor-pointer transition-all ${
                      isSelected
                        ? "border-[#E31937] bg-red-50"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute top-3 right-3">
                        <div className="w-6 h-6 bg-[#E31937] rounded-full flex items-center justify-center">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      </div>
                    )}

                    <div className={`w-12 h-12 ${entity.color} rounded-lg flex items-center justify-center mb-3`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>

                    <h3 className="font-semibold text-gray-900 mb-1">{entity.label}</h3>
                    <p className="text-sm text-gray-600">{entity.description}</p>
                  </div>
                );
              })}
            </div>

            {selectedEntities.length > 0 && (
              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Selected:</strong> {selectedEntities.map(e =>
                    entityOptions.find(opt => opt.type === e)?.label
                  ).join(", ")}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 2+: Entity Forms */}
        {currentStep > 1 && currentStep < totalSteps && (() => {
          const entityIndex = currentStep - 2;
          const currentEntity = selectedEntities[entityIndex];

          if (currentEntity === "case") {
            return (
              <div className="space-y-4">
                <h2 className="font-semibold text-lg text-gray-900 mb-4">Case Information</h2>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                  <textarea
                    value={formData.case.description}
                    onChange={(e) => setFormData({ ...formData, case: { ...formData.case, description: e.target.value } })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    rows={3}
                    placeholder="Describe the case..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority *</label>
                    <select
                      value={formData.case.priority}
                      onChange={(e) => setFormData({ ...formData, case: { ...formData.case, priority: e.target.value } })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Critical">Critical</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status *</label>
                    <select
                      value={formData.case.status}
                      onChange={(e) => setFormData({ ...formData, case: { ...formData.case, status: e.target.value } })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="Open">Open</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Escalated">Escalated</option>
                      <option value="Closed">Closed</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                    <select
                      value={formData.case.category}
                      onChange={(e) => setFormData({ ...formData, case: { ...formData.case, category: e.target.value } })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="Technical">Technical</option>
                      <option value="Solution Design">Solution Design</option>
                      <option value="Proof of Concept">Proof of Concept</option>
                      <option value="RFP Response">RFP Response</option>
                      <option value="Demonstration">Demonstration</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Case Owner</label>
                    <input
                      type="text"
                      value={formData.case.caseOwner}
                      onChange={(e) => setFormData({ ...formData, case: { ...formData.case, caseOwner: e.target.value } })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                      placeholder="Owner name"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">SE Owner</label>
                    <input
                      type="text"
                      value={formData.case.seOwner}
                      onChange={(e) => setFormData({ ...formData, case: { ...formData.case, seOwner: e.target.value } })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                      placeholder="Solution consultant name"
                    />
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-4 mt-4">
                  <h3 className="font-medium text-gray-900 mb-3">Link to Existing Entities (Optional)</h3>
                  <p className="text-sm text-gray-600 mb-4">Associate this case with existing records in the system</p>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Account</label>
                      <select
                        value={formData.case.account}
                        onChange={(e) => setFormData({ ...formData, case: { ...formData.case, account: e.target.value } })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                      >
                        <option value="">None</option>
                        {accounts.map((acc) => (
                          <option key={acc.recordId} value={acc.recordId}>
                            {acc.recordId} - {acc.accountName}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
                      <select
                        value={formData.case.project}
                        onChange={(e) => setFormData({ ...formData, case: { ...formData.case, project: e.target.value } })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                      >
                        <option value="">None</option>
                        {projects.map((proj) => (
                          <option key={proj.recordId} value={proj.recordId}>
                            {proj.recordId} - {proj.projectName}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
                      <select
                        value={formData.case.product}
                        onChange={(e) => setFormData({ ...formData, case: { ...formData.case, product: e.target.value } })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                      >
                        <option value="">None</option>
                        {products.map((prod) => (
                          <option key={prod.recordId} value={prod.recordId}>
                            {prod.recordId} - {prod.productName}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">NFR</label>
                      <select
                        value={formData.case.nfrRecordId}
                        onChange={(e) => setFormData({ ...formData, case: { ...formData.case, nfrRecordId: e.target.value } })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                      >
                        <option value="">None</option>
                        {nfrs.map((nfr) => (
                          <option key={nfr.recordId} value={nfr.recordId}>
                            {nfr.mantisId || nfr.recordId} - {nfr.description.substring(0, 40)}...
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Knock</label>
                      <select
                        value={formData.case.knockRecordId}
                        onChange={(e) => setFormData({ ...formData, case: { ...formData.case, knockRecordId: e.target.value } })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                      >
                        <option value="">None</option>
                        {knocks.map((knock) => (
                          <option key={knock.recordId} value={knock.recordId}>
                            {knock.knockId || knock.recordId} - {knock.description.substring(0, 40)}...
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          if (currentEntity === "account") {
            return (
              <div className="space-y-4">
                <h2 className="font-semibold text-lg text-gray-900 mb-4">Account Information</h2>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Account Name *</label>
                  <input
                    type="text"
                    value={formData.account.accountName}
                    onChange={(e) => setFormData({ ...formData, account: { ...formData.account, accountName: e.target.value } })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    placeholder="Enter account name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                  <input
                    type="text"
                    value={formData.account.website}
                    onChange={(e) => setFormData({ ...formData, account: { ...formData.account, website: e.target.value } })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    placeholder="https://example.com"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                    <select
                      value={formData.account.type}
                      onChange={(e) => setFormData({ ...formData, account: { ...formData.account, type: e.target.value } })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="Enterprise">Enterprise</option>
                      <option value="Mid-Market">Mid-Market</option>
                      <option value="Startup">Startup</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Vertical</label>
                    <input
                      type="text"
                      value={formData.account.vertical}
                      onChange={(e) => setFormData({ ...formData, account: { ...formData.account, vertical: e.target.value } })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                      placeholder="e.g., Technology, Finance"
                    />
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-4 mt-4">
                  <h3 className="font-medium text-gray-900 mb-3">Link to Existing Case (Optional)</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Related Case</label>
                    <select
                      value={formData.account.linkedCase}
                      onChange={(e) => setFormData({ ...formData, account: { ...formData.account, linkedCase: e.target.value } })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="">None</option>
                      {cases.map((caseItem) => (
                        <option key={caseItem.recordId} value={caseItem.recordId}>
                          {caseItem.recordId} - {caseItem.description.substring(0, 50)}...
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            );
          }

          if (currentEntity === "project") {
            return (
              <div className="space-y-4">
                <h2 className="font-semibold text-lg text-gray-900 mb-4">Project Information</h2>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Project Name *</label>
                  <input
                    type="text"
                    value={formData.project.projectName}
                    onChange={(e) => setFormData({ ...formData, project: { ...formData.project, projectName: e.target.value } })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    placeholder="Enter project name"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={formData.project.startDate}
                      onChange={(e) => setFormData({ ...formData, project: { ...formData.project, startDate: e.target.value } })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Close Date</label>
                    <input
                      type="date"
                      value={formData.project.closeDate}
                      onChange={(e) => setFormData({ ...formData, project: { ...formData.project, closeDate: e.target.value } })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Stage</label>
                    <select
                      value={formData.project.stage}
                      onChange={(e) => setFormData({ ...formData, project: { ...formData.project, stage: e.target.value } })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="Discovery">Discovery</option>
                      <option value="Planning">Planning</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Completed">Completed</option>
                      <option value="On Hold">On Hold</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">SFDC Value</label>
                    <input
                      type="text"
                      value={formData.project.sfdcValue}
                      onChange={(e) => setFormData({ ...formData, project: { ...formData.project, sfdcValue: e.target.value } })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                      placeholder="$100,000"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Solution Consultant</label>
                    <input
                      type="text"
                      value={formData.project.se}
                      onChange={(e) => setFormData({ ...formData, project: { ...formData.project, se: e.target.value } })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                      placeholder="Consultant name"
                    />
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-4 mt-4">
                  <h3 className="font-medium text-gray-900 mb-3">Link to Existing Case (Optional)</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Related Case</label>
                    <select
                      value={formData.project.linkedCase}
                      onChange={(e) => setFormData({ ...formData, project: { ...formData.project, linkedCase: e.target.value } })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="">None</option>
                      {cases.map((caseItem) => (
                        <option key={caseItem.recordId} value={caseItem.recordId}>
                          {caseItem.recordId} - {caseItem.description.substring(0, 50)}...
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            );
          }

          if (currentEntity === "product") {
            return (
              <div className="space-y-4">
                <h2 className="font-semibold text-lg text-gray-900 mb-4">Product Information</h2>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Product Name *</label>
                  <input
                    type="text"
                    value={formData.product.productName}
                    onChange={(e) => setFormData({ ...formData, product: { ...formData.product, productName: e.target.value } })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    placeholder="e.g., FortiGate"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Product Family</label>
                  <input
                    type="text"
                    value={formData.product.productFamily}
                    onChange={(e) => setFormData({ ...formData, product: { ...formData.product, productFamily: e.target.value } })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    placeholder="e.g., Network Security"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Product URL</label>
                  <input
                    type="text"
                    value={formData.product.productUrl}
                    onChange={(e) => setFormData({ ...formData, product: { ...formData.product, productUrl: e.target.value } })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    placeholder="https://www.fortinet.com/products/..."
                  />
                </div>

                <div className="border-t border-gray-200 pt-4 mt-4">
                  <h3 className="font-medium text-gray-900 mb-3">Link to Existing Case (Optional)</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Related Case</label>
                    <select
                      value={formData.product.linkedCase}
                      onChange={(e) => setFormData({ ...formData, product: { ...formData.product, linkedCase: e.target.value } })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="">None</option>
                      {cases.map((caseItem) => (
                        <option key={caseItem.recordId} value={caseItem.recordId}>
                          {caseItem.recordId} - {caseItem.description.substring(0, 50)}...
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            );
          }

          if (currentEntity === "nfr") {
            return (
              <div className="space-y-4">
                <h2 className="font-semibold text-lg text-gray-900 mb-4">NFR Information</h2>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                  <textarea
                    value={formData.nfr.description}
                    onChange={(e) => setFormData({ ...formData, nfr: { ...formData.nfr, description: e.target.value } })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    rows={3}
                    placeholder="Describe the feature request..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mantis ID</label>
                    <input
                      type="text"
                      value={formData.nfr.mantisId}
                      onChange={(e) => setFormData({ ...formData, nfr: { ...formData.nfr, mantisId: e.target.value } })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                      placeholder="MANT-1234"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      value={formData.nfr.nfrStatus}
                      onChange={(e) => setFormData({ ...formData, nfr: { ...formData.nfr, nfrStatus: e.target.value } })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="Pending">Pending</option>
                      <option value="In Review">In Review</option>
                      <option value="Approved">Approved</option>
                      <option value="Rejected">Rejected</option>
                      <option value="Implemented">Implemented</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Request Date</label>
                    <input
                      type="date"
                      value={formData.nfr.nfrRequestDate}
                      onChange={(e) => setFormData({ ...formData, nfr: { ...formData.nfr, nfrRequestDate: e.target.value } })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Target Date</label>
                    <input
                      type="date"
                      value={formData.nfr.nfrTargetDate}
                      onChange={(e) => setFormData({ ...formData, nfr: { ...formData.nfr, nfrTargetDate: e.target.value } })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-4 mt-4">
                  <h3 className="font-medium text-gray-900 mb-3">Link to Existing Case (Optional)</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Related Case</label>
                    <select
                      value={formData.nfr.linkedCase}
                      onChange={(e) => setFormData({ ...formData, nfr: { ...formData.nfr, linkedCase: e.target.value } })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="">None</option>
                      {cases.map((caseItem) => (
                        <option key={caseItem.recordId} value={caseItem.recordId}>
                          {caseItem.recordId} - {caseItem.description.substring(0, 50)}...
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            );
          }

          if (currentEntity === "knock") {
            return (
              <div className="space-y-4">
                <h2 className="font-semibold text-lg text-gray-900 mb-4">Knock Information</h2>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                  <textarea
                    value={formData.knock.description}
                    onChange={(e) => setFormData({ ...formData, knock: { ...formData.knock, description: e.target.value } })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    rows={3}
                    placeholder="Describe the knock request..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Knock ID</label>
                    <input
                      type="text"
                      value={formData.knock.knockId}
                      onChange={(e) => setFormData({ ...formData, knock: { ...formData.knock, knockId: e.target.value } })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                      placeholder="KNK-1234"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      value={formData.knock.status}
                      onChange={(e) => setFormData({ ...formData, knock: { ...formData.knock, status: e.target.value } })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="Active">Active</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Completed">Completed</option>
                      <option value="Cancelled">Cancelled</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Request Date</label>
                    <input
                      type="date"
                      value={formData.knock.requestDate}
                      onChange={(e) => setFormData({ ...formData, knock: { ...formData.knock, requestDate: e.target.value } })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Target Date</label>
                    <input
                      type="date"
                      value={formData.knock.targetDate}
                      onChange={(e) => setFormData({ ...formData, knock: { ...formData.knock, targetDate: e.target.value } })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-4 mt-4">
                  <h3 className="font-medium text-gray-900 mb-3">Link to Existing Case (Optional)</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Related Case</label>
                    <select
                      value={formData.knock.linkedCase}
                      onChange={(e) => setFormData({ ...formData, knock: { ...formData.knock, linkedCase: e.target.value } })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    >
                      <option value="">None</option>
                      {cases.map((caseItem) => (
                        <option key={caseItem.recordId} value={caseItem.recordId}>
                          {caseItem.recordId} - {caseItem.description.substring(0, 50)}...
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            );
          }

          return null;
        })()}

        {/* Final Step: Review */}
        {currentStep === totalSteps && (
          <div className="space-y-6">
            <h2 className="font-semibold text-lg text-gray-900 mb-4">Review & Confirm</h2>

            {selectedEntities.includes("case") && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 mb-2">Case</h3>
                <div className="text-sm text-gray-700 space-y-1">
                  <p><strong>Description:</strong> {formData.case.description || "—"}</p>
                  <p><strong>Priority:</strong> {formData.case.priority}</p>
                  <p><strong>Category:</strong> {formData.case.category}</p>
                  <p><strong>Status:</strong> {formData.case.status}</p>
                  <p><strong>Case Owner:</strong> {formData.case.caseOwner || "—"}</p>
                  <p><strong>SE Owner:</strong> {formData.case.seOwner || "—"}</p>
                  {formData.case.account && (
                    <p><strong>Linked Account:</strong> {formData.case.account}</p>
                  )}
                  {formData.case.project && (
                    <p><strong>Linked Project:</strong> {formData.case.project}</p>
                  )}
                  {formData.case.product && (
                    <p><strong>Linked Product:</strong> {formData.case.product}</p>
                  )}
                  {formData.case.nfrRecordId && (
                    <p><strong>Linked NFR:</strong> {formData.case.nfrRecordId}</p>
                  )}
                  {formData.case.knockRecordId && (
                    <p><strong>Linked Knock:</strong> {formData.case.knockRecordId}</p>
                  )}
                </div>
              </div>
            )}

            {selectedEntities.includes("account") && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 mb-2">Account</h3>
                <div className="text-sm text-gray-700 space-y-1">
                  <p><strong>Account Name:</strong> {formData.account.accountName || "—"}</p>
                  <p><strong>Website:</strong> {formData.account.website || "—"}</p>
                  <p><strong>Type:</strong> {formData.account.type}</p>
                  <p><strong>Vertical:</strong> {formData.account.vertical || "—"}</p>
                  {formData.account.linkedCase && (
                    <p><strong>Linked Case:</strong> {formData.account.linkedCase}</p>
                  )}
                </div>
              </div>
            )}

            {selectedEntities.includes("project") && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 mb-2">Project</h3>
                <div className="text-sm text-gray-700 space-y-1">
                  <p><strong>Project Name:</strong> {formData.project.projectName || "—"}</p>
                  <p><strong>Start Date:</strong> {formData.project.startDate || "—"}</p>
                  <p><strong>Close Date:</strong> {formData.project.closeDate || "—"}</p>
                  <p><strong>Stage:</strong> {formData.project.stage}</p>
                  <p><strong>SFDC Value:</strong> {formData.project.sfdcValue || "—"}</p>
                  <p><strong>Solution Consultant:</strong> {formData.project.se || "—"}</p>
                  {formData.project.linkedCase && (
                    <p><strong>Linked Case:</strong> {formData.project.linkedCase}</p>
                  )}
                </div>
              </div>
            )}

            {selectedEntities.includes("product") && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 mb-2">Product</h3>
                <div className="text-sm text-gray-700 space-y-1">
                  <p><strong>Product Name:</strong> {formData.product.productName || "—"}</p>
                  <p><strong>Product Family:</strong> {formData.product.productFamily || "—"}</p>
                  <p><strong>Product URL:</strong> {formData.product.productUrl || "—"}</p>
                  {formData.product.linkedCase && (
                    <p><strong>Linked Case:</strong> {formData.product.linkedCase}</p>
                  )}
                </div>
              </div>
            )}

            {selectedEntities.includes("nfr") && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 mb-2">NFR</h3>
                <div className="text-sm text-gray-700 space-y-1">
                  <p><strong>Description:</strong> {formData.nfr.description || "—"}</p>
                  <p><strong>Mantis ID:</strong> {formData.nfr.mantisId || "—"}</p>
                  <p><strong>Status:</strong> {formData.nfr.nfrStatus}</p>
                  <p><strong>Request Date:</strong> {formData.nfr.nfrRequestDate || "—"}</p>
                  <p><strong>Target Date:</strong> {formData.nfr.nfrTargetDate || "—"}</p>
                  {formData.nfr.linkedCase && (
                    <p><strong>Linked Case:</strong> {formData.nfr.linkedCase}</p>
                  )}
                </div>
              </div>
            )}

            {selectedEntities.includes("knock") && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 mb-2">Knock</h3>
                <div className="text-sm text-gray-700 space-y-1">
                  <p><strong>Description:</strong> {formData.knock.description || "—"}</p>
                  <p><strong>Knock ID:</strong> {formData.knock.knockId || "—"}</p>
                  <p><strong>Status:</strong> {formData.knock.status}</p>
                  <p><strong>Request Date:</strong> {formData.knock.requestDate || "—"}</p>
                  <p><strong>Target Date:</strong> {formData.knock.targetDate || "—"}</p>
                  {formData.knock.linkedCase && (
                    <p><strong>Linked Case:</strong> {formData.knock.linkedCase}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {submitError && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {submitError}
          </div>
        )}

        {createdRecordIds.length > 0 && !submitError && (
          <div className="mt-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            Created records: {createdRecordIds.join(", ")}
          </div>
        )}

        <div className="flex justify-between mt-8 pt-6 border-t border-gray-200">
          <button
            onClick={handleBack}
            disabled={currentStep === 1 || isSubmitting}
            className="px-6 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Back
          </button>

          {currentStep < totalSteps ? (
            <button
              onClick={handleNext}
              disabled={!canProceed() || isSubmitting}
              className="px-6 py-2 bg-[#E31937] text-white rounded-lg font-medium hover:bg-[#c41230] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || Boolean(getFirstValidationError())}
              className="px-6 py-2 bg-[#E31937] text-white rounded-lg font-medium hover:bg-[#c41230] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? "Creating..." : "Create All"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
