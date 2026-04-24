import { createContext, useContext, useState, useEffect } from 'react';
import { addUserBookmark, getUserBookmarks, removeUserBookmark, type BookmarkedItem } from '../data/apiClient';
import { useAuth } from './AuthContext';

interface BookmarksContextType {
  bookmarked: BookmarkedItem[];
  addBookmark: (item: BookmarkedItem) => void;
  removeBookmark: (id: string, type: string) => void;
  isBookmarked: (id: string, type: string) => boolean;
}

const BookmarksContext = createContext<BookmarksContextType | undefined>(undefined);

export function BookmarksProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [bookmarked, setBookmarked] = useState<BookmarkedItem[]>([]);

  useEffect(() => {
    let mounted = true;

    async function loadBookmarks() {
      if (!user) {
        if (mounted) {
          setBookmarked([]);
        }
        return;
      }

      try {
        const rows = await getUserBookmarks();
        if (mounted) {
          setBookmarked(rows);
        }
      } catch (error) {
        console.error('Failed to load bookmarks:', error);
        if (mounted) {
          setBookmarked([]);
        }
      }
    }

    void loadBookmarks();

    return () => {
      mounted = false;
    };
  }, [user]);

  const addBookmark = (item: BookmarkedItem) => {
    if (!user) {
      return;
    }

    setBookmarked((prev) => (prev.some((b) => b.id === item.id && b.type === item.type) ? prev : [item, ...prev]));
    void addUserBookmark(item).catch((error) => {
      console.error('Failed to add bookmark:', error);
    });
  };

  const removeBookmark = (id: string, type: string) => {
    if (!user) {
      return;
    }

    setBookmarked((prev) => prev.filter((b) => !(b.id === id && b.type === type)));
    void removeUserBookmark(id, type).catch((error) => {
      console.error('Failed to remove bookmark:', error);
    });
  };

  const isBookmarked = (id: string, type: string) => {
    return bookmarked.some((b) => b.id === id && b.type === type);
  };

  return (
    <BookmarksContext.Provider value={{ bookmarked, addBookmark, removeBookmark, isBookmarked }}>
      {children}
    </BookmarksContext.Provider>
  );
}

export function useBookmarks() {
  const context = useContext(BookmarksContext);
  if (!context) {
    throw new Error('useBookmarks must be used within BookmarksProvider');
  }
  return context;
}
