import express from "express";
import type { Request, Response } from "express";
import { query } from "../shared/database";

export const notificationsRouter = express.Router();

interface Notification {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: string;
  entityType: 'project' | 'case' | 'account' | 'nfr' | 'knock' | 'product';
  entityId: string;
}

interface CaseNotificationRow {
  recordId: string;
  status: string;
  updatedAt: string;
}

interface ProjectNotificationRow {
  recordId: string;
  projectName: string;
  stage: string;
  updatedAt: string;
}

interface NfrNotificationRow {
  recordId: string;
  nfrStatus: string;
  updatedAt: string;
}

interface KnockNotificationRow {
  recordId: string;
  status: string;
  updatedAt: string;
}

interface AccountNotificationRow {
  recordId: string;
  accountName: string;
  updatedAt: string;
}

interface ProductNotificationRow {
  recordId: string;
  productName: string;
  updatedAt: string;
}

const statusTypeMap: Record<string, 'warning' | 'success' | 'info'> = {
  'Escalated': 'warning',
  'Closed': 'success',
  'Open': 'info',
  'In Progress': 'info',
  'Approved': 'success',
  'Pending': 'info',
};

async function getRecentNotifications(hoursAgo: number = 24): Promise<Notification[]> {
  const notifications: Notification[] = [];
  const cutoffTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();

  try {
    // Recent cases
    const recentCases = await query<CaseNotificationRow>(
      `SELECT recordId, status, description, updatedAt FROM cases 
       WHERE updatedAt > ? ORDER BY updatedAt DESC LIMIT 10`,
      [cutoffTime]
    );

    for (const caseRecord of recentCases) {
      notifications.push({
        id: `case-${caseRecord.recordId}`,
        message: `Case ${caseRecord.recordId}: ${caseRecord.status}`,
        type: statusTypeMap[caseRecord.status] || 'info',
        timestamp: caseRecord.updatedAt,
        entityType: 'case',
        entityId: caseRecord.recordId,
      });
    }

    // Recent projects
    const recentProjects = await query<ProjectNotificationRow>(
      `SELECT recordId, projectName, stage, updatedAt FROM projects 
       WHERE updatedAt > ? ORDER BY updatedAt DESC LIMIT 10`,
      [cutoffTime]
    );

    for (const project of recentProjects) {
      notifications.push({
        id: `project-${project.recordId}`,
        message: `Project ${project.recordId} (${project.projectName}): ${project.stage}`,
        type: statusTypeMap[project.stage] || 'info',
        timestamp: project.updatedAt,
        entityType: 'project',
        entityId: project.recordId,
      });
    }

    // Recent NFRs
    const recentNfrs = await query<NfrNotificationRow>(
      `SELECT recordId, nfrStatus, updatedAt FROM nfrs 
       WHERE updatedAt > ? ORDER BY updatedAt DESC LIMIT 10`,
      [cutoffTime]
    );

    for (const nfr of recentNfrs) {
      notifications.push({
        id: `nfr-${nfr.recordId}`,
        message: `NFR ${nfr.recordId}: ${nfr.nfrStatus}`,
        type: statusTypeMap[nfr.nfrStatus] || 'info',
        timestamp: nfr.updatedAt,
        entityType: 'nfr',
        entityId: nfr.recordId,
      });
    }

    // Recent Knocks
    const recentKnocks = await query<KnockNotificationRow>(
      `SELECT recordId, status, updatedAt FROM knocks 
       WHERE updatedAt > ? ORDER BY updatedAt DESC LIMIT 10`,
      [cutoffTime]
    );

    for (const knock of recentKnocks) {
      notifications.push({
        id: `knock-${knock.recordId}`,
        message: `Knock ${knock.recordId}: ${knock.status}`,
        type: statusTypeMap[knock.status] || 'info',
        timestamp: knock.updatedAt,
        entityType: 'knock',
        entityId: knock.recordId,
      });
    }

    // Recent Accounts
    const recentAccounts = await query<AccountNotificationRow>(
      `SELECT recordId, accountName, updatedAt FROM accounts 
       WHERE updatedAt > ? ORDER BY updatedAt DESC LIMIT 10`,
      [cutoffTime]
    );

    for (const account of recentAccounts) {
      notifications.push({
        id: `account-${account.recordId}`,
        message: `Account ${account.recordId} (${account.accountName}) updated`,
        type: 'info',
        timestamp: account.updatedAt,
        entityType: 'account',
        entityId: account.recordId,
      });
    }

    // Recent Products
    const recentProducts = await query<ProductNotificationRow>(
      `SELECT recordId, productName, updatedAt FROM products 
       WHERE updatedAt > ? ORDER BY updatedAt DESC LIMIT 10`,
      [cutoffTime]
    );

    for (const product of recentProducts) {
      notifications.push({
        id: `product-${product.recordId}`,
        message: `Product ${product.recordId} (${product.productName}) updated`,
        type: 'info',
        timestamp: product.updatedAt,
        entityType: 'product',
        entityId: product.recordId,
      });
    }

    // Sort by timestamp descending and limit to 20 most recent
    return notifications
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 20);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return [];
  }
}

notificationsRouter.get("/recent", async (_req: Request, res: Response) => {
  try {
    const hoursAgo = parseInt(_req.query.hours as string) || 24;
    const notifications = await getRecentNotifications(hoursAgo);
    res.json(notifications);
  } catch (error) {
    res.status(500).json({
      message: error instanceof Error ? error.message : "Failed to fetch notifications",
    });
  }
});
