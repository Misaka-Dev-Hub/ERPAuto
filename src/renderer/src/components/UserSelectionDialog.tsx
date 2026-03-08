/**
 * User Selection Dialog - For Admin user to select which user to operate as
 *
 * Mimics the Python UserSelectionDialog functionality:
 * - Display list of all users
 * - Allow admin to select a user
 * - Return selected user info
 */

import React, { useState, useEffect } from 'react'
import { Modal, List, Tag, Button, Typography } from 'antd'

const { Text } = Typography

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

  const userTypeColors: Record<string, string> = {
    Admin: 'orange',
    User: 'blue',
    Guest: 'default'
  }

  return (
    <Modal
      open={isOpen}
      onCancel={onCancel}
      title="选择用户"
      width={500}
      footer={
        <div className="flex justify-center gap-3 w-full">
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" onClick={handleConfirm} disabled={selectedUserId === null}>
            确认
          </Button>
        </div>
      }
      destroyOnClose
    >
      <div className="flex flex-col">
        <Text type="secondary" className="mb-4 block">
          当前登录：{currentUsername}
        </Text>

        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          <List
            dataSource={users}
            renderItem={(user) => (
              <List.Item
                className={`cursor-pointer transition-all hover:bg-blue-50 ${selectedUserId === user.id ? 'bg-blue-50 border-blue-500 border rounded-lg' : 'border-transparent border rounded-lg'}`}
                style={{ padding: '12px', marginBottom: '8px' }}
                onClick={() => setSelectedUserId(user.id)}
                onDoubleClick={() => handleDoubleClick(user)}
              >
                <div className="w-full">
                  <div className="flex justify-between items-center mb-1">
                    <Text strong>{user.username}</Text>
                    <Tag color={userTypeColors[user.userType] || 'default'}>{user.userType}</Tag>
                  </div>
                  {user.createTime && (
                    <Text type="secondary" className="text-xs">
                      创建于：{new Date(user.createTime).toLocaleString('zh-CN')}
                    </Text>
                  )}
                </div>
              </List.Item>
            )}
          />
        </div>
        <Text type="secondary" className="text-center text-xs mt-3 block">
          双击用户可直接选择
        </Text>
      </div>
    </Modal>
  )
}

export default UserSelectionDialog
