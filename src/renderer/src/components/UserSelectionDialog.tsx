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
    Admin: 'bg-amber-50 text-amber-600 border border-amber-100',
    User: 'bg-blue-50 text-blue-600 border border-blue-100',
    Guest: 'bg-slate-100 text-slate-600 border border-slate-200'
  }

  if (!isOpen) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="选择操作身份"
      size="md"
      triggerRef={triggerRef}
      initialFocusSelector={users.length > 0 ? '.user-item:first-child' : undefined}
      ariaDescribedBy="user-selection-description"
    >
      <div ref={dialogRef} className="max-h-[60vh] flex flex-col">
        <div className="text-sm text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100 mb-4">
          当前登录：<span className="font-medium text-slate-700">{currentUsername}</span>
        </div>
        <p id="user-selection-description" className="sr-only">
          从列表中选择一个用户，双击可直接确认选择
        </p>

        <div className="flex-1 overflow-y-auto mb-6 pr-1">
          <div className="flex flex-col gap-2">
            {users.map((user) => (
              <div
                key={user.id}
                className={`user-item p-4 border rounded-xl cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
                  selectedUserId === user.id
                    ? 'border-blue-500 bg-blue-50/50 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
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
                  <span className="text-sm font-medium text-slate-800">{user.username}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-md font-medium ${userTypeStyles[user.userType]}`}
                  >
                    {user.userType}
                  </span>
                </div>
                {user.createTime && (
                  <div className="mt-2 text-xs text-slate-400">
                    创建于：{new Date(user.createTime).toLocaleString('zh-CN')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-100 pt-5">
          <div className="flex justify-end gap-3">
            <button
              className="px-6 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors"
              onClick={onCancel}
            >
              取消
            </button>
            <button
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleConfirm}
              disabled={selectedUserId === null}
            >
              确认选择
            </button>
          </div>
          <div className="text-right text-xs text-slate-400 mt-3">双击用户卡片可直接选择</div>
        </div>
      </div>
    </Modal>
  )
}

export default UserSelectionDialog
