import { Router, type IRouter } from "express";
import {
  createMovieSchema,
  listMoviesQuerySchema,
  searchMoviesQuerySchema,
  updateMovieSchema,
} from "@fairy/shared";
import {
  createMovieHandler,
  deleteMovieHandler,
  getMovieHandler,
  listMoviesHandler,
  searchMoviesHandler,
  updateMovieHandler,
} from "../controllers/movieController";
import { requireRole } from "../middleware/auth";
import { validateBody, validateQuery } from "../middleware/validateBody";

const router: IRouter = Router();

router.get("/", validateQuery(listMoviesQuerySchema), listMoviesHandler);
router.get("/search", validateQuery(searchMoviesQuerySchema), searchMoviesHandler);
router.get("/:id", getMovieHandler);

router.post(
  "/",
  requireRole("admin"),
  validateBody(createMovieSchema),
  createMovieHandler
);

router.patch(
  "/:id",
  requireRole("admin"),
  validateBody(updateMovieSchema),
  updateMovieHandler
);

router.delete("/:id", requireRole("admin"), deleteMovieHandler);

export { router as moviesRouter };
