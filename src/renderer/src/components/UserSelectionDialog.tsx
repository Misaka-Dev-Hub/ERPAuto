/**
 * User Selection Dialog - For Admin user to select which user to operate as
 *
 * Mimics the Python UserSelectionDialog functionality:
 * - Display list of all users
 * - Allow admin to select a user
 * - Return selected user info
 */

import React, { useState, useEffect, useRef } from 'react'
import { Modal } from './ui/Modal'

export interface UserInfo {
  id: number
  username: string
  userType: 'Admin' | 'User' | 'Guest'
  createTime?: Date
}

interface UserSelectionDialogProps {
  isOpen: boolean
  users: UserInfo[]
  currentUsername: string
  onSelectUser: (user: UserInfo) => void
  onCancel: () => void
  triggerRef?: React.RefObject<HTMLElement | null>
}

export const UserSelectionDialog: React.FC<UserSelectionDialogProps> = ({
  isOpen,
  users,
  currentUsername,
  onSelectUser,
  onCancel,
  triggerRef
}) => {
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Reset selection when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSelectedUserId(null)
    }
  }, [isOpen])

  const handleConfirm = () => {
    if (selectedUserId === null) {
      return
    }

    const selectedUser = users.find((u) => u.id === selectedUserId)
    if (selectedUser) {
      onSelectUser(selectedUser)
    }
  }

  const handleDoubleClick = (user: UserInfo) => {
    onSelectUser(user)
  }

  const userTypeStyles: Record<string, string> = {
    Admin: 'bg-amber-50 text-amber-600',
    User: 'bg-blue-50 text-blue-600',
    Guest: 'bg-gray-100 text-gray-600'
  }

  if (!isOpen) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="选择用户"
      size="md"
      triggerRef={triggerRef}
      initialFocusSelector={users.length > 0 ? '.user-item:first-child' : undefined}
      ariaDescribedBy="user-selection-description"
    >
      <div ref={dialogRef} className="max-h-[60vh] flex flex-col">
        <div className="text-sm text-gray-600 mb-4">当前登录：{currentUsername}</div>
        <p id="user-selection-description" className="sr-only">
          从列表中选择一个用户，双击可直接确认选择
        </p>

        <div className="flex-1 overflow-y-auto mb-4">
          <div className="flex flex-col gap-2">
            {users.map((user) => (
              <div
                key={user.id}
                className={`user-item p-3 border border-gray-200 rounded-lg cursor-pointer transition-all hover:border-blue-500 hover:bg-green-50 ${
                  selectedUserId === user.id ? 'border-blue-500 bg-blue-50' : ''
                }`}
                onClick={() => setSelectedUserId(user.id)}
                onDoubleClick={() => handleDoubleClick(user)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setSelectedUserId(user.id)
                  }
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">{user.username}</span>
                  <span
                    className={`text-xs px-2 py-1 rounded font-medium ${userTypeStyles[user.userType]}`}
                  >
                    {user.userType}
                  </span>
                </div>
                {user.createTime && (
                  <div className="mt-1 text-xs text-gray-500">
                    创建于：{new Date(user.createTime).toLocaleString('zh-CN')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-gray-200 pt-4">
          <div className="flex justify-center gap-3">
            <button
              className="px-6 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleConfirm}
              disabled={selectedUserId === null}
            >
              确认
            </button>
            <button
              className="px-6 py-2 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors"
              onClick={onCancel}
            >
              取消
            </button>
          </div>
          <div className="text-center text-xs text-gray-500 mt-3">双击用户可直接选择</div>
        </div>
      </div>
    </Modal>
  )
}

export default UserSelectionDialog
