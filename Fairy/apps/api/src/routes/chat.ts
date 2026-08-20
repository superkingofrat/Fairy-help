import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.post("/", (_req, res) => {
  res.json({ code: "OK", data: null, msg: "Chat endpoint placeholder." });
});

export { router as chatRouter };
