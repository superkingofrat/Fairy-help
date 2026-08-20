import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.post("/", (_req, res) => {
  res.json({ code: "OK", data: null, msg: "Rentals endpoint placeholder." });
});

export { router as rentalsRouter };
