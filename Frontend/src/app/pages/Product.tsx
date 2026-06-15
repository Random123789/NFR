import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown, Download, Edit2, Save, Bookmark, Trash2 } from "lucide-react";
import { addProductHistory, deleteProduct, updateProduct } from "../data/apiClient";
import { DetailTabs } from "../components/DetailTabs";
import { LinkedCasesList } from "../components/LinkedEntityCard";
import { CreateEntityDialog } from "../components/CreateEntityDialog";
import { RecordHistoryTimeline, formatHistoryEntryText } from "../components/RecordHistoryTimeline";
import { SearchableSelect } from "../components/SearchableSelect";
import { TypeaheadInput } from "../components/TypeaheadInput";
import { TableFieldSelector } from "../components/TableFieldSelector";
import { PageGuide } from "../components/PageGuide";
import { useLocation, useNavigate } from "react-router";
import { useSearch } from "../context/SearchContext";
import { useBookmarks } from "../context/BookmarksContext";
import { useAuth } from "../context/AuthContext";
import { useRecords } from "../context/RecordsContext";
import { useRecordReadState } from "../context/RecordReadContext";
import { useToast } from "../context/ToastContext";
import { productGuideSteps } from "../data/pageGuides";
import { useRoutedEntityDetail } from "../hooks/useEntityDetail";
import { useLinkedCases } from "../hooks/useLinkedCases";
import { useRecordComments } from "../hooks/useRecordComments";
import { compareValues, getNextSortConfig, toggleColumnKey, useStoredColumnKeys, type SortConfig } from "../hooks/useTableColumns";
import {
  createDetailPath,
  createDetailTarget,
  createLinkedDetailState,
  resolveDetailRouteRecordId,
  type DetailRouteState,
} from "../navigation/detailNavigation";
import { exportRowsToCsv } from "../utils/csvExport";
import { formatRelatedCaseOption } from "../utils/caseLabels";
import { formatTimestampMinute } from "../utils/dateTime";
import { findDuplicateProduct, productFieldSuggestions } from "../utils/productDuplicates";
import { getRecordActivityTimestamp } from "../utils/recordActivity";
import { unreadRowClassName } from "../utils/unreadRows";

type ProductColumnKey = "productName" | "productFamily" | "productVersion" | "productUrl" | "updatedAt";
type ProductSearchKey = "productName" | "productFamily" | "productVersion";

type ProductTableColumn = {
  key: ProductColumnKey;
  label: string;
  sortKey: ProductColumnKey;
  searchKey?: ProductSearchKey;
};

const PRODUCT_TABLE_COLUMNS: ProductTableColumn[] = [
  { key: "productName", label: "Product Name", sortKey: "productName", searchKey: "productName" },
  { key: "productFamily", label: "Product Family", sortKey: "productFamily", searchKey: "productFamily" },
  { key: "productVersion", label: "Version", sortKey: "productVersion", searchKey: "productVersion" },
  { key: "productUrl", label: "Product URL", sortKey: "productUrl" },
  { key: "updatedAt", label: "Updated At", sortKey: "updatedAt" },
];

const DEFAULT_PRODUCT_COLUMN_KEYS = PRODUCT_TABLE_COLUMNS.map((column) => column.key);
const PRODUCT_COLUMN_STORAGE_KEY = "product.visibleTableColumns";
const PRODUCT_DETAIL_TABS = [
  { key: "details", label: "Details" },
  { key: "linkedCases", label: "Linked Cases" },
];
const RELATED_CREATE_BUTTON_CLASS = "inline-flex h-[42px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50";

export function Product() {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const { user } = useAuth();
  const { addBookmark, removeBookmark, isBookmarked } = useBookmarks();
  const { isRecordUnread, markRecordRead } = useRecordReadState();
  const { searchTerm } = useSearch();
  const { accounts, projects, products, cases, getProductById, upsertProduct, removeProduct, refreshRecords } = useRecords();
  const {
    selectedRecord: selectedProduct,
    setSelectedRecord: setSelectedProduct,
    isEditing,
    editedRecord: editedProduct,
    setEditedRecord: setEditedProduct,
    activeDetailTab,
    setActiveDetailTab,
    handleBackFromDetail,
    handleEdit,
    handleCancelEdit,
    applySavedRecord,
  } = useRoutedEntityDetail({
    entityType: "product",
    getRecordById: getProductById,
    resolveRouteRecordId: (routeParam) => resolveDetailRouteRecordId("product", routeParam, products),
  });
  const {
    linkedCases,
    linkingCaseId,
    setLinkingCaseId,
    isLinkingCase,
    availableCases,
    linkCase,
    handleLinkCase,
    handleUnlinkCase,
  } = useLinkedCases({
    entityType: "product",
    entityRecordId: selectedProduct?.recordId,
    cases,
    entityLabel: "product",
    showToast,
  });
  const { newComment, setNewComment, selectedQuote, setSelectedQuote, isAddingComment, handleAddComment, handleAddReply } = useRecordComments({
    selectedRecord: selectedProduct,
    setSelectedRecord: setSelectedProduct,
    addHistory: addProductHistory,
    upsertRecord: upsertProduct,
    userName: user?.displayName,
    onError: (message) => showToast(message, "error"),
  });
  const selectedProductActivityAt = getRecordActivityTimestamp(selectedProduct);
  const productNameSuggestions = useMemo(
    () => productFieldSuggestions(products, "productName", selectedProduct?.recordId),
    [products, selectedProduct?.recordId],
  );
  const productFamilySuggestions = useMemo(
    () => productFieldSuggestions(products, "productFamily", selectedProduct?.recordId),
    [products, selectedProduct?.recordId],
  );
  const productVersionSuggestions = useMemo(
    () => productFieldSuggestions(products, "productVersion", selectedProduct?.recordId),
    [products, selectedProduct?.recordId],
  );
  const productUrlSuggestions = useMemo(
    () => productFieldSuggestions(products, "productUrl", selectedProduct?.recordId),
    [products, selectedProduct?.recordId],
  );
  const duplicateEditedProduct = useMemo(
    () => editedProduct ? findDuplicateProduct(products, editedProduct, editedProduct.recordId) : undefined,
    [editedProduct, products],
  );

  useEffect(() => {
    if (!selectedProduct) return;
    void markRecordRead("product", selectedProduct.recordId);
  }, [markRecordRead, selectedProduct?.recordId, selectedProductActivityAt]);
  const [visibleProductColumnKeys, setVisibleProductColumnKeys] = useStoredColumnKeys<ProductColumnKey>(PRODUCT_COLUMN_STORAGE_KEY, DEFAULT_PRODUCT_COLUMN_KEYS);

  const [searchFilters, setSearchFilters] = useState({
    productName: "",
    productFamily: "",
    productVersion: "",
  });

  const [sortConfig, setSortConfig] = useState<SortConfig<ProductColumnKey>>({
    key: "",
    direction: null,
  });

  const handleCaseClick = (caseId: string) => {
    if (!selectedProduct?.recordId) return;

    navigate(createDetailPath("case", caseId), {
      state: createLinkedDetailState(
        "case",
        caseId,
        createDetailTarget("product", selectedProduct.recordId),
        (location.state as DetailRouteState | null) ?? null,
      ),
    });
  };

  const handleSave = async () => {
    if (!editedProduct) return;

    try {
      const saved = await updateProduct(editedProduct.recordId, {
        productFamily: editedProduct.productFamily,
        productName: editedProduct.productName,
        productVersion: editedProduct.productVersion,
        productUrl: editedProduct.productUrl,
        description: editedProduct.description,
        metaData: editedProduct.metaData,
      });

      upsertProduct(saved);

      applySavedRecord(saved);
      showToast("Changes saved successfully!", "success");
    } catch (error) {
      console.error("Failed to save product:", error);
      showToast(error instanceof Error ? error.message : "Failed to save changes. Please try again.", "error");
    }
  };

  const canDeleteRecords = user?.role === "manager" || user?.role === "admin";

  const handleDelete = async () => {
    if (!selectedProduct) return;
    const confirmed = window.confirm(`Delete product "${selectedProduct.productName}"? Linked cases will be detached.`);
    if (!confirmed) return;

    try {
      await deleteProduct(selectedProduct.recordId);
      removeBookmark(selectedProduct.recordId, "product");
      removeProduct(selectedProduct.recordId);
      setSelectedProduct(null);
      await refreshRecords();
      showToast("Product deleted.", "success");
      navigate("/product");
    } catch (error) {
      console.error("Failed to delete product:", error);
      showToast(error instanceof Error ? error.message : "Failed to delete product.", "error");
    }
  };

  const handleSort = (key: ProductColumnKey) => {
    setSortConfig((current) => getNextSortConfig(current, key));
  };

  const handleToggleProductColumn = (key: ProductColumnKey) => {
    const column = PRODUCT_TABLE_COLUMNS.find((item) => item.key === key);
    const isCurrentlyVisible = visibleProductColumnKeys.includes(key);
    const shouldHide = isCurrentlyVisible && visibleProductColumnKeys.length > 1;

    if (shouldHide && column?.searchKey) {
      setSearchFilters((current) => ({ ...current, [column.searchKey!]: "" }));
    }

    if (shouldHide && sortConfig.key === key) {
      setSortConfig({ key: "", direction: null });
    }

    setVisibleProductColumnKeys((current) => toggleColumnKey(current, key, DEFAULT_PRODUCT_COLUMN_KEYS));
  };

  const handleResetProductColumns = () => {
    setVisibleProductColumnKeys(DEFAULT_PRODUCT_COLUMN_KEYS);
  };

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  const filteredProducts = products.filter((product) => {
    if (normalizedSearchTerm) {
      const matchesGlobalSearch = [
        product.productName,
        product.productFamily,
        product.productVersion,
        product.productUrl,
        product.description,
      ].some((value) => (value ?? "").toLowerCase().includes(normalizedSearchTerm));

      if (!matchesGlobalSearch) return false;
    }

    if (searchFilters.productName && !product.productName.toLowerCase().includes(searchFilters.productName.toLowerCase())) return false;
    if (searchFilters.productFamily && !(product.productFamily ?? "").toLowerCase().includes(searchFilters.productFamily.toLowerCase())) return false;
    if (searchFilters.productVersion && !(product.productVersion ?? "").toLowerCase().includes(searchFilters.productVersion.toLowerCase())) return false;
    return true;
  });

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (!sortConfig.direction || !sortConfig.key) return 0;
    return compareValues(a[sortConfig.key], b[sortConfig.key], sortConfig.direction);
  });

  const visibleProductColumns = PRODUCT_TABLE_COLUMNS.filter((column) => visibleProductColumnKeys.includes(column.key));
  const detailGridClassName = activeDetailTab === "details"
    ? `grid grid-cols-1 gap-3 sm:grid-cols-2 ${
        isEditing
          ? ""
          : "[&>div]:flex [&>div]:min-w-0 [&>div]:items-baseline [&>div]:gap-x-2 [&>div]:gap-y-1 [&>div]:rounded-lg [&>div]:border [&>div]:border-gray-100 [&>div]:bg-gray-50 [&>div]:px-3 [&>div]:py-2 [&_label]:mb-0 [&_label]:shrink-0 [&_label]:font-semibold [&_label]:after:content-[':'] [&_p]:min-w-0 [&_p]:flex-1 [&_p]:break-words [&_a]:min-w-0 [&_a]:break-all"
      }`
    : "hidden";

  const handleExportCsv = () => {
    exportRowsToCsv(
      "products",
      sortedProducts,
      visibleProductColumns.map((column) => ({
        label: column.label,
        value: (product) => column.key === "updatedAt"
          ? formatTimestampMinute(product.updatedAt)
          : product[column.key] ?? "",
      })),
    );
  };

  const renderSortIcon = (key: ProductColumnKey) => {
    if (sortConfig.key !== key || !sortConfig.direction) {
      return <ArrowUpDown className="w-4 h-4" />;
    }

    return sortConfig.direction === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />;
  };

  const renderColumnHeader = (column: ProductTableColumn) => (
    <th key={column.key} className="text-left px-6 py-3">
      <div className={`flex items-center gap-2 ${column.searchKey ? "mb-2" : ""}`}>
        <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">{column.label}</span>
        <button onClick={() => handleSort(column.sortKey)} className="text-gray-400 hover:text-gray-600">
          {renderSortIcon(column.sortKey)}
        </button>
      </div>
      {column.searchKey && (
        <input
          type="text"
          placeholder="Search..."
          value={searchFilters[column.searchKey]}
          onChange={(e) => setSearchFilters({ ...searchFilters, [column.searchKey!]: e.target.value })}
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#E31937]"
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </th>
  );

  const renderColumnCell = (product: typeof products[0], column: ProductTableColumn) => {
    switch (column.key) {
      case "productName":
        return <td key={column.key} className="px-6 py-4 text-sm font-medium text-gray-900 whitespace-nowrap">{product.productName}</td>;
      case "productFamily":
        return <td key={column.key} className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">{product.productFamily}</td>;
      case "productVersion":
        return <td key={column.key} className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">{product.productVersion || "-"}</td>;
      case "productUrl":
        return (
          <td key={column.key} className="px-6 py-4 text-sm">
            <a href={product.productUrl ?? undefined} target="_blank" rel="noopener noreferrer" className="text-[#E31937] hover:underline flex items-center gap-1 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
              View Product
              <ExternalLink className="w-3 h-3" />
            </a>
          </td>
        );
      case "updatedAt":
        return <td key={column.key} className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">{formatTimestampMinute(product.updatedAt)}</td>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div data-guide-id="products-intro">
          <h1 className="text-2xl font-bold text-gray-900">Fortinet Products</h1>
          <p className="text-gray-600 mt-1">Manage Fortinet product catalog and security solutions</p>
        </div>
        <PageGuide label="Products" steps={productGuideSteps} />
      </div>

      <div className={`bg-white rounded-xl shadow-sm border border-gray-200 ${selectedProduct ? "hidden" : ""}`}>
        <div className="flex flex-col gap-3 border-b border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Product Records</h2>
            <p className="text-sm text-gray-500">{visibleProductColumns.length} of {PRODUCT_TABLE_COLUMNS.length} fields shown</p>
          </div>
          <div data-guide-id="products-actions" className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={sortedProducts.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <CreateEntityDialog
              entityType="product"
              onCreated={(product) => navigate(createDetailPath("product", product.recordId))}
            />
            <TableFieldSelector
              columns={PRODUCT_TABLE_COLUMNS}
              visibleKeys={visibleProductColumnKeys}
              onToggle={handleToggleProductColumn}
              onReset={handleResetProductColumns}
            />
          </div>
        </div>
        <div data-guide-id="products-table" className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 w-12">
                  <Bookmark className="h-4 w-4 text-gray-500" aria-label="Bookmark" />
                </th>
                {visibleProductColumns.map(renderColumnHeader)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedProducts.map((product) => (
                <tr
                  key={product.recordId}
                  onClick={() => navigate(createDetailPath("product", product.recordId))}
                  className={unreadRowClassName(isRecordUnread("product", product.recordId, getRecordActivityTimestamp(product)))}
                >
                  <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isBookmarked(product.recordId, 'product')) {
                          removeBookmark(product.recordId, 'product');
                        } else {
                          addBookmark({
                            id: product.recordId,
                            type: 'product',
                            title: product.productName,
                            subtitle: product.productFamily ?? undefined,
                            timestamp: Date.now(),
                          });
                        }
                      }}
                      className="text-gray-400 hover:text-yellow-500 transition-colors"
                      title="Bookmark"
                    >
                      <Bookmark className={`w-5 h-5 ${isBookmarked(product.recordId, 'product') ? 'fill-yellow-400 text-yellow-500' : ''}`} />
                    </button>
                  </td>
                  {visibleProductColumns.map((column) => renderColumnCell(product, column))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedProduct && (
        <div data-guide-id="products-detail" className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="w-full">
            <div className="sticky top-[-1.5rem] z-10 bg-white border-b border-gray-200 p-6 flex items-center justify-between rounded-t-xl">
              <h2 className="text-xl font-semibold text-gray-900">Product Details</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (isBookmarked(selectedProduct!.recordId, 'product')) {
                      removeBookmark(selectedProduct!.recordId, 'product');
                    } else {
                      addBookmark({
                        id: selectedProduct!.recordId,
                        type: 'product',
                        title: selectedProduct!.productName,
                        subtitle: selectedProduct!.productFamily ?? undefined,
                        timestamp: Date.now(),
                      });
                    }
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    isBookmarked(selectedProduct!.recordId, 'product')
                      ? 'bg-yellow-100 text-yellow-600'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  title="Bookmark this product"
                >
                  <Bookmark className={`w-5 h-5 ${isBookmarked(selectedProduct!.recordId, 'product') ? 'fill-current' : ''}`} />
                </button>
                {canDeleteRecords && isEditing ? (
                  <button
                    onClick={() => void handleDelete()}
                    className="flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-[#B5122B] transition-colors hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                ) : null}
                {isEditing ? (
                  <>
                    <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-[#E31937] text-white rounded-lg hover:bg-[#c41230] transition-colors">
                      <Save className="w-4 h-4" />
                      Save
                    </button>
                    <button onClick={handleCancelEdit} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                      Cancel
                    </button>
                  </>
                ) : (
                  <button onClick={handleEdit} className="flex items-center gap-2 px-4 py-2 bg-[#E31937] text-white rounded-lg hover:bg-[#c41230] transition-colors">
                    <Edit2 className="w-4 h-4" />
                    Edit
                  </button>
                )}
                <button onClick={handleBackFromDetail} className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
              </div>
            </div>

            <div className="p-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="xl:col-span-2 space-y-6">
              <DetailTabs tabs={PRODUCT_DETAIL_TABS} activeTab={activeDetailTab} onChange={setActiveDetailTab} />

              <div className={detailGridClassName}>
                <div className="order-2">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Product Family</label>
                  {isEditing && editedProduct ? (
                    <TypeaheadInput
                      type="text"
                      value={editedProduct.productFamily ?? ""}
                      onChange={(productFamily) => setEditedProduct({ ...editedProduct, productFamily })}
                      options={productFamilySuggestions}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedProduct.productFamily || "-"}</p>
                  )}
                </div>
                <div className="order-1">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Product Name</label>
                  {isEditing && editedProduct ? (
                    <TypeaheadInput
                      type="text"
                      value={editedProduct.productName}
                      onChange={(productName) => setEditedProduct({ ...editedProduct, productName })}
                      options={productNameSuggestions}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900 font-medium">{selectedProduct.productName}</p>
                  )}
                </div>
                <div className="order-3 sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Version</label>
                  {isEditing && editedProduct ? (
                    <TypeaheadInput
                      type="text"
                      value={editedProduct.productVersion ?? ""}
                      onChange={(productVersion) => setEditedProduct({ ...editedProduct, productVersion })}
                      options={productVersionSuggestions}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                      placeholder="7.6, 2026.1, GA"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedProduct.productVersion || "-"}</p>
                  )}
                </div>
                <div className="order-4 sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Product URL</label>
                  {isEditing && editedProduct ? (
                    <TypeaheadInput
                      type="url"
                      value={editedProduct.productUrl ?? ""}
                      onChange={(productUrl) => setEditedProduct({ ...editedProduct, productUrl })}
                      options={productUrlSuggestions}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : selectedProduct.productUrl ? (
                    <a href={selectedProduct.productUrl} target="_blank" rel="noopener noreferrer" className="break-all text-[#E31937] hover:underline inline-flex items-center gap-1">
                      {selectedProduct.productUrl}
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  ) : (
                    <p className="text-gray-900">-</p>
                  )}
                </div>
                <div className="order-5 sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Description</label>
                  {isEditing && editedProduct ? (
                    <textarea
                      value={editedProduct.description ?? ""}
                      onChange={(e) => setEditedProduct({ ...editedProduct, description: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedProduct.description || "-"}</p>
                  )}
                </div>
                {isEditing && duplicateEditedProduct ? (
                  <div className="order-6 sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <div className="font-medium">Matching product exists: {duplicateEditedProduct.productName}</div>
                    <div className="mt-0.5 text-xs text-amber-800">
                      {[duplicateEditedProduct.productFamily, duplicateEditedProduct.productVersion]
                        .map((part) => part?.trim())
                        .filter(Boolean)
                        .join(" | ") || duplicateEditedProduct.recordId}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className={activeDetailTab === "linkedCases" ? "pt-1" : "hidden"}>
                <h3 className="font-semibold text-lg text-gray-900 mb-4">Linked Cases</h3>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3 mb-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Link case</label>
                      <SearchableSelect
                        label="case"
                        value={linkingCaseId}
                        options={availableCases.map((caseItem) => ({
                          value: caseItem.recordId,
                          label: formatRelatedCaseOption(caseItem, accounts, projects),
                          description: [caseItem.status, caseItem.priority].filter(Boolean).join(" | "),
                        }))}
                        emptyLabel="Select a case"
                        searchPlaceholder="Search account, project, or description"
                        onChange={setLinkingCaseId}
                      />
                    </div>
                    <CreateEntityDialog
                      entityType="case"
                      triggerLabel="New"
                      triggerTitle="Create case"
                      initialValues={{
                        product: selectedProduct.recordId,
                      }}
                      className={RELATED_CREATE_BUTTON_CLASS}
                      onCreated={(created) => {
                        void linkCase(created.recordId);
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleLinkCase}
                      disabled={!linkingCaseId || isLinkingCase}
                      className="px-4 py-2 bg-[#E31937] text-white rounded-lg hover:bg-[#c41230] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Link Case
                    </button>
                  </div>
                </div>

                <LinkedCasesList cases={linkedCases} onCaseClick={handleCaseClick} onRemoveCase={handleUnlinkCase} />
              </div>

              </div>

              <div className="xl:col-span-1">
                <div className="xl:sticky xl:top-24 border border-gray-200 rounded-lg bg-white p-4 max-h-[60vh] overflow-y-auto overflow-x-hidden">
              <div className="pt-0">
                <h3 className="font-semibold text-lg text-gray-900 mb-4">History</h3>

                <div className="mb-4 border-b border-gray-200 pb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Add Comment</label>
                  {selectedQuote && (
                    <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3 border-l-4 border-l-[#6264A7]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-gray-500 font-medium">
                          Replying to {selectedQuote.user} - {formatTimestampMinute(selectedQuote.timestamp)}
                        </p>
                        <button
                          onClick={() => setSelectedQuote(null)}
                          className="text-xs text-[#6264A7] hover:underline"
                        >
                          Clear quote
                        </button>
                      </div>
                      <p className="text-sm text-gray-700 mt-1 line-clamp-3 break-words [overflow-wrap:anywhere]">{formatHistoryEntryText(selectedQuote)}</p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Enter your comment..."
                      rows={3}
                      className="min-w-0 flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={handleAddComment}
                      disabled={isAddingComment || !newComment.trim()}
                      className="px-4 py-2 bg-[#E31937] text-white rounded-lg hover:bg-[#c41230] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isAddingComment ? "Adding..." : "Add Comment"}
                    </button>
                  </div>
                </div>
                <RecordHistoryTimeline
                  history={selectedProduct.history}
                  onQuote={setSelectedQuote}
                  onReply={handleAddReply}
                  isReplying={isAddingComment}
                />
              </div>
            </div>
          </div>
        </div>
          </div>
        </div>
      )}
    </div>
  );
}
