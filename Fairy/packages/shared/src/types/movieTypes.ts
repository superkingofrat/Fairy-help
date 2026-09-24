export const MOODS = ["治愈", "热血", "悬疑", "致郁", "轻松", "浪漫"] as const;
export const SCENES = ["雨天", "失眠夜", "周末午后", "独自在家", "约会夜", "通勤路上"] as const;

export type Mood = (typeof MOODS)[number];
export type Scene = (typeof SCENES)[number];

export interface Movie {
  id: string;
  title: string;
  director: string;
  year: number;
  mood: Mood[];
  scene: Scene[];
  genres: string[];
  quote: string | null;
  stock: number;
  totalStock: number;
  coverUrl: string | null;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedMovies {
  items: Movie[];
  pagination: Pagination;
}
