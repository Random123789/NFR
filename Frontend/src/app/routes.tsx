import { createBrowserRouter } from "react-router";
import { MainLayout } from "./components/MainLayout";
import { Home } from "./pages/Home";
import { Cases } from "./pages/Cases";
import { Accounts } from "./pages/Accounts";
import { Projects } from "./pages/Projects";
import { NFR } from "./pages/NFR";
import { Knock } from "./pages/Knock";
import { Product } from "./pages/Product";
import { Reports } from "./pages/Reports";
import { CreateData } from "./pages/CreateData";
import { Bookmarked } from "./pages/Bookmarked";
import { Login } from "./pages/Login";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Profile } from "./pages/Profile";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <Login />,
  },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <MainLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Home /> },
      { path: "cases", element: <Cases /> },
      { path: "accounts", element: <Accounts /> },
      { path: "projects", element: <Projects /> },
      { path: "nfr", element: <NFR /> },
      { path: "knock", element: <Knock /> },
      { path: "product", element: <Product /> },
      { path: "reports", element: <Reports /> },
      { path: "bookmarked", element: <Bookmarked /> },
      { path: "profile", element: <Profile /> },
      { path: "create-data", element: <CreateData /> },
    ],
  },
]);
