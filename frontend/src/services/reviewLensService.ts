import { api } from "@/services/api";
import type {
  AskRequest,
  AskResponse,
  Business,
  BusinessInput,
  Report,
  ReportSummary,
  Review,
  ReviewFilters,
  ReviewPage,
  ReviewQuery,
  ReviewUpdate,
  StatsResponse,
  Upload,
  WeekInfo,
} from "@/types";

/** Drop empty values so they are not sent as query params. */
export function cleanParams<T extends object>(params: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  ) as Partial<T>;
}

export const businessService = {
  list: async (): Promise<Business[]> => (await api.get<Business[]>("/businesses")).data,
  create: async (data: BusinessInput): Promise<Business> => (await api.post<Business>("/businesses", data)).data,
  update: async (id: number, data: Partial<BusinessInput>): Promise<Business> =>
    (await api.put<Business>(`/businesses/${id}`, data)).data,
  remove: async (id: number): Promise<void> => {
    await api.delete(`/businesses/${id}`);
  },
};

export const uploadService = {
  create: async (businessId: number, file: File): Promise<Upload> => {
    const form = new FormData();
    form.append("file", file);
    return (await api.post<Upload>(`/businesses/${businessId}/uploads`, form)).data;
  },
  list: async (businessId: number): Promise<Upload[]> =>
    (await api.get<Upload[]>(`/businesses/${businessId}/uploads`)).data,
  get: async (uploadId: number): Promise<Upload> => (await api.get<Upload>(`/uploads/${uploadId}`)).data,
  retry: async (uploadId: number): Promise<Upload> => (await api.post<Upload>(`/uploads/${uploadId}/retry`)).data,
};

export const reviewService = {
  list: async (businessId: number, query: ReviewQuery): Promise<ReviewPage> =>
    (await api.get<ReviewPage>(`/businesses/${businessId}/reviews`, { params: cleanParams(query) })).data,
  get: async (id: number): Promise<Review> => (await api.get<Review>(`/reviews/${id}`)).data,
  update: async (id: number, data: ReviewUpdate): Promise<Review> =>
    (await api.patch<Review>(`/reviews/${id}`, data)).data,
  exportCsv: async (businessId: number, filters: ReviewFilters): Promise<void> => {
    const res = await api.get<Blob>(`/businesses/${businessId}/reviews/export.csv`, {
      params: cleanParams(filters),
      responseType: "blob",
    });
    const disposition = String(res.headers["content-disposition"] ?? "");
    const match = /filename="([^"]+)"/.exec(disposition);
    const url = URL.createObjectURL(res.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = match?.[1] ?? "reviewlens_export.csv";
    link.click();
    URL.revokeObjectURL(url);
  },
};

export const statsService = {
  weeks: async (businessId: number): Promise<WeekInfo[]> =>
    (await api.get<WeekInfo[]>(`/businesses/${businessId}/weeks`)).data,
  stats: async (businessId: number, weekStart?: string): Promise<StatsResponse> =>
    (await api.get<StatsResponse>(`/businesses/${businessId}/stats`, { params: cleanParams({ week_start: weekStart }) }))
      .data,
};

export const reportService = {
  generate: async (businessId: number, weekStart: string): Promise<Report> =>
    (await api.post<Report>(`/businesses/${businessId}/reports`, { week_start: weekStart })).data,
  list: async (businessId: number): Promise<ReportSummary[]> =>
    (await api.get<ReportSummary[]>(`/businesses/${businessId}/reports`)).data,
  get: async (id: number): Promise<Report> => (await api.get<Report>(`/reports/${id}`)).data,
};

export const askService = {
  ask: async (businessId: number, body: AskRequest): Promise<AskResponse> =>
    (await api.post<AskResponse>(`/businesses/${businessId}/ask`, cleanParams(body))).data,
};
