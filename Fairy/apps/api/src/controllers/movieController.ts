import type { Request, Response, NextFunction } from "express";
import type {
  CreateMovieInput,
  ListMoviesQuery,
  SearchMoviesQuery,
  UpdateMovieInput,
} from "@fairy/shared";
import * as movieService from "../services/movieService";

function getValidatedQuery<T>(res: Response): T {
  return res.locals.validatedQuery as T;
}

export async function listMoviesHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = getValidatedQuery<ListMoviesQuery>(res);
    const data = await movieService.listMovies(query);
    res.json({ code: "OK", data, msg: "查询成功" });
  } catch (error) {
    next(error);
  }
}

export async function searchMoviesHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = getValidatedQuery<SearchMoviesQuery>(res);
    const data = await movieService.searchMovies(query);
    res.json({ code: "OK", data, msg: "查询成功" });
  } catch (error) {
    next(error);
  }
}

export async function getMovieHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const movie = await movieService.getMovieById(req.params.id);

    if (!movie) {
      res.status(404).json({
        code: "MOVIE_NOT_FOUND",
        data: null,
        msg: "影片不存在",
      });
      return;
    }

    res.json({ code: "OK", data: movie, msg: "查询成功" });
  } catch (error) {
    next(error);
  }
}

export async function createMovieHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const movie = await movieService.createMovie(req.body as CreateMovieInput);
    res.status(201).json({ code: "OK", data: movie, msg: "创建成功" });
  } catch (error) {
    next(error);
  }
}

export async function updateMovieHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const movie = await movieService.updateMovie(req.params.id, req.body as UpdateMovieInput);

    if (!movie) {
      res.status(404).json({
        code: "MOVIE_NOT_FOUND",
        data: null,
        msg: "影片不存在",
      });
      return;
    }

    res.json({ code: "OK", data: movie, msg: "更新成功" });
  } catch (error) {
    next(error);
  }
}

export async function deleteMovieHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const deleted = await movieService.deleteMovie(req.params.id);

    if (!deleted) {
      res.status(404).json({
        code: "MOVIE_NOT_FOUND",
        data: null,
        msg: "影片不存在",
      });
      return;
    }

    res.json({ code: "OK", data: { id: req.params.id }, msg: "删除成功" });
  } catch (error) {
    next(error);
  }
}
