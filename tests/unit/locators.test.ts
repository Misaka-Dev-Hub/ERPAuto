import { describe, it, expect } from 'vitest'
import { ERP_LOCATORS } from '../../src/main/services/erp/locators'

describe('ERP Locators', () => {
  it('should have login page locators defined', () => {
    expect(ERP_LOCATORS.login.usernameInput).toBeDefined()
    expect(ERP_LOCATORS.login.passwordInput).toBeDefined()
    expect(ERP_LOCATORS.login.submitButton).toBeDefined()
  })

  it('should have main frame locator', () => {
    expect(ERP_LOCATORS.main.mainIframe).toBeDefined()
  })

  it('should have extractor page locators', () => {
    expect(ERP_LOCATORS.extractor.orderNumberInputRole).toBeDefined()
    expect(ERP_LOCATORS.extractor.queryButton).toBeDefined()
    expect(ERP_LOCATORS.extractor.exportButton).toBeDefined()
    expect(ERP_LOCATORS.extractor.confirmButton).toBeDefined()
  })

  it('should have cleaner page locators', () => {
    expect(ERP_LOCATORS.cleaner.orderNumberInput).toBeDefined()
    expect(ERP_LOCATORS.cleaner.materialGrid).toBeDefined()
    expect(ERP_LOCATORS.cleaner.saveButton).toBeDefined()
  })
})
