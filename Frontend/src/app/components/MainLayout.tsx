import { useEffect, useState } from "react";
import { Outlet, NavLink, useLocation, useNavigate } from "react-router";
import { Home, Briefcase, Building2, FolderKanban, FileText, Hammer, Package, BarChart3, PlusCircle, Search, Bell, User, X, Bookmark, LogOut } from "lucide-react";
import { useSearch } from "../context/SearchContext";
import { useAuth } from "../context/AuthContext";

const navItems = [
  { path: "/", label: "Home", icon: Home, exact: true },
  { path: "/bookmarked", label: "Bookmarks", icon: Bookmark },
  { path: "/reports", label: "Reports", icon: BarChart3 },
  { path: "/cases", label: "Cases", icon: Briefcase },
  { path: "/accounts", label: "Accounts", icon: Building2 },
  { path: "/projects", label: "Projects", icon: FolderKanban },
  { path: "/nfr", label: "NFR", icon: FileText },
  { path: "/knock", label: "Knock", icon: Hammer },
  { path: "/product", label: "Product", icon: Package },
  { path: "/create-data", label: "Create Data", icon: PlusCircle },
];

interface Notification {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: Date;
  entityType?: 'project' | 'case' | 'account' | 'nfr' | 'knock' | 'product';
  entityId?: string;
}

export function MainLayout() {
  const { searchTerm, setSearchTerm } = useSearch();
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Fetch notifications on mount and set up polling
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const response = await fetch('http://localhost:4000/api/notifications/recent?hours=24', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (response.ok) {
          const data = await response.json();
          setNotifications(data);
        }
      } catch (error) {
        console.error('Failed to fetch notifications:', error);
      }
    };

    fetchNotifications();

    // Poll for new notifications every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);

    return () => clearInterval(interval);
  }, [token]);

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.entityType || !notification.entityId) return;

    const routeMap: Record<string, string> = {
      'case': '/cases',
      'project': '/projects',
      'account': '/accounts',
      'nfr': '/nfr',
      'knock': '/knock',
      'product': '/product',
    };

    const eventMap: Record<string, string> = {
      'case': 'openCaseDetail',
      'project': 'openProjectDetail',
      'account': 'openAccountDetail',
      'nfr': 'openNfrDetail',
      'knock': 'openKnockDetail',
      'product': 'openProductDetail',
    };

    const path = routeMap[notification.entityType];
    const eventName = eventMap[notification.entityType];
    
    if (path && eventName) {
      navigate(path);
      setShowNotifications(false);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent(eventName, { detail: notification.entityId }));
      }, 100);
      dismissNotification(notification.id);
    }
  };

  const dismissNotification = (id: string) => {
    setNotifications(notifications.filter(n => n.id !== id));
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'error':
        return '🔴';
      case 'warning':
        return '🟡';
      case 'success':
        return '🟢';
      default:
        return '🔵';
    }
  };

  useEffect(() => {
    const normalizedSearchTerm = searchTerm.trim().toLowerCase();

    if (!normalizedSearchTerm) {
      return;
    }

    const routeMatchers: Array<{ path: string; patterns: RegExp[] }> = [
      { path: "/cases", patterns: [/^rec-/, /case/, /priority/, /status/, /escalat/, /category/, /se owner/, /account/, /product/, /project/, /knock/, /mantis/] },
      { path: "/accounts", patterns: [/^acc-/, /account/, /customer/, /organization/, /website/, /vertical/, /enterprise/, /mid-market/, /startup/] },
      { path: "/projects", patterns: [/^prj-/, /project/, /stage/, /sfdc/, /solution consultant/, /account/] },
      { path: "/nfr", patterns: [/^nfr-/, /nfr/, /feature request/, /mantis/] },
      { path: "/knock", patterns: [/^knock-/, /^knk-/, /knock/, /request/, /integration/] },
      { path: "/product", patterns: [/^prd-/, /product/, /catalog/, /url/, /family/] },
      { path: "/reports", patterns: [/report/, /dashboard/, /metric/, /trend/, /activity/] },
    ];

    const match = routeMatchers.find((candidate) =>
      candidate.patterns.some((pattern) => pattern.test(normalizedSearchTerm)),
    );

    if (match && !location.pathname.startsWith(match.path)) {
      navigate(match.path);
    }
  }, [location.pathname, navigate, searchTerm]);

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-64 bg-[#1a1a1a] border-r border-gray-800 flex flex-col">
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#E31937] rounded flex items-center justify-center">
              <span className="text-white font-bold text-xl">F</span>
            </div>
            <div>
              <h1 className="font-bold text-lg text-white">Fortinet</h1>
              <p className="text-xs text-gray-400">NFR System</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.exact}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                  isActive
                    ? "bg-[#E31937] text-white"
                    : "text-gray-300 hover:bg-gray-800"
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <div className="text-xs text-gray-500 text-center">
            Fortinet © 2026
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm">
          <div className="flex-1 max-w-xl">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search cases, accounts, projects..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937] focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex items-center gap-4 ml-6">
            <div className="relative">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Bell className="w-5 h-5" />
                {notifications.length > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-[#E31937] rounded-full"></span>
                )}
              </button>
              
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                  <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Notifications</h3>
                    {notifications.length > 0 && (
                      <button 
                        onClick={() => setNotifications([])}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                  
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length > 0 ? (
                      notifications.map((notif) => (
                        <div 
                          key={notif.id} 
                          className="p-4 border-b border-gray-100 hover:bg-gray-100 transition-colors last:border-b-0"
                          style={{ cursor: notif.entityType && notif.entityId ? 'pointer' : 'default' }}
                        >
                          <div 
                            className="flex items-start justify-between gap-3"
                            onClick={() => handleNotificationClick(notif)}
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span>{getNotificationIcon(notif.type)}</span>
                                <p className="text-sm text-gray-900 font-medium">{notif.message}</p>
                              </div>
                              <p className="text-xs text-gray-500 mt-1">
                                {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                dismissNotification(notif.id);
                              }}
                              className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center">
                        <p className="text-gray-500 text-sm">No notifications</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
              <button
                onClick={() => navigate('/profile')}
                className="flex items-center gap-3 text-left"
                title="Open profile"
              >
                <div className="w-9 h-9 bg-[#E31937] rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="font-medium text-sm text-gray-900">{user?.displayName || "Unknown User"}</div>
                  <div className="text-xs text-gray-500">{user?.role || "User"}</div>
                </div>
              </button>
              <button
                onClick={() => {
                  void logout();
                }}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6 bg-gradient-to-br from-gray-50 to-gray-100">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
