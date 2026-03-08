import React from 'react'
import {
  Play,
  DatabaseZap,
  Layers,
  Users,
  Search,
  CheckSquare,
  Square,
  EyeOff,
  Eye,
  HardDrive,
  Settings2,
  FileSpreadsheet
} from 'lucide-react'
import MaterialTypeManagementDialog from '../components/MaterialTypeManagementDialog'
import ExecutionReportDialog from '../components/ExecutionReportDialog'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { useCleaner } from '../hooks/useCleaner'
import { Card, Table, Button, Radio, Checkbox, Space, Select, Dropdown, MenuProps, Switch, Layout, Typography, Divider } from 'antd'

const { Sider } = Layout
const { Text } = Typography

const CleanerPage: React.FC = () => {
  const typeManagementButtonRef = React.useRef<HTMLButtonElement>(null)
  const executeButtonRef = React.useRef<HTMLButtonElement>(null)

  const {
    isAdmin,
    currentUsername,
    dryRun,
    setDryRun,
    valMode,
    setValMode,
    validationResults,
    selectedItems,
    setSelectedItems,
    setHiddenItems,
    managers,
    selectedManagers,
    setSelectedManagers,
    isRunning,
    isExecuting,
    isValidationRunning,
    isExporting,
    isTypeDialogOpen,
    setIsTypeDialogOpen,
    headless,
    setHeadless,
    filteredResults,
    isReportDialogOpen,
    setIsReportDialogOpen,
    reportData,
    editingCell,
    editValue,
    setEditValue,
    inputRef,
    startEdit,
    saveEdit,
    cancelEdit,
    handleAssignManagerOnSelect,
    progress,
    startTime,
    handleValidation,
    handleCheckboxToggle,
    handleConfirmDeletion,
    handleExecuteDeletion,
    handleExportResults,
    confirmDialog
  } = useCleaner()

  const settingsMenu: MenuProps = {
    items: [
      {
        key: 'dryRun',
        label: (
          <div className="flex items-center justify-between min-w-[200px] py-1">
            <div>
              <div className="text-sm font-medium text-slate-800">预览模式 (Dry-Run)</div>
              <div className="text-xs text-slate-500 mt-0.5">仅执行页面操作定位，不保存更改</div>
            </div>
            <Switch checked={dryRun} onChange={(checked) => setDryRun(checked)} className="ml-4" />
          </div>
        )
      },
      { type: 'divider' },
      {
        key: 'headless',
        label: (
          <div className="flex items-center justify-between min-w-[200px] py-1">
            <div>
              <div className="text-sm font-medium text-slate-800">后台模式 (Headless)</div>
              <div className="text-xs text-slate-500 mt-0.5">浏览器在后台运行，不显示界面</div>
            </div>
            <Switch checked={headless} onChange={(checked) => setHeadless(checked)} className="ml-4" />
          </div>
        )
      }
    ]
  };

  return (
    <Layout className="h-full bg-transparent flex flex-row gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* 左栏：数据源与执行控制区 (仅 Admin 可见) */}
      {isAdmin && (
        <Sider width={380} theme="light" className="flex-shrink-0 flex flex-col gap-5 bg-transparent overflow-auto">
          {/* 1. 数据来源选择 */}
          <Card
            title={
              <span className="flex items-center gap-2">
                <DatabaseZap size={18} className="text-blue-500" />
                校验数据来源
              </span>
            }
            size="small"
            className="shadow-sm border-slate-200"
          >
            <Radio.Group onChange={(e) => setValMode(e.target.value)} value={valMode} className="flex flex-col gap-3 w-full">
              <Radio value="full" className={`p-3 border rounded-lg m-0 w-full transition-colors ${valMode === 'full' ? 'bg-blue-50 border-blue-200' : 'border-slate-200'}`}>
                <div className="ml-2 inline-block align-top">
                  <Text strong className="block">数据库 - 全表校验</Text>
                  <Text type="secondary" className="text-xs">校验数据库中所有待处理物料</Text>
                </div>
              </Radio>

              <Radio value="filtered" className={`p-3 border rounded-lg m-0 w-full transition-colors ${valMode === 'filtered' ? 'bg-blue-50 border-blue-200' : 'border-slate-200'}`}>
                <div className="ml-2 inline-block align-top whitespace-normal w-full" style={{ width: 'calc(100% - 24px)' }}>
                  <Text strong className="block">数据库 - ProductionID 过滤</Text>
                  <Text type="secondary" className="text-xs block">仅校验指定订单号相关的物料</Text>
                  {valMode === 'filtered' && (
                    <div className="mt-2 text-xs text-blue-700 bg-blue-100/50 rounded p-2 flex items-start gap-1.5 w-full">
                      <Layers size={14} className="mt-0.5 flex-shrink-0" />
                      <span>
                        自动使用<strong>【数据提取】</strong>模块中共享的订单号列表进行过滤。
                      </span>
                    </div>
                  )}
                </div>
              </Radio>
            </Radio.Group>
          </Card>

          {/* 2. 负责人筛选 */}
          <Card
            title={
              <div className="flex items-center justify-between w-full">
                <span className="flex items-center gap-2">
                  <Users size={18} className="text-indigo-500" />
                  筛选 (按负责人)
                </span>
                <Space size="small">
                  <Button type="link" size="small" onClick={() => setSelectedManagers(new Set(managers))} style={{ padding: 0 }}>全选</Button>
                  <Button type="link" size="small" onClick={() => setSelectedManagers(new Set())} style={{ padding: 0, color: 'gray' }}>取消</Button>
                </Space>
              </div>
            }
            size="small"
            className="shadow-sm border-slate-200"
          >
            <div className="grid grid-cols-2 gap-2 max-h-[150px] overflow-y-auto">
              {managers.map((manager) => (
                <Checkbox
                  key={manager}
                  checked={selectedManagers.has(manager)}
                  onChange={(e) => {
                    setSelectedManagers((prev) => {
                      const newSet = new Set(prev)
                      if (e.target.checked) newSet.add(manager)
                      else newSet.delete(manager)
                      return newSet
                    })
                  }}
                  className="hover:bg-slate-50 p-1.5 rounded m-0 whitespace-nowrap overflow-hidden text-ellipsis"
                  title={manager || '未分配'}
                >
                  <span className="text-sm truncate max-w-[100px] inline-block align-bottom">{manager || '未分配'}</span>
                </Checkbox>
              ))}
              {managers.length === 0 && (
                <Text type="secondary" className="text-sm">暂无负责人数据</Text>
              )}
            </div>
          </Card>
        </Sider>
      )}

      {/* 右栏：结果表格与工具栏 */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
        {/* 获取物料状态按钮 */}
        <div className="p-4 border-b border-slate-200 flex-shrink-0">
          <Button
            type="default"
            block
            size="large"
            icon={<Search size={18} />}
            onClick={handleValidation}
            loading={isValidationRunning}
            className="bg-slate-50 font-medium text-slate-800"
          >
            {isValidationRunning ? '正在获取...' : '获取并校验物料状态'}
          </Button>
        </div>

        {/* 顶部操作条 */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex justify-between items-center flex-shrink-0">
          <Space size="small" wrap>
            <Button
              size="small"
              icon={<CheckSquare size={14} className="text-blue-600" />}
              onClick={() => setSelectedItems(new Set(filteredResults.map((r) => r.materialCode)))}
            >
              全选
            </Button>
            <Button
              size="small"
              icon={<Square size={14} className="text-slate-400" />}
              onClick={() => {
                const visibleCodes = new Set(filteredResults.map((r) => r.materialCode))
                setSelectedItems((prev) => {
                  const newSet = new Set(prev)
                  for (const code of visibleCodes) {
                    newSet.delete(code)
                  }
                  return newSet
                })
              }}
            >
              取消
            </Button>

            <Divider type="vertical" />

            <Button
              size="small"
              icon={<EyeOff size={14} />}
              onClick={() => {
                const checkedCodes = filteredResults
                  .filter((r) => selectedItems.has(r.materialCode))
                  .map((r) => r.materialCode)
                if (checkedCodes.length)
                  setHiddenItems((prev) => new Set([...prev, ...checkedCodes]))
              }}
            >
              隐藏勾选
            </Button>
            <Button
              size="small"
              icon={<Eye size={14} />}
              onClick={() => setHiddenItems(new Set())}
            >
              显示全部
            </Button>

            <Divider type="vertical" />

            <Button
              size="small"
              type="primary"
              ghost
              icon={<HardDrive size={14} />}
              onClick={handleConfirmDeletion}
              disabled={isRunning || validationResults.length === 0}
            >
              确认删除 (同步数据库)
            </Button>
          </Space>

          <Space size="small">
            <Button
              size="small"
              icon={<Settings2 size={14} />}
              onClick={() => setIsTypeDialogOpen(true)}
              ref={typeManagementButtonRef as any}
            >
              类型管理
            </Button>
            <Button
              size="small"
              type="primary"
              ghost
              icon={<FileSpreadsheet size={14} />}
              onClick={handleExportResults}
              loading={isExporting}
              disabled={filteredResults.length === 0}
            >
              {isExporting ? '导出中...' : '导出结果'}
            </Button>
          </Space>
        </div>

        {/* 表格区域 */}
        <div className="flex-1 overflow-y-auto">
          <Table
            dataSource={filteredResults}
            rowKey="materialCode"
            size="small"
            pagination={false}
            scroll={{ y: 'calc(100vh - 350px)' }}
            rowSelection={{
              selectedRowKeys: Array.from(selectedItems),
              onSelect: (record) => {
                handleCheckboxToggle(record.materialCode)
                if (!isAdmin) {
                  handleAssignManagerOnSelect(record.materialCode)
                }
              },
              onSelectAll: (selected) => {
                 if(selected) {
                   setSelectedItems(new Set(filteredResults.map((r) => r.materialCode)))
                 } else {
                    const visibleCodes = new Set(filteredResults.map((r) => r.materialCode))
                    setSelectedItems((prev) => {
                      const newSet = new Set(prev)
                      for (const code of visibleCodes) {
                        newSet.delete(code)
                      }
                      return newSet
                    })
                 }
              }
            }}
            columns={[
              {
                title: '材料名称',
                dataIndex: 'materialName',
                key: 'materialName',
                ellipsis: true,
                render: (text) => <Text strong>{text}</Text>
              },
              {
                title: '材料代码',
                dataIndex: 'materialCode',
                key: 'materialCode',
                ellipsis: true,
                render: (text) => <Text code>{text}</Text>
              },
              {
                title: '规格',
                dataIndex: 'specification',
                key: 'specification',
                ellipsis: true,
                render: (text) => text || '-'
              },
              {
                title: '型号',
                dataIndex: 'model',
                key: 'model',
                ellipsis: true,
                render: (text) => text || '-'
              },
              {
                title: (
                  <span>
                    负责人 <Text type="secondary" style={{ fontSize: '10px' }}>(双击编辑)</Text>
                  </span>
                ),
                dataIndex: 'managerName',
                key: 'managerName',
                width: 150,
                ellipsis: true,
                render: (text, _record, index) => {
                  const isEditingManager = editingCell?.rowIndex === index && editingCell?.field === 'managerName'

                  if (isAdmin && isEditingManager) {
                    return (
                      <Select
                        ref={inputRef as React.Ref<any>}
                        value={editValue}
                        onChange={(val) => setEditValue(val)}
                        onBlur={saveEdit}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit()
                          if (e.key === 'Escape') cancelEdit()
                        }}
                        onClick={(e) => e.stopPropagation()}
                        size="small"
                        style={{ width: '100%' }}
                        autoFocus
                      >
                        <Select.Option value="">选择负责人</Select.Option>
                        {managers.map((m) => (
                          <Select.Option key={m} value={m}>{m}</Select.Option>
                        ))}
                      </Select>
                    )
                  }

                  if (isAdmin) {
                    return (
                      <div
                        className="min-h-[24px] cursor-text"
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                          startEdit(index, 'managerName')
                        }}
                      >
                        {text ? (
                          <span>{text}</span>
                        ) : (
                          <Text type="secondary" italic>双击编辑</Text>
                        )}
                      </div>
                    )
                  }

                  return text ? <span>{text}</span> : <Text type="warning" italic>空 (待分配)</Text>
                }
              }
            ]}
          />
        </div>

        {/* 底部状态与执行区 */}
        <div className="bg-white border-t border-slate-200 p-4 flex justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Text className="text-sm font-medium">
              共计 {filteredResults.length} 条记录 | 已选中 <Text strong type="success">{selectedItems.size}</Text> 条
            </Text>
          </div>

          <Space size="middle">
            <Dropdown menu={settingsMenu} placement="topLeft" trigger={['click']}>
              <Button size="large" icon={<Settings2 size={16} />}>执行设置</Button>
            </Dropdown>

            <Button
              type="primary"
              size="large"
              danger={!dryRun}
              icon={<Play size={18} fill="currentColor" />}
              onClick={handleExecuteDeletion}
              disabled={isRunning}
              ref={executeButtonRef as any}
              style={{ minWidth: '200px', backgroundColor: dryRun ? '#faad14' : undefined, borderColor: dryRun ? '#faad14' : undefined }}
            >
              {dryRun ? '开始预览执行' : '正式执行 ERP 清理'}
            </Button>
          </Space>
        </div>
      </div>

      {/* Material Type Management Dialog */}
      <MaterialTypeManagementDialog
        isOpen={isTypeDialogOpen}
        onClose={() => setIsTypeDialogOpen(false)}
        isAdmin={isAdmin}
        currentUsername={currentUsername}
        triggerRef={typeManagementButtonRef}
      />

      {/* Execution Report Dialog */}
      <ExecutionReportDialog
        isOpen={isReportDialogOpen}
        onClose={() => setIsReportDialogOpen(false)}
        ordersProcessed={reportData?.ordersProcessed}
        materialsDeleted={reportData?.materialsDeleted}
        materialsSkipped={reportData?.materialsSkipped}
        errors={reportData?.errors}
        dryRun={dryRun}
        isExecuting={isExecuting}
        progress={progress}
        startTime={startTime}
        triggerRef={executeButtonRef}
      />

      {/* Confirmation Dialog */}
      {confirmDialog && <ConfirmDialog {...confirmDialog} />}
    </Layout>
  )
}

export default CleanerPage
