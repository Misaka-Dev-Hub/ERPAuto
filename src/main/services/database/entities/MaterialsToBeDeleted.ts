/**
 * TypeORM Entity for MaterialsToBeDeleted table
 */

import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm'

@Entity('MaterialsToBeDeleted')
export class MaterialsToBeDeleted {
  @PrimaryGeneratedColumn()
  id!: number

  @Index({ unique: true })
  @Column({ name: 'MaterialCode', type: 'nvarchar', length: 255, nullable: false })
  materialCode!: string

  @Column({ name: 'ManagerName', type: 'nvarchar', length: 255, nullable: true })
  managerName!: string | null
}

/**
 * Material record interface for type-safe operations
 */
export interface MaterialRecordData {
  id?: number
  materialCode: string
  managerName: string | null
}
