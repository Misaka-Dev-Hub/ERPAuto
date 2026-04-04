/**
 * Enhanced Logger Type Definitions
 *
 * Provides comprehensive type safety for the logging system,
 * including request context, performance metrics, and structured log metadata.
 *
 * @packageDocumentation
 */

import type { LogLevel } from '../../shared/ipc-channels'

/**
 * Core log context interface for request tracing
 *
 * This type is re-exported from the logger service but defined here
 * for type sharing across the application without creating circular dependencies.
 */
export interface LogContext {
  /** Unique identifier for the request/operation (UUID v4) */
  requestId: string
  /** User ID performing the operation (optional) */
  userId?: string
  /** Operation name being performed (e.g., 'extract', 'clean', 'validate') */
  operation?: string
  /** Sub-operation or step within the main operation (optional) */
  subOperation?: string
  /** Batch identifier for batch operations (optional) */
  batchId?: string
}

/**
 * Enhanced log metadata for structured logging
 *
 * Provides rich context for log entries, enabling better
 * filtering, analysis, and debugging capabilities.
 */
export interface EnhancedLogMeta {
  /** Request context for correlation */
  context?: LogContext

  /** Performance metrics (if applicable) */
  performance?: PerformanceMetrics

  /** Error information (if applicable) */
  error?: {
    /** Error name/type */
    name: string
    /** Error message */
    message: string
    /** Error code for programmatic handling */
    code?: string
    /** Stack trace (in development) */
    stack?: string
    /** Serialized cause chain */
    cause?: string | Record<string, unknown>
  }

  /** Database query information (if applicable) */
  database?: {
    /** Database type (mysql, sqlserver) */
    type: 'mysql' | 'sqlserver'
    /** Query executed (sanitized in production) */
    query?: string
    /** Execution time in milliseconds */
    duration: number
    /** Number of rows affected/returned */
    rowsAffected?: number
  }

  /** File operation information (if applicable) */
  file?: {
    /** File path (sanitized in production) */
    path: string
    /** Operation type (read, write, delete, exists) */
    operation: 'read' | 'write' | 'delete' | 'exists' | 'list'
    /** File size in bytes (if applicable) */
    size?: number
    /** Result of the operation */
    success: boolean
  }

  /** HTTP/ERP API call information (if applicable) */
  http?: {
    /** HTTP method used */
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
    /** URL or endpoint called */
    url: string
    /** HTTP status code received */
    statusCode: number
    /** Request duration in milliseconds */
    duration: number
    /** Request payload size in bytes */
    requestSize?: number
    /** Response payload size in bytes */
    responseSize?: number
  }

  /** Custom key-value pairs for additional metadata */
  custom?: Record<string, unknown>
}

/**
 * Performance metrics for timing and resource tracking
 *
 * Captures timing information for operations, enabling
 * performance monitoring and bottleneck identification.
 */
export interface PerformanceMetrics {
  /** Operation start timestamp (ISO 8601 format or Date) */
  startTime: Date | string

  /** Operation end timestamp (ISO 8601 format or Date) */
  endTime?: Date | string

  /** Total duration in milliseconds */
  duration: number

  /** Breakdown of time spent in different phases (optional) */
  phases?: {
    /** Phase name (e.g., 'connect', 'query', 'process', 'write') */
    [phaseName: string]: {
      /** Duration of this phase in milliseconds */
      duration: number
      /** Additional phase-specific metadata */
      meta?: Record<string, unknown>
    }
  }

  /** Memory usage snapshot (optional, Node.js specific) */
  memory?: {
    /** Heap used in bytes */
    heapUsed: number
    /** Heap total in bytes */
    heapTotal: number
    /** RSS (Resident Set Size) in bytes */
    rss: number
    /** External memory in bytes */
    external: number
  }

  /** CPU usage snapshot (optional) */
  cpu?: {
    /** User CPU time in milliseconds */
    user: number
    /** System CPU time in milliseconds */
    system: number
  }
}

/**
 * Log entry structure for structured logging
 *
 * Represents a complete log entry with all metadata,
 * suitable for JSON serialization and log aggregation systems.
 */
export interface StructuredLogEntry {
  /** Log level */
  level: LogLevel

  /** Log message */
  message: string

  /** Timestamp (ISO 8601 format) */
  timestamp: string

  /** Service/application identifier */
  service: string

  /** Module or component context */
  context?: string

  /** Environment (development, production) */
  environment?: string

  /** Enhanced metadata */
  meta?: EnhancedLogMeta

  /** Process information */
  process?: {
    /** Process ID */
    pid: number
    /** Process uptime in seconds */
    uptime: number
  }
}

/**
 * Logger configuration interface
 *
 * Used for type-safe configuration of the logging system.
 */
export interface LoggerConfig {
  /** Log level threshold */
  level: LogLevel

  /** Number of days to retain application logs */
  appRetention: number

  /** Enable console output (default: true) */
  console?: boolean

  /** Enable file output (default: true in production) */
  file?: boolean

  /** Maximum log file size before rotation (e.g., '20m') */
  maxSize?: string

  /** Log format ('json' | 'pretty') */
  format?: 'json' | 'pretty'
}

/**
 * Result type for logger operations
 *
 * Provides type-safe error handling for logger methods.
 */
export interface LoggerOperationResult {
  /** Whether the operation succeeded */
  success: boolean
  /** Error message if operation failed */
  error?: string
  /** Additional data from the operation */
  data?: Record<string, unknown>
}

/**
 * Log transport configuration
 */
export interface LogTransportConfig {
  /** Transport type */
  type: 'console' | 'file' | 'http'

  /** Transport-specific options */
  options?: {
    /** Log level for this transport */
    level?: LogLevel
    /** Maximum number of files to retain (for file transport) */
    maxFiles?: string
    /** Maximum file size before rotation */
    maxSize?: string
    /** Compression for old logs */
    zippedArchive?: boolean
  }
}
