(define-constant ERR-NOT-AUTHORIZED u200)
(define-constant ERR-WALLET-NOT-FOUND u201)
(define-constant ERR-ENTRY-NOT-FOUND u202)
(define-constant ERR-NO-CONSENT u203)
(define-constant ERR-INVALID-POOL-ID u204)
(define-constant ERR-INVALID-DATA-HASH u205)
(define-constant ERR-INVALID-CATEGORY u206)
(define-constant ERR-POOL-ALREADY-EXISTS u207)
(define-constant ERR-POOL-NOT-FOUND u208)
(define-constant ERR-INVALID-MAX-ENTRIES u209)
(define-constant ERR-MAX-POOLS-EXCEEDED u210)
(define-constant ERR-INVALID-DATA-TYPE u211)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u212)
(define-constant ERR-INVALID-AGGREGATE u213)
(define-constant ERR-INVALID-VALUE-RANGE u214)

(define-data-var next-pool-id uint u0)
(define-data-var max-pools uint u1000)
(define-data-var authority-contract (optional principal) none)
(define-data-var wallet-contract principal 'SP000000000000000000002Q6VF78)

(define-map data-pools
  uint
  { category: (string-ascii 30), data-type: (string-ascii 20), entry-count: uint, total-value: uint, min-value: uint, max-value: uint }
)

(define-map anonymized-entries
  { user: principal, pool-id: uint, entry-index: uint }
  { anon-hash: (buff 32), timestamp: uint, aggregate-value: uint }
)

(define-read-only (get-pool (pool-id uint))
  (map-get? data-pools pool-id)
)

(define-read-only (get-anon-entry (user principal) (pool-id uint) (entry-index uint))
  (map-get? anonymized-entries { user: user, pool-id: pool-id, entry-index: entry-index })
)

(define-private (validate-pool-id (pool-id uint))
  (if (< pool-id (var-get next-pool-id))
      (ok true)
      (err ERR-INVALID-POOL-ID))
)

(define-private (validate-data-hash (hash (buff 32)))
  (if (is-eq (len hash) u32)
      (ok true)
      (err ERR-INVALID-DATA-HASH))
)

(define-private (validate-category (cat (string-ascii 30)))
  (if (<= (len cat) u30)
      (ok true)
      (err ERR-INVALID-CATEGORY))
)

(define-private (validate-data-type (dtype (string-ascii 20)))
  (if (or (is-eq dtype "fitness") (is-eq dtype "vitals") (is-eq dtype "sleep"))
      (ok true)
      (err ERR-INVALID-DATA-TYPE))
)

(define-private (validate-value-range (min uint) (max uint))
  (if (<= min max)
      (ok true)
      (err ERR-INVALID-VALUE-RANGE))
)

(define-private (validate-aggregate-value (value uint) (min uint) (max uint))
  (if (and (>= value min) (<= value max))
      (ok true)
      (err ERR-INVALID-AGGREGATE))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (asserts! (not (is-eq contract-principal 'SP000000000000000000002Q6VF78)) (err ERR-NOT-AUTHORIZED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-wallet-contract (contract-principal principal))
  (begin
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (asserts! (not (is-eq contract-principal 'SP000000000000000000002Q6VF78)) (err ERR-NOT-AUTHORIZED))
    (var-set wallet-contract contract-principal)
    (ok true)
  )
)

(define-public (create-pool (category (string-ascii 30)) (data-type (string-ascii 20)) (min-value uint) (max-value uint))
  (let ((pool-id (var-get next-pool-id)))
    (asserts! (< pool-id (var-get max-pools)) (err ERR-MAX-POOLS-EXCEEDED))
    (try! (validate-category category))
    (try! (validate-data-type data-type))
    (try! (validate-value-range min-value max-value))
    (map-set data-pools pool-id
      { category: category, data-type: data-type, entry-count: u0, total-value: u0, min-value: min-value, max-value: max-value }
    )
    (var-set next-pool-id (+ pool-id u1))
    (print { event: "pool-created", pool-id: pool-id })
    (ok pool-id)
  )
)

(define-public (anonymize-and-submit
  (entry-index uint)
  (pool-id uint)
  (anon-hash (buff 32))
  (aggregate-value uint)
)
  (let ((user tx-sender)
        (wallet-details (unwrap! (contract-call? .UserWalletContract get-wallet-details user) (err ERR-WALLET-NOT-FOUND)))
        (entry (unwrap! (contract-call? .UserWalletContract get-data-entry user entry-index) (err ERR-ENTRY-NOT-FOUND)))
        (pool (unwrap! (map-get? data-pools pool-id) (err ERR-POOL-NOT-FOUND))))
    (asserts! (contract-call? .UserWalletContract is-entry-consented user entry-index) (err ERR-NO-CONSENT))
    (try! (validate-pool-id pool-id))
    (try! (validate-data-hash anon-hash))
    (try! (validate-aggregate-value aggregate-value (get min-value pool) (get max-value pool)))
    (asserts! (is-eq (get data-type entry) (get data-type pool)) (err ERR-INVALID-DATA-TYPE))
    (asserts! (is-eq (get category entry) (get category pool)) (err ERR-INVALID-CATEGORY))
    (map-set anonymized-entries { user: user, pool-id: pool-id, entry-index: entry-index }
      { anon-hash: anon-hash, timestamp: block-height, aggregate-value: aggregate-value }
    )
    (map-set data-pools pool-id
      (merge pool
        { entry-count: (+ (get entry-count pool) u1),
          total-value: (+ (get total-value pool) aggregate-value) }
      )
    )
    (print { event: "data-anonymized", user: user, pool-id: pool-id, entry-index: entry-index })
    (ok true)
  )
)

(define-public (remove-from-pool (pool-id uint) (entry-index uint))
  (let ((user tx-sender)
        (entry (unwrap! (map-get? anonymized-entries { user: user, pool-id: pool-id, entry-index: entry-index }) (err ERR-ENTRY-NOT-FOUND)))
        (pool (unwrap! (map-get? data-pools pool-id) (err ERR-POOL-NOT-FOUND))))
    (try! (validate-pool-id pool-id))
    (map-set data-pools pool-id
      (merge pool
        { entry-count: (- (get entry-count pool) u1),
          total-value: (- (get total-value pool) (get aggregate-value entry)) }
      )
    )
    (map-delete anonymized-entries { user: user, pool-id: pool-id, entry-index: entry-index })
    (print { event: "entry-removed", user: user, pool-id: pool-id, entry-index: entry-index })
    (ok true)
  )
)

(define-public (get-pool-count)
  (ok (var-get next-pool-id))
)