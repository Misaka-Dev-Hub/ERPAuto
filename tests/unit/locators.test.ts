import { describe, it, expect } from 'vitest'
import { ERP_LOCATORS } from '../../src/main/services/erp/locators'

describe('ERP Locators', () => {
  it('should have correct login page selectors', () => {
    expect(ERP_LOCATORS.login.usernameInput).toBe('#username')
    expect(ERP_LOCATORS.login.passwordInput).toBe('#password')
    expect(ERP_LOCATORS.login.submitButton).toBe('button[type="submit"]')
  })

  it('should have correct main frame selectors', () => {
    expect(ERP_LOCATORS.main.mainIframe).toBe('#mainiframe')
    expect(ERP_LOCATORS.main.forwardFrame).toBe('#forwardFrame')
    expect(ERP_LOCATORS.main.loadingText).toBe('加载中')
  })

  it('should have correct extractor page selectors', () => {
    expect(ERP_LOCATORS.extractor.orderNumberInputRole).toBe('来源生产订单号')
    expect(ERP_LOCATORS.extractor.queryButton).toBe('.search-component-searchBtn')
    expect(ERP_LOCATORS.extractor.exportButton).toBe('internal:has-text="输出"')
    expect(ERP_LOCATORS.extractor.confirmButton).toBe('internal:has-text="确定(Y)"')
  })

  it('should have correct cleaner page selectors', () => {
    expect(ERP_LOCATORS.cleaner.orderNumberInput).toBe('input[name="orderNumber"]')
    expect(ERP_LOCATORS.cleaner.materialGrid).toBe('table.material-grid tbody tr')
    expect(ERP_LOCATORS.cleaner.saveButton).toBe('button:has-text("保存")')
  })
})
