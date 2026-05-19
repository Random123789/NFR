import { lazy, Suspense, type ComponentType, type ReactElement } from "react";
import { createBrowserRouter } from "react-router";
import { MainLayout } from "./components/MainLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";

const Home = lazy(() => import("./pages/Home").then((module) => ({ default: module.Home })));
const Cases = lazy(() => import("./pages/Cases").then((module) => ({ default: module.Cases })));
const Accounts = lazy(() => import("./pages/Accounts").then((module) => ({ default: module.Accounts })));
const Projects = lazy(() => import("./pages/Projects").then((module) => ({ default: module.Projects })));
const Mantis = lazy(() => import("./pages/Mantis").then((module) => ({ default: module.Mantis })));
const Knock = lazy(() => import("./pages/Knock").then((module) => ({ default: module.Knock })));
const Product = lazy(() => import("./pages/Product").then((module) => ({ default: module.Product })));
const Reports = lazy(() => import("./pages/Reports").then((module) => ({ default: module.Reports })));
const Bookmarked = lazy(() => import("./pages/Bookmarked").then((module) => ({ default: module.Bookmarked })));
const Login = lazy(() => import("./pages/Login").then((module) => ({ default: module.Login })));
const Profile = lazy(() => import("./pages/Profile").then((module) => ({ default: module.Profile })));

function PageFallback() {
  return (
    <div className="flex min-h-[16rem] items-center justify-center" aria-label="Loading page">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-[#E31937]" />
    </div>
  );
}

function pageElement(Page: ComponentType): ReactElement {
  return (
    <Suspense fallback={<PageFallback />}>
      <Page />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    path: "/login",
    element: pageElement(Login),
  },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <MainLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: pageElement(Home) },
      { path: "cases", element: pageElement(Cases) },
      { path: "cases/:recordSlug", element: pageElement(Cases) },
      { path: "accounts", element: pageElement(Accounts) },
      { path: "accounts/:recordSlug", element: pageElement(Accounts) },
      { path: "projects", element: pageElement(Projects) },
      { path: "projects/:recordSlug", element: pageElement(Projects) },
      { path: "mantis", element: pageElement(Mantis) },
      { path: "mantis/:recordSlug", element: pageElement(Mantis) },
      { path: "knock", element: pageElement(Knock) },
      { path: "knock/:recordSlug", element: pageElement(Knock) },
      { path: "product", element: pageElement(Product) },
      { path: "product/:recordSlug", element: pageElement(Product) },
      { path: "reports", element: pageElement(Reports) },
      { path: "bookmarked", element: pageElement(Bookmarked) },
      { path: "profile", element: pageElement(Profile) },
    ],
  },
]);
