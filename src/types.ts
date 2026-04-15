export type StrictDict<K extends string | number | symbol, V> = { [key in K]: V }

export type Dict<K extends string | number | symbol, V> = { [key in K]: V | undefined }

export enum AsyncState {
  NotStarted = 'NOT_STARTED',
  InProgress = 'IN_PROGRESS',
  Fulfilled = 'FULFILLED',
  Rejected = 'REJECTED',
}

/**
 * Classifies the type of version constraint on a gem declaration.
 * - pessimistic-1: ~> A          (1 segment, allows any A.x.y)
 * - pessimistic-2: ~> A.B        (2 segments, allows A.x.y where x >= B)
 * - pessimistic-3: ~> A.B.C      (3+ segments, last segment is free)
 * - compound:      ~> A.B + other ops (e.g. >= A.B.C)
 * - non-pessimistic: no ~>, or no version at all
 */
export type ConstraintType =
  | 'pessimistic-1'
  | 'pessimistic-2'
  | 'pessimistic-3'
  | 'compound'
  | 'non-pessimistic'

export type UpgradeLevel = 'major' | 'minor' | 'patch'
