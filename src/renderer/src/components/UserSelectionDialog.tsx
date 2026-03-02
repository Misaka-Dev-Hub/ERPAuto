/**
 * User Selection Dialog - For Admin user to select which user to operate as
 *
 * Mimics the Python UserSelectionDialog functionality:
 * - Display list of all users
 * - Allow admin to select a user
 * - Return selected user info
 */

import React, { useState, useEffect } from 'react'

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
}

export const UserSelectionDialog: React.FC<UserSelectionDialogProps> = ({
  isOpen,
  users,
  currentUsername,
  onSelectUser,
  onCancel
}) => {
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)

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

  if (!isOpen) return null

  return (
    <div className="user-selection-overlay">
      <div className="user-selection-dialog">
        <div className="user-selection-header">
          <h2 className="user-selection-title">选择用户</h2>
          <p className="user-selection-hint">当前登录：{currentUsername}</p>
        </div>

        <div className="user-selection-body">
          <div className="user-list">
            {users.map((user) => (
              <div
                key={user.id}
                className={`user-item ${selectedUserId === user.id ? 'selected' : ''}`}
                onClick={() => setSelectedUserId(user.id)}
                onDoubleClick={() => handleDoubleClick(user)}
              >
                <div className="user-item-content">
                  <div className="user-item-row">
                    <span className="user-name">{user.username}</span>
                    <span className={`user-type user-type-${user.userType.toLowerCase()}`}>
                      {user.userType}
                    </span>
                  </div>
                  {user.createTime && (
                    <div className="user-item-row">
                      <span className="user-create-time">
                        创建于：{new Date(user.createTime).toLocaleString('zh-CN')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="user-selection-footer">
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={selectedUserId === null}
          >
            确认
          </button>
          <button className="btn btn-secondary" onClick={onCancel}>
            取消
          </button>
        </div>

        <div className="user-selection-hint-footer">双击用户可直接选择</div>
      </div>

      <style>{`
        .user-selection-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
        }

        .user-selection-dialog {
          background: #fff;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
          width: 450px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
        }

        .user-selection-header {
          padding: 20px 24px;
          border-bottom: 1px solid #f0f0f0;
        }

        .user-selection-title {
          font-size: 18px;
          font-weight: 600;
          color: #333;
          margin: 0 0 8px 0;
        }

        .user-selection-hint {
          font-size: 13px;
          color: #666;
          margin: 0;
        }

        .user-selection-body {
          flex: 1;
          overflow-y: auto;
          padding: 16px 24px;
          min-height: 200px;
          max-height: 400px;
        }

        .user-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .user-item {
          padding: 12px 16px;
          border: 1px solid #e8e8e8;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .user-item:hover {
          border-color: #1890ff;
          background: #f6ffed;
        }

        .user-item.selected {
          border-color: #1890ff;
          background: #e6f7ff;
        }

        .user-item-content {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .user-item-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .user-name {
          font-size: 14px;
          font-weight: 500;
          color: #333;
        }

        .user-type {
          font-size: 12px;
          padding: 2px 8px;
          border-radius: 4px;
          font-weight: 500;
        }

        .user-type-admin {
          background: #fff7e6;
          color: #fa8c16;
        }

        .user-type-user {
          background: #e6f7ff;
          color: #1890ff;
        }

        .user-type-guest {
          background: #f5f5f5;
          color: #666;
        }

        .user-create-time {
          font-size: 12px;
          color: #999;
        }

        .user-selection-footer {
          display: flex;
          gap: 12px;
          justify-content: center;
          padding: 16px 24px;
          border-top: 1px solid #f0f0f0;
        }

        .btn {
          padding: 10px 24px;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s;
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-primary {
          background: #1890ff;
          color: #fff;
        }

        .btn-primary:hover:not(:disabled) {
          background: #40a9ff;
        }

        .btn-secondary {
          background: #f5f5f5;
          color: #666;
        }

        .btn-secondary:hover:not(:disabled) {
          background: #e8e8e8;
        }

        .user-selection-hint-footer {
          text-align: center;
          font-size: 12px;
          color: #999;
          padding: 8px 16px;
          border-top: 1px solid #f0f0f0;
        }
      `}</style>
    </div>
  )
}

export default UserSelectionDialog
