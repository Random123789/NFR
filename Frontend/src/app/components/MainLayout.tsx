import { type MouseEvent, useEffect, useState } from "react";
import { Outlet, NavLink, useLocation, useNavigate } from "react-router";
import { AlertTriangle, BarChart3, Bell, Bookmark, Briefcase, Building2, CheckCircle2, CircleAlert, FileText, FolderKanban, Hammer, Home, Info, LogOut, Package, Search, User, X } from "lucide-react";
import fortinetIconUrl from "../../../FortinetIcon.png";
import { useSearch } from "../context/SearchContext";
import { useAuth } from "../context/AuthContext";
import { formatRoleLabel } from "../data/roleLabels";
import { formatTimestampMinute } from "../utils/dateTime";
import {
  clearAllNotifications as clearAllNotificationsApi,
  dismissNotification as dismissNotificationApi,
  getRecentNotifications,
  type Notification,
} from "../data/apiClient";
import { createDetailPath, createOpenDetailState, type DetailEntityType } from "../navigation/detailNavigation";

const navItems = [
  { path: "/", label: "Home", icon: Home, exact: true },
  { path: "/bookmarked", label: "Bookmarks", icon: Bookmark },
  { path: "/reports", label: "Reports", icon: BarChart3 },
  { path: "/cases", label: "Cases", icon: Briefcase },
  { path: "/accounts", label: "Accounts", icon: Building2 },
  { path: "/projects", label: "Projects", icon: FolderKanban },
  { path: "/mantis", label: "Mantis", icon: FileText },
  { path: "/knock", label: "Knock", icon: Hammer },
  { path: "/product", label: "Products", icon: Package },
];

export function MainLayout() {
  const { searchTerm, setSearchTerm } = useSearch();
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    const fetchNotifications = async () => {
      if (!token) {
        setNotifications([]);
        return;
      }

      try {
        const data = await getRecentNotifications(24);
        setNotifications(data);
      } catch (error) {
        console.error('Failed to fetch notifications:', error);
      }
    };

    fetchNotifications();

    // Poll for new notifications every 60 seconds
    const interval = setInterval(fetchNotifications, 60000);

    return () => clearInterval(interval);
  }, [token]);

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.entityType || !notification.entityId) return;

    const entityType = notification.entityType as DetailEntityType;
    navigate(createDetailPath(entityType, notification.entityId), { state: createOpenDetailState(entityType, notification.entityId) });
    setShowNotifications(false);
    dismissNotification(notification.id);
  };

  const dismissNotification = async (id: string) => {
    try {
      await dismissNotificationApi(id);
    } catch (error) {
      console.error('Failed to dismiss notification:', error);
    }

    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const clearAllNotifications = async () => {
    try {
      await clearAllNotificationsApi();
    } catch (error) {
      console.error('Failed to clear notifications:', error);
    }

    setNotifications([]);
  };

  const handleSidebarNavigation = (event: MouseEvent<HTMLAnchorElement>, path: string) => {
    event.preventDefault();
    navigate(path, { state: { listViewKey: Date.now() } });
  };

  const getNotificationIcon = (type: Notification["type"]) => {
    switch (type) {
      case 'error':
        return <CircleAlert className="h-4 w-4 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-amber-600" />;
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
      default:
        return <Info className="h-4 w-4 text-blue-600" />;
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
      { path: "/mantis", patterns: [/^mantis-/, /^mant-/, /mantis/, /feature request/] },
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
            <div className="w-11 h-11 rounded flex items-center justify-center">
              <img src={fortinetIconUrl} alt="Fortinet" className="w-10 h-10 object-contain" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-white">Fortinet</h1>
              <p className="text-xs text-gray-400">Case Management</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.exact}
              onClick={(event) => handleSidebarNavigation(event, item.path)}
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

      <div className="min-w-0 flex-1 flex flex-col">
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
                        onClick={() => {
                          void clearAllNotifications();
                        }}
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
                                {formatTimestampMinute(notif.timestamp)}
                              </p>
                            </div>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                void dismissNotification(notif.id);
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
                  <div className="text-xs text-gray-500">{formatRoleLabel(user?.role)}</div>
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

        <main className="min-w-0 flex-1 overflow-auto p-6 bg-gradient-to-br from-gray-50 to-gray-100">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
