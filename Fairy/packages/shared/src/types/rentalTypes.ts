export type RentalStatus = "ACTIVE" | "RETURNED";

export interface Rental {
  id: string;
  movieId: string;
  userId: string;
  status: RentalStatus;
  createdAt: string;
  updatedAt: string;
}

export type BorrowErrorCode =
  | "MOVIE_NOT_FOUND"
  | "OUT_OF_STOCK"
  | "ALREADY_BORROWED";

export type ReturnErrorCode = "RENTAL_NOT_FOUND";
