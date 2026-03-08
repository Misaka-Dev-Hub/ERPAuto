import React, { useState, useEffect } from 'react'
import { Settings as SettingsIcon, Save, User, Key } from 'lucide-react'
import { Card, Form, Input, Button, message, Spin, Typography } from 'antd'

const { Text } = Typography

interface ErpCredentials {
  username: string
  password: string
}

const SettingsPage: React.FC = () => {
  const [form] = Form.useForm<ErpCredentials>()
  const [isModified, setIsModified] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [messageApi, contextHolder] = message.useMessage()

  useEffect(() => {
    loadCredentials()
  }, [])

  const loadCredentials = async () => {
    try {
      setIsLoading(true)
      // ERP credentials are loaded from database (current user's config)
      const response = await window.electron.settings.getSettings()
      const config = response.success
        ? (response.data as { erp?: ErpCredentials } | undefined)
        : undefined

      // Extract ERP credentials from the config
      if (config?.erp) {
        form.setFieldsValue({
          username: config.erp.username || '',
          password: config.erp.password || ''
        })
      } else if (!response.success) {
        messageApi.error(response.error || '加载 ERP 配置失败')
      }
      setIsModified(false)
    } catch (error) {
      messageApi.error('加载 ERP 配置失败')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveCredentials = async (values: ErpCredentials) => {
    try {
      // Save ERP credentials to database (current user's config)
      const result = await window.electron.settings.saveSettings({
        erp: {
          username: values.username,
          password: values.password
        }
      })
      const saveData = result.success
        ? (result.data as { success?: boolean; error?: string } | undefined)
        : undefined

      if (result.success && saveData?.success !== false) {
        setIsModified(false)
        messageApi.success('ERP 账号密码保存成功')
      } else {
        messageApi.error(result.error || saveData?.error || '保存失败')
      }
    } catch (error) {
      messageApi.error('保存配置时发生错误')
    }
  }

  const onValuesChange = () => {
    setIsModified(true)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <Spin size="large" tip="加载中..." />
      </div>
    )
  }

  return (
    <div className="flex justify-center animate-in fade-in slide-in-from-bottom-4 duration-500 mt-6">
      {contextHolder}

      <Card
        className="w-full max-w-xl shadow-sm border-slate-200"
        title={
          <div className="flex items-center gap-2">
            <SettingsIcon size={20} className="text-slate-600" />
            <Text strong className="text-lg">ERP 账号配置</Text>
          </div>
        }
      >
        <Text type="secondary" className="block mb-6">
          设置 ERP 系统的登录账号和密码。此配置将存储在数据库中，按用户管理。
        </Text>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSaveCredentials}
          onValuesChange={onValuesChange}
          requiredMark={false}
          className="max-w-md mx-auto"
        >
          <Form.Item
            label={
              <span className="flex items-center gap-2">
                <User size={16} className="text-slate-500" />
                ERP 登录账号
              </span>
            }
            name="username"
            rules={[{ required: true, message: '请输入 ERP 账号' }]}
          >
            <Input size="large" placeholder="输入 ERP 账号" />
          </Form.Item>

          <Form.Item
            label={
              <span className="flex items-center gap-2">
                <Key size={16} className="text-slate-500" />
                ERP 登录密码
              </span>
            }
            name="password"
            rules={[{ required: true, message: '请输入 ERP 密码' }]}
          >
            <Input.Password size="large" placeholder="••••••••" />
          </Form.Item>

          <Form.Item className="mt-8 text-center">
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              icon={<Save size={18} />}
              disabled={!isModified}
              className="w-full"
            >
              保存并应用配置
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}

export default SettingsPage
