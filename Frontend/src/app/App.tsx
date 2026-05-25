import { RouterProvider } from 'react-router';
import { router } from './routes';
import { SearchProvider } from './context/SearchContext';
import { BookmarksProvider } from './context/BookmarksContext';
import { AuthProvider } from './context/AuthContext';
import { RecordsProvider } from './context/RecordsContext';
import { RecordReadProvider } from './context/RecordReadContext';
import { ToastProvider } from './context/ToastContext';

export default function App() {
  return (
    <AuthProvider>
      <RecordsProvider>
        <RecordReadProvider>
          <BookmarksProvider>
            <ToastProvider>
              <SearchProvider>
                <RouterProvider router={router} />
              </SearchProvider>
            </ToastProvider>
          </BookmarksProvider>
        </RecordReadProvider>
      </RecordsProvider>
    </AuthProvider>
  );
}
