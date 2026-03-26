/**
 * UserFilter Component
 * Allows users to filter which users to display in comparison view
 * Shows all users as selectable chips with color coding
 */

import React from 'react'
import { USER_COLORS } from '../types'

interface UserFilterProps {
  allUsers: string[]
  selectedUsers: Set<string>
  onUserToggle: (user: string) => void
  onSelectAll: () => void
  onClearAll: () => void
}

/**
 * Helper function to get consistent color for a user
 */
const getUserColor = (user: string, users: string[]): string => {
  const index = users.indexOf(user)
  return USER_COLORS[index % USER_COLORS.length]
}

/**
 * Renders user filter interface with selectable user chips
 * Only displayed in comparison view mode
 */
export const UserFilter: React.FC<UserFilterProps> = ({
  allUsers,
  selectedUsers,
  onUserToggle,
  onSelectAll,
  onClearAll
}) => {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-slate-700">筛选用户</h3>
        <div className="flex gap-2">
          <button onClick={onSelectAll} className="text-xs text-blue-600 hover:underline">
            全选
          </button>
          <button onClick={onClearAll} className="text-xs text-slate-500 hover:underline">
            清空
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {allUsers.map((user) => {
          const isSelected = selectedUsers.has(user)
          const color = getUserColor(user, allUsers)

          return (
            <button
              key={user}
              onClick={() => onUserToggle(user)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-white border-current'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
              style={isSelected ? { color, borderColor: color } : {}}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: isSelected ? color : '#cbd5e1' }}
              />
              {user || '未分配'}
            </button>
          )
        })}
      </div>

      {selectedUsers.size === 0 && (
        <p className="text-xs text-slate-500 mt-2">未选择用户时将显示所有用户数据</p>
      )}
    </div>
  )
}
