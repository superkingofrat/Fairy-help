import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.post("/", (_req, res) => {
  res.json({ code: "OK", data: null, msg: "Trips endpoint placeholder." });
});

export { router as tripsRouter };
