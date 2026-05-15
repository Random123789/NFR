import { RouterProvider } from 'react-router';
import { router } from './routes';
import { SearchProvider } from './context/SearchContext';
import { BookmarksProvider } from './context/BookmarksContext';
import { AuthProvider } from './context/AuthContext';
import { RecordsProvider } from './context/RecordsContext';
import { ToastProvider } from './context/ToastContext';

export default function App() {
  return (
    <AuthProvider>
      <RecordsProvider>
        <BookmarksProvider>
          <ToastProvider>
            <SearchProvider>
              <RouterProvider router={router} />
            </SearchProvider>
          </ToastProvider>
        </BookmarksProvider>
      </RecordsProvider>
    </AuthProvider>
  );
}
