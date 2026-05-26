import type { PageGuideStep } from "../components/PageGuide";

export const accountGuideSteps: PageGuideStep[] = [
  {
    targetId: "accounts-intro",
    title: "Customer account hub",
    description: "Accounts are the customer organizations that cases, projects, products, and follow-up work can connect back to.",
  },
  {
    targetId: "accounts-actions",
    title: "Create, export, and tune columns",
    description: "Use these actions to add an account, export the current table, or choose which account fields are shown.",
  },
  {
    targetId: "accounts-table",
    title: "Scan the account table",
    description: "Click a row to open the account. Yellow rows indicate records with updates you have not read yet.",
  },
  {
    targetId: "accounts-detail",
    title: "Review account details",
    description: "The detail view lets you edit account fields, inspect linked cases or projects, and read the record history.",
  },
];

export const projectGuideSteps: PageGuideStep[] = [
  {
    targetId: "projects-intro",
    title: "Project tracking",
    description: "Projects track active customer opportunities, implementation work, ownership, value, and sales stage.",
  },
  {
    targetId: "projects-actions",
    title: "Create and manage the table",
    description: "Add a project, export the current rows, or use the field selector to keep only the columns you care about.",
  },
  {
    targetId: "projects-table",
    title: "Find the right project",
    description: "Sort or search columns, bookmark important projects, and open any row to inspect the full record.",
  },
  {
    targetId: "projects-detail",
    title: "Work the project record",
    description: "The detail view contains project fields, linked cases, related records, comments, and history.",
  },
];

export const caseGuideSteps: PageGuideStep[] = [
  {
    targetId: "cases-intro",
    title: "Case workspace",
    description: "Cases are the main escalation records. Use this page to track status, priority, owners, linked accounts, and related asks.",
  },
  {
    targetId: "cases-filters",
    title: "Focus the case list",
    description: "Filter by escalation status, priority, and vertical. Clear resets both visible filters and filters passed from dashboard widgets.",
  },
  {
    targetId: "cases-actions",
    title: "Create, export, and choose fields",
    description: "Create new cases, export the current filtered list, or adjust which columns are visible in the table.",
  },
  {
    targetId: "cases-table",
    title: "Read the case table",
    description: "Rows open case details. Yellow rows mean there is unread activity for your account.",
  },
  {
    targetId: "cases-detail",
    title: "Use the case record",
    description: "The case detail view includes escalation status, assignment, linked records, comments, and the full activity timeline.",
  },
];

export const mantisGuideSteps: PageGuideStep[] = [
  {
    targetId: "mantis-intro",
    title: "Mantis requests",
    description: "Mantis records track product feature requests, enhancement asks, target dates, and linked customer cases.",
  },
  {
    targetId: "mantis-actions",
    title: "Create and manage requests",
    description: "Add a Mantis request, export the table, or choose which columns should stay visible.",
  },
  {
    targetId: "mantis-table",
    title: "Scan request status",
    description: "Use the table to compare categories, statuses, request dates, and targets. Open a row to work the request.",
  },
  {
    targetId: "mantis-detail",
    title: "Connect the ask to cases",
    description: "The detail view lets you update the request, link cases, add comments, and review history.",
  },
];

export const knockGuideSteps: PageGuideStep[] = [
  {
    targetId: "knock-intro",
    title: "Knock requests",
    description: "Knock records track integration or product requests, current status, target dates, and related customer cases.",
  },
  {
    targetId: "knock-actions",
    title: "Create and manage requests",
    description: "Add a Knock request, export the table, or tune the columns shown in the list.",
  },
  {
    targetId: "knock-table",
    title: "Track status and targets",
    description: "Use the rows to compare status, request date, and target date. Open a row for the full detail view.",
  },
  {
    targetId: "knock-detail",
    title: "Link back to cases",
    description: "Use details to update the request, link cases, add comments, and review what changed over time.",
  },
];

export const productGuideSteps: PageGuideStep[] = [
  {
    targetId: "products-intro",
    title: "Product catalog",
    description: "Products keep the Fortinet catalog available for linking to cases and customer work.",
  },
  {
    targetId: "products-actions",
    title: "Create and manage products",
    description: "Add product records, export the catalog, or choose which product fields appear in the table.",
  },
  {
    targetId: "products-table",
    title: "Browse products",
    description: "Open a row to inspect or update the product. Bookmark product records you return to often.",
  },
  {
    targetId: "products-detail",
    title: "Review linked work",
    description: "Product details include editable fields, linked cases, comments, and history.",
  },
];

export const bookmarkedGuideSteps: PageGuideStep[] = [
  {
    targetId: "bookmarks-intro",
    title: "Saved records",
    description: "Bookmarks collect records you marked from across the app, grouped by record type.",
  },
  {
    targetId: "bookmarks-list",
    title: "Jump back quickly",
    description: "Click a bookmark card to open the original record. The card keeps the record ID, title, status, and saved time visible.",
  },
  {
    targetId: "bookmarks-remove",
    title: "Keep the list tidy",
    description: "Use the bookmark button on a card to remove it from this page without opening the record.",
  },
];

export const appFeedbackGuideSteps: PageGuideStep[] = [
  {
    targetId: "feedback-intro",
    title: "Send app feedback",
    description: "Use this page for bugs, improvements, and feature requests about the CRM itself.",
  },
  {
    targetId: "feedback-form",
    title: "Describe the issue or idea",
    description: "Choose a type, add a clear summary and details, then submit it for administrators to review.",
  },
  {
    targetId: "feedback-images",
    title: "Attach screenshots",
    description: "Add images when a visual example will help. The page shows selected files before you submit.",
  },
  {
    targetId: "feedback-review",
    title: "Review submitted feedback",
    description: "Administrators can refresh, review submitted items, inspect screenshots, and mark finished items as done.",
  },
];

export const profileGuideSteps: PageGuideStep[] = [
  {
    targetId: "profile-intro",
    title: "Account settings",
    description: "Profile is where you update your display name, email, password, and account-level settings.",
  },
  {
    targetId: "profile-details",
    title: "Edit profile details",
    description: "Change the name and email shown around the app, then save the profile section.",
  },
  {
    targetId: "profile-password",
    title: "Reset your password",
    description: "Enter your current password and confirm a new one to update your login credentials.",
  },
  {
    targetId: "profile-summary",
    title: "Check your permissions",
    description: "The summary shows your current email, role, and vertical access where applicable.",
  },
];

export const adminProfileGuideStep: PageGuideStep = {
  targetId: "profile-admin",
  title: "Manage users",
  description: "Admins can create users, edit roles or verticals, reset passwords, and review last login activity.",
};

export const reportGuideSteps: PageGuideStep[] = [
  {
    targetId: "reports-intro",
    title: "Build analytics",
    description: "Reports combine CRM data into saved charts or record lists that can be reused later.",
  },
  {
    targetId: "reports-global-filters",
    title: "Apply report-wide case filters",
    description: "These filters affect saved report results on the page, useful when you want a date, owner, status, or priority view.",
  },
  {
    targetId: "reports-builder",
    title: "Design a report",
    description: "Choose the report title, base data, output type, joins, fields, grouping, sorting, and chart display.",
  },
  {
    targetId: "reports-preview",
    title: "Preview before saving",
    description: "Refresh the preview to check the result, then save or update the report when the output looks right.",
  },
  {
    targetId: "reports-saved",
    title: "Arrange saved reports",
    description: "Saved reports can be resized, dragged into a new order, edited, deleted, and rerun with current filters.",
  },
];

export const managerHomeGuideSteps: PageGuideStep[] = [
  {
    targetId: "manager-home-intro",
    title: "Manager overview",
    description: "The manager dashboard summarizes open pipeline, high-risk cases, watched cases, and team coverage.",
  },
  {
    targetId: "manager-home-verticals",
    title: "Filter by vertical",
    description: "Select one or more verticals to focus the dashboard. Case widgets carry that vertical filter into the Cases page.",
  },
  {
    targetId: "manager-home-widgets",
    title: "Use widgets as shortcuts",
    description: "Click case widgets to open the matching filtered list. Counts update based on the current dashboard scope.",
  },
  {
    targetId: "manager-home-aging",
    title: "Watch stale escalation status",
    description: "Status Aging highlights acknowledged and escalated cases whose status has not moved for several months.",
  },
  {
    targetId: "manager-home-focus",
    title: "Review focus areas",
    description: "Recommended Focus, Team Load, and Priority Cases point to accounts, projects, and cases that may need attention.",
  },
];

export const seHomeGuideSteps: PageGuideStep[] = [
  {
    targetId: "se-home-intro",
    title: "SE focus view",
    description: "This dashboard gathers the cases, projects, and product asks most relevant to your visible work.",
  },
  {
    targetId: "se-home-widgets",
    title: "Start from the widgets",
    description: "Widgets show open cases, critical work, pipeline, and assigned cases. Click them to jump into the related records.",
  },
  {
    targetId: "se-home-attention",
    title: "Work the attention queue",
    description: "The queue ranks cases by escalation, priority, and deadline pressure so urgent work stays visible.",
  },
  {
    targetId: "se-home-asks",
    title: "Track product asks",
    description: "Mantis and Knock follow-ups surface active asks with target pressure and linked case counts.",
  },
];

export const homeGuideSteps: PageGuideStep[] = [
  {
    targetId: "home-intro",
    title: "Home overview",
    description: "Home gives a compact view of case activity, chart trends, and recently updated records.",
  },
  {
    targetId: "home-widgets",
    title: "Use widgets as case shortcuts",
    description: "Click a widget to open Cases with that widget's filter. Custom widgets can be added, edited, or deleted here.",
  },
  {
    targetId: "home-charts",
    title: "Read the charts",
    description: "Charts summarize case status and activity trends across cases, accounts, and projects.",
  },
  {
    targetId: "home-recent",
    title: "Review recent cases",
    description: "Recent Cases lets you filter the latest records by owner and open the row that needs attention.",
  },
];
