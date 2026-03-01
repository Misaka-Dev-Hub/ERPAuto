export interface CleanerInput {
  orderNumbers: string[];
  materialCodes: string[];
  dryRun: boolean;
  onProgress?: (message: string, progress: number) => void;
}

export interface CleanerResult {
  ordersProcessed: number;
  materialsDeleted: number;
  materialsSkipped: number;
  errors: string[];
  details: OrderCleanDetail[];
}

export interface OrderCleanDetail {
  orderNumber: string;
  materialsDeleted: number;
  materialsSkipped: number;
  errors: string[];
}