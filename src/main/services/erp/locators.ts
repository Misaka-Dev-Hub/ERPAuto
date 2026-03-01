/**
 * ERP Page Element Locators
 * Reference: playwrite/utils/ discrete_material_plan_extractor.py
 * Reference: playwrite/utils/ discrete_material_plan_cleaner.py
 */

export const ERP_LOCATORS = {
  // Login Page
  login: {
    usernameInput: '#username',
    passwordInput: '#password',
    submitButton: 'button[type="submit"]'
  },

  // Main Frame
  // Reference: Nested iframe structure from Python code
  main: {
    // Main iframe on the page
    mainIframe: '#mainiframe',
    // Forward frame (nested inside main)
    forwardFrame: '#forwardFrame',
    // Inner iframe (inside forward frame)
    innerIframe: '#mainiframe',
    // Loading overlay text
    loadingText: '加载中'
  },

  // Extractor (Data Export) Page
  // Reference: playwrite/utils/discrete_material_plan_extractor.py
  extractor: {
    // Textbox by role: get_by_role("textbox", name="来源生产订单号")
    orderNumberInputRole: '来源生产订单号',
    // Search button: .search-component-searchBtn
    queryButton: '.search-component-searchBtn',
    // Loading indicator: div with text "加载中"
    loadingText: '加载中',
    // First row selector (序号 row)
    firstRowSelector: 'internal:role=row[name=/序号/i]',
    // More button
    moreButton: 'internal:has-text="更多"',
    // Export button (输出)
    exportButton: 'internal:has-text="输出"',
    // Export dialog - threshold input
    thresholdInputSelector: 'div:has-text(/^行数阈值$/) input[type="text"]',
    // Confirm button
    confirmButton: 'internal:has-text="确定(Y)"'
  },

  // Menu navigation
  menu: {
    // Search icon in search wrapper
    searchIcon: '.search-name-wrapper .iconfont',
    // Order number query menu item
    orderQuery: 'internal:has-text="订单号查询"',
    // "All" tab
    allTab: 'internal:role=tab[name="全部"]',
    // Select input for setting limits
    selectInput: '#rc_select_0'
  },

  // Discrete material plan menu item
  discreteMaterialPlan: 'internal:has-title="离散备料计划维护"',

  // Cleaner (Material Delete) Page
  cleaner: {
    orderNumberInput: 'input[name="orderNumber"]',
    materialGrid: 'table.material-grid tbody tr',
    saveButton: 'button:has-text("保存")'
  },

  // Common Elements
  common: {
    successMessage: '.message.success',
    errorMessage: '.message.error',
    confirmDialog: '.confirm-dialog',
    confirmButton: 'button:has-text("确定")',
    cancelButton: 'button:has-text("取消")'
  }
}
