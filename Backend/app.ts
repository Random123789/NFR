import cors from "cors";
import express from "express";
import type { Request, Response } from "express";
import { accountRouter } from "./accountService";
import { caseRouter } from "./caseService";
import { knockRouter } from "./knockService";
import { nfrRouter } from "./nfrService";
import { productRouter } from "./productService";
import { projectRouter } from "./projectService";
import { reportsRouter } from "./reportsService";
import { notificationsRouter } from "./notificationsService";
import { authRouter } from "./authService";
import { bookmarkRouter } from "./bookmarkService";
import { pingDatabase } from "./shared/database";

export const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", async (_req, res) => {
  try {
    const databaseUp = await pingDatabase();
    res.json({ status: "ok", database: databaseUp ? "up" : "down" });
  } catch (error) {
    res.status(503).json({
      status: "degraded",
      database: "down",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.use("/api/accounts", accountRouter);
app.use("/api/cases", caseRouter);
app.use("/api/knocks", knockRouter);
app.use("/api/nfrs", nfrRouter);
app.use("/api/products", productRouter);
app.use("/api/projects", projectRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/auth", authRouter);
app.use("/api/bookmarks", bookmarkRouter);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ message: "Route not found" });
});
