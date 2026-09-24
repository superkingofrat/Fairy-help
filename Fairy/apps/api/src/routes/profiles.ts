import { Router, type IRouter } from "express";
import { createProfileSchema, updateProfileSchema } from "@fairy/shared";
import {
  createProfileHandler,
  getProfileHandler,
  listProfilesHandler,
  updateProfileHandler,
} from "../controllers/profileController";
import { requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validateBody";

const router: IRouter = Router();

router.get("/", requireRole("admin"), listProfilesHandler);
router.get("/:userId", getProfileHandler);
router.post("/", requireRole("admin"), validateBody(createProfileSchema), createProfileHandler);
router.patch(
  "/:userId",
  requireRole("admin"),
  validateBody(updateProfileSchema),
  updateProfileHandler,
);

export { router as profilesRouter };
