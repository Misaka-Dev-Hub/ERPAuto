import { Entity, PrimaryColumn, Column, Index } from 'typeorm'

/**
 * Production Contract Entity
 *
 * Represents the production contract database table.
 * Maps to: productionContractData_26年压力表合同数据
 *
 * Columns:
 * - 总排号 (productionId): Production ID, primary key
 * - 生产订单号 (orderNumber): Production order number
 */
@Entity('productionContractData_26年压力表合同数据')
export class ProductionContract {
  @Index()
  @PrimaryColumn({ name: '总排号', type: 'varchar', length: 50 })
  productionId!: string

  @Index()
  @Column({ name: '生产订单号', type: 'varchar', length: 50 })
  orderNumber!: string
}
