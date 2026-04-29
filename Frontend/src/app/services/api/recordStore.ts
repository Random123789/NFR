import { listAccounts } from './accountService';
import { listCases } from './caseService';
import { listKnocks } from './knockService';
import { listNfrs } from './nfrService';
import { listProducts } from './productService';
import { listProjects } from './projectService';
import type { AccountRecord, CaseRecord, KnockRecord, NfrRecord, ProductRecord, ProjectRecord } from './types';

export let accounts: AccountRecord[] = [];
export let products: ProductRecord[] = [];
export let projects: ProjectRecord[] = [];
export let nfrs: NfrRecord[] = [];
export let knocks: KnockRecord[] = [];
export let cases: CaseRecord[] = [];

export async function initializeData() {
  try {
    const [accountsData, productsData, projectsData, nfrsData, knocksData, casesData] = await Promise.all([
      listAccounts(),
      listProducts(),
      listProjects(),
      listNfrs(),
      listKnocks(),
      listCases(),
    ]);

    accounts = accountsData;
    products = productsData;
    projects = projectsData;
    nfrs = nfrsData;
    knocks = knocksData;
    cases = casesData;

    console.log('Data initialized from backend');
  } catch (error) {
    console.error('Failed to initialize data from backend:', error);
  }
}

export const getAccountById = (id: string | null) => {
  if (!id) return undefined;
  return accounts.find((account) => account.recordId === id);
};

export const getProductById = (id: string | null) => {
  if (!id) return undefined;
  return products.find((product) => product.recordId === id);
};

export const getProjectById = (id: string | null) => {
  if (!id) return undefined;
  return projects.find((project) => project.recordId === id);
};

export const getNfrById = (id: string | null) => {
  if (!id) return undefined;
  return nfrs.find((nfr) => nfr.recordId === id);
};

export const getNfrByMantisId = (mantisId: string | null) => {
  if (!mantisId) return undefined;
  return nfrs.find((nfr) => nfr.mantisId === mantisId);
};

export const getKnockById = (id: string | null) => {
  if (!id) return undefined;
  return knocks.find((knock) => knock.recordId === id);
};

export const getKnockByKnockId = (knockId: string | null) => {
  if (!knockId) return undefined;
  return knocks.find((knock) => knock.knockId === knockId);
};

export const getCaseById = (id: string | null) => {
  if (!id) return undefined;
  return cases.find((caseRecord) => caseRecord.recordId === id);
};

export const getCasesByAccountId = (accountId: string) => {
  return cases.filter((caseRecord) => caseRecord.account === accountId);
};

export const getCasesByProductId = (productId: string) => {
  return cases.filter((caseRecord) => caseRecord.product === productId);
};

export const getCasesByProjectId = (projectId: string) => {
  return cases.filter((caseRecord) => caseRecord.project === projectId);
};

export const getCasesByMantisId = (mantisId: string) => {
  return cases.filter((caseRecord) => caseRecord.mantisId === mantisId);
};

export const getCasesByKnockId = (knockId: string) => {
  return cases.filter((caseRecord) => caseRecord.knockId === knockId);
};

export const getCasesByNfrId = (nfrId: string) => {
  return cases.filter((caseRecord) => {
    const nfr = getNfrById(nfrId);
    return caseRecord.nfrRecordId === nfrId || Boolean(nfr && caseRecord.mantisId === nfr.mantisId);
  });
};

export const getProjectsByAccountId = (accountId: string) => {
  return projects.filter((project) => project.accountId === accountId);
};
