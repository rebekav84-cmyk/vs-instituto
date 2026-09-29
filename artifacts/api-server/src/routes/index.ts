import { Router, type IRouter } from "express";
import adminRouter from "./admin";
import healthRouter from "./health";
import vsRouter from "./vs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(adminRouter);
router.use(vsRouter);

export default router;
