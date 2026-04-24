import { RouterProvider } from 'react-router';
import { router } from './routes';
import { SearchProvider } from './context/SearchContext';
import { BookmarksProvider } from './context/BookmarksContext';
import { AuthProvider } from './context/AuthContext';

export default function App() {
  return (
    <AuthProvider>
      <BookmarksProvider>
        <SearchProvider>
          <RouterProvider router={router} />
        </SearchProvider>
      </BookmarksProvider>
    </AuthProvider>
  );
}