/**
 * TypeORM Entity for DiscreteMaterialPlanData table
 */

import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm'

@Entity('DiscreteMaterialPlanData')
export class DiscreteMaterialPlan {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ name: 'Factory', type: 'nvarchar', length: 100, nullable: true })
  factory!: string | null

  @Column({ name: 'MaterialStatus', type: 'nvarchar', length: 50, nullable: true })
  materialStatus!: string | null

  @Index()
  @Column({ name: 'PlanNumber', type: 'nvarchar', length: 100, nullable: true })
  planNumber!: string | null

  @Index()
  @Column({ name: 'SourceNumber', type: 'nvarchar', length: 100, nullable: true })
  sourceNumber!: string | null

  @Column({ name: 'MaterialType', type: 'nvarchar', length: 100, nullable: true })
  materialType!: string | null

  @Column({ name: 'ProductCode', type: 'nvarchar', length: 100, nullable: true })
  productCode!: string | null

  @Column({ name: 'ProductName', type: 'nvarchar', length: 255, nullable: true })
  productName!: string | null

  @Column({ name: 'ProductUnit', type: 'nvarchar', length: 50, nullable: true })
  productUnit!: string | null

  @Column({ name: 'ProductPlanQuantity', type: 'decimal', precision: 18, scale: 4, nullable: true })
  productPlanQuantity!: number | null

  @Column({ name: 'UseDepartment', type: 'nvarchar', length: 100, nullable: true })
  useDepartment!: string | null

  @Column({ name: 'Remark', type: 'nvarchar', length: 500, nullable: true })
  remark!: string | null

  @Column({ name: 'Creator', type: 'nvarchar', length: 100, nullable: true })
  creator!: string | null

  @Column({ name: 'CreateDate', type: 'datetime', nullable: true })
  createDate!: Date | null

  @Column({ name: 'Approver', type: 'nvarchar', length: 100, nullable: true })
  approver!: string | null

  @Column({ name: 'ApproveDate', type: 'datetime', nullable: true })
  approveDate!: Date | null

  @Column({ name: 'SequenceNumber', type: 'int', nullable: true })
  sequenceNumber!: number | null

  @Index()
  @Column({ name: 'MaterialCode', type: 'nvarchar', length: 100, nullable: true })
  materialCode!: string | null

  @Column({ name: 'MaterialName', type: 'nvarchar', length: 255, nullable: true })
  materialName!: string | null

  @Column({ name: 'Specification', type: 'nvarchar', length: 255, nullable: true })
  specification!: string | null

  @Column({ name: 'Model', type: 'nvarchar', length: 255, nullable: true })
  model!: string | null

  @Column({ name: 'DrawingNumber', type: 'nvarchar', length: 100, nullable: true })
  drawingNumber!: string | null

  @Column({ name: 'MaterialQuality', type: 'nvarchar', length: 100, nullable: true })
  materialQuality!: string | null

  @Column({ name: 'PlanQuantity', type: 'decimal', precision: 18, scale: 4, nullable: true })
  planQuantity!: number | null

  @Column({ name: 'Unit', type: 'nvarchar', length: 50, nullable: true })
  unit!: string | null

  @Column({ name: 'RequiredDate', type: 'datetime', nullable: true })
  requiredDate!: Date | null

  @Column({ name: 'Warehouse', type: 'nvarchar', length: 100, nullable: true })
  warehouse!: string | null

  @Column({ name: 'UnitUsage', type: 'decimal', precision: 18, scale: 6, nullable: true })
  unitUsage!: number | null

  @Column({
    name: 'CumulativeOutputQuantity',
    type: 'decimal',
    precision: 18,
    scale: 4,
    nullable: true
  })
  cumulativeOutputQuantity!: number | null

  @Column({ name: 'BOMVersion', type: 'nvarchar', length: 50, nullable: true })
  bomVersion!: string | null
}

/**
 * Material plan record interface for type-safe operations
 */
export interface MaterialPlanRecordData {
  id?: number
  factory?: string | null
  materialStatus?: string | null
  planNumber?: string | null
  sourceNumber?: string | null
  materialType?: string | null
  productCode?: string | null
  productName?: string | null
  productUnit?: string | null
  productPlanQuantity?: number | null
  useDepartment?: string | null
  remark?: string | null
  creator?: string | null
  createDate?: Date | null
  approver?: string | null
  approveDate?: Date | null
  sequenceNumber?: number | null
  materialCode?: string | null
  materialName?: string | null
  specification?: string | null
  model?: string | null
  drawingNumber?: string | null
  materialQuality?: string | null
  planQuantity?: number | null
  unit?: string | null
  requiredDate?: Date | null
  warehouse?: string | null
  unitUsage?: number | null
  cumulativeOutputQuantity?: number | null
  bomVersion?: string | null
}
