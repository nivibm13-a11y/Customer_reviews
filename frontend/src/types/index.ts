export type Sentiment = "positive" | "neutral" | "negative";
export type Category = "food_quality" | "delivery" | "price" | "staff" | "packaging" | "app";
export type Urgency = "low" | "medium" | "high";
export type Language = "English" | "Tamil" | "Tanglish";
export type AnalysisStatus = "pending" | "ok" | "needs_review";
export type UploadStatus = "pending" | "processing" | "completed" | "failed";
export type BusinessType = "restaurant" | "online_store" | "other";

export const SENTIMENTS: Sentiment[] = ["positive", "neutral", "negative"];
export const CATEGORIES: Category[] = ["food_quality", "delivery", "price", "staff", "packaging", "app"];
export const URGENCIES: Urgency[] = ["high", "medium", "low"];
export const LANGUAGES: Language[] = ["English", "Tamil", "Tanglish"];
export const PLATFORMS: string[] = ["Google", "Zomato", "Swiggy", "Amazon"];

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface User {
  id: number;
  email: string;
  full_name: string | null;
  is_active: boolean;
  is_verified: boolean;
  oauth_provider: string | null;
  has_password: boolean;
  created_at: string;
}

export interface Business {
  id: number;
  name: string;
  business_type: BusinessType;
  created_at: string;
  updated_at: string | null;
}

export interface BusinessInput {
  name: string;
  business_type: BusinessType;
}

export interface Upload {
  id: number;
  business_id: number;
  filename: string;
  status: UploadStatus;
  total_rows: number;
  valid_rows: number;
  dropped_rows: number;
  duplicates_skipped: number;
  processed_count: number;
  needs_review_count: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  progress_pct: number;
}

export interface Review {
  id: number;
  business_id: number;
  upload_id: number;
  review_id: string;
  review_date: string;
  platform: string;
  rating: number | null;
  review_text: string;
  sentiment: Sentiment | null;
  category: Category | null;
  urgency: Urgency | null;
  language: Language | null;
  summary: string | null;
  suggested_reply: string | null;
  analysis_status: AnalysisStatus;
  is_edited: boolean;
  edited_at: string | null;
  created_at: string;
}

export interface ReviewPage {
  items: Review[];
  total: number;
  page: number;
  page_size: number;
}

export interface ReviewFilters {
  sentiment?: Sentiment;
  category?: Category;
  urgency?: Urgency;
  platform?: string;
  language?: Language;
  analysis_status?: AnalysisStatus;
  date_from?: string;
  date_to?: string;
  upload_id?: number;
  search?: string;
}

export interface ReviewQuery extends ReviewFilters {
  page: number;
  page_size: number;
  sort: string;
}

export type ReviewUpdate = Partial<
  Pick<Review, "sentiment" | "category" | "urgency" | "language" | "summary" | "suggested_reply">
>;

export interface CountPct {
  count: number;
  pct: number;
}

export interface WeekStats {
  week_start: string;
  week_end: string;
  total: number;
  analysed: number;
  needs_review: number;
  sentiment: Record<Sentiment, CountPct>;
  category: Record<Category, number>;
  urgency: Record<Urgency, number>;
  platform: Record<string, number>;
  language: Record<Language, number>;
  negative_by_category: Record<Category, number>;
  positive_by_category: Record<Category, number>;
  negative_by_platform: Record<string, number>;
  urgent_count: number;
  avg_rating: number | null;
}

export interface WeekDeltas {
  total: number;
  positive_pct: number;
  negative_pct: number;
  urgent_count: number;
  avg_rating: number | null;
}

export interface StatsResponse {
  current: WeekStats;
  previous: WeekStats | null;
  deltas: WeekDeltas | null;
}

export interface WeekInfo {
  week_start: string;
  week_end: string;
  review_count: number;
}

export interface Complaint {
  title: string;
  category: Category;
  count: number;
  note: string;
}

export interface Praise {
  title: string;
  category: Category;
  mentions: number;
}

export interface Report {
  id: number;
  business_id: number;
  week_start: string;
  week_end: string;
  stats: WeekStats;
  top_complaints: Complaint[];
  top_praises: Praise[];
  action_items: string[];
  urgent_count: number;
  generated_at: string;
}

export interface ReportSummary {
  id: number;
  week_start: string;
  week_end: string;
  urgent_count: number;
  generated_at: string;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AskFilters {
  week_start?: string;
  sentiment?: Sentiment;
  category?: Category;
  platform?: string;
}

export interface AskRequest extends AskFilters {
  question: string;
  history: ChatTurn[];
}

export interface ReviewSource {
  id: number;
  review_id: string;
  review_date: string;
  platform: string;
  rating: number | null;
  sentiment: Sentiment | null;
  category: Category | null;
  urgency: Urgency | null;
  summary: string | null;
  snippet: string;
}

export interface AskResponse {
  answer: string;
  sources: ReviewSource[];
}

export interface ApiErrorBody {
  detail?: string | { msg: string }[];
}
