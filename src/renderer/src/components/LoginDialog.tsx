/**
 * Login Dialog - Modal dialog for user authentication
 *
 * Mimics the Python LoginDialog functionality:
 * - Modal dialog for username/password input
 * - Display computer name
 * - Enter key to submit
 */

import React, { useState } from 'react'
import { Modal, Form, Input, Button, Typography, Alert } from 'antd'

const { Text } = Typography

interface LoginDialogProps {
  isOpen: boolean
  computerName: string
  onLogin: (username: string, password: string) => Promise<boolean>
  onCancel: () => void
  onError: (message: string) => void
}

export const LoginDialog: React.FC<LoginDialogProps> = ({
  isOpen,
  computerName,
  onLogin,
  onCancel,
  onError
}) => {
  const [form] = Form.useForm()
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const handleFinish = async (values: any) => {
    setErrorMessage('')
    setIsLoggingIn(true)
    const success = await onLogin(values.username.trim(), values.password.trim())
    setIsLoggingIn(false)

    if (!success) {
      setErrorMessage('用户名或密码错误')
      onError('用户名或密码错误')
      form.setFieldsValue({ password: '' })
    }
  }

  return (
    <Modal
      open={isOpen}
      onCancel={onCancel}
      title="请登录"
      width={400}
      footer={null}
      destroyOnClose
    >
      <div className="mt-4">
        {errorMessage && (
          <Alert
            message={errorMessage}
            type="error"
            showIcon
            className="mb-4"
          />
        )}

        <Text type="secondary" className="block mb-4">
          当前计算机：{computerName}
        </Text>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleFinish}
          requiredMark={false}
        >
          <Form.Item
            label="用户名"
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input
              placeholder="请输入用户名"
              disabled={isLoggingIn}
              autoFocus
            />
          </Form.Item>

          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              placeholder="请输入密码"
              disabled={isLoggingIn}
            />
          </Form.Item>

          <Form.Item className="mb-0 mt-6 text-right">
            <Button onClick={onCancel} disabled={isLoggingIn} className="mr-2">
              取消
            </Button>
            <Button type="primary" htmlType="submit" loading={isLoggingIn}>
              {isLoggingIn ? '登录中...' : '登录'}
            </Button>
          </Form.Item>
        </Form>
        <div className="mt-4 text-xs text-gray-400 text-right">v1.0</div>
      </div>
    </Modal>
  )
}

export default LoginDialog
