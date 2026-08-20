export interface ApiResponse<T> {
  code: string;
  data: T;
  msg: string;
}
