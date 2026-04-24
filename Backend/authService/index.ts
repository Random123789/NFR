import { Router } from "express";
import { ensureDefaultUser, getAuthUserFromRequest, loginWithEmail, logoutFromRequest, requireAuthUser } from "../shared/auth";
import { logAuditAction } from "../shared/audit";

export const authRouter = Router();

authRouter.post("/login", async (req, res, next) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!email || !password) {
      res.status(400).json({ message: "Email and password are required" });
      return;
    }

    const result = await loginWithEmail(email, password);
    if (!result) {
      res.status(401).json({ message: "Invalid email or password" });
      return;
    }

    await logAuditAction({
      userId: result.user.id,
      userEmail: result.user.email,
      action: "LOGIN",
      entityType: "auth",
      entityId: result.user.email,
      details: { role: result.user.role },
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", async (req, res, next) => {
  try {
    const user = await getAuthUserFromRequest(req);
    if (!user) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    res.json({ user });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", async (req, res, next) => {
  try {
    const user = await requireAuthUser(req, res);
    if (!user) {
      return;
    }

    await logoutFromRequest(req);

    await logAuditAction({
      userId: user.id,
      userEmail: user.email,
      action: "LOGOUT",
      entityType: "auth",
      entityId: user.email,
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/bootstrap", async (_req, res, next) => {
  try {
    await ensureDefaultUser();
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});
