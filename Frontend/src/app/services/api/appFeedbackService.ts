import { API_BASE, clearStoredAuth, fetchJson, getStoredToken } from "./http";
import type { AppFeedbackRecord, SubmitAppFeedbackRequest } from "./types";

export async function submitAppFeedback(data: SubmitAppFeedbackRequest) {
  const formData = new FormData();
  formData.append("category", data.category);
  formData.append("title", data.title);
  formData.append("description", data.description);

  for (const image of data.images ?? []) {
    formData.append("images", image);
  }

  return fetchJson<AppFeedbackRecord>("/app-feedback", {
    method: "POST",
    body: formData,
  });
}

export function listAppFeedback() {
  return fetchJson<AppFeedbackRecord[]>("/app-feedback");
}

export function markAppFeedbackDone(feedbackId: number) {
  return fetchJson<AppFeedbackRecord>(`/app-feedback/${feedbackId}/done`, {
    method: "PUT",
  });
}

export async function fetchAppFeedbackImage(imageId: number) {
  const token = getStoredToken();
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}/app-feedback/images/${imageId}`, { headers });
  if (response.status === 401) {
    clearStoredAuth();
  }
  if (!response.ok) {
    throw new Error(`Image request failed (${response.status})`);
  }

  return response.blob();
}
