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
    submitButton: 'button[type="submit"]',
  },

  // Main Frame
  main: {
    mainIframe: '#mainiframe',
    loadingOverlay: '.loading-overlay',
    contentFrame: '#contentframe',
  },

  // Extractor (Data Export) Page
  extractor: {
    orderNumberInput: 'input[name="orderNumber"]',
    queryButton: 'button:has-text("查询")',
    exportButton: 'button:has-text("导出")',
  },

  // Cleaner (Material Delete) Page
  cleaner: {
    orderNumberInput: 'input[name="orderNumber"]',
    materialGrid: 'table.material-grid tbody tr',
    saveButton: 'button:has-text("保存")',
  },

  // Common Elements
  common: {
    successMessage: '.message.success',
    errorMessage: '.message.error',
    confirmDialog: '.confirm-dialog',
    confirmButton: 'button:has-text("确定")',
    cancelButton: 'button:has-text("取消")',
  },
};