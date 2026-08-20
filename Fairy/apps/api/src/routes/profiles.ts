import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/:userId", (_req, res) => {
  res.json({ code: "OK", data: null, msg: "Profiles endpoint placeholder." });
});

export { router as profilesRouter };
