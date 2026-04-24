import { useState, useEffect } from "react";
import { X, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown, Edit2, Save, Bookmark } from "lucide-react";
import { products, getProductById, getCasesByProductId, updateProduct } from "../data/apiClient";
import { LinkedCasesList } from "../components/LinkedEntityCard";
import { useNavigate } from "react-router";
import { useSearch } from "../context/SearchContext";
import { useBookmarks } from "../context/BookmarksContext";

export function Product() {
  const navigate = useNavigate();
  const { addBookmark, removeBookmark, isBookmarked } = useBookmarks();
  const { searchTerm } = useSearch();
  const [selectedProduct, setSelectedProduct] = useState<typeof products[0] | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedProduct, setEditedProduct] = useState<typeof products[0] | null>(null);
  const [newComment, setNewComment] = useState("");

  const [searchFilters, setSearchFilters] = useState({
    recordId: "",
    productName: "",
    productFamily: "",
  });

  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({
    key: "",
    direction: null,
  });

  useEffect(() => {
    const handleOpenDetail = (event: any) => {
      const productId = event.detail;
      const product = getProductById(productId);
      if (product) {
        setSelectedProduct(product);
      }
    };

    window.addEventListener('openProductDetail', handleOpenDetail as EventListener);
    return () => window.removeEventListener('openProductDetail', handleOpenDetail as EventListener);
  }, []);

  const handleCaseClick = (caseId: string) => {
    setSelectedProduct(null);
    navigate('/cases');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('openCaseDetail', { detail: caseId }));
    }, 100);
  };

  const handleEdit = () => {
    if (selectedProduct) {
      setEditedProduct({ ...selectedProduct });
      setIsEditing(true);
    }
  };

  const handleSave = async () => {
    if (!editedProduct) return;

    try {
      const saved = await updateProduct(editedProduct.recordId, {
        productFamily: editedProduct.productFamily,
        productName: editedProduct.productName,
        productUrl: editedProduct.productUrl,
        metaData: editedProduct.metaData,
      });

      const index = products.findIndex((product) => product.recordId === saved.recordId);
      if (index >= 0) {
        products[index] = saved;
      }

      setSelectedProduct(saved);
      setEditedProduct(saved);
      setIsEditing(false);
      alert("Changes saved successfully!");
    } catch (error) {
      console.error("Failed to save product:", error);
      alert("Failed to save changes. Please try again.");
    }
  };

  const handleCancelEdit = () => {
    setEditedProduct(null);
    setIsEditing(false);
  };

  const handleAddComment = () => {
    if (selectedProduct && newComment.trim()) {
      const now = new Date();
      const timestamp = now.toISOString().slice(0, 19).replace('T', ' ');

      const newHistoryEntry = {
        timestamp,
        user: "Current User",
        action: "Comment",
        changes: newComment.trim(),
      };

      const updatedProduct = {
        ...selectedProduct,
        history: [...(selectedProduct.history || []), newHistoryEntry],
      };

      setSelectedProduct(updatedProduct);
      setNewComment("");
    }
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' | null = 'asc';
    if (sortConfig.key === key) {
      if (sortConfig.direction === 'asc') {
        direction = 'desc';
      } else if (sortConfig.direction === 'desc') {
        direction = null;
      }
    }
    setSortConfig({ key, direction });
  };

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  const filteredProducts = products.filter((product) => {
    if (normalizedSearchTerm) {
      const matchesGlobalSearch = [
        product.recordId,
        product.productName,
        product.productFamily,
        product.productUrl,
      ].some((value) => (value ?? "").toLowerCase().includes(normalizedSearchTerm));

      if (!matchesGlobalSearch) return false;
    }

    if (searchFilters.recordId && !product.recordId.toLowerCase().includes(searchFilters.recordId.toLowerCase())) return false;
    if (searchFilters.productName && !product.productName.toLowerCase().includes(searchFilters.productName.toLowerCase())) return false;
    if (searchFilters.productFamily && !(product.productFamily ?? "").toLowerCase().includes(searchFilters.productFamily.toLowerCase())) return false;
    return true;
  });

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (!sortConfig.direction) return 0;

    let aValue: any = a[sortConfig.key as keyof typeof a] || "";
    let bValue: any = b[sortConfig.key as keyof typeof b] || "";

    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const relatedCases = selectedProduct ? getCasesByProductId(selectedProduct.recordId) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Fortinet Products</h1>
        <p className="text-gray-600 mt-1">Manage Fortinet product catalog and security solutions</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">                <th className="text-left px-4 py-3 w-12">
                  <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">★</span>
                </th>                <th className="text-left px-6 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Record ID</span>
                    <button onClick={() => handleSort("recordId")} className="text-gray-400 hover:text-gray-600">
                      {sortConfig.key === "recordId" ? (
                        sortConfig.direction === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                      ) : (
                        <ArrowUpDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchFilters.recordId}
                    onChange={(e) => setSearchFilters({ ...searchFilters, recordId: e.target.value })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#E31937]"
                    onClick={(e) => e.stopPropagation()}
                  />
                </th>
                <th className="text-left px-6 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Product Name</span>
                    <button onClick={() => handleSort("productName")} className="text-gray-400 hover:text-gray-600">
                      {sortConfig.key === "productName" ? (
                        sortConfig.direction === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                      ) : (
                        <ArrowUpDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchFilters.productName}
                    onChange={(e) => setSearchFilters({ ...searchFilters, productName: e.target.value })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#E31937]"
                    onClick={(e) => e.stopPropagation()}
                  />
                </th>
                <th className="text-left px-6 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Product Family</span>
                    <button onClick={() => handleSort("productFamily")} className="text-gray-400 hover:text-gray-600">
                      {sortConfig.key === "productFamily" ? (
                        sortConfig.direction === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                      ) : (
                        <ArrowUpDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchFilters.productFamily}
                    onChange={(e) => setSearchFilters({ ...searchFilters, productFamily: e.target.value })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#E31937]"
                    onClick={(e) => e.stopPropagation()}
                  />
                </th>
                <th className="text-left px-6 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Product URL</span>
                    <button onClick={() => handleSort("productUrl")} className="text-gray-400 hover:text-gray-600">
                      {sortConfig.key === "productUrl" ? (
                        sortConfig.direction === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                      ) : (
                        <ArrowUpDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </th>
                <th className="text-left px-6 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Updated At</span>
                    <button onClick={() => handleSort("updatedAt")} className="text-gray-400 hover:text-gray-600">
                      {sortConfig.key === "updatedAt" ? (
                        sortConfig.direction === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                      ) : (
                        <ArrowUpDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedProducts.map((product) => (
                <tr
                  key={product.recordId}
                  onClick={() => setSelectedProduct(product)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
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
                            subtitle: product.productFamily,
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
                  <td className="px-6 py-4 text-sm font-medium text-[#E31937] whitespace-nowrap">{product.recordId}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 whitespace-nowrap">{product.productName}</td>
                  <td className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">{product.productFamily}</td>
                  <td className="px-6 py-4 text-sm">
                    <a href={product.productUrl ?? undefined} target="_blank" rel="noopener noreferrer" className="text-[#E31937] hover:underline flex items-center gap-1 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      View Product
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">{product.updatedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between rounded-t-xl">
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
                        subtitle: selectedProduct!.productFamily,
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
                <button onClick={() => setSelectedProduct(null)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Record ID</label>
                  <p className="text-gray-900">{selectedProduct.recordId}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Product Family</label>
                  {isEditing && editedProduct ? (
                    <input
                      type="text"
                      value={editedProduct.productFamily ?? ""}
                      onChange={(e) => setEditedProduct({ ...editedProduct, productFamily: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedProduct.productFamily}</p>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Product Name</label>
                  {isEditing && editedProduct ? (
                    <input
                      type="text"
                      value={editedProduct.productName}
                      onChange={(e) => setEditedProduct({ ...editedProduct, productName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    <p className="text-gray-900 font-medium">{selectedProduct.productName}</p>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Product URL</label>
                  {isEditing && editedProduct ? (
                    <input
                      type="url"
                      value={editedProduct.productUrl ?? ""}
                      onChange={(e) => setEditedProduct({ ...editedProduct, productUrl: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  ) : (
                    selectedProduct.productUrl ? (
                      <a href={selectedProduct.productUrl} target="_blank" rel="noopener noreferrer" className="text-[#E31937] hover:underline flex items-center gap-1">
                        {selectedProduct.productUrl}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Created At</label>
                  <p className="text-gray-900">{selectedProduct.createdAt}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Updated At</label>
                  <p className="text-gray-900">{selectedProduct.updatedAt}</p>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <h3 className="font-semibold text-lg text-gray-900 mb-4">Related Data</h3>
                <LinkedCasesList cases={relatedCases} onCaseClick={handleCaseClick} />
              </div>

              <div className="border-t border-gray-200 pt-6">
                <h3 className="font-semibold text-lg text-gray-900 mb-4">History</h3>
                <div className="space-y-3 mb-6">
                  {selectedProduct.history && selectedProduct.history.length > 0 ? (
                    selectedProduct.history.map((entry, index) => (
                      <div key={index} className="flex gap-4 p-4 bg-gray-50 rounded-lg">
                        <div className="flex-shrink-0 w-40">
                          <div className="text-sm text-gray-500">{entry.timestamp}</div>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-gray-900">{entry.user}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              entry.action === "Comment"
                                ? "bg-green-100 text-green-800"
                                : "bg-blue-100 text-blue-800"
                            }`}>
                              {entry.action}
                            </span>
                          </div>
                          <div className="text-sm text-gray-700">{entry.changes}</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500 italic">No history available</p>
                  )}
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Add Comment</label>
                  <div className="flex gap-2">
                    <textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Enter your comment..."
                      rows={3}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                    />
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={handleAddComment}
                      disabled={!newComment.trim()}
                      className="px-4 py-2 bg-[#E31937] text-white rounded-lg hover:bg-[#c41230] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Add Comment
                    </button>
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
