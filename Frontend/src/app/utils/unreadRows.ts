export function unreadRowClassName(isUnread: boolean) {
  return `cursor-pointer transition-colors ${isUnread ? "bg-yellow-200 hover:bg-yellow-300" : "hover:bg-gray-50"}`;
}
