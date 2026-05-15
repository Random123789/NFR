import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import { listAccounts } from "../services/api/accountService";
import { listCases } from "../services/api/caseService";
import { listKnocks } from "../services/api/knockService";
import { listMantis } from "../services/api/mantisService";
import { listProducts } from "../services/api/productService";
import { listProjects } from "../services/api/projectService";
import type { AccountRecord, CaseRecord, KnockRecord, MantisRecord, ProductRecord, ProjectRecord } from "../services/api/types";

type RecordsContextValue = {
  accounts: AccountRecord[];
  products: ProductRecord[];
  projects: ProjectRecord[];
  mantisRecords: MantisRecord[];
  knocks: KnockRecord[];
  cases: CaseRecord[];
  isLoading: boolean;
  refreshRecords: () => Promise<void>;
  upsertAccount: (record: AccountRecord) => void;
  upsertProduct: (record: ProductRecord) => void;
  upsertProject: (record: ProjectRecord) => void;
  upsertMantis: (record: MantisRecord) => void;
  upsertKnock: (record: KnockRecord) => void;
  upsertCase: (record: CaseRecord) => void;
  getAccountById: (id: string | null | undefined) => AccountRecord | undefined;
  getProductById: (id: string | null | undefined) => ProductRecord | undefined;
  getProjectById: (id: string | null | undefined) => ProjectRecord | undefined;
  getMantisById: (id: string | null | undefined) => MantisRecord | undefined;
  getMantisByMantisId: (mantisId: string | null | undefined) => MantisRecord | undefined;
  getKnockById: (id: string | null | undefined) => KnockRecord | undefined;
  getKnockByKnockId: (knockId: string | null | undefined) => KnockRecord | undefined;
  getCaseById: (id: string | null | undefined) => CaseRecord | undefined;
  getCasesByAccountId: (accountId: string) => CaseRecord[];
  getCasesByProductId: (productId: string) => CaseRecord[];
  getCasesByProjectId: (projectId: string) => CaseRecord[];
  getCasesByMantisId: (mantisId: string) => CaseRecord[];
  getCasesByKnockId: (knockId: string) => CaseRecord[];
  getCasesByMantisRecordId: (mantisRecordId: string) => CaseRecord[];
  getProjectsByAccountId: (accountId: string) => ProjectRecord[];
};

const RecordsContext = createContext<RecordsContextValue | undefined>(undefined);

function upsertByRecordId<T extends { recordId: string }>(records: T[], record: T) {
  const index = records.findIndex((item) => item.recordId === record.recordId);
  if (index === -1) {
    return [record, ...records];
  }

  const next = [...records];
  next[index] = record;
  return next;
}

export function RecordsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [mantisRecords, setMantisRecords] = useState<MantisRecord[]>([]);
  const [knocks, setKnocks] = useState<KnockRecord[]>([]);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refreshRecords = useCallback(async () => {
    if (!user) {
      setAccounts([]);
      setProducts([]);
      setProjects([]);
      setMantisRecords([]);
      setKnocks([]);
      setCases([]);
      return;
    }

    setIsLoading(true);
    try {
      const [accountsData, productsData, projectsData, mantisData, knocksData, casesData] = await Promise.all([
        listAccounts(),
        listProducts(),
        listProjects(),
        listMantis(),
        listKnocks(),
        listCases(),
      ]);

      setAccounts(accountsData);
      setProducts(productsData);
      setProjects(projectsData);
      setMantisRecords(mantisData);
      setKnocks(knocksData);
      setCases(casesData);
    } catch (error) {
      console.error("Failed to load records from backend:", error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refreshRecords();
  }, [refreshRecords]);

  const value = useMemo<RecordsContextValue>(() => ({
    accounts,
    products,
    projects,
    mantisRecords,
    knocks,
    cases,
    isLoading,
    refreshRecords,
    upsertAccount: (record) => setAccounts((current) => upsertByRecordId(current, record)),
    upsertProduct: (record) => setProducts((current) => upsertByRecordId(current, record)),
    upsertProject: (record) => setProjects((current) => upsertByRecordId(current, record)),
    upsertMantis: (record) => setMantisRecords((current) => upsertByRecordId(current, record)),
    upsertKnock: (record) => setKnocks((current) => upsertByRecordId(current, record)),
    upsertCase: (record) => setCases((current) => upsertByRecordId(current, record)),
    getAccountById: (id) => {
      if (!id) return undefined;
      return accounts.find((account) => account.recordId === id);
    },
    getProductById: (id) => {
      if (!id) return undefined;
      return products.find((product) => product.recordId === id);
    },
    getProjectById: (id) => {
      if (!id) return undefined;
      return projects.find((project) => project.recordId === id);
    },
    getMantisById: (id) => {
      if (!id) return undefined;
      return mantisRecords.find((mantis) => mantis.recordId === id);
    },
    getMantisByMantisId: (mantisId) => {
      if (!mantisId) return undefined;
      return mantisRecords.find((mantis) => mantis.mantisId === mantisId);
    },
    getKnockById: (id) => {
      if (!id) return undefined;
      return knocks.find((knock) => knock.recordId === id);
    },
    getKnockByKnockId: (knockId) => {
      if (!knockId) return undefined;
      return knocks.find((knock) => knock.knockId === knockId);
    },
    getCaseById: (id) => {
      if (!id) return undefined;
      return cases.find((caseRecord) => caseRecord.recordId === id);
    },
    getCasesByAccountId: (accountId) => cases.filter((caseRecord) => caseRecord.account === accountId),
    getCasesByProductId: (productId) => cases.filter((caseRecord) => caseRecord.product === productId),
    getCasesByProjectId: (projectId) => cases.filter((caseRecord) => caseRecord.project === projectId),
    getCasesByMantisId: (mantisId) => cases.filter((caseRecord) => caseRecord.mantisId === mantisId),
    getCasesByKnockId: (knockId) => cases.filter((caseRecord) => caseRecord.knockId === knockId),
    getCasesByMantisRecordId: (mantisRecordId) => {
      const mantis = mantisRecords.find((item) => item.recordId === mantisRecordId);
      return cases.filter((caseRecord) => Boolean(mantis && caseRecord.mantisId === mantis.mantisId));
    },
    getProjectsByAccountId: (accountId) => projects.filter((project) => project.accountId === accountId),
  }), [accounts, cases, isLoading, knocks, mantisRecords, products, projects, refreshRecords]);

  return <RecordsContext.Provider value={value}>{children}</RecordsContext.Provider>;
}

export function useRecords() {
  const context = useContext(RecordsContext);
  if (!context) {
    throw new Error("useRecords must be used within RecordsProvider");
  }
  return context;
}
