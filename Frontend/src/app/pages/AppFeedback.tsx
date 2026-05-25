import { type FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Image as ImageIcon, MessageSquare, RefreshCw, Send, ShieldCheck, Upload, UserRound, X } from "lucide-react";
import {
  fetchAppFeedbackImage,
  listAppFeedback,
  markAppFeedbackDone,
  submitAppFeedback,
  type AppFeedbackCategory,
  type AppFeedbackImage,
  type AppFeedbackRecord,
} from "../data/apiClient";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { formatTimestampMinute } from "../utils/dateTime";

const FEEDBACK_CATEGORIES: Array<{ value: AppFeedbackCategory; label: string }> = [
  { value: "bug", label: "Bug" },
  { value: "improvement", label: "Improvement" },
  { value: "feature", label: "Feature" },
];

const categoryStyles: Record<AppFeedbackCategory, string> = {
  bug: "bg-red-50 text-[#B5122B] ring-red-200",
  improvement: "bg-blue-50 text-blue-700 ring-blue-200",
  feature: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_COUNT = 5;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function categoryLabel(value: string) {
  return FEEDBACK_CATEGORIES.find((category) => category.value === value)?.label ?? value;
}

function FeedbackImageThumbnail({ image }: { image: AppFeedbackImage }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    void (async () => {
      try {
        const blob = await fetchAppFeedbackImage(image.id);
        if (cancelled) return;

        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      } catch (error) {
        console.error("Failed to load feedback image:", error);
        if (!cancelled) {
          setHasError(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [image.id]);

  if (hasError) {
    return (
      <div className="flex h-20 w-28 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-500">
        Unavailable
      </div>
    );
  }

  if (!imageUrl) {
    return (
      <div className="flex h-20 w-28 items-center justify-center rounded-lg border border-gray-200 bg-gray-50">
        <RefreshCw className="h-4 w-4 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <a href={imageUrl} target="_blank" rel="noreferrer" className="block">
      <img
        src={imageUrl}
        alt={image.fileName}
        className="h-20 w-28 rounded-lg border border-gray-200 object-cover transition-opacity hover:opacity-85"
      />
    </a>
  );
}

export function AppFeedback() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user?.role === "admin";
  const [category, setCategory] = useState<AppFeedbackCategory>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [feedback, setFeedback] = useState<AppFeedbackRecord[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingFeedback, setIsLoadingFeedback] = useState(false);
  const [completingIds, setCompletingIds] = useState<Set<number>>(() => new Set());
  const [loadError, setLoadError] = useState("");

  const selectedImageSize = useMemo(() => images.reduce((total, image) => total + image.size, 0), [images]);

  const loadFeedback = async () => {
    if (!isAdmin) return;

    setIsLoadingFeedback(true);
    setLoadError("");
    try {
      setFeedback(await listAppFeedback());
    } catch (error) {
      console.error("Failed to load app feedback:", error);
      setLoadError(error instanceof Error ? error.message : "Failed to load app feedback");
    } finally {
      setIsLoadingFeedback(false);
    }
  };

  useEffect(() => {
    void loadFeedback();
  }, [isAdmin]);

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const pickedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";

    const nextImages = [...images];
    for (const file of pickedFiles) {
      if (!file.type.startsWith("image/")) {
        showToast(`${file.name} is not an image.`, "error");
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        showToast(`${file.name} exceeds 5 MB.`, "error");
        continue;
      }
      if (nextImages.length >= MAX_IMAGE_COUNT) {
        showToast(`Upload up to ${MAX_IMAGE_COUNT} images.`, "error");
        break;
      }
      const duplicate = nextImages.some((image) => image.name === file.name && image.size === file.size);
      if (!duplicate) {
        nextImages.push(file);
      }
    }

    setImages(nextImages);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const cleanTitle = title.trim();
    const cleanDescription = description.trim();
    if (!cleanTitle || !cleanDescription) {
      showToast("Summary and description are required.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await submitAppFeedback({
        category,
        title: cleanTitle,
        description: cleanDescription,
        images,
      });
      setTitle("");
      setDescription("");
      setImages([]);
      if (isAdmin) {
        setFeedback((current) => [created, ...current]);
      }
      showToast("Feedback submitted.", "success");
    } catch (error) {
      console.error("Failed to submit feedback:", error);
      showToast(error instanceof Error ? error.message : "Failed to submit feedback.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkDone = async (feedbackId: number) => {
    setCompletingIds((current) => new Set(current).add(feedbackId));
    try {
      await markAppFeedbackDone(feedbackId);
      setFeedback((current) => current.filter((item) => item.id !== feedbackId));
      showToast("Feedback marked done.", "success");
    } catch (error) {
      console.error("Failed to mark feedback done:", error);
      showToast(error instanceof Error ? error.message : "Failed to mark feedback done.", "error");
    } finally {
      setCompletingIds((current) => {
        const next = new Set(current);
        next.delete(feedbackId);
        return next;
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">App Feedback</h1>
          <p className="mt-1 text-gray-600">Share bugs, improvements, and feature requests.</p>
        </div>
        {isAdmin ? (
          <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm">
            <ShieldCheck className="h-4 w-4 text-[#E31937]" />
            Admin view
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#E31937] text-white">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Submit Feedback</h2>
              <p className="text-sm text-gray-500">Visible to administrators after submission.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Type</label>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as AppFeedbackCategory)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
              >
                {FEEDBACK_CATEGORIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Summary</label>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={255}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={6}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Images</label>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
                  <Upload className="h-4 w-4" />
                  Add Images
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageChange} />
                </label>
                {images.length > 0 ? (
                  <span className="text-sm text-gray-500">
                    {images.length} selected, {formatBytes(selectedImageSize)}
                  </span>
                ) : null}
              </div>

              {images.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {images.map((image) => (
                    <div key={`${image.name}-${image.size}`} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <ImageIcon className="h-4 w-4 shrink-0 text-gray-500" />
                        <span className="truncate text-sm font-medium text-gray-800">{image.name}</span>
                        <span className="shrink-0 text-xs text-gray-500">{formatBytes(image.size)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setImages((current) => current.filter((item) => item !== image))}
                        className="rounded-md p-1 text-gray-500 hover:bg-white hover:text-gray-700"
                        aria-label={`Remove ${image.name}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#E31937] px-4 py-2 font-medium text-white transition-colors hover:bg-[#c41230] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {isSubmitting ? "Submitting..." : "Submit Feedback"}
            </button>
          </div>
        </form>

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          {isAdmin ? (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-gray-200 p-5">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Submitted Feedback</h2>
                  <p className="text-sm text-gray-500">{feedback.length} items</p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadFeedback()}
                  disabled={isLoadingFeedback}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${isLoadingFeedback ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>

              {loadError ? (
                <div className="m-5 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <AlertTriangle className="h-4 w-4" />
                  {loadError}
                </div>
              ) : null}

              <div className="divide-y divide-gray-100">
                {feedback.map((item) => (
                  <article key={item.id} className="p-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ring-1 ${categoryStyles[item.category]}`}>
                            {categoryLabel(item.category)}
                          </span>
                          <span className="text-xs text-gray-500">{formatTimestampMinute(item.createdAt)}</span>
                        </div>
                        <h3 className="text-base font-semibold text-gray-900">{item.title}</h3>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{item.description}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-700">
                        <UserRound className="h-4 w-4" />
                        <span>{item.createdByName}</span>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-gray-500">{item.createdByEmail}</p>
                      <button
                        type="button"
                        onClick={() => void handleMarkDone(item.id)}
                        disabled={completingIds.has(item.id)}
                        className="inline-flex w-fit items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {completingIds.has(item.id) ? "Marking..." : "Mark Done"}
                      </button>
                    </div>

                    {item.images.length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-3">
                        {item.images.map((image) => (
                          <div key={image.id} className="space-y-1">
                            <FeedbackImageThumbnail image={image} />
                            <p className="max-w-28 truncate text-xs text-gray-500" title={image.fileName}>
                              {image.fileName}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}

                {!isLoadingFeedback && feedback.length === 0 ? (
                  <div className="flex flex-col items-center justify-center px-5 py-14 text-center">
                    <CheckCircle2 className="h-10 w-10 text-gray-300" />
                    <p className="mt-3 text-sm text-gray-500">No feedback submitted yet.</p>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="flex h-full min-h-[24rem] flex-col items-center justify-center p-8 text-center">
              <ShieldCheck className="h-12 w-12 text-gray-300" />
              <h2 className="mt-4 text-lg font-semibold text-gray-900">Feedback Submitted Privately</h2>
              <p className="mt-2 max-w-sm text-sm text-gray-500">Administrators can review submitted feedback and attached screenshots.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
